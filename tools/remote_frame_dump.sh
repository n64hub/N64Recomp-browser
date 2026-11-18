#!/usr/bin/env bash
# Dumps a recomp's frames by a plan and checks them with tools/frame_check.mjs on a Linux host with an NVIDIA GPU over
# ssh ($DUMP_HOST, a host name ssh knows), in one command, and brings back only the results: the check made on that
# host's GPU and CPU, not on the machine you run this from. A dump is ~20 MB a second, too much to bring back over a
# slow link, so the dumps are made, checked and deleted there.
#
#   DUMP_HOST=<host> tools/remote_frame_dump.sh [-c <config dir>] [-r <sound reference>] <game dir> <exe> <game id>
#       <rom> <plan> <out dir> [tools/frame_dump.mjs options: --window 1280x720,960x720,2560x720 --seconds 10-70 ...]
#   DUMP_HOST=<host> tools/remote_frame_dump.sh <game dir> <exe> <game id> <rom> <save plan> <out dir> --saves <load plan>
#
# The second form is frame_dump.mjs's save check (its header says what it does): a save, a restart and the save found
# again, through symlinks, with no dumps and no frame_check; <load plan> is a plan here, sent with the run.
#
# <game dir> and <rom> are paths on the host (relative to its home): the recomp's Linux build, its release archive
# unpacked or a build folder with assets/, and its ROM. <exe> is the program in <game dir>, <game id> the name its
# runtime stores the ROM under (its game_id). <plan> is a plan of tools/capture_window.ps1's here, and <out dir> a
# folder here that gets frame_check.txt (the check's output, also printed; seam_check.txt with two --window sizes),
# each run's stdout.log, stderr.log and the plan's shots, flagged/ (the check's --save), and each run's sound recording
# and sound_check.txt (tools/sound_check.mjs's output, also printed). -c sends a folder of settings files
# (graphics.json, general.json) for every run, and -r a run's folder from an earlier one (its sound.tsv, sound.raw and
# steps.tsv) for sound_check to compare the first run's sound with (frame_dump.mjs's --sound-reference).
# tools/frame_dump.mjs's header says what a run does and what the options mean; its exit code is this one's (0 passes,
# 1 fails, the game's speed included, 2 nothing to test, 3 a run failed, 75 stopped by the queue). With --restart (a
# first launch and two restarts, in place of frame_check) <out dir> gets restart.txt and each run's settings files.
# A container killed outright (137, which in practice is the kernel at its memory cap: a game whose memory ran away
# faster than frame_dump could see it go) said nothing, so it is said here: a --soak fails (1), a dump's run failed (3).
#
# It runs in the image of tools/frame_dump.Dockerfile, tagged with a hash of that file and built on the host the first
# time a run needs it, in a container named frame-dump-<out dir's name> (`docker stop` that name to end one), as the
# host's own user, with the host's GPUs, $FRAME_DUMP_CPUS of its cores (8: a run draws on 2-3, frame_check takes
# the rest) and $FRAME_DUMP_MEMORY of its memory (4g: a game's dumps held 0.3-0.6 GB, frame_check up to 3.0, and was killed at 2g), which is also
# the host memory each of its jobs asks the queue for, so several fit beside each other. Its files are in $FRAME_DUMP_DIR/<out dir's name> under the host's home
# (frame-dumps), deleted when it ends unless --keep is given (which keeps the dumps too, for another check there).
# With --reuse beside --keep the folder isn't emptied first, so the dumps a run before kept are checked again and only
# those missing are made (tools/frame_dump.mjs's --reuse): FRAME_DUMP_DIR and <out dir>'s name then key the dumps.
#
# A host whose GPU is shared through a queue: FRAME_DUMP_QUEUE_CLIENT names a JavaScript module here that exports
# gpuRun(spec, run), sent with the run, and the dumps then wait for a turn as one job and frame_check as another
# (tools/frame_dump.mjs's --queue), at low priority unless --priority says otherwise. The queue's key is
# $GPU_QUEUE_KEY, sent on ssh's stdin, never on a command line; $GPU_QUEUE_URL is passed on if set,
# $FRAME_DUMP_NETWORK names the docker network the queue answers on, and $FRAME_DUMP_JOB_URL is each job's link.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
config="" reference=""
while [[ $# -gt 0 ]]; do
    case "$1" in
    -c) config="$(cd "$2" && pwd)"; shift 2 ;;
    -r) reference="$(cd "$2" && pwd)"; shift 2 ;;
    *) break ;;
    esac
done
[[ $# -ge 6 ]] || { sed -n '6,7p' "$0" >&2; exit 3; }
game=$1 exe=$2 game_id=$3 rom=$4 plan=$5 out=$6
shift 6
host="${DUMP_HOST:?set DUMP_HOST to the host to dump on}"
[[ -f "$plan" ]] || { echo "no plan $plan" >&2; exit 3; }
mkdir -p "$out"
out="$(cd "$out" && pwd)"
name="$(basename "$out")"
dir="${FRAME_DUMP_DIR:-frame-dumps}/$name"
image="frame-dump:$(git hash-object "$here/frame_dump.Dockerfile" | cut -c1-12)"
keep="" reuse=""
for a in "$@"; do [[ "$a" == --keep ]] && keep=1; [[ "$a" == --reuse ]] && reuse=1; done
remote() { ssh -o BatchMode=yes "$host" "$@"; }

remote "docker image inspect $image >/dev/null 2>&1 || docker build -q -t $image - >/dev/null" \
    < "$here/frame_dump.Dockerfile"

# What the container reads, in one tar: the scripts, the plan, the settings, the sound reference, the queue's client.
stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT
cp "$here/frame_dump.mjs" "$here/frame_check.mjs" "$here/frame_pace.mjs" "$here/seam_check.mjs" "$here/sound_check.mjs" \
    "$here/game_speed.mjs" "$here/sdl_audio_record.c" "$stage/"
cp "$plan" "$stage/plan.txt"
args=()
while [[ $# -gt 0 ]]; do
    if [[ "$1" == --saves ]]; then
        [[ -f "${2:-}" ]] || { echo "no load plan ${2:-}" >&2; exit 3; }
        cp "$2" "$stage/saves.txt"; args+=(--saves /work/saves.txt); shift 2
    else args+=("$1"); shift; fi
done
set -- "${args[@]}"
mkdir -p "$stage/config-in"
[[ -n "$config" ]] && cp -r "$config/." "$stage/config-in/"
if [[ -n "$reference" ]]; then
    mkdir -p "$stage/sound-reference"
    cp "$reference/sound.tsv" "$reference/sound.raw" "$reference/steps.tsv" "$stage/sound-reference/"
fi
queue=()
if [[ -n "${FRAME_DUMP_QUEUE_CLIENT:-}" ]]; then
    cp "$FRAME_DUMP_QUEUE_CLIENT" "$stage/queue.mjs"
    queue=(--queue /work/queue.mjs)
    [[ -n "${FRAME_DUMP_JOB_URL:-}" ]] && queue+=(--url "$FRAME_DUMP_JOB_URL")
fi
if [[ -n "$reuse" ]]; then remote "mkdir -p $dir/home"; else remote "rm -rf $dir && mkdir -p $dir/home"; fi
tar -C "$stage" -cf - . | remote "tar -C $dir -xf -"

# The command the host runs, each argument quoted for its shell.
q() { printf '%q ' "$@"; }
cpus="${FRAME_DUMP_CPUS:-8}"
run=(docker run --rm --name "frame-dump-$name" --gpus all --cpus "$cpus" --memory "${FRAME_DUMP_MEMORY:-4g}" --shm-size 1g -e HOME=/work/home)
[[ -n "${FRAME_DUMP_NETWORK:-}" ]] && run+=(--network "$FRAME_DUMP_NETWORK")
[[ -n "${GPU_QUEUE_URL:-}" ]] && run+=(-e "GPU_QUEUE_URL=$GPU_QUEUE_URL")
cmd=(node /work/frame_dump.mjs --game /game --exe "$exe" --game-id "$game_id" --rom /rom.z64 --plan /work/plan.txt
    --out /work/out --workers "$cpus" "${queue[@]}")
[[ -n "$config" ]] && cmd+=(--config /work/config-in)
[[ -n "$reference" ]] && cmd+=(--sound-reference /work/sound-reference)
stopped() { remote "docker stop frame-dump-$name >/dev/null 2>&1" || true; exit 75; }
trap 'rm -rf "$stage"; stopped' INT TERM
set +e
printf %s "${GPU_QUEUE_KEY:-}" | remote "cd ~ && GPU_QUEUE_KEY=\$(cat) && export GPU_QUEUE_KEY && \
    $(q "${run[@]}") --user \$(id -u):\$(id -g) -e GPU_QUEUE_KEY -v \$HOME/$dir:/work \
    -v \"\$(realpath $(q "$game"))\":/game:ro -v \"\$(realpath $(q "$rom"))\":/rom.z64:ro $image $(q "${cmd[@]}" "$@")"
code=$?
set -e
if [[ $code == 137 ]]; then
    code=3
    for a in "$@"; do [[ "$a" == --soak ]] && code=1; done
    [[ $code == 1 ]] && echo -n "soak FAILED: " || echo -n "frame_dump: "
    echo "the container was killed (137), most likely at its ${FRAME_DUMP_MEMORY:-4g} memory cap"
fi
trap 'rm -rf "$stage"' EXIT
trap - INT TERM

# Everything but the dumps and the runs' copies of the game comes back.
remote "tar -C $dir/out -cf - --exclude=./*/dump --exclude=./*/run --exclude=./config --exclude=./game --exclude=./sdl_audio_record.so ." 2>/dev/null | tar -C "$out" -xf - \
    || echo "nothing came back from $host:$dir/out" >&2
[[ -n "$keep" ]] || remote "rm -rf $dir"
echo "results in $out (exit $code)"
exit $code

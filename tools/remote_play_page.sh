#!/usr/bin/env bash
# Plays a page (tools/play_page.mjs) or records its shaders (tools/record_shaders.mjs) on a Linux host with an NVIDIA
# GPU over ssh ($PLAY_HOST, a host name ssh knows), in Chrome or Firefox in a container there, in one command, and
# brings back only what the play wrote: its output (printed as it comes), the files it was told to write, and the lines
# it recorded. The page is a build on that host (a game's page built there) or a URL (GitHub Pages).
#
#   PLAY_HOST=<host> tools/remote_play_page.sh [--measure] [--model <game>] <out dir> <play_page.mjs | record_shaders.mjs> <its args...>
#
# The tool's arguments are its own (each one's header), with five kinds rewritten for the host:
#   host:<path>   a file or folder on the host, relative to its home (a build dir, a ROM), given to the tool read-only
#   out:<name>    a file the tool writes (--json, --shot, record_shaders' list), which comes back as <out dir>/<name>;
#                 one already there is sent first, so record_shaders' --add records into it
#   --record <f>  a local file of runs (plays.jsonl): sent, so the tool compares the run with the earlier ones, and the
#                 lines the run adds are appended to the local file
#   a local file  sent as it is (a plan, a --preload script), a plan with the files its evalFile steps name, up
#                 into a recomp's lib/N64Recomp-browser too
#   a local dir   a folder, sent as it is: a page built elsewhere and kept here, which no host: path names
# Anything else (a URL, a number, a flag) goes as it is. For example, a smoke play of a page built there:
#
#   tools/remote_play_page.sh --model mg out/mg-smoke play_page.mjs chrome host:pages/mg/build-web host:roms/mg.z64 \
#       ../mario-golf-recomp/play_plan.json --shot out:end.png --record plays.jsonl --game mg --build "main 1a2b3c4"
#
# It runs in the image of tools/page_play.Dockerfile, tagged with a hash of that file and the week and built on the host
# the first time a run needs it, in a container named page-play-<key> (printed as it starts: `docker stop` that name to
# end one), as the host's own user, with the host's GPUs, capped at $PLAY_CPUS cores (4: a play in Chrome used 1-1.5)
# and $PLAY_MEMORY of memory (4g: one held 1.6 GB), which is also the host memory its job asks the queue for. Its
# files are in $PLAY_DIR/<key> under the host's home (page-plays), deleted when it ends. The key is the out dir's name
# and a hash of its whole path here (out-3f9a1c02), so callers whose out dirs share a name never share a folder or a
# container; a run started while a container of its key is on the host (the same out dir's) stops (exit 3) before it
# touches the folder. tools/play_job.mjs starts the browsers' display and sound there and runs the tool.
#
# A host whose GPU is shared through a queue: PLAY_QUEUE_CLIENT names a JavaScript module here that exports
# gpuRun(spec, run), sent with the run, and the play waits for a turn as one job of it (play_job.mjs's header says what
# each asks), one that checks beside other jobs, and --measure gives a play whose numbers are the result the GPU to
# itself (docs/playing.md). --model is the game's name, which the queue sizes the job by (the tool's --game when it
# has one). The queue's key is $GPU_QUEUE_KEY, sent on ssh's stdin, never on a command line; $GPU_QUEUE_URL and
# $GPU_QUEUE_BOARD (the label of what files the job, which a queue may require of its key's jobs) are passed on if set,
# $PLAY_NETWORK names the docker network the queue answers on, $PLAY_JOB_URL is the job's link, and
# $PLAY_PRIORITY its priority (low). The exit code is the tool's (play_page.mjs's header), 75 when the queue stopped
# it, 3 for a mistake in the arguments.
#
# Or $PLAY_RUNNER, in place of the queue's client: a command (split on spaces) that is given the container's
# `docker run` line, without --name or --rm, as its last argument, and runs it as a job of the queue from here: it
# names the container itself, starts it on the host once the job is let in there, and exits with its code. A line
# `gpu-queue: more` in the output (a recording prints one between two sections) is where the runner calls the queue's
# more(), as play_job.mjs does (its header), or a recording is one item of its job from start to end. Such a
# runner may let the queue put the job on this machine instead: $PLAY_HERE is then the path of a file holding the
# command that makes the same run here (NUL-separated: this script's --here form, below), and $PLAY_MODEL the job's
# --model. The container then never started (it marks /work/.ran first thing), so nothing comes back from the host and
# the exit code is the runner's. A --measure play isn't given to one: it takes the queue's client, the host's GPU alone.
#
#   tools/remote_play_page.sh --here <dir> <out dir> <tool> <its args...>
#
# makes the run on this machine instead, with the same arguments, relative to <dir>: each host: path fetched from the
# host first (a folder's own files, as remote_build.sh's get takes a page: no subfolders and no build leftovers), out:
# names and the tool's working directory the out dir, on a fresh profile, with $NODE (node unless set). A --record
# path is relative to <dir> unless it is absolute, /d/... or D:/... (a runner on Windows may pass either).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
measure="" model="" from=""
while [[ $# -gt 0 ]]; do
    case "$1" in
    --measure) measure=1; shift ;;
    --model) model="$2"; shift 2 ;;
    --here) from="$2"; shift 2 ;;
    *) break ;;
    esac
done
[[ $# -ge 2 ]] || { sed -n '6,7p' "$0" >&2; exit 3; }
out=$1 tool=$2
shift 2
case "$tool" in play_page.mjs|record_shaders.mjs) ;; *) echo "the tool is play_page.mjs or record_shaders.mjs, not $tool" >&2; exit 3 ;; esac
host="${PLAY_HOST:?set PLAY_HOST to the host to play on}"
mkdir -p "$out"
out="$(cd "$out" && pwd)"
remote() { ssh -o BatchMode=yes "$host" "$@"; }

if [[ -n "$from" ]]; then
    cd "$from"
    fetched="$(mktemp -d)"
    trap 'rm -rf "$fetched"' EXIT
    largs=() n=0 prev=""
    for a in "$@"; do
        n=$((n + 1))
        # A Windows runner (a node one, from Git Bash) passes a path as D:/... rather than /d/...: that is absolute
        # too, and $PWD before it made a path list that Git Bash turned into D;C:\Program Files\Git\... for node.
        if [[ "$prev" == --record && "$a" != /* && "$a" != [A-Za-z]:/* ]]; then
            largs+=("$PWD/$a")
        elif [[ "$a" == host:* ]]; then
            p="~/$(printf %q "${a#host:}")"
            mkdir -p "$fetched/$n"
            if remote "test -d $p"; then
                remote "cd $p && find . -maxdepth 1 -type f ! -name '*.ninja*' ! -name '*.log' ! -name '*.a' ! -name '*.json'                     ! -name CMakeCache.txt ! -name '*.cmake' ! -name '.*' ! -name '*.[ch]' | tar cf - -T -" | tar xf - -C "$fetched/$n"
                largs+=("$fetched/$n")
            else
                remote "cat $p" > "$fetched/$n/$(basename "${a#host:}")"
                largs+=("$fetched/$n/$(basename "${a#host:}")")
            fi
        elif [[ "$a" == out:* ]]; then
            largs+=("$out/${a#out:}")
        elif [[ -e "$a" ]]; then
            largs+=("$(cd "$(dirname "$a")" && pwd)/$(basename "$a")")
        else
            largs+=("$a")
        fi
        prev="$a"
    done
    echo "here, not on $host"
    cd "$out"
    set +e
    "${NODE:-node}" "$here/$tool" "${largs[@]}"
    code=$?
    set -e
    echo "results in $out (exit $code)"
    exit $code
fi

key="$(basename "$out")-$(printf %s "$out" | git hash-object --stdin | cut -c1-8)"
dir="${PLAY_DIR:-page-plays}/$key"
image="page-play:$(git hash-object "$here/page_play.Dockerfile" | cut -c1-12)-$(date -u +%G%V)"
# A run already there with this key (playing, or waiting for its turn) is left alone: this one stops before it
# empties the folder under the other.
if remote "docker container inspect page-play-$key >/dev/null 2>&1"; then
    echo "page-play-$key is already on $host: a run of this out dir holds it" >&2
    exit 3
fi
echo "on $host as page-play-$key, in ~/$dir"

# What the container reads, in one tar: the tools, the inputs, the out dir as it is, the queue's client.
stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT
mkdir -p "$stage/tools" "$stage/in" "$stage/out" "$stage/home"
cp "$here"/*.mjs "$here"/*.js "$stage/tools/"
cp -r "$out/." "$stage/out/"
mounts=() targs=() record="" record_lines=0 n=0
prev=""
for a in "$@"; do
    n=$((n + 1))
    if [[ "$prev" == --record ]]; then
        record="$a"
        [[ -f "$record" ]] && cp "$record" "$stage/in/record.jsonl" || : > "$stage/in/record.jsonl"
        record_lines=$(wc -l < "$stage/in/record.jsonl")
        targs+=(/work/in/record.jsonl)
    elif [[ "$a" == host:* ]]; then
        mounts+=(-v "\$HOME/${a#host:}:/host/$n:ro")
        targs+=("/host/$n")
    elif [[ "$a" == out:* ]]; then
        targs+=("/work/out/${a#out:}")
    elif [[ -f "$a" ]]; then
        # A plan's evalFile steps name files relative to it, a recomp's plan often up and into its N64Recomp-browser
        # submodule (../lib/N64Recomp-browser/tools/gamepad_probe.js): they go where it names them, the plan as many
        # folders down in its own as they reach up (in/<n>/_/_/plan.json for ../../), so none lands outside it. Any
        # other file goes as it is.
        files=()
        if [[ "$a" == *.json ]]; then
            mapfile -t files < <(node -e '
                const fs = require("fs");
                const plan = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
                const steps = [plan.load, plan.setup, plan.start, plan.play, ...(plan.sections || []).map((s) => s.steps)];
                for (const s of [].concat(...steps.filter(Boolean))) if (Array.isArray(s) && (s[0] === "evalFile")) console.log(s[1]);
            ' "$a" | tr -d '\r')
        fi
        sub=""
        for f in "${files[@]}"; do
            [[ "$f" != /* ]] || { echo "an evalFile step names $f: a plan names its scripts relative to itself" >&2; exit 3; }
            rest="$f" up=""
            while [[ "$rest" == ../* ]]; do rest="${rest#../}" up="${up}_/"; done
            [[ "$rest" != *..* ]] || { echo "an evalFile step names $f, which goes up past its start" >&2; exit 3; }
            if (( ${#up} > ${#sub} )); then sub="$up"; fi
        done
        mkdir -p "$stage/in/$n/$sub"
        cp "$a" "$stage/in/$n/$sub"
        for f in "${files[@]}"; do
            mkdir -p "$(dirname "$stage/in/$n/$sub$f")"
            cp "$(dirname "$a")/$f" "$stage/in/$n/$sub$f"
        done
        targs+=("/work/in/$n/$sub$(basename "$a")")
    elif [[ -d "$a" ]]; then
        mkdir -p "$stage/in/$n"
        cp -r "$a" "$stage/in/$n/"
        targs+=("/work/in/$n/$(basename "$a")")
    else
        targs+=("$a")
    fi
    prev="$a"
done
if [[ -z "$model" ]]; then
    for ((i = 0; i < ${#targs[@]} - 1; i++)); do [[ "${targs[i]}" == --game ]] && model="${targs[i + 1]}"; done
fi
job=() runner="${PLAY_RUNNER:-}"
[[ -z "$measure" ]] || runner=""
if [[ -n "$runner" ]]; then
    :
elif [[ -n "${PLAY_QUEUE_CLIENT:-}" ]]; then
    [[ -n "$model" ]] || { echo "--model <game> (or the tool's --game) is needed to take a turn in the queue" >&2; exit 3; }
    cp "$PLAY_QUEUE_CLIENT" "$stage/queue.mjs"
    job=(--queue /work/queue.mjs --model "$model" --priority "${PLAY_PRIORITY:-low}")
    [[ -n "${PLAY_JOB_URL:-}" ]] && job+=(--url "$PLAY_JOB_URL")
    [[ -n "$measure" ]] && job+=(--measure)
fi

# The image, built once a week (or for a change to its Dockerfile) by whichever run first needs it, the older ones
# removed (one still in use stays).
remote "flock /tmp/page-play-image.lock sh -c 'docker image inspect $image >/dev/null 2>&1 || \
    { docker build -q -t $image - >/dev/null && docker image ls page-play --format {{.Repository}}:{{.Tag}} | \
      grep -vx $image | xargs -r docker rmi >/dev/null 2>&1; true; }'" < "$here/page_play.Dockerfile"
remote "rm -rf $dir && mkdir -p $dir"
tar -C "$stage" -cf - . | remote "tar -C $dir -xf -"

q() { printf '%q ' "$@"; }
run=(docker run --rm --name "page-play-$key" --gpus all --cpus "${PLAY_CPUS:-4}" --memory "${PLAY_MEMORY:-4g}"
    --shm-size 2g -e HOME=/work/home -w /work/out)
[[ -n "${PLAY_NETWORK:-}" ]] && run+=(--network "$PLAY_NETWORK")
[[ -n "${GPU_QUEUE_URL:-}" ]] && run+=(-e "GPU_QUEUE_URL=$GPU_QUEUE_URL")
[[ -n "${GPU_QUEUE_BOARD:-}" ]] && run+=(-e "GPU_QUEUE_BOARD=$GPU_QUEUE_BOARD")
cmd=(node /work/tools/play_job.mjs "${job[@]}" -- node "/work/tools/$tool" "${targs[@]}")
if [[ -n "$runner" ]]; then
    # The runner names, caps and stops the container; the play goes as play_job.mjs runs it with no queue. Or it makes
    # the run here, by the --here form of this one.
    [[ -n "$model" ]] || { echo "--model <game> (or the tool's --game) is needed to take a turn in the queue" >&2; exit 3; }
    printf '%s\0' "$BASH" "$here/remote_play_page.sh" --here "$PWD" "$out" "$tool" "$@" > "$stage/here"
    set +e
    PLAY_HERE="$stage/here" PLAY_MODEL="$model" ${runner} "docker run $(q "${run[@]:5}")--user \$(id -u):\$(id -g) -v \$HOME/$dir:/work ${mounts[*]} $image \
$(q sh -c 'touch /work/.ran && exec "$@"' sh "${cmd[@]}")"
    code=$?
    set -e
    if ! remote "test -e $dir/.ran"; then
        remote "rm -rf $dir"
        echo "not played on $host: the runner played it elsewhere (exit $code)"
        exit $code
    fi
else
    stopped() { remote "docker stop page-play-$key >/dev/null 2>&1" || true; exit 75; }
    trap 'rm -rf "$stage"; stopped' INT TERM
    set +e
    printf %s "${GPU_QUEUE_KEY:-}" | remote "cd ~ && GPU_QUEUE_KEY=\$(cat) && export GPU_QUEUE_KEY && \
        $(q "${run[@]}") --user \$(id -u):\$(id -g) -e GPU_QUEUE_KEY -v \$HOME/$dir:/work ${mounts[*]} $image $(q "${cmd[@]}")"
    code=$?
    set -e
    trap 'rm -rf "$stage"' EXIT
    trap - INT TERM
fi

# What the play wrote, and the runs it recorded.
remote "tar -C $dir/out -cf - ." 2>/dev/null | tar -C "$out" -xf - || echo "nothing came back from $host:$dir/out" >&2
if [[ -n "$record" ]]; then
    remote "tail -n +$((record_lines + 1)) $dir/in/record.jsonl" >> "$record" || echo "no runs came back from $host" >&2
fi
remote "rm -rf $dir"
echo "results in $out (exit $code)"
exit $code

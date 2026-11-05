#!/usr/bin/env bash
# Boots a recomp's release archive as a player first runs it, before the release is published (CLAUDE.md, Releasing):
# unpacked into a new folder, the ROM stored there as Load ROM stores it, started with --boot so it goes straight into
# the game, and left to run for a set time. Each recomp's tools/release.sh runs it as `tools/release.sh boot windows`
# (Git Bash on Windows) and `tools/release.sh boot linux` (a Linux host with Docker, where its Linux archive is built).
#
#   tools/boot_release.sh <archive> <rom> <game id> <dir> [program args...]
#
# <archive> is the .zip (Windows) or .tar.gz (Linux) release.sh packs, one folder with the program in it; <rom> the
# game's ROM; <game id> the recomp's game_id, the name the runtime stores the ROM under (<game id>.z64 beside the
# program, which portable.txt makes the folder for it, the config and saves). <dir> is emptied and gets the folder,
# the program's stdout.log and stderr.log, and captures of its window, boot-<s>.png every 10 s and at the end. The
# program args follow --boot: a recomp's --input script, say, to get past a screen that waits for a button.
# BOOT_SECONDS (30) is how long it runs: past the first menu in every recomp, and before lavapipe crashes in some
# (boot_release.Dockerfile).
#
# It passes when the program still runs at the end, its stderr has no "Crash:" (the recomps' crash trace) and no
# "--boot: no valid stored ROM", and a capture shows more than one flat colour (a game's screen changes go through
# black, so any one capture may be). Then it writes <archive>.booted, the archive's SHA-256, which release.sh's publish
# asks for. Look at the captures too: a boot that passes can still draw the wrong thing.
#
# Windows: the program runs from tools/capture_window.ps1 (pwsh), which captures that process's own window
# (PrintWindow, never the screen) and stops it by its PID. Linux: in a container of boot_release.Dockerfile, a plain
# Ubuntu 24.04 with GTK 3, FreeType and Mesa's software Vulkan (lavapipe) under Xvfb, not the image the archive was
# built in, so a library the archive should carry and doesn't fails the boot. Its captures are the virtual display's,
# which holds only the program. The container is named boot-release-<this script's PID> and stopped by that name.
set -euo pipefail
[ $# -ge 4 ] || { echo "usage: tools/boot_release.sh <archive> <rom> <game id> <dir> [program args...]" >&2; exit 1; }
archive=$1 rom=$2 game_id=$3 dir=$4
shift 4
seconds=${BOOT_SECONDS:-30}
here=$(cd "$(dirname "$0")" && pwd)
[ -f "$archive" ] || { echo "no archive $archive" >&2; exit 1; }
[ -f "$rom" ] || { echo "no ROM $rom" >&2; exit 1; }

rm -rf "$dir"
mkdir -p "$dir/run"
dir=$(cd "$dir" && pwd)
case "$archive" in
*.zip) unzip -q "$archive" -d "$dir/run" ;;
*.tar.gz) tar -xzf "$archive" -C "$dir/run" ;;
*) echo "$archive is neither a .zip nor a .tar.gz" >&2; exit 1 ;;
esac
folder=$(ls "$dir/run")
[ "$(echo "$folder" | wc -l)" = 1 ] || { echo "$archive holds more than one folder" >&2; exit 1; }
touch "$dir/run/$folder/portable.txt"
cp "$rom" "$dir/run/$folder/$game_id.z64"
shots=$(seq 10 10 "$seconds"; [ $((seconds % 10)) = 0 ] || echo "$seconds")

case "$archive" in
*.zip)
    exe=$(ls "$dir/run/$folder" | grep '\.exe$')
    { for s in $shots; do printf '%s shot boot-%03d\n' "$s" "$s"; done; echo "$seconds end"; } > "$dir/plan.txt"
    # capture_window.ps1 hands its -ExeArgs to the program as one command line.
    args="--boot"
    for a in "$@"; do args+=" \"$a\""; done
    pwsh -NoProfile -File "$(cygpath -w "$here/capture_window.ps1")" -Exe "$(cygpath -w "$dir/run/$folder/$exe")" \
        -WorkDir "$(cygpath -w "$dir/run/$folder")" -Plan "$(cygpath -w "$dir/plan.txt")" -OutDir "$(cygpath -w "$dir")" \
        -ExeArgs "$args" | tee "$dir/capture.log"
    ! grep -q '^exited with' "$dir/capture.log" || { echo "boot failed: $(grep '^exited with' "$dir/capture.log")"; ran=no; }
    # Each capture's name and the standard deviation of its grey, 0 to 255, at 32x32 points.
    pwsh -NoProfile -Command "Add-Type -AssemblyName System.Drawing
        foreach (\$f in Get-ChildItem '$(cygpath -w "$dir")' -Filter 'boot-*.png') {
            \$b = New-Object System.Drawing.Bitmap \$f.FullName; \$v = @()
            for (\$y = 0; \$y -lt 32; \$y++) { for (\$x = 0; \$x -lt 32; \$x++) {
                \$c = \$b.GetPixel([int]((\$x + 0.5) * \$b.Width / 32), [int]((\$y + 0.5) * \$b.Height / 32))
                \$v += 0.299 * \$c.R + 0.587 * \$c.G + 0.114 * \$c.B } }
            \$b.Dispose(); \$m = (\$v | Measure-Object -Average).Average
            \$f.Name + ' ' + [Math]::Sqrt((\$v | ForEach-Object { (\$_ - \$m) * (\$_ - \$m) } | Measure-Object -Average).Average)
        }" > "$dir/spread.txt"
    ;;
*.tar.gz)
    exe=$(cd "$dir/run/$folder" && find . -maxdepth 1 -type f -perm -u+x ! -name '*.so*' | sed 's|^\./||')
    image=boot-release:$(sha256sum "$here/boot_release.Dockerfile" | cut -c1-12)
    docker image inspect "$image" > /dev/null 2>&1 || docker build -q -t "$image" - < "$here/boot_release.Dockerfile"
    name=boot-release-$$
    trap 'docker stop "$name" > /dev/null 2>&1 || true' EXIT
    mkdir -p "$dir/home"
    # Inside: the program under Xvfb, the virtual display captured at each shot's second, then stopped.
    docker run --rm --name "$name" -u "$(id -u):$(id -g)" -v "$dir:/b" -w "/b/run/$folder" -e HOME=/b/home \
        -e SDL_AUDIODRIVER=dummy "$image" bash -c '
        exe=$1 seconds=$2 shots=$3
        shift 3
        Xvfb :9 -screen 0 1600x1200x24 > /dev/null 2>&1 &
        sleep 2
        export DISPLAY=:9
        ./"$exe" --boot "$@" > /b/stdout.log 2> /b/stderr.log &
        pid=$! t=0
        while [ $t -lt "$seconds" ]; do
            sleep 1; t=$((t + 1))
            kill -0 $pid 2> /dev/null || { wait $pid && code=0 || code=$?; echo "exited with $code at ${t}s"; exit 0; }
            for s in $shots; do [ $s != $t ] || xwd -root -silent | convert xwd:- "$(printf "/b/boot-%03d.png" $s)"; done
        done
        kill $pid; echo "stopped at ${t}s"' boot "$exe" "$seconds" "$(echo $shots)" "$@" | tee "$dir/capture.log"
    ! grep -q '^exited with' "$dir/capture.log" || { echo "boot failed: $(grep '^exited with' "$dir/capture.log")"; ran=no; }
    docker run --rm -u "$(id -u):$(id -g)" -v "$dir:/b" -w /b "$image" bash -c 'for f in boot-*.png; do
        echo "$f $(convert "$f" -colorspace Gray -format "%[fx:255*standard_deviation]" info:)"; done' > "$dir/spread.txt"
    ;;
esac

grep -E '^Crash:|^--boot: no valid stored ROM' "$dir/stderr.log" && ran=no
# The capture that shows the most, which has to show more than a flat colour.
best=$(sort -k2 -g "$dir/spread.txt" | tail -1)
awk -v s="${best#* }" 'BEGIN { exit !(s + 0 < 2) }' && { echo "no capture shows more than a flat colour"; ran=no; }
if [ "${ran:-yes}" = no ]; then
    echo "boot of $archive FAILED; stderr's end:"
    tail -15 "$dir/stderr.log"
    exit 1
fi
sha256sum "$archive" | cut -d' ' -f1 > "$archive.booted"
echo "boot of $archive passed: running at ${seconds}s; the capture that shows most of $dir's: $best"

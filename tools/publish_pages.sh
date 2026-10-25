#!/usr/bin/env bash
# Rebuilds every game's page from its repo's main, publishes the ones whose files changed, and checks each one it
# published from Pages: the deploy after a change that reaches the pages, so no page is left behind main.
#
#   bash tools/publish_pages.sh <rush-2049-recomp checkout> [<game>...] [--dry-run | --browser <commit> [--keep <dir>]]
#       [--ref <commit>] [--played <dir>] [-- <queue command>...]
#
# For each game in the list below (all of them unless named):
# 1. Syncs its repo's origin/main to a copy kept on $BUILD_HOST, with rush-2049-recomp's tools/remote_build.sh (its
#    Docker image, a copy per name, one shared ccache): Rush 2049's is the copy named publish, as its own
#    tools/publish_page.sh has it, and a fork's is pages-<game>, synced from a clone of it kept here in $PAGES_CACHE
#    (~/.cache/n64recomp-pages) with no files checked out.
# 2. Builds the page there by the fork's BUILDING.md steps (Rush 2049's: remote_build.sh build), in that image, or on
#    the host itself for a repo whose scripts run images of their own (Perfect Dark's: the decomp's, then the web's;
#    Super Mario 64's: the web's).
# 3. Hashes the files the page serves (.html, .js, .wasm, .data, coi_serviceworker.js) as git does and compares them
#    with the blobs in its folder of the hub's gh-pages (below). A commit builds the same bytes in any copy
#    (frontend/build_speed.cmake, once the game's N64Recomp-browser pin has it: before, a ccache hit could carry another
#    checkout's path in), so a page whose code didn't change is left alone, and one built from an older main but the same bytes stays too.
# 4. Publishes those that differ into their folders of the hub with tools/publish_page.sh --into, as "main <sha>".
# 5. Waits for Pages to serve the new .js, then boots each published page from Pages in headless Chrome
#    (tools/play_page.mjs) with the game's own shader_plan.json (tools/, DKR-R's web/): launcher, ROM, Start Game,
#    then 20 s of the game running by itself, uncapped at the stand-in's 3840x2000 as every measured play is (docs/playing.md,
#    Uncapped, and the browsers' clocks), which has to present frames with no WebGPU error. Each run goes into
#    plays.jsonl (play_page.mjs --record), to be committed with the Games table's rows. A queue command after -- goes in
#    front of each boot's play_page.mjs, as ab_pages.mjs's does, so the boot takes its turn in the machine's GPU queue
#    (CLAUDE.md, Playing a page): a shared turn with a short limit, like a smoke play (docs/playing.md, What a change
#    plays). Without one it plays at once, beside whatever else holds the GPU, and its presents a second read that.
# 6. Prints the pages it published, which are then played in Chrome and Firefox and their cells in the README's Games
#    table updated (CLAUDE.md, The games table): that needs Firefox in a window.
# --dry-run stops after 3, saying which pages differ.
# --browser <commit> is the retest before the pins move (CLAUDE.md, "The pins"): a dry run of every game with its
# N64Recomp-browser moved to <commit> (a tag, or a commit this checkout has) in its copy only, Rush 2049's by a
# commit of its own on top of main that is synced there and pushed nowhere. It names the pages that build differently
# from what Pages serves, and their builds stay in the copies to fetch with remote_build.sh -n <copy> get and play.
# Once the pins are moved there (a fork's main, Rush 2049's by a pull request on its repo), a run without it builds
# the same bytes and publishes them. PAGES_COPY=<prefix> builds in copies of its own, <prefix>-<game> (Rush 2049's
# too), for a test build of a branch beside others' builds in the usual copies.
# --ref <commit> builds that commit of the one game named in place of its main, as a dry run, in PAGES_COPY's copies
# (needed: its patches can be other than main's, which a usual copy's next build of main would start from). So a game
# fork's change that has to land with its pin (its own patch rebased onto a tag, which no longer applies at the old
# pin) is built and played, with --browser <tag>, before the fork's main moves; once main is that commit, a run without
# it builds the same bytes and publishes them. The commit is a branch, a tag or a whole SHA the game's clone has or its
# GitHub repo gives (a pushed wip/<topic> branch); one only in a local clone goes into the clone first,
# `git -C $PAGES_CACHE/<game> fetch <local clone> <branch>` (Rush 2049's clone is its checkout), its origin left at
# GitHub: the build host clones from origin's URL, and the sync sends the commit as a bundle on top of origin/main.
# Every line names the commit built ("commit <sha>", not "main <sha>").
# --keep <dir> (with --browser) copies each build that differs into <dir>/<game>, with a file `built` naming the main
# and the N64Recomp-browser commit it was built from: what the retest plays, which another run's build in the same
# copy can't overwrite. --played <dir> then publishes those files as they were played, without building again: once a
# game's pin has moved, its origin/main has to be the built main with only N64Recomp-browser moved to that commit (the
# same files, so the same bytes), or the game fails and is left alone. That spares the retest a second build of
# every page (a minute or more each) between its plays and its publish.
# A copy whose N64Recomp-browser moved since its last build puts the checkouts it patches back first, since
# apply.cmake can't take a checkout from one version of the patches to another.
#
# It needs BUILD_HOST (an ssh host with Docker), push access to the game repos and gh signed in, and the ROMs: Rush
# 2049's in the checkout's roms/ (its README), and each other game's plain dump as $ROMS/<game>.z64 (sha1 in the fork's
# BUILDING.md), copied to the build host when they differ. NODE is the node that runs play_page.mjs (node unless set).
# The pages build one after another; each container takes $BUILD_CPUS cores (remote_build.sh).
#
# Measured on 2026-10-15, a 32-core host, a container 12 cores, the host otherwise quiet (load 0.5-4): all 9 pages warm,
# --dry-run, 4 min 53 s, 24-53 s a game (sync, the recompilers run again, ninja), two of them rebuilding a new main
# (Pilotwings 64 failed in that run, and took ~50 s alone once fixed);
# one game cold, Donkey Kong 64 in a new copy (its clone and submodules, the ROM, a whole build from the shared
# ccache), 162 s to built, 6 min 14 s with its publish, the wait for Pages and the boot in headless Chrome.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
dry_run=false browser="" ref="" keep="" played_dir=""
args=() queue=()
while [[ $# -gt 0 ]]; do
    case "$1" in
    --) shift; queue=("$@"); break ;;
    --dry-run) dry_run=true ;;
    --browser) browser="$2" dry_run=true; shift ;;
    --ref) ref="$2" dry_run=true; shift ;;
    --keep) keep="$2"; shift ;;
    --played) played_dir="$2"; shift ;;
    *) args+=("$1") ;;
    esac
    shift
done
[[ ${#args[@]} -ge 1 ]] || { sed -n 5,6p "$0"; exit 1; }
# A remote gives a commit only by its whole SHA: an abbreviated one failed to fetch, and the build kept the old pin.
[[ ! $browser =~ ^[0-9a-f]{4,39}$ ]] || browser="$(git -C "$here/.." rev-parse --verify "$browser^{commit}")"
[[ -z $keep || -n $browser ]] || { echo "--keep keeps a --browser run's builds"; exit 1; }
[[ -z $played_dir || -z "$browser$ref$keep" ]] || { echo "--played publishes builds already made: no --browser, --ref or --keep"; exit 1; }
if [[ -n $keep ]]; then
    mkdir -p "$keep" && keep="$(cd "$keep" && pwd)"
    browser_sha="$(git -C "$here/.." rev-parse -q --verify "$browser^{commit}" ||
        git -C "$here/.." ls-remote origin "refs/tags/$browser^{}" | cut -f1)"
    [[ -n $browser_sha ]] || { echo "no commit $browser here or at origin"; exit 1; }
fi
[[ -z $played_dir ]] || played_dir="$(cd "$played_dir" && pwd)"
rush="$(cd "${args[0]}" && pwd)"
remote_build="$rush/tools/remote_build.sh"
[[ -f "$remote_build" ]] || { echo "$rush is not a rush-2049-recomp checkout"; exit 1; }
cache="${PAGES_CACHE:-$HOME/.cache/n64recomp-pages}"
node="${NODE:-node}"
# The hub every page is published in, a folder each (the list below), and its address: its custom domain once it has
# one.
hub=n64hub/n64hub.github.io
hub_url="$(gh api "repos/$hub/pages" --jq .html_url)"

# <game> <repo> <page name> <build dir> <hub folder>, the build dir relative to the repo's root, the folder the page
# is published to in the hub (tools/publish_site.sh), the address its Page cell in the README links.
games="
rush   n64hub/rush-2049-recomp               Rush2049Recompiled   build-web rush-2049
ge     n64hub/GoldenEye64Recomp-web          GoldenRecomp         build-web goldeneye
mm     n64hub/Zelda64Recomp-web              Zelda64Recompiled    build-web majoras-mask
banjo  n64hub/BanjoRecomp-web                BanjoRecompiled      build-web banjo-kazooie
cbfd   n64hub/CBFD-Recompiled-web            ConkerRecomp         host/build-web conker
dk64   n64hub/Donkey-Kong-64-Recompiled-web  DK64Recompiled       build-web donkey-kong-64
wr     n64hub/wave-race-64-recomp-web        WaveRace64Recomp     build-web wave-race-64
pw     n64hub/pilotwings-64-recomp-web       Pilotwings64Recomp   build-web pilotwings-64
bt     n64hub/BanjoTooieRecompiled-web       BanjoTooieRecompiled build-web banjo-tooie
mk64   n64hub/MarioKart64Recomp-web          MarioKart64Recompiled build-web mario-kart-64
sf64   n64hub/Starfox64Recomp-web            Starfox64Recompiled  build-web star-fox-64
oot    n64hub/oot-recompiled-web             OoTRecompiled        build-web ocarina-of-time
jfg    n64hub/JetForceGemini-Recomp-web      JetForceGeminiRecompiled web-build/build-web jet-force-gemini
dkr    n64hub/DKR-R-web                      DKR-R                build-web/bin/Release diddy-kong-racing
snap   n64hub/Snap64Recomp-web               Snap64Recomp         build-web pokemon-snap
rush2  n64hub/rush2recompiled-web            Rush2Recompiled      build-web rush-2
1080   n64hub/1080-Snowboarding-recomp-web   1080SnowboardingRecompiled build-web 1080-snowboarding
pd     n64hub/perfect-dark-recomp            PerfectDarkRecompiled build/web perfect-dark
sm64   n64hub/super-mario-64-recomp          SuperMario64Recompiled build/web super-mario-64
"
selected=("${args[@]:1}")
[[ ${#selected[@]} -gt 0 ]] || selected=($(awk 'NF { print $1 }' <<< "$games"))
for g in "${selected[@]}"; do grep -q "^$g " <<< "$games" || { echo "no game $g (one of: $(awk 'NF { printf "%s ", $1 }' <<< "$games"))"; exit 1; }; done
if [[ -n "$ref" ]]; then
    [[ ${#args[@]} -eq 2 ]] || { echo "--ref builds one game's commit: name the game"; exit 1; }
    [[ -n "${PAGES_COPY:-}" ]] || { echo "--ref builds in copies of its own: set PAGES_COPY"; exit 1; }
fi
# base <clone>: the commit to build, as a whole SHA: origin/main, or --ref's, from origin first and from the clone only
# when origin gives none (a commit fetched into it by hand). The clone's own branches are as it was cloned, never
# updated, so `--ref main` read first from the clone built the fork's first commit. The fetch goes to a ref of this
# run's own, not FETCH_HEAD: the clone is shared, and another run's fetch in the same seconds (a publish of main)
# rewrites FETCH_HEAD, which built that main in place of the --ref.
base() {
    [[ -n "$ref" ]] || { git -C "$1" rev-parse origin/main; return; }
    local own="refs/publish-pages/ref-$$"
    if git -C "$1" fetch -q origin "+$ref:$own" 2> /dev/null; then
        git -C "$1" rev-parse "$own^{commit}"
        git -C "$1" update-ref -d "$own"
        return
    fi
    git -C "$1" rev-parse -q --verify "$ref^{commit}" ||
        { echo "$1 has no $ref and origin gives none (a short SHA it never gives)" >&2; return 1; }
}

# --- What runs in the image, in the copy's repo (the ROM is ../rom.z64) ---

# Build products the sync's git clean must leave, for forks that don't ignore them all.
exclude() {
    grep -qx '# publish_pages.sh' .git/info/exclude 2> /dev/null ||
        printf '%s\n' '# publish_pages.sh' '/build*/' '/host/build-web/' '/N64Recomp' '/RSPRecomp' '/OfflineModRecomp' \
            '*.z64' '/RecompiledFuncs/' '/RecompiledPatches/' '/reference/' '/.venv/' >> .git/info/exclude
}
# browser_at <commit>: N64Recomp-browser moved to <commit> in a commit of the copy's own, for a retest: the build is
# then what main builds once the fork's pin is moved there, which a run after the move checks (the same bytes).
browser_at() {
    local b=lib/N64Recomp-browser
    [[ -d $b ]] || b=tools/N64Recomp-browser
    # Two commands, not one && list, which set -e lets fail: a commit GitHub won't fetch by name (a short SHA) left the
    # pin where it was, and the run built Pages' own bytes as the commit's.
    git -C $b fetch -q origin "$1"
    git -C $b checkout -q --detach FETCH_HEAD
    git add $b
    git diff --cached --quiet || git -c user.name=publish_pages -c user.email=publish_pages@localhost commit -qm "N64Recomp-browser $1"
}
# unpatch / patched: the checkouts N64Recomp-browser patches go back to their commits when it moved since the last
# build here, since its patches changed and apply.cmake can't take a checkout from one version of them to another.
unpatch() {
    local b=lib s
    [[ -d $b/N64Recomp-browser ]] || b=tools
    [[ "$(cat ../patched 2> /dev/null)" != "$(git -C $b/N64Recomp-browser rev-parse HEAD)" ]] || return 0
    for s in $b/rt64 $b/RT64 $b/N64ModernRuntime $b/RecompFrontend $b/N64Recomp; do
        [[ -e $s/.git ]] || continue
        git -C $s submodule foreach --recursive -q 'git reset -q --hard && git clean -fdq'
        git -C $s reset -q --hard && git -C $s clean -fdq
    done
}
patched() {
    local b=lib
    [[ -d $b/N64Recomp-browser ]] || b=tools
    git -C $b/N64Recomp-browser rev-parse HEAD > ../patched
}
# keep_times <dir>... -- <command>: a file the command writes the same as before keeps its old time, so the build
# recompiles only what the recompiler changed (it rewrites everything).
keep_times() {
    local old
    old="$(mktemp -d)"
    while [[ "$1" != -- ]]; do [[ -d "$1" ]] && mkdir -p "$old/$1" && cp -a "$1/." "$old/$1/"; shift; done
    shift
    "$@"
    (cd "$old" && find . -type f) | while read -r f; do if cmp -s "$old/$f" "$f"; then touch -r "$old/$f" "$f"; fi; done
    rm -rf "$old"
}
# n64recomp <target>...: the recompilers the runtime pins, patched for the web first (the page needs the code the
# patched one writes), built in build-n64recomp and copied to the root.
n64recomp() {
    cmake -P lib/N64Recomp-browser/patches/apply.cmake lib > /dev/null
    [[ -f build-n64recomp/build.ninja ]] || cmake -S lib/N64ModernRuntime/N64Recomp -B build-n64recomp -G Ninja \
        -DCMAKE_BUILD_TYPE=Release -DCMAKE_C_COMPILER=clang -DCMAKE_CXX_COMPILER=clang++ > /dev/null
    ninja -C build-n64recomp "$@" > /dev/null
    local t
    for t in "$@"; do cp "build-n64recomp/${t%CLI}" .; done
}
# web <target> [<source dir>]: configures <source dir>/build-web once and builds <target> in it.
web() {
    local src="${2:-.}"
    embuilder build sdl2-mt freetype-legacysjlj > /dev/null 2>&1
    [[ -f "$src/build-web/build.ninja" ]] || emcmake cmake -S "$src" -B "$src/build-web" -G Ninja -DCMAKE_BUILD_TYPE=Release \
        -DRT64_NAGA_EXECUTABLE="$(command -v naga)" -DPATCHES_C_COMPILER=clang -DPATCHES_LD=ld.lld > ../configure.log 2>&1 ||
        { tail -20 ../configure.log; rm -f "$src/build-web/build.ninja"; exit 1; }
    ninja -C "$src/build-web" "$1" > ../build.log 2>&1 || { grep -E ' error|FAILED|undefined' ../build.log | head -20; exit 1; }
}

build_ge() {
    [[ -f ge007.tlbfree.z64 ]] || xdelta3 -d -s ../rom.z64 vanilla_to_tlbfree.xdelta ge007.tlbfree.z64
    # The game's own changes to lib/ (podulator's), with N64Recomp-browser's patches on top.
    cmake -P lib-patches/apply.cmake lib > /dev/null
    n64recomp N64RecompCLI RSPRecomp
    keep_times RecompiledFuncs rsp -- bash -c './N64Recomp us.toml > /dev/null && ./RSPRecomp aspMain.us.toml > /dev/null'
    web GoldenRecomp
}
build_mm() {
    if [[ ! -f mm.us.rev1.rom_uncompressed.z64 ]]; then
        local z=../z64decompress
        [[ -x $z/z64decompress ]] || { rm -rf $z; git clone -q https://github.com/z64tools/z64decompress $z &&
            clang -O2 -o $z/z64decompress $z/src/*.c $z/src/decoder/*.c; }
        $z/z64decompress ../rom.z64 mm.us.rev1.rom_uncompressed.z64 > /dev/null
    fi
    n64recomp N64RecompCLI RSPRecomp OfflineModRecomp
    keep_times RecompiledFuncs rsp -- bash -c './N64Recomp us.rev1.toml > /dev/null && ./RSPRecomp aspMain.us.rev1.toml > /dev/null &&
        ./RSPRecomp njpgdspMain.us.rev1.toml > /dev/null'
    web Zelda64Recompiled
}
build_banjo() {
    if [[ ! -f banjo.us.v10.decompressed.z64 ]]; then
        local c=lib/bk-decomp/tools/bk_rom_compressor
        (cd $c && PATH=/opt/cargo/bin:$PATH CARGO_HOME=$HOME/.cargo RUSTUP_HOME=/opt/rustup /opt/cargo/bin/cargo build -q --release --bin bk_rom_decompress)
        $c/target/release/bk_rom_decompress ../rom.z64 banjo.us.v10.decompressed.z64 > /dev/null
    fi
    n64recomp N64RecompCLI RSPRecomp
    keep_times RecompiledFuncs rsp -- bash -c './N64Recomp banjo.us.rev0.toml > /dev/null && ./RSPRecomp n_aspMain.us.rev0.toml > /dev/null'
    web BanjoRecompiled
}
build_cbfd() {
    [[ -f conker/baserom.us.z64 ]] || cp ../rom.z64 conker/baserom.us.z64
    # Conker's own patches, then the web's on top (tools/web_patch.sh): only into a checkout the sync left clean (it
    # resets one that moved), and all of them again from clean when Conker's patches or the web's (a --browser build's)
    # changed since the last build here.
    local tool patch state
    state="$(cat recomp/*.patch tools/web_patch.sh tools/web_*.patch tools/N64Recomp-browser/patches/*.patch |
        git hash-object --stdin)"
    if [[ "$(cat ../cbfd-patched 2> /dev/null)" != "$state" ]]; then
        for tool in tools/N64Recomp tools/N64ModernRuntime tools/rt64 tools/RecompFrontend; do
            git -C $tool submodule foreach --recursive -q 'git reset -q --hard && git clean -fdq'
            git -C $tool reset -q --hard && git -C $tool clean -fdq
        done
    fi
    while read -r tool patch; do
        git -C "$tool" diff --quiet HEAD && git -C "$tool" apply "$PWD/$patch"
    done <<<"tools/N64Recomp recomp/n64recomp.patch
tools/N64ModernRuntime recomp/n64modernruntime.patch
tools/rt64 recomp/rt64.patch
tools/RecompFrontend recomp/recompfrontend.patch
tools/RecompFrontend/recompui/lib/RmlUi recomp/rmlui.patch"
    sh tools/web_patch.sh > /dev/null
    echo "$state" > ../cbfd-patched
    [[ -f tools/N64Recomp/build/build.ninja ]] || cmake -S tools/N64Recomp -B tools/N64Recomp/build -G Ninja \
        -DCMAKE_BUILD_TYPE=Release -DCMAKE_C_COMPILER=clang -DCMAKE_CXX_COMPILER=clang++ > /dev/null
    ninja -C tools/N64Recomp/build N64RecompCLI RSPRecomp > /dev/null
    keep_times RecompiledFuncs -- bash -c 'python3 recomp/recompile.py > /dev/null'
    web ConkerRecomp host
}
build_dk64() {
    if [[ ! -f donkeykong64.decompressed.us.z64 ]]; then
        local t r=$PWD
        t="$(mktemp -d)"
        cp ../rom.z64 "$t/baserom.us.z64"
        (cd "$t" && python3 -I "$r/lib/dk64_decomp/tools/generate_decompressed_rom.py" > /dev/null)
        mv "$t/baserom.us.decompressed.z64" donkeykong64.decompressed.us.z64
        rm -rf "$t"
    fi
    n64recomp N64RecompCLI RSPRecomp
    keep_times RecompiledFuncs rsp -- bash -c './N64Recomp us.toml > /dev/null && ./RSPRecomp n_aspMain.toml > /dev/null'
    web DK64Recompiled
}
build_wr() {
    # The decomp splat reads, at the commit docs/BUILDING.md names.
    [[ -d reference/wr64-decomp/.git ]] || { git clone -q https://github.com/LLONSIT/Wave-Race-64.git reference/wr64-decomp &&
        git -C reference/wr64-decomp checkout -q 7784087; }
    bash tools/web_patch.sh > /dev/null
    [[ -d .venv ]] || bash tools/wsl_setup_splat.sh > /dev/null
    bash tools/wsl_build_recompiler.sh > /dev/null
    # The decomp's build as a fresh clone has it: the sync cleans what the last run left in the repo (asm-all/) but not
    # in reference/, and a second build over the first made an ELF N64Recomp refused.
    git -C reference/wr64-decomp clean -fdxq
    keep_times RecompiledFuncs rsp -- bash -c 'python3 tools/generate_game.py ../rom.z64 > /dev/null'
    web WaveRace64Recomp
}
build_pw() {
    # Patched from clean every time, as Wave Race's web_patch.sh does: a web patch that stopped halfway once left
    # plume with some of its new files and not others, which neither patch_all.py nor apply.cmake can get past.
    local s p
    for s in lib/RT64 lib/N64ModernRuntime lib/RecompFrontend; do
        git -C $s submodule foreach --recursive -q 'git reset -q --hard && git clean -fdq'
        git -C $s reset -q --hard && git -C $s clean -fdq
    done
    python3 tools/patch_all.py > /dev/null
    for p in "rt64 lib/RT64" "plume lib/RT64/src/contrib/plume" "hlslpp lib/RT64/src/contrib/hlslpp" \
        "N64ModernRuntime lib/N64ModernRuntime" "N64Recomp lib/N64ModernRuntime/N64Recomp" "RecompFrontend lib/RecompFrontend"; do
        cmake -P lib/N64Recomp-browser/patches/apply.cmake $p > /dev/null
    done
    bash tools/wsl_build_recompiler.sh > /dev/null
    keep_times RecompiledFuncs rsp -- bash -c 'python3 tools/generate_game.py ../rom.z64 > /dev/null'
    web Pilotwings64Recomp
}
build_bt() {
    embuilder build sdl2-mt freetype-legacysjlj > /dev/null 2>&1
    bash tools/build_web.sh ../rom.z64 > ../build.log 2>&1 || { tail -20 ../build.log; exit 1; }
}
build_mk64() {
    [[ -f mk64.us.z64 ]] || cp ../rom.z64 mk64.us.z64
    n64recomp N64RecompCLI RSPRecomp
    keep_times RecompiledFuncs rsp -- bash -c './N64Recomp us.toml > /dev/null && ./RSPRecomp aspMain.us.toml > /dev/null'
    web MarioKart64Recompiled
}
build_sf64() {
    # N64Recomp reads the decompressed ROM (its tools/decompress_rom.sh); the page takes the plain one.
    [[ -f starfox64.us.rev1.uncompressed.z64 ]] || bash tools/decompress_rom.sh ../rom.z64 > /dev/null
    n64recomp N64RecompCLI RSPRecomp
    keep_times RecompiledFuncs rsp -- bash -c './N64Recomp us.rev1.toml > /dev/null && ./RSPRecomp aspMain.us.rev1.toml > /dev/null'
    web Starfox64Recompiled
}
build_oot() {
    bash tools/build_web.sh ../rom.z64 > ../build.log 2>&1 || { tail -20 ../build.log; exit 1; }
}
build_jfg() {
    bash tools/build_web.sh ../rom.z64 > ../build.log 2>&1 || { tail -20 ../build.log; exit 1; }
}

build_dkr() {
    # Patches its dependencies from clean whenever N64Recomp-browser or its patches moved (build/web-patched).
    bash scripts/build_web.sh ../rom.z64 > ../build.log 2>&1 || { tail -20 ../build.log; exit 1; }
}
build_snap() {
    # Patches its submodules from clean whenever N64Recomp-browser or patches/web moved (build-web-prep/web-patched).
    bash tools/build_web.sh ../rom.z64 > ../build.log 2>&1 || { tail -20 ../build.log; exit 1; }
}
build_rush2() {
    # Patches its submodules from clean whenever its own patches, N64Recomp-browser or web/patches moved
    # (build-web-prep/web-patched).
    bash tools/build_web.sh ../rom.z64 > ../build.log 2>&1 || { tail -20 ../build.log; exit 1; }
}
build_1080() {
    # Patches its submodules from clean whenever its own patches, N64Recomp-browser or web/patches moved
    # (build-web-prep/web-patched).
    bash tools/build_web.sh ../rom.z64 > ../build.log 2>&1 || { tail -20 ../build.log; exit 1; }
}
# Runs on the host (on_host): both scripts start Docker images of their own. The decomp's build checks the ROM, and
# makes the relink and syms/ the recompilation is made from (incremental after the first run).
build_pd() {
    bash tools/build_decomp.sh ../rom.z64 "$BUILD_CPUS" > ../build.log 2>&1 || { tail -20 ../build.log; exit 1; }
    git diff --quiet syms || { echo "tools/build_decomp.sh changed syms/: main's are not this ROM's"; exit 1; }
    bash tools/build_web.sh "$BUILD_CPUS" >> ../build.log 2>&1 || { tail -20 ../build.log; exit 1; }
}
# Its tools/build_web.sh recompiles from roms/sm64.us.z64 (the syms/ are in git) and builds the page, in its own image.
build_sm64() {
    mkdir -p roms
    cmp -s ../rom.z64 roms/sm64.us.z64 || cp ../rom.z64 roms/sm64.us.z64
    bash tools/build_web.sh "$BUILD_CPUS" > ../build.log 2>&1 || { tail -20 ../build.log; exit 1; }
}
on_host=" pd sm64 "

# --- Here ---

files() { echo "$1.html $1.js $1.wasm $1.data coi_serviceworker.js"; }
# same_files <clone> <main> <pin> <commit>: whether <commit>'s files are <main>'s with N64Recomp-browser at <pin>,
# checked in a scratch index, so a merge or a squash of the pin's PR passes too.
same_files() {
    local b=lib/N64Recomp-browser
    [[ -n "$(git -C "$1" ls-tree "$2" $b)" ]] || b=tools/N64Recomp-browser
    GIT_INDEX_FILE="$work/same.index" git -C "$1" read-tree "$2" &&
        GIT_INDEX_FILE="$work/same.index" git -C "$1" update-index --cacheinfo "160000,$3,$b" &&
        [[ "$(GIT_INDEX_FILE="$work/same.index" git -C "$1" write-tree)" == "$(git -C "$1" rev-parse "$4^{tree}")" ]]
}
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
published=() differ=() failed=()
for g in "${selected[@]}"; do
    read -r _ repo name dir folder <<< "$(grep "^$g " <<< "$games")"
    start=$SECONDS
    echo "== $g: $repo"
    if [[ $g == rush ]]; then
        clone="$rush" copy="${PAGES_COPY:+$PAGES_COPY-rush}" copy="${copy:-publish}"
        git -C "$clone" fetch -q origin main
        from="$(base "$clone")" || { failed+=("$g"); continue; }
        target=$from
        if [[ -n "$browser" ]]; then
            # main with lib/N64Recomp-browser at <commit>, made in a scratch index: the checkout's files and branches
            # stay as they are, and remote_build.sh's sync moves the submodule and patches it.
            git -C "$here/.." fetch -q origin "$browser"
            export GIT_INDEX_FILE="$work/rush.index"
            git -C "$clone" read-tree "$from"
            git -C "$clone" update-index --cacheinfo "160000,$(git -C "$here/.." rev-parse "FETCH_HEAD^{commit}"),lib/N64Recomp-browser"
            target="$(git -C "$clone" -c user.name=publish_pages -c user.email=publish_pages@localhost \
                commit-tree "$(git -C "$clone" write-tree)" -p "$from" -m "N64Recomp-browser $browser")"
            unset GIT_INDEX_FILE
        fi
    else
        clone="$cache/$g" copy="${PAGES_COPY:-pages}-$g"
        [[ -d "$clone/.git" ]] || git clone -q --filter=blob:none --no-checkout "https://github.com/$repo" "$clone"
        git -C "$clone" fetch -q origin main
        from="$(base "$clone")" || { failed+=("$g"); continue; }
        target=$from
    fi
    sha="$(git -C "$clone" rev-parse --short "$from")" label="${ref:+commit $sha}" label="${label:-main $sha}"
    out="$work/$g"
    if [[ -n $played_dir ]]; then
        # --played: the files a --browser --keep run left, if main is the main they were built from with only the pin
        # moved, which builds the same bytes.
        out="$played_dir/$g"
        read -r was pin < "$out/built" 2> /dev/null || { echo "   no $out/built: build it"; failed+=("$g"); continue; }
        if ! same_files "$clone" "$was" "$pin" "$from"; then
            echo "   main $sha is not main ${was:0:7} with N64Recomp-browser ${pin:0:7}: build it"; failed+=("$g"); continue
        fi
        built="$(cd "$out" && git hash-object $(files $name) | tr '\n' ' ')"
    elif ! bash "$remote_build" -C "$clone" -n $copy sync $target > "$work/$g.log" 2>&1; then
        echo "   sync failed:"; tail -5 "$work/$g.log"; failed+=("$g"); continue
    elif [[ $g == rush ]]; then
        bash "$remote_build" -n $copy build > "$work/$g.log" 2>&1 || { echo "   build failed:"; tail -20 "$work/$g.log"; failed+=("$g"); continue; }
    else
        rom="${ROMS:?set ROMS to the folder holding <game>.z64}/$g.z64"
        have="$(ssh -o BatchMode=yes "$BUILD_HOST" "sha1sum rush2049/$copy/rom.z64 2> /dev/null || true")"  # remote_build.sh's base
        [[ "$have" == "$(sha1sum < "$rom" | cut -c1-40) "* ]] || scp -q "$rom" "$BUILD_HOST:rush2049/$copy/rom.z64"
        script="set -euo pipefail; trap 'echo \"failed: \$BASH_COMMAND\" >&2' ERR; $(declare -f exclude browser_at unpatch patched keep_times n64recomp web build_$g); exclude;
            ${browser:+browser_at $browser;} unpatch; build_$g; patched"
        if [[ $on_host == *" $g "* ]]; then
            # In the copy as remote_build.sh's run is, holding its lock, but outside its image.
            run=(ssh -o BatchMode=yes "$BUILD_HOST" "cd ~/rush2049/$copy/repo && BUILD_CPUS=${BUILD_CPUS:-12} exec flock ../.lock bash -c $(printf %q "$script")")
        else
            run=(bash "$remote_build" -n $copy run "$script")
        fi
        if ! "${run[@]}" > "$work/$g.log" 2>&1; then
            echo "   build failed:"; tail -20 "$work/$g.log"; failed+=("$g"); continue
        fi
    fi
    [[ -n $played_dir ]] || built="$(bash "$remote_build" -n $copy run "cd $dir && git hash-object $(files $name)" | tr '\n' ' ')"
    pages="$(gh api "repos/$hub/git/trees/gh-pages:$folder" --jq '.tree[] | .path + " " + .sha' 2> /dev/null || true)"
    served=""
    for f in $(files $name); do served+="$(awk -v p="${f/$name.html/index.html}" '$1 == p { print $2 }' <<< "$pages") "; done
    echo "   $label${browser:+ with N64Recomp-browser $browser} $([[ -n $played_dir ]] && echo "as played" || echo "built in $((SECONDS - start)) s"); $([[ "$built" == "$served" ]] && echo "the same as the hub's" || echo "differs from the hub's")"
    [[ "$built" != "$served" ]] || continue
    differ+=("$g")
    if [[ -n $keep ]]; then
        rm -rf "${keep:?}/$g"
        bash "$remote_build" -n $copy get "$dir" "$keep/$g"
        echo "$from $browser_sha" > "$keep/$g/built"
    fi
    $dry_run && continue
    [[ -n $played_dir ]] || bash "$remote_build" -n $copy get "$dir" "$out"
    bash "$here/publish_page.sh" "$out" "$name" "$hub" "$label" --into "$folder" | sed 's/^/   /'
    published+=("$g")
done

# --- Each published page, from Pages ---

played=()
for g in "${published[@]}"; do
    read -r _ repo name dir folder <<< "$(grep "^$g " <<< "$games")"
    url="$hub_url$folder"
    out="$work/$g"; [[ -z $played_dir ]] || out="$played_dir/$g"
    js="$(git hash-object "$out/$name.js")"
    for i in $(seq 60); do
        [[ "$(curl -sf "$url/$name.js" | git hash-object --stdin)" == "$js" ]] && break
        sleep 10
    done
    if [[ $g == rush ]]; then rom="$rush/roms/rush2049.us.z64" clone="$rush"; else rom="$ROMS/$g.z64" clone="$cache/$g"; fi
    # The plan with the scripts its steps load (shader_survey.js): in tools/, or web/ (DKR-R).
    mkdir -p "$work/$g-tools"
    git -C "$clone" archive origin/main $(git -C "$clone" ls-tree --name-only origin/main tools web) | tar xf - -C "$work/$g-tools"
    plan="$work/$g-tools/tools/shader_plan.json"
    [[ -f "$plan" ]] || plan="$work/$g-tools/web/shader_plan.json"
    "${queue[@]}" "$node" "$here/play_page.mjs" chrome "$url/index.html" "$rom" "$plan" --play 20 --uncapped \
        --size 3840x2000 --profile "$work/$g-profile" --json "$work/$g.json" --record "$here/../plays.jsonl" --game $g \
        --build "Pages, main $(git -C "$clone" rev-parse --short origin/main)" --note "publish_pages.sh's boot check" \
        > "$work/$g-play.log" 2>&1 || true
    result="$("$node" -e "const s = require(process.argv[1]); const p = s.presents ? s.presents.median : 0;
        console.log((p > 0 && !s.webgpuErrors.length ? 'ok' : 'FAILED') + ': ' + p + ' presents/s, ' + s.webgpuErrors.length +
        ' WebGPU errors, ' + s.exceptions + ' exceptions')" "$work/$g.json" 2> /dev/null || echo "FAILED: no summary")"
    echo "== $g from Pages in headless Chrome: $result"
    [[ $result == ok* ]] && played+=("$g") || { tail -15 "$work/$g-play.log"; failed+=("$g"); }
done

echo
[[ ${#failed[@]} -eq 0 ]] || echo "failed: ${failed[*]}"
if [[ -n "$browser$ref" ]]; then
    echo "built${ref:+ ${args[1]} at $ref}${browser:+ with N64Recomp-browser $browser}, differing from Pages: ${differ[*]:-none}"
    # A --ref build is there to play whether or not it differs.
    shown=("${differ[@]}")
    [[ -z "$ref" || ${#failed[@]} -gt 0 ]] || shown=("${args[1]}")
    for g in "${shown[@]}"; do
        read -r _ repo name dir folder <<< "$(grep "^$g " <<< "$games")"
        echo "  $g: bash $remote_build -n $([[ $g == rush ]] && { [[ -n ${PAGES_COPY:-} ]] && echo "$PAGES_COPY-rush" || echo publish; } || echo "${PAGES_COPY:-pages}-$g") get $dir <dir>"
    done
fi
$dry_run && { echo "dry run: nothing published"; [[ ${#failed[@]} -eq 0 ]]; exit; }
if [[ ${#published[@]} -eq 0 ]]; then
    echo "every page is what its main builds: nothing published"
else
    echo "published, to play in Chrome and Firefox and update in the README's Games table:"
    for g in "${published[@]}"; do
        read -r _ repo name dir folder <<< "$(grep "^$g " <<< "$games")"
        echo "  $g $hub_url$folder/ (main $(git -C "$([[ $g == rush ]] && echo "$rush" || echo "$cache/$g")" rev-parse --short origin/main))"
    done
fi
[[ ${#failed[@]} -eq 0 ]]

#!/usr/bin/env bash
# Plays each published page from Pages by its game's regular plan, one after another: the play from Pages after a
# publish (CLAUDE.md, The games table), most often in Firefox, since publish_pages.sh boots each page from Pages only in
# headless Chrome. It needs no build, so a second machine with the ROMs can play the pages a retest publishes while the
# retest's own machine builds and plays the next ones.
#
#   bash tools/play_pages.sh <rush-2049-recomp checkout> <chrome|firefox> <game>... [--build <label>] [--note <text>]
#       [-- <queue command>...]
#
# <game> is a name in publish_pages.sh's list, whose games, repos and hub folders this reads. For each, one after
# another:
# 1. Fetches the game's repo (Rush 2049's checkout, a fork's clone in $PAGES_CACHE as publish_pages.sh keeps them),
#    reads which main the hub's folder was built from (the hub's last gh-pages commit names it, "<folder>/: built from
#    main <sha>") and says it, with the N64Recomp-browser it pins (a tag where it is one) and whether the repo's main has
#    moved on since.
# 2. Plays https://<hub>/<folder>/index.html with that main's play_plan.json (tools/, or web/ for DKR-R, Snap and
#    Rush 2) and the scripts beside it, uncapped at the stand-in's 3840x2000 as every measured play is (docs/playing.md),
#    on a fresh profile, its shot steps writing into a scratch dir. Each play goes into plays.jsonl
#    (play_page.mjs --record) as "Pages, <tag>" (or "Pages, main <sha>" for a pin that is no tag), or --build's label,
#    and --note's text, to be committed with the work.
# 3. Says ok or FAILED (no presents, a WebGPU error or an exception), its presents a second (Firefox's are not compared:
#    docs/playing.md), and for a failed play its log's tail and whether the game got as far as "Initializing recomp
#    heap" (one that never does hung in its loads, before the game started).
# A queue command after -- goes in front of each play_page.mjs, so each takes its own turn in the machine's GPU queue
# (CLAUDE.md, Playing a page), a shared one with a short limit like a smoke play's. It exits 1 if any play failed.
# It needs gh, each other game's plain dump as $ROMS/<game>.z64 (Rush 2049's in the checkout's roms/), as
# publish_pages.sh does, and NODE for play_page.mjs (node unless set).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
label="" note="" args=() queue=()
while [[ $# -gt 0 ]]; do
    case "$1" in
    --) shift; queue=("$@"); break ;;
    --build) label="$2"; shift ;;
    --note) note="$2"; shift ;;
    *) args+=("$1") ;;
    esac
    shift
done
[[ ${#args[@]} -ge 3 && ${args[1]} =~ ^(chrome|firefox)$ ]] || { sed -n 7,8p "$0"; exit 1; }
rush="$(cd "${args[0]}" && pwd)" browser="${args[1]}" selected=("${args[@]:2}")
node="${NODE:-node}" cache="${PAGES_CACHE:-$HOME/.cache/n64recomp-pages}"
# publish_pages.sh's list of games, read from it so the two never disagree.
games="$(sed -n '/^games="/,/^"/p' "$here/publish_pages.sh" | grep -v '"')"
hub="$(sed -n 's/^hub=//p' "$here/publish_pages.sh")"
for g in "${selected[@]}"; do grep -q "^$g " <<< "$games" || { echo "no game $g (one of: $(awk 'NF { printf "%s ", $1 }' <<< "$games"))"; exit 1; }; done
hub_url="$(gh api "repos/$hub/pages" --jq .html_url)"
hub_head="$(gh api "repos/$hub/commits/gh-pages" --jq .commit.message)"
git -C "$here/.." fetch -q --tags origin
work="$(mktemp -d)"
# A browser that has just quit can still hold a file in it on Windows: a folder left in TMPDIR fails no play.
trap 'rm -rf "$work" || true' EXIT
failed=()
for g in "${selected[@]}"; do
    read -r _ repo name dir folder <<< "$(grep "^$g " <<< "$games")"
    echo "== $g: $hub_url$folder/"
    if [[ $g == rush ]]; then
        clone="$rush" rom="$rush/roms/rush2049.us.z64"
    else
        clone="$cache/$g" rom="${ROMS:?set ROMS to the folder holding <game>.z64}/$g.z64"
        [[ -d "$clone/.git" ]] || git clone -q --filter=blob:none --no-checkout "https://github.com/$repo" "$clone"
    fi
    git -C "$clone" fetch -q origin main
    served="$(sed -n "s|^$folder/: built from main \([0-9a-f]*\)$|\1|p" <<< "$hub_head")"
    served="$(git -C "$clone" rev-parse --verify -q "${served:-none}^{commit}" || true)"
    [[ -n $served ]] || { echo "   the hub's last gh-pages commit names no main of $repo for $folder/"; failed+=("$g"); continue; }
    pin="$(git -C "$clone" ls-tree -r "$served" | awk '$2 == "commit" && $4 ~ /(^|\/)N64Recomp-browser$/ { print $3; exit }')"
    tag="$(git -C "$here/.." describe --tags --exact-match "$pin" 2> /dev/null || echo "${pin:0:7}")"
    main="$(git -C "$clone" rev-parse origin/main)"
    echo "   serves main ${served:0:7}, N64Recomp-browser $tag$([[ $served == "$main" ]] || echo "; $repo's main is ${main:0:7} now")"
    # The plan with the scripts its steps load (shader_survey.js), as publish_pages.sh takes them.
    mkdir -p "$work/$g/plan" "$work/$g/shots"
    git -C "$clone" archive "$served" $(git -C "$clone" ls-tree --name-only "$served" tools web) | tar xf - -C "$work/$g/plan"
    plan="$work/$g/plan/tools/play_plan.json"
    [[ -f "$plan" ]] || plan="$work/$g/plan/web/play_plan.json"
    [[ -f "$plan" ]] || { echo "   no play_plan.json in tools/ or web/"; failed+=("$g"); continue; }
    build="${label:-Pages, $([[ $tag == v* ]] && echo "$tag" || echo "main ${served:0:7}")}"
    (cd "$work/$g/shots" && "${queue[@]}" "$node" "$here/play_page.mjs" "$browser" "$hub_url$folder/index.html" "$rom" "$plan" \
        --uncapped --size 3840x2000 --profile "$work/$g/profile" --json "$work/$g/summary.json" \
        --record "$here/../plays.jsonl" --game "$g" --build "$build" ${note:+--note "$note"}) > "$work/$g/play.log" 2>&1 || true
    result="$("$node" -e "const s = require(process.argv[1]); const p = s.presents ? Math.round(s.presents.median * 10) / 10 : 0;
        console.log((p > 0 && !s.webgpuErrors.length && !s.exceptions ? 'ok' : 'FAILED') + ': ' + p + ' presents/s, ' +
        s.webgpuErrors.length + ' WebGPU errors, ' + s.exceptions + ' exceptions')" "$work/$g/summary.json" 2> /dev/null ||
        echo "FAILED: no summary")"
    echo "== $g from Pages in $browser: $result"
    if [[ $result != ok* ]]; then
        failed+=("$g")
        tail -15 "$work/$g/play.log" | sed 's/^/   /'
        grep -q "Initializing recomp heap" "$work/$g/play.log" && echo "   it reached Initializing recomp heap" ||
            echo "   it never reached Initializing recomp heap"
    fi
done
echo
[[ ${#failed[@]} -eq 0 ]] && echo "every page played ok" || { echo "failed: ${failed[*]}"; exit 1; }

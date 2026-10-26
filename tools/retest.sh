#!/usr/bin/env bash
# One run of the retest (docs/publishing.md, The retest) from build to publish, a game at a time: what each run
# otherwise wrote by hand around publish_pages.sh, ab_pages.mjs and play_pages.sh.
#
#   bash tools/retest.sh <rush-2049-recomp checkout> <tag> <dir> [<game>...] [--ab <game>...] [--cpu-throttle <rate>]
#       [--queue <command>] [--note <text>]
#
# <game>s are publish_pages.sh's names (all of them without), --ab the games that stand for the rest in Chrome's A/B
# (none without: a tag that can't move speed gets only the smoke plays). <dir> holds the run: the builds
# (<dir>/keep/<game>), each play's logs (<dir>/ab, <dir>/smoke), each step's log (<dir>/<game>.<step>.log) and a marker
# per game and step that ended (<dir>/<game>.<step>, holding the step's exit code), so a run started again with the
# same <dir> skips what is done and goes on where it stopped. Two loops run side by side:
# - the builds, one game after another, the --ab games first: publish_pages.sh <game> --browser <tag> --keep, which
#   leaves a page whose files differ from what Pages serves in <dir>/keep/<game> and says when they are the same;
# - the plays, a game behind: for a page that differs, its A/B if it is one of --ab (ab_pages.mjs, Chrome, Pages' page
#   against the build, interleaved), then its smoke play (ab_pages.mjs --smoke, Firefox, the build), each by the plan
#   of the main it was built from (tools/ or web/ play_plan.json), uncapped at 3840x2000, into plays.jsonl. The --ab
#   games come first, so their verdict is in before any pin moves: one that isn't "no worse" stops every pin, and
#   every other page then gets the A/B too, for the work it is filed with. A page whose smoke play is clean, with the
#   A/B gate open, then moves its fork's pin onto the tag (a commit on its main, the built main with only
#   N64Recomp-browser moved, pushed as a fast-forward) and is published as played (publish_pages.sh --played, which
#   boots it from Pages in headless Chrome). An --ab game, and one whose repo changed more than its pin since the main
#   Pages served, is then played from Pages in Firefox (play_pages.sh); the rest are not (docs/publishing.md, The
#   retest). Rush 2049, Perfect Dark, Super Mario 64 and F-Zero X move by a PR on their own repos (CLAUDE.md, The
#   pins): for each, the run pushes the pin commit as
#   branch n64recomp-browser-<tag> and opens that PR, and stops there; once it merges (Rush 2049's after its desktop
#   build has run), `publish_pages.sh <checkout> <game> --played <dir>/keep` and `play_pages.sh <checkout> firefox
#   <game>` publish and play it.
# --cpu-throttle is ab_pages.mjs's for the A/B (a desktop GPU's Chrome reads the same ceiling for every build
# uncapped). --queue <command> takes each build and play's turn in the machine's GPU queue (CLAUDE.md, Playing a page):
# it is run as `<command> <shared|whole> <minutes> <command line...>`, a build and a smoke play, a boot and a play from
# Pages a shared turn, an A/B's play a whole one, the minutes the turn's limit. Without it each runs at once.
# --note <text> goes into every play's note in plays.jsonl after "retest <tag>": the host, and what else ran beside it.
# At the end it prints each game's outcome: same (no new bytes: its Played cell takes the tag), published, PR (an own
# recomp's, to merge and publish), held (the gate is shut, its plays done), or what failed, with the step's log.
# It needs what publish_pages.sh, ab_pages.mjs and play_pages.sh need (BUILD_HOST, ROMS, gh, push access to the forks)
# and NODE, a node that runs the .mjs tools.
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
args=() ab=() throttle=0 queue="" note=""
while [[ $# -gt 0 ]]; do
    case "$1" in
    --ab) shift; while [[ $# -gt 0 && $1 != --* ]]; do ab+=("$1"); shift; done; continue ;;
    --cpu-throttle) throttle="$2"; shift ;;
    --queue) queue="$2"; shift ;;
    --note) note="$2"; shift ;;
    *) args+=("$1") ;;
    esac
    shift
done
[[ ${#args[@]} -ge 3 ]] || { sed -n 5,6p "$0"; exit 1; }
rush="$(cd "${args[0]}" && pwd)" tag="${args[1]}" selected=("${args[@]:3}")
mkdir -p "${args[2]}" && run="$(cd "${args[2]}" && pwd)"
node="${NODE:-node}" cache="${PAGES_CACHE:-$HOME/.cache/n64recomp-pages}"
games="$(sed -n '/^games="/,/^"/p' "$here/publish_pages.sh" | grep -v '"')"
[[ ${#selected[@]} -gt 0 ]] || selected=($(awk 'NF { print $1 }' <<< "$games"))
for g in "${selected[@]}" "${ab[@]}"; do grep -q "^$g " <<< "$games" || { echo "no game $g"; exit 1; }; done
git -C "$here/.." fetch -q --tags origin
tag_sha="$(git -C "$here/.." rev-parse -q --verify "$tag^{commit}")" || { echo "no tag $tag"; exit 1; }
own=" rush pd sm64 fzx "
# The --ab games first, then the rest in the order given.
order=("${ab[@]}")
for g in "${selected[@]}"; do [[ " ${ab[*]} " == *" $g "* ]] || order+=("$g"); done
hub="$(sed -n 's/^hub=//p' "$here/publish_pages.sh")"
hub_url="$(gh api "repos/$hub/pages" --jq .html_url)"

# q <shared|whole> <minutes> <command...>: the command in its turn of the queue, if there is one.
q() { if [[ -n $queue ]]; then $queue "$@"; else shift 2; "$@"; fi; }
qwords() { [[ -n $queue ]] && echo "$queue $1 $2" || true; }
# step <game> <name> <command...>: runs it once per <dir>, its output in <game>.<name>.log, its exit code in the marker.
step() {
    local g=$1 s=$2; shift 2
    [[ -f "$run/$g.$s" ]] || { echo "== $g $s $(date +%H:%M:%S)"; "$@" > "$run/$g.$s.log" 2>&1; echo $? > "$run/$g.$s"; }
    echo "== $g $s exit $(cat "$run/$g.$s")"
    return "$(cat "$run/$g.$s")"
}
clone_of() { [[ $1 == rush ]] && echo "$rush" || echo "$cache/$1"; }
rom_of() { [[ $1 == rush ]] && echo "$rush/roms/rush2049.us.z64" || echo "${ROMS:?set ROMS}/$1.z64"; }
# pin_commit <game>: the built main with N64Recomp-browser moved to the tag, as a commit in the game's clone.
pin_commit() {
    local clone was pin b index="$run/$1.index"
    clone="$(clone_of "$1")"
    read -r was pin < "$run/keep/$1/built"
    b=lib/N64Recomp-browser
    [[ -n "$(git -C "$clone" ls-tree "$was" $b)" ]] || b=tools/N64Recomp-browser
    GIT_INDEX_FILE="$index" git -C "$clone" read-tree "$was" &&
        GIT_INDEX_FILE="$index" git -C "$clone" update-index --cacheinfo "160000,$pin,$b" &&
        git -C "$clone" commit-tree "$(GIT_INDEX_FILE="$index" git -C "$clone" write-tree)" -p "$was" \
            -m "$b at N64Recomp-browser $tag (${pin:0:7})" \
            -m "N64Recomp-browser's retest: the page built on $tag played clean in Firefox$([[ ${#ab[@]} -gt 0 ]] &&
                echo ", and Chrome's A/B against Pages on ${ab[*]} read no worse")."
}
# move_pin <game>: a fork's main fast-forwarded to the pin commit; an own recomp's PR opened with it.
move_pin() {
    local g=$1 clone repo commit branch="n64recomp-browser-$tag"
    clone="$(clone_of "$g")" repo="$(awk -v g="$g" '$1 == g { print $2 }' <<< "$games")"
    git -C "$clone" fetch -q origin main
    read -r was _ < "$run/keep/$g/built"
    [[ "$(git -C "$clone" rev-parse origin/main)" == "$was" ]] || { echo "$repo's main moved since the build"; return 1; }
    commit="$(pin_commit "$g")" || return 1
    if [[ $own != *" $g "* ]]; then
        git -C "$clone" push origin "$commit:refs/heads/main" && echo "pushed $repo main ${commit:0:7}"
        return
    fi
    git -C "$clone" push -f origin "$commit:refs/heads/$branch" || return 1
    local body="Moves the N64Recomp-browser pin to $tag, the tag N64Recomp-browser's retest builds every page on: what it"
    body+=" brings is \`git log <the old pin>..$tag\` there. Only the pin changes. The page built from this commit played"
    body+=" clean in Firefox (N64Recomp-browser's plays.jsonl); once this merges, \`publish_pages.sh --played\` publishes"
    body+=" the files that were played."
    gh pr view "$branch" -R "$repo" --json url --jq .url 2> /dev/null ||
        gh pr create -R "$repo" --base main --head "$branch" --title "lib/N64Recomp-browser at $tag (${tag_sha:0:7})" \
            --body "$body"
}

builds() {
    for g in "${order[@]}"; do
        step "$g" build q shared 40 bash "$here/publish_pages.sh" "$rush" "$g" --browser "$tag" --keep "$run/keep"
    done
}
builds > "$run/builds.log" 2>&1 &
builder=$!

# outcome <game> <text>
outcome() { echo "$2" > "$run/$1.outcome"; echo "== $1: $2"; }
gate=open
for g in "${order[@]}"; do
    while [[ ! -f "$run/$g.build" ]] && kill -0 $builder 2> /dev/null; do sleep 10; done
    [[ -f "$run/$g.build" ]] || { outcome "$g" "never built"; continue; }
    if [[ ! -f "$run/keep/$g/built" ]]; then
        grep -q "the same as the hub's" "$run/$g.build.log" && outcome "$g" same ||
            outcome "$g" "build failed: $run/$g.build.log"
        continue
    fi
    read -r _ repo name _ folder <<< "$(grep "^$g " <<< "$games")"
    read -r was _ < "$run/keep/$g/built"
    clone="$(clone_of "$g")"
    # The plan of the main built, with the scripts beside it; what Pages serves now, by its tag.
    rm -rf "$run/plan/$g" && mkdir -p "$run/plan/$g"
    git -C "$clone" archive "$was" $(git -C "$clone" ls-tree --name-only "$was" tools web) | tar xf - -C "$run/plan/$g"
    plan="$run/plan/$g/tools/play_plan.json"
    [[ -f $plan ]] || plan="$run/plan/$g/web/play_plan.json"
    page="$("$node" -e "console.log(require(process.argv[1]).page || 'index.html')" "$plan")"
    build="$run/keep/$g"
    [[ -f "$build/$page" ]] || build="$build/$name.html"
    served="$(gh api "repos/$hub/commits/gh-pages" --jq .commit.message | sed -n "s|^$folder/: built from main \([0-9a-f]*\)$|\1|p")"
    served_pin="$(git -C "$clone" ls-tree -r "${served:-none}" 2> /dev/null |
        awk '$2 == "commit" && $4 ~ /(^|\/)N64Recomp-browser$/ { print $3; exit }')"
    pages_build="$(git -C "$here/.." describe --tags --exact-match "$served_pin" 2> /dev/null || echo "main ${served:0:7}")"
    # Its own changes since the main Pages served, besides the pin: its shell, patches or plan, played from Pages too.
    own_changes=no
    git -C "$clone" diff --quiet "${served:-none}" "$was" -- . ':!lib/N64Recomp-browser' ':!tools/N64Recomp-browser' \
        2> /dev/null || own_changes=yes
    abp=(env NODE="$node" "$node" "$here/ab_pages.mjs" "$g" "$hub_url$folder/" "$build" "$(rom_of "$g")" "$plan"
        --pages-build "$pages_build" --build "$tag" --record "$here/../plays.jsonl" --note "retest $tag${note:+; $note}")
    if [[ " ${ab[*]} " == *" $g "* || $gate == shut ]]; then
        step "$g" ab "${abp[@]}" --cpu-throttle "$throttle" --out "$run/ab/$g" -- $(qwords whole 8)
        [[ $(cat "$run/$g.ab") == 0 ]] || gate=shut
    fi
    step "$g" smoke "${abp[@]}" --smoke --out "$run/smoke/$g" -- $(qwords shared 8) ||
        { outcome "$g" "smoke play not clean: $run/$g.smoke.log"; continue; }
    [[ $gate == open ]] || { outcome "$g" "held: an A/B read worse or not clean"; continue; }
    step "$g" pin move_pin "$g" || { outcome "$g" "pin not moved: $run/$g.pin.log"; continue; }
    if [[ $own == *" $g "* ]]; then outcome "$g" "PR $(tail -1 "$run/$g.pin.log")"; continue; fi
    step "$g" publish bash "$here/publish_pages.sh" "$rush" "$g" --played "$run/keep" -- $(qwords shared 5) ||
        { outcome "$g" "publish failed: $run/$g.publish.log"; continue; }
    if [[ " ${ab[*]} " != *" $g "* && $own_changes == no ]]; then
        outcome "$g" "published (its pin alone changed: no Firefox play from Pages)"
    else
        step "$g" firefox bash "$here/play_pages.sh" "$rush" firefox "$g" --note "retest $tag${note:+; $note}" -- $(qwords shared 8) &&
            outcome "$g" "published" || outcome "$g" "published; its Firefox play from Pages failed: $run/$g.firefox.log"
    fi
done
wait $builder
echo
for g in "${order[@]}"; do printf '%-6s %s\n' "$g" "$(cat "$run/$g.outcome" 2> /dev/null || echo "?")"; done

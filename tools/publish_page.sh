#!/usr/bin/env bash
# Publishes a recomp's built page on GitHub Pages, at the repo's Pages address (https://<owner>.github.io/<repo>/, or
# its custom domain, as the hub's https://n64hub.com/; it prints the one `gh api repos/<owner/repo>/pages` gives): the
# build dir's <name>.html as index.html, with its .js, .wasm, .data (a page that preloads nothing has none) and
# coi_serviceworker.js (Pages can't send the cross-origin headers threads need, so the service worker sets them after
# one reload), and a .nojekyll so Pages serves the files as they are.
# They go in as the only commit on the orphan branch gh-pages, force-pushed each time, so the repo keeps one copy of
# the page rather than every one published. The first time, Pages is switched on for that branch (with gh).
#
#   bash tools/publish_page.sh <build dir> <name> <owner/repo> [<what it was built from>] [--into <dir>] [--dry-run]
#   bash tools/publish_page.sh --drop <dir> <owner/repo>
#
# e.g. bash lib/N64Recomp-browser/tools/publish_page.sh build-web BanjoRecompiled n64hub/n64hub.github.io \
#          "main $(git rev-parse --short HEAD)" --into banjo-kazooie
# A page holds the recompiled code, so it is built from the ROM wherever that is (CI has none) and published from
# there, or copied to a machine with push access first: the script needs only the build's files. Check that the .data
# holds no game data: it is what the page preloads (assets, a controller database), never the ROM or anything
# extracted from it. --dry-run stages the page in <build dir>/page and pushes nothing.
#
# A test page (a branch's build, played by hand before it lands) is a folder of its own beside main's page:
# --into <dir> publishes the build there, at <that address>/<dir>/, and --drop <dir> takes it off
# once it is done with. Each publish starts from the gh-pages it replaces: main's page replaces the files at the top
# and keeps every folder, a test page replaces its folder and keeps the rest. The commit's subject names what main's
# page was built from ("The web page, built from main <sha>", which is what `git log -1 origin/gh-pages` reads), and
# a line in its body each test page's ("<dir>/: built from <branch> <sha>"). The hub (tools/publish_site.sh) is the
# same: its top is the games' page, and each game's page is published into a folder of it with --into.
set -euo pipefail
dry_run=false into="" drop=""
args=()
while [ $# -gt 0 ]; do
    case "$1" in
        --dry-run) dry_run=true ;;
        --into) into="${2:-}"; shift ;;
        --drop) drop="${2:-}"; shift ;;
        *) args+=("$1") ;;
    esac
    shift
done
folder="$into$drop"
[[ -z "$into" || -z "$drop" ]] || { echo "--into or --drop, not both"; exit 1; }
[[ -z "$folder" || "$folder" =~ ^[A-Za-z0-9_-][A-Za-z0-9._-]*$ ]] || { echo "--into and --drop take a folder's name"; exit 1; }
if [ -n "$drop" ]; then
    [ ${#args[@]} -eq 1 ] || { sed -n '9p' "$0"; exit 1; }
    repo="${args[0]}" stage="$(mktemp -d)"
    trap 'rm -rf "$stage"' EXIT
else
    [ ${#args[@]} -ge 3 ] || { sed -n '8p' "$0"; exit 1; }
    build="${args[0]}" name="${args[1]}" repo="${args[2]}" from="${args[3]:-}"
    stage="$build/page"
    rm -rf "$stage"
    mkdir -p "$stage"
    cp "$build/$name".{js,wasm} "$build"/coi_serviceworker.js "$stage"/
    [ ! -f "$build/$name.data" ] || cp "$build/$name.data" "$stage"/
    cp "$build/$name.html" "$stage"/index.html
    touch "$stage"/.nojekyll
    if $dry_run; then
        echo "staged in $stage, nothing pushed"
        exit 0
    fi
fi

url="https://github.com/$repo"
git=(git -C "$stage")
# publish_once: a commit on top of what gh-pages holds now, pushed with a lease on it. Called as a condition, where
# set -e is off, so each step that matters returns on its own failure.
publish_once() {
rm -rf "$stage/.git"
"${git[@]}" init -q -b gh-pages || return 1
# What gh-pages holds now, unless there is none yet (ls-remote's 2); it is a commit or two, as each publish is an
# orphan.
have=0
git ls-remote -q --exit-code "$url" refs/heads/gh-pages > /dev/null || have=$?
case $have in
    0) "${git[@]}" fetch -q "$url" gh-pages || return 1
       lease=(--force-with-lease="gh-pages:$("${git[@]}" rev-parse FETCH_HEAD)")
       "${git[@]}" read-tree FETCH_HEAD || return 1
       subject="$("${git[@]}" log --format=%s FETCH_HEAD | grep -m1 -e '^The web page' -e "^The games' page" -e ' plays in the hub at /' || true)"
       lines="$("${git[@]}" log -1 --format=%b FETCH_HEAD | grep -E '^[A-Za-z0-9._-]+/:( |$)' || true)" ;;
    2) subject="" lines="" lease=(-f) ;;
    *) return 1 ;;
esac
[ -z "$drop" ] || "${git[@]}" ls-files --error-unmatch "$drop" > /dev/null 2>&1 ||
    { echo "gh-pages has no $drop/"; exit 1; }

# Out with the files this replaces, in with the build's.
if [ -n "$folder" ]; then
    "${git[@]}" rm -r -q -f --cached --ignore-unmatch -- "$folder"
    lines="$(awk -v d="$folder/:" 'index($0, d) != 1' <<< "$lines")"
else
    { "${git[@]}" ls-files | grep -v / || true; } | xargs -r "${git[@]}" rm -q -f --cached --
fi
if [ -z "$drop" ]; then
    for f in $(ls -A "$stage" | grep -vx -e .git -e .nojekyll); do
        "${git[@]}" update-index --add --cacheinfo \
            "100644,$("${git[@]}" hash-object -w --no-filters "$f"),${into:+$into/}$f" || return 1  # the files exactly as built
    done
    if [ -n "$into" ]; then
        lines="$(printf '%s\n%s' "$lines" "$into/:${from:+ built from $from}" | sed '/^$/d' | sort)"
    else
        subject="The web page${from:+, built from $from}"
    fi
fi
"${git[@]}" update-index --add --cacheinfo "100644,$("${git[@]}" hash-object -w --stdin < /dev/null),.nojekyll" || return 1
"${git[@]}" commit -q -F - <<< "${subject:-The web page}${lines:+$'\n\n'$lines}" || return 1
"${git[@]}" push -q "${lease[@]}" "$url" gh-pages
}
# Another publish to this gh-pages (a page in another of its folders, the hub's page) pushed since the fetch: the lease
# refuses the push, and it starts again from the gh-pages that publish left, so publishes of several pages can run at
# once.
for try in 1 2 3 4 5; do
    publish_once && break
    [ $try -lt 5 ] || { echo "gh-pages refused this publish $try times"; exit 1; }
    echo "gh-pages moved during this publish: again on top of it"
    sleep $((try * 3))
done
# A first push of gh-pages to a public repo can switch Pages on by itself in the seconds between the check and the
# POST, which then answers 409 "already enabled": so a refused POST is checked again.
gh api "repos/$repo/pages" > /dev/null 2>&1 ||
    gh api -X POST "repos/$repo/pages" -f "source[branch]=gh-pages" -f "source[path]=/" > /dev/null 2>&1 ||
    gh api "repos/$repo/pages" > /dev/null
echo "pushed gh-pages: $(gh api "repos/$repo/pages" --jq .html_url)${folder:+$folder/} $([ -n "$drop" ] && echo "is gone" || echo "serves it") in a minute or two"

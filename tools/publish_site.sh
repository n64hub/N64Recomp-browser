#!/usr/bin/env bash
# Publishes the games' page (site/) at the top of the hub, the n64hub org's own GitHub Pages site
# (n64hub/n64hub.github.io): https://n64hub.github.io/, or the custom domain its Pages has (n64hub.com). Every game's page is a
# folder of the hub beside it (tools/publish_page.sh --into <folder>, as tools/publish_pages.sh publishes them), the
# same origin, so a game plays in the page's frame. The top is site/'s files, frontend/coi_serviceworker.js (Pages
# can't send the cross-origin headers a frame with threads needs), frontend/save_sync.js (sign-in's upload), a .nojekyll, and a CNAME naming the domain once the
# repo has one; they replace the files at the top of gh-pages and every folder stays. The page reads the Games table
# from main's README.md each visit, so only a change to site/ needs publishing again.
# The domain is set once, in the repo's Pages settings, after its DNS points at GitHub Pages: a CNAME published before
# then would send every game's page to a domain that doesn't serve them. From then on each publish keeps it.
#
#   bash tools/publish_site.sh [--dry-run]
set -euo pipefail
repo=n64hub/n64hub.github.io
dry_run=false
[ "${1:-}" != --dry-run ] || dry_run=true
root="$(cd "$(dirname "$0")/.." && pwd)"
stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT
cp -r "$root"/site/. "$stage"/
cp "$root"/frontend/coi_serviceworker.js "$root"/frontend/save_sync.js "$stage"/
domain="$(gh api "repos/$repo/pages" --jq ".cname // empty")"
[ -z "$domain" ] || echo "$domain" > "$stage"/CNAME
if $dry_run; then
    trap - EXIT
    echo "staged in $stage, nothing pushed"
    exit 0
fi

url="https://github.com/$repo"
git=(git -C "$stage")
"${git[@]}" init -q -b gh-pages
"${git[@]}" fetch -q "$url" gh-pages
had="$("${git[@]}" rev-parse FETCH_HEAD)"
"${git[@]}" read-tree FETCH_HEAD
{ "${git[@]}" ls-files | grep -v / || true; } | xargs -r "${git[@]}" rm -q -f --cached --
"${git[@]}" rm -r -q -f --cached --ignore-unmatch -- img
for f in $(cd "$stage" && find . -path ./.git -prune -o -type f -print | sed 's|^\./||'); do
    "${git[@]}" update-index --add --cacheinfo "100644,$("${git[@]}" hash-object -w --no-filters "$f"),$f"
done
"${git[@]}" update-index --add --cacheinfo "100644,$("${git[@]}" hash-object -w --stdin < /dev/null),.nojekyll"
# The lines naming what each folder was built from stay.
lines="$("${git[@]}" log -1 --format=%b "$had" | grep -E '^[A-Za-z0-9._-]+/:( |$)' || true)"
subject="The games' page, from $(git -C "$root" rev-parse --abbrev-ref HEAD) $(git -C "$root" rev-parse --short HEAD)"
"${git[@]}" commit -q -F - <<< "$subject${lines:+$'\n\n'$lines}"
# Another publish (a game's folder) pushed since the fetch: refused, so run it again.
"${git[@]}" push -q --force-with-lease="gh-pages:$had" "$url" gh-pages
echo "pushed gh-pages: $(gh api "repos/$repo/pages" --jq .html_url) serves it in a minute or two"

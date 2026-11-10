#!/usr/bin/env bash
# Waits until GitHub Pages serves a gh-pages commit, building it again when its deploy fails: the end of every publish
# (tools/publish_page.sh, publish_site.sh, publish_pages.sh), since a push only starts the deploy, and one that fails
# leaves the site serving the old files while the push looks done.
#
#   bash tools/wait_pages.sh <owner/repo> <gh-pages commit>
#
# Pages deploys a push with an Actions run: Pages' own "pages build and deployment", or on a repo whose Pages builds
# from a workflow, its "Deploy Pages" (the hub's .github/workflows/pages.yml on gh-pages, which waits an hour for the
# deploy). The deploy (actions/deploy-pages) gives up after 10 minutes in Pages' own run, and on the hub, whose
# artifact is every game's page at once (240 MB), deploys have sat in "syncing_files" that long for hours at a time
# while others took about a minute; a re-run of a failed run has also sat queued with no jobs. So a run that fails, or
# is queued for 10 minutes, is replaced by a new run of the same commit (POST /pages/builds, or the workflow
# dispatched on gh-pages), three times at most. Pages' own build records (/pages/builds) aren't read: they say
# "errored" of runs that deployed.
# A newer push to gh-pages carries this one, since every publish commits on top of what gh-pages holds (with a lease),
# and Pages cancels the older run for it: the wait moves to the newest commit, so it ends when Pages serves this one or
# a later one. It fails after two hours, or after a third failed run.
set -euo pipefail
[[ $# -eq 2 ]] || { sed -n 6p "$0"; exit 1; }
repo="$1" sha="$2"
runs() {  # the newest Pages run of a commit: id status conclusion created_at
    gh api "repos/$repo/actions/runs?head_sha=$1&per_page=10" \
        --jq '[.workflow_runs[] | select(.name == "pages build and deployment" or .name == "Deploy Pages")][0] // empty |
            "\(.id) \(.status) \(.conclusion) \(.created_at)"'
}
# A run created before the last new build (give or take the clocks) is the one it replaced: no run yet.
rebuild() {
    if [[ "$(gh api "repos/$repo/pages" --jq .build_type)" == workflow ]]; then
        gh api -X POST "repos/$repo/actions/workflows/pages.yml/dispatches" -f ref=gh-pages
    else
        gh api -X POST "repos/$repo/pages/builds" > /dev/null
    fi || { echo "Pages refused a new build of $repo"; exit 1; }
    builds=$((builds + 1)) asked=$(date +%s) since=$(($(date +%s) - 30))
}
start=$(date +%s) asked=$start since=0 builds=0
while :; do
    sleep 15
    now=$(date +%s)
    (( now - start < 7200 )) || { echo "Pages hasn't deployed $repo's gh-pages ${sha:0:7} in two hours"; exit 1; }
    head="$(gh api "repos/$repo/commits/gh-pages" --jq .sha 2> /dev/null || true)"
    [[ -n $head ]] || continue  # GitHub's API answering badly for a moment
    if [[ $head != "$sha" ]]; then
        echo "gh-pages moved on to ${head:0:7}, which carries ${sha:0:7}: waiting for that one"
        sha=$head builds=0 asked=$now since=0
    fi
    id="" status="" conclusion="" created=""
    read -r id status conclusion created <<< "$(runs "$sha" 2> /dev/null)" || true
    [[ -z $id ]] || (( $(date -d "$created" +%s) >= since )) || id=""
    url="https://github.com/$repo/actions/runs/$id"
    if [[ -z $id ]]; then
        # No run yet: Pages starts one in seconds, so after three minutes it is asked to.
        (( now - asked < 180 )) || { echo "no Pages run for ${sha:0:7} after 3 minutes: building it"; rebuild; }
    elif [[ $status == completed && $conclusion == success ]]; then
        echo "Pages serves gh-pages ${sha:0:7} ($url)"; exit 0
    elif [[ $status == completed ]] ||
        { [[ $status == queued ]] && (( now - $(date -d "$created" +%s) > 600 && now - asked > 600 )); }; then
        [[ $status == completed ]] && why="$conclusion" || why="queued for 10 minutes"
        (( builds < 3 )) || { echo "Pages' deploy of ${sha:0:7} failed again ($why, $url): giving up after $builds new runs"; exit 1; }
        echo "Pages' deploy of ${sha:0:7} failed ($why, $url): building it again"
        rebuild
    fi
done

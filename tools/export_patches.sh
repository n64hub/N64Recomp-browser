#!/usr/bin/env bash
# Writes patches/<name>.patch for every project in patches/patches.txt: the diff from the upstream commit its fork is
# on to the fork commit forks.txt names (for plume, hlslpp and N64Recomp, the one rt64's or N64ModernRuntime's fork
# commit points at), without the fork's README, COPYING (an upstream license merged in), .gitmodules and submodule
# pointers. Run it after every change to forks.txt or to an upstream commit in patches.txt; CI checks that the patches
# match.
#
#   bash tools/export_patches.sh [<work dir>]      fetches into <work dir> (default: a temporary one)
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
work="${1:-$(mktemp -d)}"
mkdir -p "$work"

fetch() { # <dir> <url> <commit>...
    local dir="$1" url="$2"; shift 2
    [[ -d "$dir/.git" ]] || git init -q "$dir"
    git -C "$dir" -c protocol.version=2 fetch -q --depth 1 --filter=blob:none "$url" "$@"
}

declare -A commit
while read -r name url sha; do commit[$name]="$sha"; done < <(grep -v '^#' "$root/forks.txt" | grep .)

grep -v '^#' "$root/patches/patches.txt" | grep . | while read -r name path fork base; do
    top="${path%%/*}"
    if [[ "$path" == "$top" ]]; then
        tip="${commit[$top]}"
    else  # a fork inside another: the commit the outer fork points at
        fetch "$work/$top" "$(grep -E "^$top " "$root/forks.txt" | awk '{print $2}')" "${commit[$top]}"
        tip="$(git -C "$work/$top" ls-tree "${commit[$top]}" "${path#*/}" | awk '{print $3}')"
    fi
    fetch "$work/$name" "$fork" "$tip" "$base"
    {
        echo "$name: $fork $tip"
        echo "on upstream $base (tools/export_patches.sh)"
        echo
        git -C "$work/$name" diff --binary --no-renames --ignore-submodules=all "$base" "$tip" -- . \
            ':(exclude)README.md' ':(exclude)Readme.md' ':(exclude)COPYING' ':(exclude).gitmodules' ':(exclude).github'
    } > "$root/patches/$name.patch"
    echo "$name: $(grep -c '^diff --git' "$root/patches/$name.patch") files, $base..$tip"
done

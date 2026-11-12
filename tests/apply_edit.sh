#!/usr/bin/env bash
# patches/apply.cmake on a checkout patched with an older version of a patch: what the old one put in comes out and the
# new one goes in, applied plainly and three-way merged, where the edit changes the old one's own lines, adds a hunk or
# drops one. A made-up project in a scratch folder, with apply.cmake beside its own patches.txt and demo.patch, stands
# in for a recomp's rt64 and this repository moving on.
#
#   bash tests/apply_edit.sh
set -euo pipefail
here=$(cd "$(dirname "$0")/.." && pwd)
t=$(mktemp -d)
trap 'rm -rf "$t"' EXIT
# apply.cmake's git too: files as written, whatever the host's git does with line endings.
export GIT_CONFIG_COUNT=5 \
    GIT_CONFIG_KEY_0=core.autocrlf GIT_CONFIG_VALUE_0=false \
    GIT_CONFIG_KEY_1=user.name GIT_CONFIG_VALUE_1=test \
    GIT_CONFIG_KEY_2=user.email GIT_CONFIG_VALUE_2=test@example.com \
    GIT_CONFIG_KEY_3=init.defaultBranch GIT_CONFIG_VALUE_3=main \
    GIT_CONFIG_KEY_4=advice.detachedHead GIT_CONFIG_VALUE_4=false
fail() { echo "FAIL: $*"; exit 1; }

# Upstream: a.c at base, and a later commit a recomp could pin, which changes a line near the patch's hunks so they
# go in only by a three-way merge.
u="$t/upstream"
git init -q "$u"
seq -f 'line %g' 1 12 > "$u/a.c"
git -C "$u" add a.c && git -C "$u" commit -qm base
base=$(git -C "$u" rev-parse HEAD)
sed -i 's/^line 5$/line 5 upstream/' "$u/a.c"
git -C "$u" commit -qam later
later=$(git -C "$u" rev-parse HEAD)
p=$(cd "$u" && { pwd -W 2>/dev/null || pwd; })
case "$p" in /*) url="file://$p" ;; *) url="file:///$p" ;; esac

mkdir "$t/patches"
cp "$here/patches/apply.cmake" "$t/patches/"
echo "demo demo $url $base" > "$t/patches/patches.txt"
# A patch made on base: <line>=<text> pairs.
patch() {
    git -C "$u" checkout -q "$base" -- a.c
    for edit in "$@"; do sed -i "s/^line ${edit%%=*}\$/${edit#*=}/" "$u/a.c"; done
    git -C "$u" diff > "$t/patches/demo.patch"
    git -C "$u" checkout -q HEAD -- a.c
}
apply() { cmake -P "$t/patches/apply.cmake" demo "$1" | sed 's/^/  /'; }
# The checkout's a.c holds exactly these lines changed from <commit>'s.
expect() {
    local dir=$1 commit=$2; shift 2
    git -C "$dir" show "$commit:a.c" > "$t/want"
    for edit in "$@"; do sed -i "s/^line ${edit%%=*}\$/${edit#*=}/" "$t/want"; done
    diff "$t/want" "$dir/a.c" || fail "$dir: a.c isn't upstream's with $*"
}

for pin in base later; do
    commit=${!pin}
    c="$t/checkout-$pin"
    git clone -q "$u" "$c" && git -C "$c" checkout -q "$commit"
    echo "on upstream's $pin commit:"
    patch 3=three
    apply "$c"; expect "$c" "$commit" 3=three
    apply "$c"; expect "$c" "$commit" 3=three          # a second time changes nothing
    patch 3=THREE 9=nine                               # its own hunk edited, and one added
    apply "$c"; expect "$c" "$commit" 3=THREE 9=nine
    patch 9=nine                                       # a hunk dropped
    apply "$c"; expect "$c" "$commit" 9=nine
    apply "$c"; expect "$c" "$commit" 9=nine
done
echo "apply.cmake takes an older patch out before the new one goes in"

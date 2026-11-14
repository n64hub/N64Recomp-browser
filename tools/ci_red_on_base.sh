#!/usr/bin/env bash
# Whether a CI job's failed check is the change's or was already there: run by the last step of each game's patch job
# (.github/workflows/ci.yml, dkr-patches to wwf-patches) once one of its check steps (ids check1, check2...: each
# continue-on-error) has failed, as
#
#   tools/ci_red_on_base.sh <job id>          BASE=<the commit the change is measured against>
#
# Those jobs check this repo's patches against another repo's main (a game fork's, a recomp's), which moves by itself:
# a commit there that stops its own patches applying over this repo's makes every PR here red, whatever it changes, as
# rush-2049-recomp's runtime patches did, written for its own older pin of this repo. So the job's check steps, as this
# commit's workflow has them, run again over a checkout of BASE (a PR's base, a push's commit before it), in a temporary
# directory of their own, with the other repo's main as it is now. Red there too: main is already red, not because of
# this change, which passes with a warning that names the job (that job's work is fixing it where the job says, in the
# other repo). Green there: this change made it red, and it fails. A base that can't be checked out fails it too.
set -u
job="$1"
workflow="$GITHUB_WORKSPACE/.github/workflows/ci.yml"
fail() { echo "::error::$job: $1"; exit 1; }
[[ -n "${BASE:-}" ]] || fail "no base commit to compare with: the change's own failure stands"
git -C "$GITHUB_WORKSPACE" fetch -q --depth 1 origin "$BASE" || fail "can't fetch the base $BASE: the change's own failure stands"
base="$(mktemp -d)/base" temp="$(mktemp -d)"
git -C "$GITHUB_WORKSPACE" worktree add -q --detach "$base" "$BASE" || fail "can't check out the base $BASE"
steps="$(mktemp -d)"
JOB="$job" STEPS="$steps" python3 - "$workflow" <<'PY' || fail "can't read its check steps from the workflow"
import os, sys, yaml
job = yaml.safe_load(open(sys.argv[1]))["jobs"][os.environ["JOB"]]
n = 0
for step in job["steps"]:
    if str(step.get("id", "")).startswith("check") and "run" in step:
        n += 1
        open(f"{os.environ['STEPS']}/{n:02d}.sh", "w").write(step["run"])
sys.exit(0 if n else 1)
PY
red=""
for script in "$steps"/*.sh; do
  echo "::group::$(basename "$script" .sh) over the base $BASE"
  (cd "$base" && GITHUB_WORKSPACE="$base" RUNNER_TEMP="$temp" bash --noprofile --norc -eo pipefail "$script") || red=1
  echo "::endgroup::"
done
if [[ -n "$red" ]]; then
  echo "::warning::$job is red over the base $BASE too, so this change didn't make it red: it passes. The job's own comment says where its fix goes."
  exit 0
fi
fail "green over the base $BASE and red here: this change made it red"

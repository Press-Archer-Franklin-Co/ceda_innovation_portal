#!/usr/bin/env bash
# Wait for the CI result of one pushed commit and print its summary.
#
#   wait_for_ci.sh <branch> <full-sha> [timeout-minutes]
#
# Reads results/<branch>/<sha>/ from the `ci-results` branch, which the
# `report` job in .github/workflows/ci.yml writes after every push. Works with
# plain git access (SSH), no GitHub API token needed.
# Exit codes: 0 run green, 1 run red, 3 timed out waiting.
set -euo pipefail

branch="${1:?branch required}"
sha="${2:?full commit sha required}"
timeout_min="${3:-45}"
remote="${CI_RESULTS_REMOTE:-origin}"
path="results/${branch}/${sha}"
deadline=$(( $(date +%s) + timeout_min * 60 ))

while true; do
  if git fetch --quiet "$remote" "+refs/heads/ci-results:refs/remotes/${remote}/ci-results" 2>/dev/null \
     && git cat-file -e "${remote}/ci-results:${path}/summary.md" 2>/dev/null; then
    out="${CI_RESULTS_OUT:-test-reports/ci/${branch//\//_}-${sha:0:7}}"
    mkdir -p "$out"
    for name in $(git ls-tree --name-only "${remote}/ci-results:${path}"); do
      git show "${remote}/ci-results:${path}/${name}" > "${out}/${name}"
    done
    cat "${out}/summary.md"
    echo
    echo "Files saved in ${out}/"
    if grep -q '"green": true' "${out}/summary.json"; then exit 0; fi
    exit 1
  fi
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "No CI result for ${branch}@${sha:0:7} after ${timeout_min} minutes." >&2
    echo "Check that the push reached GitHub and that Actions is enabled for the repository." >&2
    exit 3
  fi
  sleep 30
done

#!/usr/bin/env bash
# No em dashes (U+2014) in new text. See .claude/skills/plain-writing.
# Older files on main still have some; this fails only on lines this branch adds.
# Usage: scripts/check_em_dash.sh [base-ref]   (default origin/main)
set -euo pipefail
base="${1:-origin/main}"
dash=$'\xe2\x80\x94'
found=$(git diff --unified=0 "$(git merge-base "$base" HEAD)" HEAD -- . ':!**/node_modules/**' ':!**/dist/**' ':!**/package-lock.json' \
  | awk -v d="$dash" '/^\+\+\+ /{file=substr($0,7); next} /^@@/{split($3,a,/[+,]/); line=a[2]; next} /^\+/{ if (index($0,d)) print file":"line": "substr($0,2); line++ }')
if [ -n "$found" ]; then
  echo "Em dash found in new lines (use a comma, colon, full stop or brackets instead):"
  echo "$found"
  exit 1
fi
echo "No new em dashes."

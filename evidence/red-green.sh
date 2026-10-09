#!/usr/bin/env bash
# The invoice repair, before and after, on your machine rather than on mine.
#
# Puts the two repaired files back to exactly what the starter shipped, runs the
# invoice tests, then restores the repair and runs them again. It uses git only,
# so nothing is left behind, and it refuses to run on a dirty tree.
#
#   bash evidence/red-green.sh        (from anywhere inside the clone)
#
# Expect 29 of 34 failing before and 34 passing after.
set -uo pipefail

REPO=$(git rev-parse --show-toplevel 2>/dev/null) || {
  echo "Run this from inside the cloned repository."; exit 2; }
cd "$REPO" || exit 2

SRC="starter-02/source/src/views/InvoicesView.jsx starter-02/source/src/views/invoices/InvoiceForm.jsx"
TEST=src/views/invoices/

# The baseline is the starter as supplied. origin/main in a normal clone; plain
# main if the clone has no remote. Nothing else is ever used as the baseline.
BASE=""
for ref in origin/main main; do
  git rev-parse --verify -q "$ref" >/dev/null && { BASE=$ref; break; }
done
[ -n "$BASE" ] || { echo "No main branch found to compare against. Fetch it first: git fetch origin main"; exit 2; }

if [ -n "$(git status --porcelain)" ]; then
  echo "Working tree is not clean. Commit or stash first, then run this again."
  git status --short
  exit 1
fi

[ -d starter-02/source/node_modules ] || {
  echo "Dependencies are not installed. Run this first:"
  echo "  cd starter-02/source && cp .env.example .env && npm ci"; exit 2; }

run() { ( cd "$REPO/starter-02/source" && npx vitest run "$TEST" --reporter=basic 2>&1 | grep -E '^\s+[^ ]|Tests ' ); }

echo "============================================================"
echo " BEFORE: the two files exactly as the starter shipped them"
echo " baseline: $BASE"
echo "============================================================"
git checkout -q "$BASE" -- $SRC
git --no-pager diff --stat HEAD -- $SRC | tail -3
echo
run

echo
echo "============================================================"
echo " AFTER: the repair restored, nothing else changed"
echo "============================================================"
git checkout -q HEAD -- $SRC
run
echo
if [ -n "$(git status --porcelain)" ]; then
  echo "WARNING: tree not clean after restore"
  git status --short
else
  echo "Tree clean. Nothing left behind."
fi

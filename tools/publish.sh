#!/bin/bash
# Publish with your fingerprint. One command, two choices:
#   tools/publish.sh app    customers get the latest dev (main branch; Claude, ChatGPT, npm install from it)
#   tools/publish.sh site   the marketing site updates (marketing branch; Vercel publishes it)
# It pushes dev, merges dev into that branch with ONE commit signed by you (Touch ID), pushes,
# and puts you back on dev. AI tools only ever commit to dev; nothing reaches main or marketing
# without your fingerprint.
set -euo pipefail
case "${1:-}" in
  app)  BRANCH=main;      WHAT="the app for customers" ;;
  site) BRANCH=marketing; WHAT="the marketing site" ;;
  *) echo "Use: tools/publish.sh app   or   tools/publish.sh site"; exit 2 ;;
esac
cd "$(dirname "$0")/.."
[ "$(git branch --show-current)" = dev ] || { echo "✗ Switch to dev first:  git switch dev"; exit 1; }
[ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "✗ dev has uncommitted changes. Nothing published."; exit 1; }
VERSION=$(node -p "require('./package.json').version")
if [ "$BRANCH" = main ]; then
  echo "Running the tests (about 3 minutes)…"
  LOG="${TMPDIR:-/tmp}/living-resume-tests.log"
  npm test --silent > "$LOG" 2>&1 || { echo "✗ Tests failed. Nothing published. Details: $LOG"; exit 1; }
fi
git push -q origin dev
trap 'git merge --abort 2>/dev/null || true; git switch -q dev 2>/dev/null || true' EXIT
git switch -q "$BRANCH" 2>/dev/null || git switch -q -c "$BRANCH" dev
git merge -q --no-ff --no-commit dev 2>/dev/null || true
echo; echo "Changes going to $WHAT:"; git diff --cached --stat HEAD | tail -15
echo; read -r -p "Publish $WHAT ($VERSION)? Touch ID will ask next. (y/N) " a
[ "$a" = y ] || [ "$a" = Y ] || { echo "Stopped. Nothing published."; exit 0; }
git commit -S -q --allow-empty -m "Publish $WHAT ($VERSION, $(date +%Y-%m-%d))"
git push -q -u origin "$BRANCH"
echo "✓ Published $WHAT."

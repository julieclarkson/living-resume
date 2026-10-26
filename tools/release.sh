#!/bin/bash
# Release: copy ONLY the customer files from dev into the public repository's main branch,
# show what changes, ask, then make one commit signed with your fingerprint and push.
# Usage (from anywhere): ~/JULIE_FILES/100_APPS/SUPERFLY_APPS/LIVING-RESUME/tools/release.sh
# Nothing from dev's history, tests, notes, or the marketing site ever reaches the public repository.
set -euo pipefail
PUBLIC_URL="https://github.com/julieclarkson/living-resume.git"
SRC="$(cd "$(dirname "$0")/.." && pwd)"
PUB="$SRC/../LIVING-RESUME-PUBLIC"
cd "$SRC"
[ "$(git branch --show-current)" = dev ] || { echo "✗ Switch to dev first:  cd \"$SRC\" && git switch dev"; exit 1; }
[ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "✗ dev has uncommitted changes. Nothing published."; exit 1; }
echo "Running the tests…"
npm test --silent > "${TMPDIR:-/tmp}/living-resume-release-tests.log" 2>&1 || { echo "✗ Tests failed. Nothing published. Details: ${TMPDIR:-/tmp}/living-resume-release-tests.log"; exit 1; }
VERSION=$(node -p "require('./package.json').version")
[ -d "$PUB/.git" ] || git clone -q "$PUBLIC_URL" "$PUB"
[ "$(git -C "$PUB" remote get-url origin)" = "$PUBLIC_URL" ] || { echo "✗ $PUB isn't a copy of the public repository. Nothing published."; exit 1; }
cd "$PUB"
git fetch -q origin 2>/dev/null || true
git switch -q main 2>/dev/null || git switch -q -c main
git pull -q --ff-only origin main 2>/dev/null || true
find . -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cd "$SRC"
node -e "for (const f of require('./package.json').files) console.log(f.replace(/\/$/, ''))" | while read -r f; do
  [ -e "$f" ] || continue
  mkdir -p "$PUB/$(dirname "$f")"; cp -R "$f" "$PUB/$(dirname "$f")/"
done
cp package.json "$PUB/"
printf 'node_modules/\n.DS_Store\n.state/\n' > "$PUB/.gitignore"
cd "$PUB"
git add -A
if git diff --cached --quiet; then echo "Nothing new to publish: the public repository already matches $VERSION."; exit 0; fi
echo; echo "Files that change for customers (version $VERSION):"; git diff --cached --stat | tail -25
echo; read -r -p "Publish version $VERSION to customers? Touch ID will ask next. (y/N) " a
[ "$a" = y ] || [ "$a" = Y ] || { git reset -q; echo "Stopped. Nothing published."; exit 0; }
git commit -S -q -m "Release $VERSION"
git push -q -u origin main
echo "✓ Published $VERSION. Customers get it from github.com/julieclarkson/living-resume (main)."

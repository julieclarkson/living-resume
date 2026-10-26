#!/bin/bash
# Publish the marketing site: bring dev's marketing/ folder onto the marketing branch of the
# PRIVATE repository with one commit signed with your fingerprint, and push. Vercel publishes it
# to living-resume.julieclarkson.com. You end up back on the branch you started on.
# Usage (from anywhere): ~/JULIE_FILES/100_APPS/SUPERFLY_APPS/LIVING-RESUME/tools/publish-site.sh
set -euo pipefail
SRC="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SRC"
case "$(git remote get-url origin)" in *living-resume.git) echo "✗ origin is the public repository. The site publishes from the private one. Nothing published."; exit 1;; esac
[ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "✗ You have uncommitted changes. Nothing published."; exit 1; }
START="$(git branch --show-current)"
trap 'git switch -q "$START" 2>/dev/null || true' EXIT
git switch -q marketing 2>/dev/null || git switch -q -c marketing dev
git merge -q --no-ff --no-commit dev 2>/dev/null || true
read -r -p "Publish the marketing site now? Touch ID will ask next. (y/N) " a
[ "$a" = y ] || [ "$a" = Y ] || { git merge --abort 2>/dev/null || true; echo "Stopped. Nothing published."; exit 0; }
git commit -S -q --allow-empty -m "Publish marketing site ($(date +%Y-%m-%d))"
git push -q -u origin marketing
echo "✓ Pushed. Vercel publishes living-resume.julieclarkson.com in a minute or two."

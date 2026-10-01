#!/usr/bin/env bash
# Create a linked worktree on feat/<topic>, derived from freshly pulled main.
# Usage: scripts/new-worktree.sh <topic>   -> ../Terra-Tools-<topic> on feat/<topic>
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "usage: $0 <topic>   # -> ../Terra-Tools-<topic> on feat/<topic>" >&2
  exit 2
fi
topic=$1
branch="feat/$topic"

main_wt=$(git worktree list --porcelain | sed -n 's/^worktree //p' | head -n1)
wt="$(dirname "$main_wt")/Terra-Tools-$topic"

# The primary worktree hosts main and is pull-only: refresh it before
# anything derives from it.
git -C "$main_wt" pull --ff-only origin main

if git show-ref --verify --quiet "refs/heads/$branch"; then
  git worktree add "$wt" "$branch"
else
  git worktree add -b "$branch" "$wt" origin/main
fi

# .env is untracked and lives only in the primary worktree; worktrees need
# their own copy.
if [ -f "$main_wt/.env" ] && [ ! -f "$wt/.env" ]; then
  cp "$main_wt/.env" "$wt/.env"
  echo "copied .env into $wt"
fi

echo
echo "worktree : $wt"
echo "branch   : $branch"
echo "next     : cd '$wt/frontend' && npm install"

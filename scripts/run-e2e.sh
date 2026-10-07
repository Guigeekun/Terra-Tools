#!/bin/sh
# Pre-PR frontend regression suite (Playwright, frontend/e2e/).
#
# Ensures a backend is reachable on 127.0.0.1:5001 (starts this worktree's
# compose stack if none is running), then lets Playwright drive the vite dev
# server, so the suite always exercises this branch's frontend source rather
# than a stale build. To test a built/bundled instance instead, point
# E2E_BASE_URL at it (e.g. E2E_BASE_URL=http://127.0.0.1:5001 scripts/run-e2e.sh).
#
# Extra args are passed through to `npx playwright test`
# (e.g. scripts/run-e2e.sh e2e/deep-links.spec.js --headed).
set -e

cd "$(dirname "$0")/.."  # repo root of the current worktree

HEALTH_URL="${E2E_BACKEND_URL:-http://127.0.0.1:5001/api/stats}"

if ! curl -sf -m 3 "$HEALTH_URL" > /dev/null; then
  echo "No backend on 127.0.0.1:5001 - starting this worktree's compose stack..."
  # auto, not force-download: force-download replaces user-data, and in a
  # worktree that directory is a junction into the primary checkout.
  BUILD_MODE="${BUILD_MODE:-auto}" docker compose up -d
  i=0
  while [ "$i" -lt 60 ]; do
    if curl -sf -m 3 "$HEALTH_URL" > /dev/null; then
      break
    fi
    i=$((i + 1))
    if [ "$i" = 60 ]; then
      echo "Backend never became healthy on 127.0.0.1:5001" >&2
      exit 1
    fi
    sleep 2
  done
fi

cd frontend
[ -d node_modules ] || npm install
npx playwright install chromium
exec npx playwright test "$@"

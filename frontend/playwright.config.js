import { defineConfig } from '@playwright/test';

// The suite drives the real UI against real served data (no mocks): a caught
// regression must mean "the app broke", not "the fixture drifted".
//
// Default target: the vite dev server on port 5173, which proxies /api to a
// backend on 127.0.0.1:5001 (see vite.config.js). Start one with
// scripts/run-e2e.sh from your worktree. Point E2E_BASE_URL at any other
// instance instead — e.g. E2E_BASE_URL=http://127.0.0.1:5001 to test the
// built dist served by the compose stack — and no dev server is started.
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:5173';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run dev -- --strictPort',
        url: 'http://localhost:5173',
        // Reuse a dev server that is already up — but it must be this
        // worktree's; a stray one from another worktree serves stale source.
        reuseExistingServer: true,
        timeout: 120_000,
      },
});

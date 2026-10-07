import { expect } from '@playwright/test';
// Imported straight from app source so the sweep can never drift from the
// real tab list: adding a tab without teaching the suite fails here.
// constants.js is plain data (no imports), so Playwright can load it as-is.
import { TAB_META } from '../src/utils/constants.js';

export { TAB_META };

// A crashed render (blank tab) usually surfaces as an uncaught page exception
// before any DOM assertion would fail — treat one as a test failure.
export function trackPageErrors(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error));
  return errors;
}

export function expectNoPageErrors(errors) {
  expect(
    errors,
    errors.map((e) => String(e)).join('\n')
  ).toEqual([]);
}

// First entry of a paginated list endpoint — deep links are built from real,
// currently-served IDs instead of hardcoded ones a repack could remove.
export async function firstListed(request, path) {
  const res = await request.get(path);
  expect(res.ok(), `GET ${path} -> ${res.status()}`).toBeTruthy();
  const body = await res.json();
  const item = body.items?.[0];
  expect(item, `no entries returned by ${path}`).toBeTruthy();
  return item;
}

// Navigate to a hash route and wait for the app shell: the header shows the
// routed tab's title, which only renders after the initial data fetch
// (/api/strings, /api/stats, /api/skills) has dismissed the loading overlay.
export async function gotoTab(page, hash) {
  await page.goto(hash.startsWith('#') ? `/${hash}` : `/#/${hash}`);
  await expect(page.locator('.header-title h2')).toBeVisible();
}

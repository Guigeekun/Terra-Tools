import { test, expect } from '@playwright/test';
import { gotoTab, trackPageErrors, expectNoPageErrors } from './helpers';

test('bare URL lands on the dashboard and rewrites the hash', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.header-title h2')).toHaveText('Dashboard Overview');
  await expect(page).toHaveURL(/#\/dashboard$/);
});

test('unknown tab falls back to the dashboard, not a blank app', async ({ page }) => {
  const errors = trackPageErrors(page);
  await gotoTab(page, '#/does-not-exist');
  await expect(page.locator('.header-title h2')).toHaveText('Dashboard Overview');
  expectNoPageErrors(errors);
});

test('sidebar links navigate through the hash router', async ({ page }) => {
  await gotoTab(page, '#/dashboard');
  await page.locator('.sidebar-nav a[href="#/skills"]').click();
  await expect(page.locator('.header-title h2')).toHaveText('Skills Catalog');
  await expect(page).toHaveURL(/#\/skills$/);
});

test('browser Back undoes a tab change', async ({ page }) => {
  await gotoTab(page, '#/characters');
  await page.locator('.sidebar-nav a[href="#/skills"]').click();
  await expect(page.locator('.header-title h2')).toHaveText('Skills Catalog');
  await page.goBack();
  await expect(page.locator('.header-title h2')).toHaveText('Characters Database');
  await expect(page).toHaveURL(/#\/characters$/);
});

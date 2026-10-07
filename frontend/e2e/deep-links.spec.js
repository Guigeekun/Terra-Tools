import { test, expect } from '@playwright/test';
import { gotoTab, firstListed, trackPageErrors, expectNoPageErrors } from './helpers';

// The hash is the app's single source of truth: modals and selections must
// restore from a pasted URL alone (no prior clicking). Each test starts from
// the deep link directly, so a regression in URL parsing can't hide behind
// the interaction path still working.

test('character modal deep link (?char=) opens the modal', async ({ page, request }) => {
  const character = await firstListed(request, '/api/characters?page=1&limit=1');
  const errors = trackPageErrors(page);
  await gotoTab(page, `#/characters?char=${character.ID}`);
  const modal = page.locator('.modal-backdrop .modal-card');
  await expect(modal).toBeVisible();
  // The modal shows the deep-linked character, fetched by ID.
  await expect(modal).toContainText(character.NameString.en);
  expectNoPageErrors(errors);
});

test('enemy modal deep link (?enemy=) opens the variant group', async ({ page, request }) => {
  const enemy = await firstListed(request, '/api/enemies?page=1&limit=1');
  const errors = trackPageErrors(page);
  await gotoTab(page, `#/bestiary?enemy=${enemy.first_id}`);
  const modal = page.locator('.modal-backdrop .modal-card');
  await expect(modal).toBeVisible();
  await expect(modal).toContainText(enemy.name);
  expectNoPageErrors(errors);
});

test('skills tab deep link (?q=) pre-fills the search', async ({ page, request }) => {
  const skill = await firstListed(request, '/api/skills?page=1&limit=1');
  const name = skill.nameString?.en?.trim();
  test.skip(!name, 'first served skill has no English name to search for');
  const errors = trackPageErrors(page);
  await gotoTab(page, `#/skills?q=${encodeURIComponent(name)}`);
  const input = page.locator('.search-input-wrapper input');
  await expect(input).toHaveValue(name);
  // The pre-filled search actually filtered the list down to matches.
  await expect(page.locator('#skills-table-body tr').first()).toContainText(name);
  expectNoPageErrors(errors);
});

test('stages deep link (?chapter=&section=) selects the chapter', async ({ page }) => {
  const errors = trackPageErrors(page);
  await gotoTab(page, '#/stages?chapter=1&section=1');
  await expect(page.locator('.chapter-btn.active')).toBeVisible();
  await expect(page).toHaveURL(/chapter=1/);
  expectNoPageErrors(errors);
});

test('clicking a character pushes a modal entry that Back closes', async ({ page }) => {
  await gotoTab(page, '#/characters');
  const firstCard = page.locator('.card-item').first();
  await expect(firstCard).toBeVisible();
  await firstCard.click();
  await expect(page.locator('.modal-backdrop .modal-card')).toBeVisible();
  await expect(page).toHaveURL(/char=\d+/);
  await page.goBack();
  await expect(page.locator('.modal-backdrop')).toHaveCount(0);
  await expect(page).toHaveURL(/#\/characters$/);
});

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

test('compare deep link (?left=) preselects the character', async ({ page, request }) => {
  const character = await firstListed(request, '/api/characters?page=1&limit=1');
  const errors = trackPageErrors(page);
  await gotoTab(page, `#/compare?left=${character.ID}`);
  const panel = page.locator('.compare-side.left');
  await expect(panel).toContainText(character.NameString.en);
  // The preselected side loads its job row without any interaction.
  await expect(panel.locator('.compare-job-chip').first()).toBeVisible();
  expectNoPageErrors(errors);
});

test('character card compare button opens the compare tab preselected', async ({ page, request }) => {
  const character = await firstListed(request, '/api/characters?page=1&limit=1');
  const errors = trackPageErrors(page);
  await gotoTab(page, '#/characters');
  // The compare shortcut sits on the card the API listed first; clicking it
  // must not open the character modal (the card's own link target).
  const card = page.locator('.card-item').first();
  await expect(card).toContainText(character.NameString.en);
  await card.locator('.card-compare-btn').click();
  await expect(page).toHaveURL(new RegExp(`#/compare\\?left=${character.ID}`));
  await expect(page.locator('.modal-backdrop')).toHaveCount(0);
  await expect(page.locator('.compare-side.left')).toContainText(character.NameString.en);
  expectNoPageErrors(errors);
});

test('compare slot picker fills a slotted skill and the URL records it', async ({ page, request }) => {
  // A character with at least two jobs always has skills left to slot (its
  // other jobs' skills) — the first roster entry with jobCount >= 2.
  const roster = await (await request.get('/api/compare/roster')).json();
  const character = roster.characters.find(c => c.jobCount >= 2);
  test.skip(!character, 'no multi-job character in the roster');
  const errors = trackPageErrors(page);
  await gotoTab(page, `#/compare?left=${character.ID}`);
  const panel = page.locator('.compare-side.left');
  // Job detail must be loaded before the slots section renders.
  await expect(panel.locator('.compare-job-chip').first()).toBeVisible();
  const emptySlots = panel.locator('.compare-slot-empty');
  await emptySlots.first().click();
  const option = panel.locator('.compare-picker-list .compare-picker-row').first();
  await expect(option).toBeVisible();
  const skillName = await option.locator('.compare-picker-name').innerText();
  await option.click();
  await expect(panel.locator('.compare-slot.filled')).toHaveCount(1);
  await expect(panel.locator('.compare-slot.filled').first()).toContainText(skillName);
  await expect(page).toHaveURL(/leftSkills=\d+/);
  expectNoPageErrors(errors);
});

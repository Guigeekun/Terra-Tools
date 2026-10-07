import { test, expect } from '@playwright/test';
import { TAB_META, gotoTab, trackPageErrors, expectNoPageErrors } from './helpers';

// One test per tab: deep-link the hash, confirm the header shows that tab's
// title (catches a broken tab silently falling back to the dashboard), and
// confirm nothing on the page threw while it loaded.
for (const [tab, meta] of Object.entries(TAB_META)) {
  test(`tab "${tab}" renders: ${meta.title}`, async ({ page }) => {
    const errors = trackPageErrors(page);
    await gotoTab(page, `#/${tab}`);
    await expect(page.locator('.header-title h2')).toHaveText(meta.title);
    await expect(page.locator('.content-container').locator('> *').first()).toBeVisible();
    expectNoPageErrors(errors);
  });
}

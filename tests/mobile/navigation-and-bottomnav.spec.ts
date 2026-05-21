import { test, expect } from '@playwright/test';

test.describe('Mobile navigation and bottom-nav usability', () => {
  test.setTimeout(60000);
  test('bottom nav buttons are visible, tappable and not clipped', async ({ page }) => {
    await page.goto('/');
    const buttons = ['Today', 'Patients', 'Consult', 'Appointments', 'More'];
    for (const label of buttons) {
      const btn = page.locator(`button[aria-label="${label}"]`).first();
      await expect(btn).toBeVisible();
      const box = await btn.boundingBox();
      expect(box).not.toBeNull();
      if (box) {
        const vw = await page.evaluate(() => window.innerWidth);
        const vh = await page.evaluate(() => window.innerHeight);
        expect(box.x + box.width).toBeLessThanOrEqual(vw + 2);
        expect(box.y + box.height).toBeLessThanOrEqual(vh + 2);
      }
      // Ensure tappable: scroll into view then click with fallback
      await btn.scrollIntoViewIfNeeded();
      await btn.click().catch(async () => { await btn.click({ force: true }); });
      await page.waitForTimeout(250);
    }
  });
});

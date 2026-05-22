import { test, expect } from '@playwright/test';
import { assertNoHorizontalOverflow, assertMinTapTarget, assertVisibleInViewport } from '../testUtils';

test.describe('Mobile navigation and bottom-nav usability', () => {
  test.setTimeout(60000);
  test('bottom nav buttons are visible, tappable and not clipped', async ({ page }) => {
    await page.goto('/');
    await assertNoHorizontalOverflow(page);

    const buttons = [
      'bottom-nav-today-button',
      'bottom-nav-patients-button',
      'bottom-nav-consult-button',
      'bottom-nav-appointments-button',
      // "More" slot is now the global command palette trigger (Search)
      'bottom-nav-more-button',
    ];

    for (const testId of buttons) {
      const btn = page.locator(`[data-testid="${testId}"]`).first();
      await expect(btn).toBeVisible({ timeout: 10000 });
      await assertMinTapTarget(btn);
      await assertVisibleInViewport(page, `[data-testid="${testId}"]`);
      await btn.scrollIntoViewIfNeeded();
      await btn.click();
      await page.waitForTimeout(200);

      if (testId === 'bottom-nav-more-button') {
        const palette = page.locator('[data-testid="command-palette"]');
        await expect(palette).toBeVisible({ timeout: 10000 });
        await page.keyboard.press('Escape');
        await expect(palette).toBeHidden({ timeout: 10000 });
      }
    }
  });
});

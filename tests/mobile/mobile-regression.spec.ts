import { test, expect } from '@playwright/test';
import { assertNoHorizontalOverflow, assertNoOverflowContainers, assertNoFixedStickyOverlap, assertAppVhDefined, navigateTo } from '../testUtils';

test.describe('Mobile regression audit', () => {
  test.setTimeout(90000);

  test('ensures no horizontal overflow, stable viewport, and safe-area mobile layout', async ({ page }) => {
    await page.goto('/');

    await assertAppVhDefined(page);
    await assertNoHorizontalOverflow(page);
    await assertNoOverflowContainers(page);
    await assertNoFixedStickyOverlap(page);

    const bottomNav = page.locator('[data-testid="bottom-nav"]');
    await expect(bottomNav).toBeVisible({ timeout: 10000 });
    const bottomNavStyle = await bottomNav.evaluate((nav) => getComputedStyle(nav).paddingBottom);
    expect(bottomNavStyle).toContain('env(safe-area-inset-bottom');

    await navigateTo(page, 'Patients');
    await assertNoHorizontalOverflow(page);
    await assertNoOverflowContainers(page);
    await assertNoFixedStickyOverlap(page);

    const beforeScroll = await page.evaluate(() => window.scrollY);
    await page.focus('[data-testid="patient-name-input"]');
    await page.type('[data-testid="patient-name-input"]', 'KeyboardTest', { delay: 50 });
    const afterScroll = await page.evaluate(() => window.scrollY);
    expect(Math.abs(afterScroll - beforeScroll)).toBeLessThan(100);

    await navigateTo(page, 'Appointments');
    await assertNoHorizontalOverflow(page);
    await assertNoOverflowContainers(page);
    await assertNoFixedStickyOverlap(page);

    const appointmentForm = page.locator('[data-testid="appointment-scheduling-form"]').first();
    await expect(appointmentForm).toBeVisible({ timeout: 10000 });
    const appointmentBox = await appointmentForm.boundingBox();
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(appointmentBox).not.toBeNull();
    if (appointmentBox) {
      expect(appointmentBox.x + appointmentBox.width).toBeLessThanOrEqual(viewportWidth + 2);
    }

    const appVh = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--app-vh'));
    expect(appVh.trim()).not.toBe('');
  });
});

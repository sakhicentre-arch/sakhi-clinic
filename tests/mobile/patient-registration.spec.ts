import { test, expect } from '@playwright/test';
import { generatePatientData, registerPatient, navigateTo } from '../testUtils';

test.describe('Mobile patient registration and keyboard behavior', () => {
  test('registers a patient on small viewport and avoids viewport jump while typing', async ({ page }) => {
    const patient = generatePatientData('MobilePatient');

    await page.goto('/');
    // ensure bottom nav visible
    const todayBtn = page.locator('[data-testid="bottom-nav-today-button"]').first();
    await expect(todayBtn).toBeVisible({ timeout: 10000 });

    // navigate to Patients and open registration
    await navigateTo(page, 'Patients');

    // check no hidden overflow on body/html
    const bodyOverflow = await page.evaluate(() => getComputedStyle(document.body).overflow || '');
    expect(bodyOverflow).not.toBe('hidden');

    // Focus the name input and measure scrollY before typing
    await page.waitForSelector('[data-testid="patient-name-input"]');
    const beforeScroll = await page.evaluate(() => window.scrollY);
    await page.focus('[data-testid="patient-name-input"]');
    await page.type('[data-testid="patient-name-input"]', patient.name, { delay: 50 });
    const afterScroll = await page.evaluate(() => window.scrollY);
    // Allow small adjustments but not big jumps
    expect(Math.abs(afterScroll - beforeScroll)).toBeLessThan(100);

    // Complete registration
    await registerPatient(page, patient);

    // Ensure patient row is visible and not clipped (bounding box inside viewport)
    const row = page.locator('[data-testid="patient-row"]', { hasText: patient.name }).first();
    await expect(row).toBeVisible();
    const box = await row.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      const vw = await page.evaluate(() => window.innerWidth);
      expect(box.x + box.width).toBeLessThanOrEqual(vw + 2);
    }
  });
});

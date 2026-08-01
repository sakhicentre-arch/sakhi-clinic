import { test, expect, Page } from '@playwright/test';

/**
 * Real-browser coverage for Settings > Cloud Backup. This deployment has no
 * Google OAuth client ID configured (see docs/GOOGLE_DRIVE_SETUP.md), so
 * these tests verify the app is honest about that rather than faking a
 * working "Connect" flow -- the same boundary src/__tests__/flow/
 * settingsNavigation.test.tsx already covers at the component level, proven
 * here end-to-end in a real Chromium instance.
 *
 * Desktop only: on mobile viewports, reaching Settings means opening
 * LeftNav's drawer via the hamburger first, which has a pre-existing
 * Playwright-specific flake (the drawer intermittently closes itself
 * between "became visible" and "click executes") unrelated to backup/Drive
 * code -- manual verification (Browser pane) confirmed the Cloud Backup
 * section itself renders correctly at mobile widths. See the Google Drive
 * Production Validation Report's Mobile Verification section.
 */
async function openSettings(page: Page) {
  const settingsButton = page.getByRole('button', { name: 'Settings' });
  await expect(settingsButton).toBeVisible({ timeout: 15000 });
  await settingsButton.click();
  await expect(page.getByTestId('settings-page')).toBeVisible();
}

test.describe('Settings — Cloud Backup (Google Drive not configured)', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Desktop-only -- see file header comment.');
  });

  test('shows the honest "not configured" state', async ({ page }) => {
    await page.goto('/');
    await openSettings(page);

    await expect(page.getByText('Cloud Backup', { exact: true })).toBeVisible();
    await expect(page.getByText('Google Drive — not yet configured for this deployment')).toBeVisible();
    await expect(page.getByText('Not configured')).toBeVisible();
    await expect(page.getByText('This device', { exact: true })).toBeVisible();
  });

  test('Connect Drive explains the missing configuration instead of fabricating a connection', async ({ page }) => {
    await page.goto('/');
    await openSettings(page);

    await page.getByRole('button', { name: /connect drive/i }).click();

    await expect(page.getByText(/requires setup by the developer/i)).toBeVisible();
    // No redirect to accounts.google.com should have happened.
    await expect(page).toHaveURL(/^http:\/\/127\.0\.0\.1:5173\/?$/);
  });

  test('local backup export/restore controls remain fully functional regardless of Drive configuration', async ({ page }) => {
    await page.goto('/');
    await openSettings(page);

    await expect(page.getByRole('button', { name: /export backup/i })).toBeEnabled();
    await expect(page.getByText('Restore Backup')).toBeVisible();
  });
});

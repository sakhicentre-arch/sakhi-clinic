import { defineConfig, devices } from '@playwright/test';

const devServerURL = 'http://127.0.0.1:5173';
const baseURL = process.env.PLAYWRIGHT_BASE_URL || process.env.BASE_URL || devServerURL;
const preferredChannel =
  process.env.SAKHI_PLAYWRIGHT_CHANNEL ||
  // On Windows, Playwright-managed browsers can be blocked by enterprise policy/AV.
  // Defaulting to system Chrome keeps local runs viable.
  (process.platform === 'win32' ? 'chrome' : undefined);

export default defineConfig({
  testDir: './tests',
  timeout: 30 * 1000,
  expect: { timeout: 5000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  outputDir: 'playwright-results',
  webServer: {
    command: 'npx vite --host 127.0.0.1 --port 5173',
    url: devServerURL,
    reuseExistingServer: true,
    timeout: 120 * 1000,
  },
  use: {
    baseURL,
    actionTimeout: 0,
    navigationTimeout: 30 * 1000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    channel: preferredChannel,
    launchOptions: {
      args: ['--disable-gpu'],
    },
  },
  projects: [
    {
      name: 'chromium',
      // Mobile suites are validated against dedicated mobile viewports below.
      // Ignoring them for the desktop project avoids false failures when the mobile-only BottomNav is intentionally absent.
      testIgnore: /tests[\/\\]mobile[\/\\].*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'pixel5',
      use: { ...devices['Pixel 5'], viewport: devices['Pixel 5'].viewport, isMobile: true },
    },
    {
      name: 'small-android-360x800',
      use: { viewport: { width: 360, height: 800 }, userAgent: 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36', isMobile: true },
    },
    {
      name: 'small-android-390x844',
      use: { viewport: { width: 390, height: 844 }, userAgent: 'Mozilla/5.0 (Linux; Android 12; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36', isMobile: true },
    },
    {
      name: 'small-android-412x915',
      use: { viewport: { width: 412, height: 915 }, userAgent: 'Mozilla/5.0 (Linux; Android 12; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36', isMobile: true },
    },
  ],
});

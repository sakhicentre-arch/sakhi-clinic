import { defineConfig, devices } from '@playwright/test';

const devServerURL = 'http://127.0.0.1:5173';
const baseURL = process.env.PLAYWRIGHT_BASE_URL || process.env.BASE_URL || devServerURL;

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
    launchOptions: {
      args: ['--disable-gpu'],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'pixel5',
      use: { ...devices['Pixel 5'], viewport: devices['Pixel 5'].viewport, isMobile: true },
    },
    {
      name: 'small-android',
      use: { viewport: { width: 360, height: 780 }, userAgent: 'Mozilla/5.0 (Linux; Android 10; Pixel 4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36', isMobile: true },
    },
  ],
});

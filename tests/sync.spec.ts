import { expect, test } from '@playwright/test';
import { generatePatientData, navigateTo, registerPatient } from './testUtils';

test('cross-tab patient sync propagates new registry entries', async ({ browser }) => {
  const context = await browser.newContext();
  const pageA = await context.newPage();
  const pageB = await context.newPage();

  await pageA.goto('/');
  await pageB.goto('/');

  await navigateTo(pageA, 'Patients');
  await navigateTo(pageB, 'Patients');

  const patientData = generatePatientData('Sync');
  await registerPatient(pageA, patientData);

  await expect(pageB.locator('[data-testid="patient-list"]')).toContainText(patientData.name, { timeout: 10000 });

  await context.close();
});

test('queue updates synchronize across tabs in real time', async ({ browser }) => {
  const context = await browser.newContext();
  const pageA = await context.newPage();
  const pageB = await context.newPage();

  await pageA.goto('/');
  await pageB.goto('/');

  const patientData = generatePatientData('QueueSync');
  await navigateTo(pageA, 'Patients');
  await registerPatient(pageA, patientData);

  await navigateTo(pageA, 'Today');
  await navigateTo(pageB, 'Today');

  await pageA.click('[data-testid="add-patient-to-queue-btn"]');
  await expect(pageA.locator('[data-testid="queue-search-input"]')).toBeVisible({ timeout: 5000 });
  await pageA.fill('[data-testid="queue-search-input"]', patientData.name);
  await expect(pageA.locator(`button:has-text("${patientData.name}")`)).toBeVisible({ timeout: 5000 });
  await pageA.click(`button:has-text("${patientData.name}")`);

  await expect(pageB.locator('[data-testid="queue-panel"]').locator(`text=${patientData.name}`)).toBeVisible({ timeout: 10000 });

  await pageA.click('[data-testid^="queue-remove-"]');
  await expect(pageB.locator('[data-testid="queue-panel"]').locator(`text=${patientData.name}`)).toHaveCount(0, { timeout: 10000 });

  await context.close();
});

test('mobile and desktop views see the same sync events', async ({ browser }) => {
  const context = await browser.newContext();
  const desktopPage = await context.newPage();
  const mobilePage = await context.newPage();
  await mobilePage.setViewportSize({ width: 375, height: 812 });

  await desktopPage.goto('/');
  await mobilePage.goto('/');

  const patientData = generatePatientData('MobileSync');
  await navigateTo(desktopPage, 'Patients');
  await registerPatient(desktopPage, patientData);

  await navigateTo(mobilePage, 'Patients');
  await expect(mobilePage.locator('[data-testid="patient-list"]')).toContainText(patientData.name, { timeout: 10000 });

  await context.close();
});

test('refresh recovers stale queue state from another tab', async ({ browser }) => {
  const context = await browser.newContext();
  const activePage = await context.newPage();
  const refreshedPage = await context.newPage();

  await activePage.goto('/');
  await refreshedPage.goto('/');

  const patientData = generatePatientData('RefreshSync');
  await navigateTo(activePage, 'Patients');
  await registerPatient(activePage, patientData);

  await navigateTo(activePage, 'Today');
  await activePage.click('[data-testid="add-patient-to-queue-btn"]');
  await activePage.fill('[data-testid="queue-search-input"]', patientData.name);
  await activePage.click(`button:has-text("${patientData.name}")`);

  await navigateTo(refreshedPage, 'Today');
  await refreshedPage.reload();

  await expect(refreshedPage.locator('[data-testid="queue-panel"]').locator(`text=${patientData.name}`)).toBeVisible({ timeout: 15000 });

  await context.close();
});

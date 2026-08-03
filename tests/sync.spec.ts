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

  const viewportA = pageA.viewportSize();
  const isMobileA = !!viewportA && viewportA.width < 768;
  const addTrigger = isMobileA
    ? pageA.locator('[data-testid="mobile-fab-add-walkin"]')
    : pageA.locator('[data-testid="add-patient-to-queue-btn"]');

  await addTrigger.click();
  await expect(pageA.locator('[data-testid="queue-search-input"]')).toBeVisible({ timeout: 5000 });
  await pageA.fill('[data-testid="queue-search-input"]', patientData.name);
  await expect(pageA.locator(`button:has-text("${patientData.name}")`)).toBeVisible({ timeout: 5000 });
  await pageA.click(`button:has-text("${patientData.name}")`);

  // On mobile, the queue is a chip strip (`.sakhi-chipstrip`, no wrapper
  // testid) -- on desktop it's the QueuePanel. Scoping to the chip strip
  // specifically (not `body`) matters: the patient's name also appears in
  // the "Now Serving" hero card above it, so a body-wide text locator hits
  // a strict-mode violation (two matches) rather than the intended one.
  const viewportB = pageB.viewportSize();
  const isMobileB = !!viewportB && viewportB.width < 768;
  const queueSurfaceB = isMobileB ? pageB.locator('.sakhi-chipstrip') : pageB.locator('[data-testid="queue-panel"]');

  await expect(queueSurfaceB.locator(`text=${patientData.name}`)).toBeVisible({ timeout: 10000 });

  // Removal-sync is only checked on desktop: the mobile "Command Center"
  // chip strip (TodayPage.tsx) has no remove/delete affordance at all --
  // only the desktop QueuePanel exposes `queue-remove-*`. There is nothing
  // to click on mobile, so there is nothing further to verify there.
  if (!isMobileA) {
    await pageA.click('[data-testid^="queue-remove-"]');
    await expect(queueSurfaceB.locator(`text=${patientData.name}`)).toHaveCount(0, { timeout: 10000 });
  }

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

  const viewport = activePage.viewportSize();
  const isMobile = !!viewport && viewport.width < 768;
  const addTrigger = isMobile
    ? activePage.locator('[data-testid="mobile-fab-add-walkin"]')
    : activePage.locator('[data-testid="add-patient-to-queue-btn"]');

  await addTrigger.click();
  await activePage.fill('[data-testid="queue-search-input"]', patientData.name);
  await activePage.click(`button:has-text("${patientData.name}")`);

  await navigateTo(refreshedPage, 'Today');
  await refreshedPage.reload();

  // On mobile, the queue renders as a chip strip (`.sakhi-chipstrip`, no
  // wrapper testid) -- on desktop it's the QueuePanel. Scoping to the chip
  // strip specifically (not `body`) matters: the patient's name also
  // appears in the "Now Serving" hero card above it, so a body-wide text
  // locator hits a strict-mode violation (two matches) rather than the
  // intended one.
  const refreshedViewport = refreshedPage.viewportSize();
  const isRefreshedMobile = !!refreshedViewport && refreshedViewport.width < 768;
  const queueSurface = isRefreshedMobile ? refreshedPage.locator('.sakhi-chipstrip') : refreshedPage.locator('[data-testid="queue-panel"]');

  await expect(queueSurface.locator(`text=${patientData.name}`)).toBeVisible({ timeout: 15000 });

  await context.close();
});

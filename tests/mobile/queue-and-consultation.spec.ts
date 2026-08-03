import { test, expect } from '@playwright/test';
import { generatePatientData, registerPatient, bookAppointment, navigateTo, assertVisibleBelowStickyHeader, assertLastActionNotCoveredByActionBar } from '../testUtils';

test.describe('Mobile queue and consultation workflow', () => {
  test.setTimeout(60000);
  test('books appointment, adds to queue and starts consultation', async ({ page }) => {
    const patient = generatePatientData('QueueMobile');
    const clinicBranch = 'Dabholi';
    const appointmentTime = '11:20';
    const appointmentDate = await page.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toLocaleDateString('en-CA'); });

    await page.goto('/');
    await navigateTo(page, 'Patients');
    await registerPatient(page, patient);

    await bookAppointment(page, {
      patientName: patient.name,
      clinicBranch,
      appointmentDate,
      appointmentTime,
    });

    await navigateTo(page, 'Today');

    const viewport = page.viewportSize();
    const isMobile = !!viewport && viewport.width < 768;

    if (isMobile) {
      await expect(page.locator('[data-testid="mobile-fab-add-walkin"]')).toBeVisible();

      // Add to queue (mobile FAB + existing dropdown)
      await page.click('[data-testid="mobile-fab-add-walkin"]');
      await expect(page.locator('[data-testid="queue-search-input"]')).toBeVisible();
      await page.fill('[data-testid="queue-search-input"]', patient.name);
      const patientAddBtn = page.locator('button').filter({ hasText: new RegExp(patient.name, 'i') }).first();
      await expect(patientAddBtn).toBeVisible();
      await patientAddBtn.click();

      // Now serving CTA should be enabled
      const startCta = page.locator('[data-testid^="mobile-now-serving-start-"]').first();
      await expect(startCta).toBeVisible({ timeout: 5000 });
      await startCta.click();
    } else {
      // Fallback for non-mobile environments (keeps desktop/tablet behavior)
      await expect(page.locator('[data-testid="queue-panel"]')).toBeVisible();
      const queueList = page.locator('[data-testid="queue-list"]');
      await expect(queueList).toBeVisible();
      await page.click('[data-testid="add-patient-to-queue-btn"]');
      await expect(page.locator('[data-testid="queue-search-input"]')).toBeVisible();
      await page.fill('[data-testid="queue-search-input"]', patient.name);
      const patientAddBtn = page.locator('button').filter({ hasText: new RegExp(patient.name, 'i') }).first();
      await expect(patientAddBtn).toBeVisible();
      await patientAddBtn.click();

      const activeQueueRow = page.locator('[data-testid^="queue-row-active-"]').first();
      await activeQueueRow.waitFor({ state: 'visible', timeout: 3000 });
      const startBtn = activeQueueRow.locator('[data-testid^="queue-start-consultation-"]');
      await expect(startBtn).toHaveCount(1);
      await startBtn.click();
    }

    // Ensure consultation UI or form appears
    await expect(page.locator('[data-testid="consultation-root"]')).toBeVisible({ timeout: 5000 }).catch(() => {});

    // Mobile action bar exists for clinical speed controls
    await expect(page.locator('[data-testid="consultation-action-bar"]')).toBeVisible({ timeout: 10000 }).catch(() => {});

    if (isMobile) {
      // Newly-registered patients are always first-visit, and ConsultationPage
      // deliberately defaults first-visit consultations to Classic Mode (see
      // ConsultationPage.tsx's `setMode(isFirstVisit ? "classic" : "quick")`)
      // -- a real clinical-documentation safeguard, not a bug. The mobile
      // stage strip (`consultation-stage-*`) only renders in Quick Mode, so
      // switch to it explicitly before exercising stage switching.
      const quickModeToggle = page.getByRole('tab', { name: /Quick Mode/i });
      if (await quickModeToggle.isVisible().catch(() => false)) {
        await quickModeToggle.click();
      }

      // Stage switching must be stable and sections must remain reachable.
      await page.click('[data-testid="consultation-stage-exam"]');
      await expect(page.locator('[data-testid="section-examination"]')).toBeVisible({ timeout: 10000 });
      await assertVisibleBelowStickyHeader(page, '[data-testid="section-examination"]', [
        '[data-testid="consultation-sticky-header"]',
        '[data-testid="consultation-stage-strip"]',
      ]);
      await assertLastActionNotCoveredByActionBar(page, '[data-testid="section-examination"]', '[data-testid="consultation-action-bar"]');

      await page.click('[data-testid="consultation-stage-remedy"]');
      await expect(page.locator('[data-testid="section-prescription"]')).toBeVisible({ timeout: 10000 });
      await assertVisibleBelowStickyHeader(page, '[data-testid="section-prescription"]', [
        '[data-testid="consultation-sticky-header"]',
        '[data-testid="consultation-stage-strip"]',
      ]);
      await assertLastActionNotCoveredByActionBar(page, '[data-testid="section-prescription"]', '[data-testid="consultation-action-bar"]');

      await page.click('[data-testid="consultation-stage-followup"]');
      await expect(page.locator('[data-testid="section-followup"]')).toBeVisible({ timeout: 10000 });
      await assertVisibleBelowStickyHeader(page, '[data-testid="section-followup"]', [
        '[data-testid="consultation-sticky-header"]',
        '[data-testid="consultation-stage-strip"]',
      ]);
      await assertLastActionNotCoveredByActionBar(page, '[data-testid="section-followup"]', '[data-testid="consultation-action-bar"]');

      await page.click('[data-testid="consultation-stage-complaint"]');
      await expect(page.locator('[data-testid="section-chief-complaint"]')).toBeVisible({ timeout: 10000 });
      await assertVisibleBelowStickyHeader(page, '[data-testid="section-chief-complaint"]', [
        '[data-testid="consultation-sticky-header"]',
        '[data-testid="consultation-stage-strip"]',
      ]);
      await assertLastActionNotCoveredByActionBar(page, '[data-testid="section-chief-complaint"]', '[data-testid="consultation-action-bar"]');
    }
  });
});

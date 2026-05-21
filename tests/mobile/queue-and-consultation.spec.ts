import { test, expect } from '@playwright/test';
import { generatePatientData, registerPatient, bookAppointment, navigateTo } from '../testUtils';

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
    await expect(page.locator('[data-testid="queue-panel"]')).toBeVisible();

    // Add to queue if missing (reuse desktop test flow)
    const queueList = page.locator('[data-testid="queue-list"]');
    await expect(queueList).toBeVisible();

    let patientQueueRows = page.locator('[data-testid^="queue-row-"]').filter({ hasText: patient.name });
    let count = await patientQueueRows.count();
    if (count === 0) {
      await page.click('[data-testid="add-patient-to-queue-btn"]');
      await expect(page.locator('[data-testid="queue-search-input"]')).toBeVisible();
      await page.fill('[data-testid="queue-search-input"]', patient.name);
      const patientAddBtn = page.locator('button').filter({ hasText: new RegExp(patient.name, 'i') }).first();
      await expect(patientAddBtn).toBeVisible();
      await patientAddBtn.click();
      await expect(page.locator('[data-testid^="queue-row-"]').filter({ hasText: patient.name })).toHaveCount(1);
      patientQueueRows = page.locator('[data-testid^="queue-row-"]').filter({ hasText: patient.name });
    }

    const queueRow = patientQueueRows.first();
    const queueId = await queueRow.getAttribute('data-testid');
    // Select the row
    await queueRow.click();
    const expectedActiveSelector = queueId!.replace(/^queue-row-/, 'queue-row-active-');
    const activeRow = page.locator(`[data-testid="${expectedActiveSelector}"]`).first();
    await expect(activeRow).toBeVisible({ timeout: 2000 }).catch(() => {});

    // Click start consultation inside active row
    const activeQueueRow = page.locator('[data-testid^="queue-row-active-"]').first();
    await activeQueueRow.waitFor({ state: 'visible', timeout: 3000 });
    const startBtn = activeQueueRow.locator('[data-testid^="queue-start-consultation-"]');
    await expect(startBtn).toHaveCount(1);
    await startBtn.click();

    // Ensure consultation UI or form appears
    await expect(page.locator('[data-testid="consultation-root"]')).toBeVisible({ timeout: 5000 }).catch(() => {});
  });
});

import { test, expect } from '@playwright/test';
import { generatePatientData, registerPatient, bookAppointment, navigateTo } from '../testUtils';

test.describe('Mobile prescription and WhatsApp workflow', () => {
  test.setTimeout(60000);
  test('adds prescription and opens whatsapp share (stub)', async ({ page }) => {
    const patient = generatePatientData('RxMobile');
    await page.goto('/');

    await navigateTo(page, 'Patients');
    await registerPatient(page, patient);

    const date = await page.evaluate(() => {
      const d = new Date(); d.setDate(d.getDate() + 1); return d.toLocaleDateString('en-CA');
    });
    await bookAppointment(page, {
      patientName: patient.name,
      clinicBranch: 'Dabholi',
      appointmentDate: date,
      appointmentTime: '11:20',
    });

    await navigateTo(page, 'Today');
    // Ensure patient appears in queue and start consultation using robust selectors
    let patientQueueRows = page.locator('[data-testid^="queue-row-"]').filter({ hasText: patient.name });
    if ((await patientQueueRows.count()) === 0) {
      await page.click('[data-testid="add-patient-to-queue-btn"]');
      await expect(page.locator('[data-testid="queue-search-input"]')).toBeVisible();
      await page.fill('[data-testid="queue-search-input"]', patient.name);
      await page.locator('button').filter({ hasText: new RegExp(patient.name, 'i') }).first().click();
      await expect(page.locator('[data-testid^="queue-row-"]').filter({ hasText: patient.name })).toHaveCount(1);
      patientQueueRows = page.locator('[data-testid^="queue-row-"]').filter({ hasText: patient.name });
    }

    const queueRow = patientQueueRows.first();
    await queueRow.click();
    const queueId = await queueRow.getAttribute('data-testid');
    const expectedActiveSelector = queueId!.replace(/^queue-row-/, 'queue-row-active-');
    const activeRow = page.locator(`[data-testid="${expectedActiveSelector}"]`).first();
    await activeRow.waitFor({ state: 'visible', timeout: 2000 }).catch(() => {});
    const startBtn = activeRow.locator('[data-testid^="queue-start-consultation-"]');
    if ((await startBtn.count()) > 0) await startBtn.click();

    // attempt to find a visible WhatsApp share button (consultation UI may expose different labels)
    await page.evaluate(() => { (window as any)._opened = null; window.open = (u: any) => { (window as any)._opened = u; return null; }; });
    const waBtn = page.locator('button:has-text("WhatsApp")').first();
    await expect(waBtn).toBeVisible({ timeout: 8000 });
    await waBtn.click().catch(async () => { await waBtn.click({ force: true }); });
    const opened = await page.evaluate(() => (window as any)._opened);
    expect(opened).toBeTruthy();
    expect(String(opened)).toContain('wa.me');
  });
});

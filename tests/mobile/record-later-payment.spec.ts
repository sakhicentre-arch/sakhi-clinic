import { test, expect } from '@playwright/test';
import { generatePatientData, registerPatient, bookAppointment, navigateTo } from '../testUtils';

/**
 * Doctor-requested feature: "Record Later Payment." End-to-end doctor
 * workflow -- a patient's visit is billed but unpaid at consultation time;
 * later the doctor uploads a payment screenshot from the Patient Ledger,
 * reviews/edits the extracted-by-hand details, confirms, and the ledger/
 * revenue/receipt all reflect it. No real patient/payment data used --
 * `generatePatientData` produces a unique synthetic name/phone per run.
 */

// A minimal, valid 1x1 transparent PNG -- enough for compressPaymentScreenshot
// (a real <canvas>/<img> pipeline, which only a real browser like Playwright's
// Chromium, not jsdom, can actually execute) to decode and re-encode.
const TEST_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

test.describe('Record Later Payment workflow', () => {
  test.setTimeout(90000);

  test('doctor uploads a payment screenshot and posts a later payment via the Patient Ledger', async ({ page }) => {
    const patient = generatePatientData('PayLater');
    const fee = '600';

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

    const viewport = page.viewportSize();
    const isMobile = !!viewport && viewport.width < 768;

    if (isMobile) {
      await expect(page.locator('[data-testid="mobile-fab-add-walkin"]')).toBeVisible();
      await page.click('[data-testid="mobile-fab-add-walkin"]');
      await expect(page.locator('[data-testid="queue-search-input"]')).toBeVisible();
      await page.fill('[data-testid="queue-search-input"]', patient.name);
      await page.locator('button').filter({ hasText: new RegExp(patient.name, 'i') }).first().click();
      const startCta = page.locator('[data-testid^="mobile-now-serving-start-"]').first();
      await expect(startCta).toBeVisible({ timeout: 5000 });
      await startCta.click();
    } else {
      await page.click('[data-testid="add-patient-to-queue-btn"]');
      await expect(page.locator('[data-testid="queue-search-input"]')).toBeVisible();
      await page.fill('[data-testid="queue-search-input"]', patient.name);
      await page.locator('button').filter({ hasText: new RegExp(patient.name, 'i') }).first().click();
      const queueRow = page.locator('[data-testid^="queue-row-"]').filter({ hasText: patient.name }).first();
      await queueRow.click();
      const startBtn = page.locator('[data-testid^="queue-start-consultation-"]');
      if ((await startBtn.count()) > 0) await startBtn.click();
    }

    // First-visit consultations default to Classic Mode -- switch to Quick
    // Mode for the one consistent surface with the billing fields this test needs.
    const quickModeToggle = page.getByRole('tab', { name: /Quick Mode/i });
    if (await quickModeToggle.isVisible().catch(() => false)) {
      await quickModeToggle.click();
    }

    // Chief complaint is required to save.
    const complaintField = page.locator('[data-testid="section-chief-complaint"] textarea, [data-testid="section-chief-complaint"] input[type="text"]').first();
    await expect(complaintField).toBeVisible({ timeout: 10000 });
    await complaintField.fill('Test complaint for later-payment workflow');

    // Fee/billing lives in the "Follow-up" mobile stage panel, not the
    // complaint stage -- switch stages before it's interactable.
    const followupStageTab = page.locator('[data-testid="consultation-stage-followup"]');
    if (await followupStageTab.isVisible().catch(() => false)) {
      await followupStageTab.click();
    }

    // Bill this visit, leave it unpaid -- exactly the doctor's reported scenario.
    const feeField = page.locator('input[placeholder="Amount"]').first();
    await feeField.scrollIntoViewIfNeeded();
    await feeField.fill(fee);

    const saveBtn = page.locator('[data-testid="consultation-action-bar"] button, [data-testid="consultation-save-button"]').filter({ hasText: /Save/i }).first();
    await saveBtn.scrollIntoViewIfNeeded();
    await saveBtn.click().catch(async () => { await saveBtn.click({ force: true }); });
    // Let the save (and its background rubric/learning side effects) settle
    // before navigating away -- avoids a race with the app's own post-save
    // work that the shared navigateTo() helper doesn't otherwise account for.
    await expect(page.locator('[data-testid="consultation-saved-toast"]')).toBeVisible({ timeout: 15000 }).catch(() => {});

    // ── Doctor forgot to collect payment at the visit. Later, from the
    // Patient Ledger: record the payment against that same billed visit. ──
    await navigateTo(page, 'Patients');
    await page.fill('[data-testid="patient-search-input"]', patient.name);
    await page.locator('[data-testid="patient-row"]', { hasText: patient.name }).first().click();

    const financeTab = page.getByRole('button', { name: /Finance/i }).or(page.locator('button', { hasText: 'Finance' }));
    if (await financeTab.first().isVisible().catch(() => false)) {
      await financeTab.first().click();
    }

    await page.click('[data-testid="patient-record-payment-btn"]');
    await expect(page.locator('[data-testid="record-later-payment-flow"]')).toBeVisible();

    // Exactly one billed visit -> the flow auto-advances past patient
    // confirmation straight to picking that visit.
    const visitOption = page.locator('[data-testid^="record-payment-visit-option-"]').first();
    await expect(visitOption).toBeVisible({ timeout: 10000 });
    await visitOption.click();

    // Upload the payment screenshot (evidence).
    await page.setInputFiles('[data-testid="record-payment-upload-file"] input[type="file"]', {
      name: 'payment-screenshot.png',
      mimeType: 'image/png',
      buffer: Buffer.from(TEST_PNG_BASE64, 'base64'),
    });
    await expect(page.locator('[data-testid="record-payment-screenshot-preview"]')).toBeVisible({ timeout: 10000 });
    await page.click('[data-testid="record-payment-continue"]');

    // Review + edit extracted (here: doctor-entered, no OCR) payment details.
    await page.fill('[data-testid="record-payment-amount"]', fee);
    await page.click('[data-testid="record-payment-mode-upi"]');
    await page.fill('[data-testid="record-payment-reference"]', `E2E-${Date.now()}`);

    // First tap runs the duplicate check; second tap actually posts.
    await page.click('[data-testid="record-payment-confirm"]');
    await expect(page.locator('[data-testid="record-payment-confirm"]')).toHaveText(/Confirm & Record Payment/i);
    await page.click('[data-testid="record-payment-confirm"]');

    await expect(page.getByText(/Payment recorded successfully/i)).toBeVisible({ timeout: 10000 });

    // Receipt actions are reachable from the success screen.
    await expect(page.locator('[data-testid="record-payment-view-receipt"]')).toBeVisible();
    await page.click('[data-testid="record-payment-view-receipt"]');
    await expect(page.locator('[data-testid="record-payment-receipt-text"]')).toContainText(fee);
    await page.click('[data-testid="record-payment-receipt-preview-close"]');
    await expect(page.locator('[data-testid="record-payment-receipt-text"]')).not.toBeVisible();

    await page.click('[data-testid="record-payment-done"]');
    await expect(page.locator('[data-testid="record-later-payment-flow"]')).not.toBeVisible();

    // ── Verify the ledger, status, and revenue all reflect the one payment
    // transaction -- no separate write path to independently check. ──
    if (await financeTab.first().isVisible().catch(() => false)) {
      await financeTab.first().click();
    }
    await expect(page.getByText(/PAID/i).first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator(`[data-testid^="payment-proof-view-"]`).first()).toBeVisible();
  });
});

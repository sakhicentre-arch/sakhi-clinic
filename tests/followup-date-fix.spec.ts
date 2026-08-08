import { test, expect, Page } from '@playwright/test';
import { generatePatientData, navigateTo, registerPatient } from './testUtils';

/**
 * Regression E2E for the doctor-reported follow-up date bug (2026-08-08):
 * a consultation dated 08/08/2026 with a next follow-up of 10/08/2026 was
 * immediately shown as "Overdue Follow-up" / "Missed Patient" with the
 * displayed date corrupted to 01/08/2026.
 *
 * `page.clock` fixes the browser's notion of "now" to the doctor's exact
 * reported date so this is a faithful reproduction, not just "some future
 * date relative to whenever CI happens to run."
 *
 * Runs across every project (not placed under tests/mobile/) since the
 * root cause involved BOTH the mobile "Schedule & billing" follow-up
 * field and the desktop Classic-mode footer field -- both were
 * `<input type="datetime-local">`, both are now `type="date"`.
 */

const TODAY = new Date('2026-08-08T09:00:00');
const ACTIVE_PAGE_STORAGE_KEY = 'sakhi.activePage.v1';

async function startConsultationForPatient(page: Page, patientName: string) {
  const viewport = page.viewportSize();
  const isMobile = !!viewport && viewport.width < 768;

  await navigateTo(page, 'Today');

  if (isMobile) {
    await expect(page.locator('[data-testid="mobile-fab-add-walkin"]')).toBeVisible();
    await page.click('[data-testid="mobile-fab-add-walkin"]');
    await expect(page.locator('[data-testid="queue-search-input"]')).toBeVisible();
    await page.fill('[data-testid="queue-search-input"]', patientName);
    await page.locator('button').filter({ hasText: new RegExp(patientName, 'i') }).first().click();
    const startCta = page.locator('[data-testid^="mobile-now-serving-start-"]').first();
    await expect(startCta).toBeVisible({ timeout: 5000 });
    await startCta.click();
  } else {
    await page.click('[data-testid="add-patient-to-queue-btn"]');
    await expect(page.locator('[data-testid="queue-search-input"]')).toBeVisible();
    await page.fill('[data-testid="queue-search-input"]', patientName);
    await page.locator('button').filter({ hasText: new RegExp(patientName, 'i') }).first().click();
    const queueRow = page.locator('[data-testid^="queue-row-"]').filter({ hasText: patientName }).first();
    await queueRow.click();
    const startBtn = page.locator('[data-testid^="queue-start-consultation-"]');
    if ((await startBtn.count()) > 0) await startBtn.click();
  }
}

async function fillChiefComplaint(page: Page, text: string) {
  const quickModeToggle = page.getByRole('tab', { name: /Quick Mode/i });
  if (await quickModeToggle.isVisible().catch(() => false)) {
    await quickModeToggle.click();
  }
  const complaintField = page.locator('[data-testid="section-chief-complaint"] textarea, [data-testid="section-chief-complaint"] input[type="text"]').first();
  await expect(complaintField).toBeVisible({ timeout: 10000 });
  await complaintField.fill(text);
}

/** Fills the follow-up date, trying every surface this field is bound to
 * (mobile Quick-Mode "Schedule & billing" panel, desktop Classic-mode
 * footer) since which one is visible depends on mode/viewport. */
async function setFollowUpDate(page: Page, isoDate: string) {
  const followupStageTab = page.locator('[data-testid="consultation-stage-followup"]');
  if (await followupStageTab.isVisible().catch(() => false)) {
    await followupStageTab.click();
  }

  const mobileInput = page.locator('[data-testid="consultation-followup-date-input"]');
  const classicInput = page.locator('[data-testid="consultation-followup-date-input-classic"]');

  if (await mobileInput.isVisible().catch(() => false)) {
    await mobileInput.scrollIntoViewIfNeeded();
    await mobileInput.fill(isoDate);
  } else {
    await expect(classicInput).toBeVisible({ timeout: 10000 });
    await classicInput.scrollIntoViewIfNeeded();
    await classicInput.fill(isoDate);
  }
}

async function saveConsultation(page: Page) {
  const saveBtn = page.locator('[data-testid="consultation-action-bar"] button, [data-testid="consultation-save-button"], [data-testid="consultation-classic-save-button"]').filter({ hasText: /Save/i }).first();
  await saveBtn.scrollIntoViewIfNeeded();
  await saveBtn.click().catch(async () => { await saveBtn.click({ force: true }); });
  await expect(page.locator('[data-testid="consultation-saved-toast"]')).toBeVisible({ timeout: 15000 }).catch(() => {});
}

/** The app remembers the last visited page in sessionStorage and restores
 * it on reload (see App.tsx's getStoredPage()) -- a plain page.goto('/')
 * after navigating elsewhere lands back on that page, not the Dashboard.
 * Clearing the key first forces the documented "fresh session" default. */
async function goToDashboard(page: Page) {
  await page.evaluate((key) => window.sessionStorage.removeItem(key), ACTIVE_PAGE_STORAGE_KEY);
  await page.goto('/');
  await expect(page.locator('[data-testid="dashboard-action-card-overdueFollowUps"]')).toBeVisible({ timeout: 15000 });
}

async function goToFollowUpsPage(page: Page) {
  await page.keyboard.press('Control+k');
  const palette = page.locator('[data-testid="command-palette"]');
  await expect(palette).toBeVisible();
  await palette.locator('button', { hasText: 'Follow-ups' }).click();
  await expect(page.locator('[data-testid="followups-page"]')).toBeVisible({ timeout: 10000 });
}

test.describe('Follow-up date bug fix (doctor-reported 2026-08-08)', () => {
  test.setTimeout(120000);

  test('a consultation today with a follow-up 2 days out is never Overdue or Missed, and shows the exact entered date', async ({ page }) => {
    await page.clock.setFixedTime(TODAY);

    const patient = generatePatientData('FUFix');

    await page.goto('/');
    await navigateTo(page, 'Patients');
    await registerPatient(page, patient);

    await startConsultationForPatient(page, patient.name);
    await fillChiefComplaint(page, 'Test complaint for follow-up date fix');
    await setFollowUpDate(page, '2026-08-10'); // doctor's exact reported scenario
    await saveConsultation(page);

    // ── FollowUpPage: must not be in Overdue; must be in Upcoming with the exact date ──
    await goToFollowUpsPage(page);
    await expect(page.getByText(patient.name)).not.toBeVisible();

    await page.getByRole('button', { name: /^Upcoming \(\d+\)$/ }).click();
    await expect(page.getByText(patient.name)).toBeVisible({ timeout: 10000 });
    // Locale-order-agnostic ("10 Aug" vs "Aug 10" depending on the
    // browser's locale) -- the day and month must both be the entered ones.
    await expect(page.getByText(/10\s*Aug|Aug\s*10/i)).toBeVisible();
    // The old bug's exact symptom (day collapsed to the 1st) must never appear.
    await expect(page.getByText(/\b01\s*Aug|Aug\s*01\b/i)).not.toBeVisible();

    // ── Dashboard: must NOT appear under Overdue Follow-ups or Missed Patients ──
    await goToDashboard(page);
    const overdueCard = page.locator('[data-testid="dashboard-action-card-overdueFollowUps"]');
    const missedCard = page.locator('[data-testid="dashboard-action-card-missedPatients"]');

    await overdueCard.click();
    await expect(page.locator('[data-testid="filtered-patient-list"]')).toBeVisible();
    await expect(page.getByText(patient.name)).not.toBeVisible();

    await goToDashboard(page);
    await expect(missedCard).toBeVisible({ timeout: 15000 });
    await missedCard.click();
    await expect(page.locator('[data-testid="filtered-patient-list"]')).toBeVisible();
    await expect(page.getByText(patient.name)).not.toBeVisible();
  });

  test('positive case: a follow-up date that has since passed is correctly flagged Overdue (the fix must not break real overdue detection)', async ({ page }) => {
    // Realistic overdue scenario: the follow-up was a genuinely FUTURE date
    // at the time it was scheduled (syncPatientFollowUp only adopts
    // consultation.followUpDate onto Patient.nextFollowUpDate when it is
    // >= "today" at save time -- a follow-up scheduled for what's already
    // a past date is correctly treated as "no active follow-up," not
    // "overdue"). So: schedule it while "today" is still before the due
    // date, then advance the clock past it to make it overdue.
    await page.clock.setFixedTime(new Date('2026-07-25T09:00:00'));

    const patient = generatePatientData('FUOverdue');

    await page.goto('/');
    await navigateTo(page, 'Patients');
    await registerPatient(page, patient);

    await startConsultationForPatient(page, patient.name);
    await fillChiefComplaint(page, 'Test complaint for genuinely overdue follow-up');
    await setFollowUpDate(page, '2026-08-01'); // future relative to 25 Jul
    await saveConsultation(page);

    await page.clock.setFixedTime(TODAY); // 7 days after the due date now passed
    await goToDashboard(page);
    const overdueCard = page.locator('[data-testid="dashboard-action-card-overdueFollowUps"]');
    await overdueCard.click();
    await expect(page.locator('[data-testid="filtered-patient-list"]')).toBeVisible();
    await expect(page.getByText(patient.name)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/7 days overdue/i)).toBeVisible();
  });
});

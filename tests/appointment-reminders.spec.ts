import { test, expect, Page } from '@playwright/test';
import { generatePatientData, registerPatient, bookAppointment, navigateTo } from './testUtils';

/**
 * Appointment reminders (REMINDER_SYSTEM_AUDIT.md / REMINDER_SYSTEM_IMPLEMENTATION_REPORT.md).
 *
 * `page.clock` fixes "today" to a specific date so this doesn't depend on
 * whenever the suite happens to run, and so the appointment's operating-hours
 * validation (Dabholi 11:00-14:00) has a stable window to book within.
 *
 * Runs on every project (not placed under tests/mobile/) since the feature
 * touches both AppointmentPage.tsx (desktop-oriented) and TodayPage.tsx/
 * RemindersPage.tsx (used on both).
 */

const TODAY = new Date('2026-08-08T09:00:00');

async function openRemindersPage(page: Page) {
  await page.keyboard.press('Control+k');
  const palette = page.locator('[data-testid="command-palette"]');
  await expect(palette).toBeVisible();
  await palette.locator('button', { hasText: 'Reminders' }).click();
  await expect(page.locator('[data-testid="reminders-page"]')).toBeVisible({ timeout: 10000 });
}

test.describe('Appointment reminders', () => {
  test.setTimeout(120000);

  test('queue → duplicate-guard → approve → send, end to end through the canonical reminder queue', async ({ page }) => {
    await page.clock.setFixedTime(TODAY);

    const patient = generatePatientData('ApptReminder');
    const appointmentTime = '11:20';

    await page.goto('/');
    await navigateTo(page, 'Patients');
    await registerPatient(page, patient);

    await bookAppointment(page, {
      patientName: patient.name,
      clinicBranch: 'Dabholi',
      appointmentDate: '2026-08-08', // "today" under the fixed clock
      appointmentTime,
    });

    await openRemindersPage(page);

    // ── Today's Appointment Reminders: shows the booked appointment, not yet queued ──
    const todayRow = page.locator('[data-testid^="today-reminder-row-"]', { hasText: patient.name });
    await expect(todayRow).toBeVisible({ timeout: 10000 });
    await expect(todayRow).toContainText('Not queued');

    // ── Queue it ──
    await page.click('[data-testid="queue-today-reminders"]');
    await expect(page.getByText(/1 queued for review/i)).toBeVisible({ timeout: 10000 });
    await expect(todayRow).toContainText(/Pending/i);

    // ── DUPLICATE TEST: queueing again must not create a second active reminder ──
    await page.click('[data-testid="queue-today-reminders"]');
    await expect(page.getByText(/already have an active reminder/i)).toBeVisible({ timeout: 10000 });
    await expect(todayRow).toContainText(/Pending/i); // still just the one, still pending

    const pendingTab = page.locator('button', { hasText: /^Pending \(\d+\)$/ });
    await pendingTab.click();
    // Scoped to the actual queue row (not the always-visible "Today's
    // Appointment Reminders" card above, which also shows this patient's
    // name in its own .sakhi-progress-card row).
    const pendingRow = page.locator('[data-testid^="reminder-queue-row-"]', { hasText: patient.name });
    await expect(pendingRow).toHaveCount(1); // exactly one active reminder for this patient

    // ── Approve ──
    await pendingRow.getByRole('button', { name: /Approve/i }).click();
    await expect(page.locator('button', { hasText: /^Approved \(\d+\)$/ })).toBeVisible();
    await expect(todayRow).toContainText('Approved');

    // ── Send (openWhatsApp opens a window/tab -- close it so it doesn't
    // interfere with the rest of the test; the app marks the reminder
    // "sent" synchronously before that popup even opens). ──
    page.on('popup', (popup) => { popup.close().catch(() => {}); });
    const approvedTab = page.locator('button', { hasText: /^Approved \(\d+\)$/ });
    await approvedTab.click();
    const approvedRow = page.locator('[data-testid^="reminder-queue-row-"]', { hasText: patient.name });
    await approvedRow.getByRole('button', { name: /Send via WhatsApp/i }).click();

    await expect(page.locator('button', { hasText: /^Sent \(\d+\)$/ })).toBeVisible({ timeout: 10000 });
    await expect(todayRow).toContainText(/✓ Sent/);
  });

  test('AppointmentPage no longer sends directly -- its reminder buttons queue through the same canonical path', async ({ page }) => {
    await page.clock.setFixedTime(TODAY);

    const patient = generatePatientData('ApptDirectRetired');

    await page.goto('/');
    await navigateTo(page, 'Patients');
    await registerPatient(page, patient);

    await bookAppointment(page, {
      patientName: patient.name,
      clinicBranch: 'Dabholi',
      appointmentDate: '2026-08-08',
      appointmentTime: '11:40',
    });

    // bookAppointment's own booking-confirmation WhatsApp send (an
    // unrelated, unchanged transactional message, not a "reminder") opens
    // a window via a fire-and-forget path that can pop a SECOND, delayed
    // fallback window up to ~950ms later (whatsappService.ts's app-scheme
    // vs. web-fallback race) -- wait that out first so it can't be
    // mistaken for a popup caused by the reminder button below.
    await page.waitForTimeout(1500);
    let popupOpenedAfterBooking = false;
    page.on('popup', () => { popupOpenedAfterBooking = true; });

    await navigateTo(page, 'Appointments');
    await expect(page.locator('[data-testid="appointment-scheduling-form"]')).toBeVisible();

    let dialogMessage = '';
    page.once('dialog', async (dialog) => {
      dialogMessage = dialog.message();
      await dialog.accept();
    });
    await page.click('button:has-text("Queue Today\'s Reminders")');
    await page.waitForTimeout(1500); // long enough for the old direct-send path's popup to have appeared, if it still existed

    expect(popupOpenedAfterBooking).toBe(false); // no WhatsApp window opened directly
    expect(dialogMessage).toMatch(/queued for review|already have an active reminder/i);

    // Confirm it actually landed in the canonical queue, not nowhere.
    await openRemindersPage(page);
    const todayRow = page.locator('[data-testid^="today-reminder-row-"]', { hasText: patient.name });
    await expect(todayRow).toBeVisible({ timeout: 10000 });
    await expect(todayRow).toContainText(/Pending/i);
  });
});

import { test, expect } from '@playwright/test';

test('standard appointment booking workflow', async ({ page }) => {
  const patientName = `Automation Patient ${Date.now()}`;
  const patientAge = '34';
  const patientGender = 'Female';
  const patientPhone = String(9000000000 + Math.floor(Math.random() * 1000000000));
  const clinicBranch = 'Dabholi';
  const appointmentTime = '11:20';

  const today = new Date();
  const futureDate = new Date(today);
  futureDate.setDate(today.getDate() + 1);
  const appointmentDate = futureDate.toISOString().split('T')[0];
  const appointmentDateDisplay = futureDate.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });

  await page.goto('/');

  await page.click('button[aria-label="Patients"]');
  await expect(page.locator('[data-testid="patient-registration-form"]')).toBeVisible();

  await page.fill('[data-testid="patient-name-input"]', patientName);
  await page.fill('[data-testid="patient-age-input"]', patientAge);
  await page.selectOption('[data-testid="patient-gender-select"]', patientGender);
  await page.fill('[data-testid="patient-phone-input"]', patientPhone);
  await page.click('[data-testid="save-patient-btn"]');

  const patientRow = page.locator('[data-testid="patient-row"]', { hasText: patientName });
  await expect(patientRow).toBeVisible();
  await expect(patientRow).toContainText(patientPhone);

  await page.click('button[aria-label="Appointments"]');
  await expect(page.locator('[data-testid="appointment-scheduling-form"]')).toBeVisible();

  await page.fill('[data-testid="appointment-patient-search-input"]', patientName);
  const patientSelectOption = page.locator('[data-testid="appointment-patient-select"] option', { hasText: patientName }).first();
  const patientValue = await patientSelectOption.getAttribute('value');
  await expect(patientValue).not.toBeNull();
  await page.selectOption('[data-testid="appointment-patient-select"]', patientValue!);
  await page.selectOption('[data-testid="appointment-clinic-select"]', clinicBranch);
  await page.fill('[data-testid="appointment-date-input"]', appointmentDate);
  await page.selectOption('[data-testid="appointment-time-select"]', appointmentTime);

  page.once('popup', async (popup) => {
    await popup.close();
  });

  const [dialog] = await Promise.all([
    page.waitForEvent('dialog'),
    page.click('[data-testid="appointment-submit-btn"]'),
  ]);
  await expect(dialog.message()).toContain('Appointment Secured');
  await dialog.accept();

  const bookedSlotCard = page.locator('[data-testid="appointment-slot-card"]', { hasText: patientName });
  await expect(bookedSlotCard).toHaveCount(1);
  await expect(bookedSlotCard).toContainText('Scheduled');

  const bookedOption = page.locator('[data-testid="appointment-time-select"] option[value="' + appointmentTime + '"]');
  await expect(bookedOption).toBeDisabled();

  const upcomingCardsContainer = page.locator('text=Filter by Date').first().locator('xpath=ancestor::div[1]/following-sibling::div[1]');
  const upcomingAppointmentCard = upcomingCardsContainer.locator(':scope > div', { hasText: patientName }).filter({ hasText: /scheduled/i });
  await expect(upcomingAppointmentCard).toHaveCount(1);

  await page.reload();
  await page.click('button[aria-label="Appointments"]');
  await expect(page.locator('[data-testid="appointment-scheduling-form"]')).toBeVisible();
  await page.fill('[data-testid="appointment-date-input"]', appointmentDate);

  const persistedSlotCard = page.locator('[data-testid="appointment-slot-card"]', { hasText: patientName });
  await expect(persistedSlotCard).toHaveCount(1);
  await expect(persistedSlotCard).toContainText('Scheduled');

  const persistedUpcomingCardsContainer = page.locator('text=Filter by Date').first().locator('xpath=ancestor::div[1]/following-sibling::div[1]');
  const persistedUpcomingCard = persistedUpcomingCardsContainer.locator(':scope > div', { hasText: patientName }).filter({ hasText: /scheduled/i });
  await expect(persistedUpcomingCard).toHaveCount(1);
});

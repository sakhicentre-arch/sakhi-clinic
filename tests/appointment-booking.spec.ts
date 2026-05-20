import { test, expect } from '@playwright/test';
import { generatePatientData, getRelativeDate, navigateTo, registerPatient, bookAppointment } from './testUtils';

test('standard appointment booking workflow', async ({ page }) => {
  const patient = generatePatientData('Automation Patient');
  const clinicBranch = 'Dabholi';
  const appointmentTime = '11:20';
  const appointmentDate = getRelativeDate(1);

  await page.goto('/');

  await navigateTo(page, 'Patients');
  await registerPatient(page, patient);

  const patientRow = page.locator('[data-testid="patient-row"]', { hasText: patient.name });
  await expect(patientRow).toBeVisible();
  await expect(patientRow).toContainText(patient.phone);

  await bookAppointment(page, {
    patientName: patient.name,
    clinicBranch,
    appointmentDate,
    appointmentTime,
  });

  const bookedSlotCard = page.locator('[data-testid="appointment-slot-card"]', { hasText: patient.name });
  await expect(bookedSlotCard).toHaveCount(1);
  await expect(bookedSlotCard).toContainText('Scheduled');

  const bookedOption = page.locator('[data-testid="appointment-time-select"] option[value="' + appointmentTime + '"]');
  await expect(bookedOption).toBeDisabled();

  const upcomingCardsContainer = page.locator('text=Filter by Date').first().locator('xpath=ancestor::div[1]/following-sibling::div[1]');
  const upcomingAppointmentCard = upcomingCardsContainer.locator(':scope > div', { hasText: patient.name }).filter({ hasText: /scheduled/i });
  await expect(upcomingAppointmentCard).toHaveCount(1);

  await page.reload();
  await navigateTo(page, 'Appointments');
  await expect(page.locator('[data-testid="appointment-scheduling-form"]')).toBeVisible();
  await page.fill('[data-testid="appointment-date-input"]', appointmentDate);

  const persistedSlotCard = page.locator('[data-testid="appointment-slot-card"]', { hasText: patient.name });
  await expect(persistedSlotCard).toHaveCount(1);
  await expect(persistedSlotCard).toContainText('Scheduled');

  const persistedUpcomingCardsContainer = page.locator('text=Filter by Date').first().locator('xpath=ancestor::div[1]/following-sibling::div[1]');
  const persistedUpcomingCard = persistedUpcomingCardsContainer.locator(':scope > div', { hasText: patient.name }).filter({ hasText: /scheduled/i });
  await expect(persistedUpcomingCard).toHaveCount(1);
});

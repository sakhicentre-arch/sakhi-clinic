import { test, expect } from '@playwright/test';
import { navigateTo } from './testUtils';

test('duplicate patient validation workflow', async ({ page }) => {
  const firstPatientName = `Duplicate Test Patient ${Date.now()}`;
  const secondPatientName = `${firstPatientName} II`;
  const patientAge = '35';
  const patientGender = 'Female';
  const duplicatePhone = String(9000000000 + Math.floor(Math.random() * 1000000000));

  // Open the application and navigate to the patient management page.
  await page.goto('/');
  await navigateTo(page, 'Patients');

  // Register the first patient.
  await page.fill('[data-testid="patient-name-input"]', firstPatientName);
  await page.fill('[data-testid="patient-age-input"]', patientAge);
  await page.selectOption('[data-testid="patient-gender-select"]', patientGender);
  await page.fill('[data-testid="patient-phone-input"]', duplicatePhone);
  await page.click('[data-testid="save-patient-btn"]');

  // Confirm the first patient is present in the list.
  const firstPatientRow = page.locator('[data-testid="patient-row"]', { hasText: firstPatientName });
  await expect(firstPatientRow).toBeVisible();
  await expect(firstPatientRow).toContainText(duplicatePhone);

  // Clear the search before the second registration.
  await page.fill('[data-testid="patient-search-input"]', '');

  // Attempt to register a second patient using the same phone number.
  await page.fill('[data-testid="patient-name-input"]', secondPatientName);
  await page.fill('[data-testid="patient-age-input"]', patientAge);
  await page.selectOption('[data-testid="patient-gender-select"]', patientGender);
  await page.fill('[data-testid="patient-phone-input"]', duplicatePhone);
  await page.click('[data-testid="save-patient-btn"]');

  // Verify the system does not create a duplicate patient record with the same phone.
  await page.fill('[data-testid="patient-search-input"]', duplicatePhone);
  const matchingRows = page.locator('[data-testid="patient-row"]');
  await expect(matchingRows).toHaveCount(1);

  // The patient list should still contain the original patient only.
  await expect(matchingRows.first()).toContainText(firstPatientName);
});
import { test, expect } from '@playwright/test';
import { navigateTo } from './testUtils';

test('patient registration workflow', async ({ page }) => {
  // Use a realistic patient and unique phone number to avoid collisions.
  const patientName = `Test Patient ${Date.now()}`;
  const patientAge = '28';
  const patientGender = 'Female';
  const patientPhone = String(9000000000 + Math.floor(Math.random() * 1000000000));

  // Open the application.
  await page.goto('/');

  // Navigate to the patient management page using the app navigation.
  await navigateTo(page, 'Patients');

  // Verify the registration form is present.
  const registrationForm = page.locator('[data-testid="patient-registration-form"]');
  await expect(registrationForm).toBeVisible();

  // Fill the patient registration form using stable test IDs.
  await page.fill('[data-testid="patient-name-input"]', patientName);
  await page.fill('[data-testid="patient-age-input"]', patientAge);
  await page.selectOption('[data-testid="patient-gender-select"]', patientGender);
  await page.fill('[data-testid="patient-phone-input"]', patientPhone);

  // Submit the registration form.
  await page.click('[data-testid="save-patient-btn"]');

  // Verify the form submission succeeded by checking that the form cleared.
  await expect(page.locator('[data-testid="patient-name-input"]')).toHaveValue('');
  await expect(page.locator('[data-testid="patient-phone-input"]')).toHaveValue('');

  // Verify the new patient appears in the patient list.
  const patientRow = page.locator('[data-testid="patient-row"]', { hasText: patientName });
  await expect(patientRow).toBeVisible();
  await expect(patientRow).toContainText(patientPhone);

  // Verify the patient can be found using the search field.
  await page.fill('[data-testid="patient-search-input"]', patientName);
  const searchResultRow = page.locator('[data-testid="patient-row"]', { hasText: patientName });
  await expect(searchResultRow).toHaveCount(1);
  await expect(searchResultRow).toBeVisible();
});
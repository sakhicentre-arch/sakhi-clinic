import { test, expect } from '@playwright/test';
import { navigateTo } from './testUtils';

test('patient edit workflow', async ({ page }) => {
  const originalPatientName = `Edit Test Patient ${Date.now()}`;
  const updatedPatientName = `${originalPatientName} Updated`;
  const originalPatientAge = '30';
  const updatedPatientAge = '31';
  const patientGender = 'Female';
  const patientPhone = String(9000000000 + Math.floor(Math.random() * 1000000000));

  // Open the application and navigate to the patient management screen.
  await page.goto('/');
  await navigateTo(page, 'Patients');

  // Create a new patient record.
  await page.fill('[data-testid="patient-name-input"]', originalPatientName);
  await page.fill('[data-testid="patient-age-input"]', originalPatientAge);
  await page.selectOption('[data-testid="patient-gender-select"]', patientGender);
  await page.fill('[data-testid="patient-phone-input"]', patientPhone);
  await page.click('[data-testid="save-patient-btn"]');

  // Verify the new patient appears in the list.
  const createdRow = page.locator('[data-testid="patient-row"]', {
    hasText: originalPatientName,
  });
  await expect(createdRow).toBeVisible();
  await expect(createdRow).toContainText(patientPhone);

  // Trigger the edit workflow for the created patient (icon-only button,
  // labelled via aria-label rather than visible text).
  await createdRow.getByRole('button', { name: 'Edit patient' }).click();

  // The form should populate with the selected patient values.
  await expect(page.locator('[data-testid="patient-name-input"]')).toHaveValue(originalPatientName);
  await expect(page.locator('[data-testid="patient-age-input"]')).toHaveValue(originalPatientAge);
  await expect(page.locator('[data-testid="patient-phone-input"]')).toHaveValue(patientPhone);

  // Update patient name and age, keeping the phone number stable.
  await page.fill('[data-testid="patient-name-input"]', updatedPatientName);
  await page.fill('[data-testid="patient-age-input"]', updatedPatientAge);
  await page.click('[data-testid="save-patient-btn"]');

  // Verify the list reflects the updated patient name and that the same phone remains.
  await page.fill('[data-testid="patient-search-input"]', updatedPatientName);
  const updatedRow = page.locator('[data-testid="patient-row"]', {
    hasText: updatedPatientName,
  });
  await expect(updatedRow).toHaveCount(1);
  await expect(updatedRow).toContainText(patientPhone);

  // Verify the patient search by phone still resolves the same record.
  await page.fill('[data-testid="patient-search-input"]', patientPhone);
  const phoneSearchRows = page.locator('[data-testid="patient-row"]');
  await expect(phoneSearchRows).toHaveCount(1);
  await expect(phoneSearchRows.first()).toContainText(updatedPatientName);
});
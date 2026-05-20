import { expect, Page } from '@playwright/test';

export function formatLocalDate(date: Date) {
  return date.toLocaleDateString('en-CA');
}

export function getRelativeDate(daysAhead: number) {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  return formatLocalDate(date);
}

export function generatePatientData(prefix: string) {
  const uniqueSuffix = Date.now();
  return {
    name: `${prefix} ${uniqueSuffix}`,
    age: '34',
    gender: 'Female',
    phone: String(9000000000 + Math.floor(Math.random() * 1000000000)),
  };
}

export async function navigateTo(page: Page, section: 'Patients' | 'Appointments' | 'Today') {
  const selectorMap: Record<string, string> = {
    Patients: 'button[aria-label="Patients"]',
    Appointments: 'button[aria-label="Appointments"]',
    Today: 'button[aria-label="Today"]',
  };

  const selector = selectorMap[section];
  const button = page.locator(selector).first();
  await expect(button).toBeVisible();
  await button.click();
}

export async function registerPatient(page: Page, patientData: {
  name: string;
  age: string;
  gender: string;
  phone: string;
}) {
  await expect(page.locator('[data-testid="patient-registration-form"]')).toBeVisible();
  await page.fill('[data-testid="patient-name-input"]', patientData.name);
  await page.fill('[data-testid="patient-age-input"]', patientData.age);
  await page.selectOption('[data-testid="patient-gender-select"]', patientData.gender);
  await page.fill('[data-testid="patient-phone-input"]', patientData.phone);
  await page.click('[data-testid="save-patient-btn"]');
}

export async function bookAppointment(page: Page, bookingData: {
  patientName: string;
  clinicBranch: string;
  appointmentDate: string;
  appointmentTime: string;
}) {
  await navigateTo(page, 'Appointments');
  await expect(page.locator('[data-testid="appointment-scheduling-form"]')).toBeVisible();

  await page.fill('[data-testid="appointment-patient-search-input"]', bookingData.patientName);
  const patientSelectOption = page.locator('[data-testid="appointment-patient-select"] option', {
    hasText: bookingData.patientName,
  }).first();
  const patientValue = await patientSelectOption.getAttribute('value');
  await expect(patientValue).not.toBeNull();
  await page.selectOption('[data-testid="appointment-patient-select"]', patientValue!);

  await page.selectOption('[data-testid="appointment-clinic-select"]', bookingData.clinicBranch);
  await page.fill('[data-testid="appointment-date-input"]', bookingData.appointmentDate);
  await page.selectOption('[data-testid="appointment-time-select"]', bookingData.appointmentTime);

  page.once('popup', async (popup) => {
    await popup.close();
  });

  const [dialog] = await Promise.all([
    page.waitForEvent('dialog'),
    page.click('[data-testid="appointment-submit-btn"]'),
  ]);

  await expect(dialog.message()).toContain('Appointment Secured');
  await dialog.accept();
}

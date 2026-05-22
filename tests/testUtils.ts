import { expect, Locator, Page } from '@playwright/test';

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
    Patients: '[data-testid="bottom-nav-patients-button"]',
    Appointments: '[data-testid="bottom-nav-appointments-button"]',
    Today: '[data-testid="bottom-nav-today-button"]',
  };

  const selector = selectorMap[section];
  const button = page.locator(selector).first();
  await expect(button).toBeVisible({ timeout: 10000 });
  await button.waitFor({ state: 'visible', timeout: 10000 });
  await button.click();
}

export async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth - window.innerWidth;
  });
  expect(overflow).toBeLessThanOrEqual(0);
}

export async function assertMinTapTarget(locator: Locator, minSize = 44) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  if (box) {
    expect(box.width).toBeGreaterThanOrEqual(minSize);
    expect(box.height).toBeGreaterThanOrEqual(minSize);
  }
}

export async function assertVisibleInViewport(page: Page, selector: string) {
  const visible = await page.evaluate((sel) => {
    const element = document.querySelector(sel);
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    return rect.top >= 0 && rect.left >= 0 && rect.right <= window.innerWidth + 1 && rect.bottom <= window.innerHeight + 1;
  }, selector);
  expect(visible).toBeTruthy();
}

export async function assertAppVhDefined(page: Page) {
  await page.waitForFunction(() => {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--app-vh');
    return Boolean(v && v.trim().length > 0);
  }, undefined, { timeout: 10000 });
  const appVh = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--app-vh'));
  expect(appVh.trim()).not.toBe('');
}

export async function assertNoOverflowContainers(page: Page) {
  const violations = await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll('*')) as HTMLElement[];
    return candidates.filter((elem) => {
      const style = getComputedStyle(elem);
      const overflowX = style.overflowX;
      // For mobile stability we care primarily about horizontal overflow.
      if (!['hidden', 'auto', 'scroll'].includes(overflowX)) return false;
      if (elem.clientWidth === 0 || elem.clientHeight === 0) return false;
      const hasOverflowX = overflowX !== 'visible' && elem.scrollWidth > elem.clientWidth + 1;
      return hasOverflowX;
    }).map((elem) => {
      const tag = elem.tagName.toLowerCase();
      const id = elem.id ? `#${elem.id}` : '';
      const classes = elem.className ? `.${String(elem.className).trim().replace(/\s+/g, '.')}` : '';
      const overflowX = getComputedStyle(elem).overflowX;
      return `${tag}${id}${classes} overflowX=${overflowX} clientWidth=${elem.clientWidth} scrollWidth=${elem.scrollWidth}`;
    });
  });
  expect(violations).toEqual([]);
}

export async function assertNoFixedStickyOverlap(page: Page) {
  const overlaps = await page.evaluate(() => {
    const fixedSticky = Array.from(document.querySelectorAll('*')).filter((el) => {
      const pos = getComputedStyle(el).position;
      return pos === 'fixed' || pos === 'sticky';
    }) as HTMLElement[];
    const interactives = Array.from(document.querySelectorAll('button, a, input, select, textarea, [role="button"]')) as HTMLElement[];
    const conflicts: string[] = [];
    for (const fixed of fixedSticky) {
      const fixedRect = fixed.getBoundingClientRect();
      if (fixedRect.width === 0 || fixedRect.height === 0) continue;
      for (const interactive of interactives) {
        if (fixed.contains(interactive) || interactive.contains(fixed)) continue;
        const rect = interactive.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        // Only consider interactives that are actually in (or near) the viewport.
        if (rect.bottom < -1 || rect.top > window.innerHeight + 1) continue;
        if (rect.right < -1 || rect.left > window.innerWidth + 1) continue;
        const intersects = !(rect.right <= fixedRect.left || rect.left >= fixedRect.right || rect.bottom <= fixedRect.top || rect.top >= fixedRect.bottom);
        if (intersects) {
          const tag = interactive.tagName.toLowerCase();
          const id = interactive.id ? `#${interactive.id}` : '';
          const dataset = (interactive as HTMLElement).dataset ? JSON.stringify((interactive as HTMLElement).dataset) : '';
          const label =
            (interactive as HTMLElement).getAttribute?.('aria-label') ||
            (interactive as HTMLElement).textContent?.trim().slice(0, 40) ||
            '';
          conflicts.push(`${tag}${id} ${dataset} "${label}" overlaps ${fixed.tagName.toLowerCase()} ${fixed.className}`);
        }
      }
    }
    return conflicts;
  });
  expect(overlaps).toEqual([]);
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
  await expect(page.locator('[data-testid="patient-row"]', { hasText: patientData.name })).toBeVisible({ timeout: 10000 });
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
    try {
      await popup.close();
    } catch {
      // Some Windows environments can throw spawn EPERM on close; ignore so tests can proceed.
    }
  });

  const [dialog] = await Promise.all([
    page.waitForEvent('dialog'),
    page.click('[data-testid="appointment-submit-btn"]'),
  ]);

  await expect(dialog.message()).toContain('Appointment Secured');
  await dialog.accept();
}

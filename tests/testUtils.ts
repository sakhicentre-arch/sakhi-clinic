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

// BottomNav (mobile, <=768px) only renders on narrow viewports; LeftNav
// (desktop) is the equivalent on wide ones. This helper is used by specs
// that run on both the desktop "chromium" project and the mobile-viewport
// projects, so it has to find the right nav for whichever is present
// rather than assuming BottomNav always exists.
export async function navigateTo(page: Page, section: 'Patients' | 'Appointments' | 'Today') {
  const bottomNavSelector: Record<string, string> = {
    Patients: '[data-testid="bottom-nav-patients-button"]',
    Appointments: '[data-testid="bottom-nav-appointments-button"]',
    Today: '[data-testid="bottom-nav-today-button"]',
  };

  const bottomNavButton = page.locator(bottomNavSelector[section]).first();
  const leftNavButton = page.getByRole('button', { name: section, exact: true }).first();

  const button = (await bottomNavButton.count()) > 0 ? bottomNavButton : leftNavButton;
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

type Rect = { top: number; bottom: number; left: number; right: number; width: number; height: number };

async function getRect(page: Page, selector: string): Promise<Rect | null> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!r || r.width === 0 || r.height === 0) return null;
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
  }, selector);
}

export async function assertVisibleBelowStickyHeader(page: Page, targetSelector: string, stickySelectors: string[]) {
  const target = await getRect(page, targetSelector);
  expect(target).not.toBeNull();
  if (!target) return;

  const blockers = await Promise.all(stickySelectors.map((s) => getRect(page, s)));
  const bottom = blockers
    .filter((r): r is Rect => Boolean(r))
    .reduce((max, r) => Math.max(max, r.bottom), 0);

  // Allow a tiny tolerance for subpixel rounding.
  expect(target.top).toBeGreaterThanOrEqual(bottom - 1);
}

export async function assertLastActionNotCoveredByActionBar(page: Page, sectionSelector: string, actionBarSelector: string) {
  const actionBar = await getRect(page, actionBarSelector);
  expect(actionBar).not.toBeNull();
  if (!actionBar) return;

  const section = page.locator(sectionSelector).first();
  await expect(section).toBeVisible({ timeout: 10000 });

  // Choose the last likely interactive control in the section.
  const focusables = section.locator('button, input, select, textarea, [role="button"]');
  const count = await focusables.count();
  if (count === 0) return;

  // Some components render hidden focusables (e.g., offscreen helpers).
  // Find the last *visible* interactive control to assert true reachability.
  let lastRect: { x: number; y: number; width: number; height: number } | null = null;
  for (let i = count - 1; i >= 0; i--) {
    const candidate = focusables.nth(i);
    try {
      await candidate.scrollIntoViewIfNeeded();
    } catch {
      // ignore and keep searching
    }
    // boundingBox returns null if not visible.
    lastRect = await candidate.boundingBox();
    if (lastRect) break;
  }
  expect(lastRect).not.toBeNull();
  if (!lastRect) return;

  // Ensure bottom of the last control sits above the action bar top.
  expect(lastRect.y + lastRect.height).toBeLessThanOrEqual(actionBar.top + 1);
}

export async function assertAboveBottomNav(page: Page, targetSelector: string, bottomNavSelector = '[data-testid="bottom-nav"]') {
  const target = await getRect(page, targetSelector);
  expect(target).not.toBeNull();
  if (!target) return;

  const bottomNav = await getRect(page, bottomNavSelector);
  if (!bottomNav) return;

  // Device scale + subpixel rounding can cause small deltas; allow a tiny tolerance.
  expect(target.bottom).toBeLessThanOrEqual(bottomNav.top + 4);
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

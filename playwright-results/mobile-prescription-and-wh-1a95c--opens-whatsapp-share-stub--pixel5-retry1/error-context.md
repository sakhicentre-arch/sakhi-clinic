# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: mobile\prescription-and-whatsapp.spec.ts >> Mobile prescription and WhatsApp workflow >> adds prescription and opens whatsapp share (stub)
- Location: tests\mobile\prescription-and-whatsapp.spec.ts:6:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('button:has-text("WhatsApp")').first()
Expected: visible
Timeout: 8000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 8000ms
  - waiting for locator('button:has-text("WhatsApp")').first()

```

```yaml
- text: ⚕️ Sakhi
- button "Dabholi"
- textbox "Search patients... (press \"/\" to focus)"
- text: 10:44:35 AM
- button "Dashboard"
- button "Today": 1 NEW
- button "Patients"
- button "Appointments"
- button "Consultation"
- button "Revenue"
- button "Settings"
- main:
  - heading "Today's Queue" [level=2]
  - text: Dabholi · Thu, 21 May 1 waiting
  - button "Add Patient to Queue"
  - text: 1 R RxMobile 1779340464122 Waiting
  - button
  - button
  - button
  - button "Start Consultation"
  - text: R
  - heading "RxMobile 1779340464122" [level=2]
  - text: 🔵 First Visit 34Y ·Female ·9384271338
  - button "Start Consultation"
  - text: Last Visit ✨ No previous visits — this is a new patient Visits 0 Total Paid ₹0 Pending ₹0 Today's Snapshot In Queue 1 Waiting 1 Done 0 Revenue ₹0 today · paid only Dabholi · Today 0 No appointments for today
- navigation:
  - button "Today"
  - button "Patients"
  - button "Consult"
  - button "Appointments": Appt
  - button "More"
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import { generatePatientData, registerPatient, bookAppointment, navigateTo } from '../testUtils';
  3  | 
  4  | test.describe('Mobile prescription and WhatsApp workflow', () => {
  5  |   test.setTimeout(60000);
  6  |   test('adds prescription and opens whatsapp share (stub)', async ({ page }) => {
  7  |     const patient = generatePatientData('RxMobile');
  8  |     await page.goto('/');
  9  | 
  10 |     await navigateTo(page, 'Patients');
  11 |     await registerPatient(page, patient);
  12 | 
  13 |     const date = await page.evaluate(() => {
  14 |       const d = new Date(); d.setDate(d.getDate() + 1); return d.toLocaleDateString('en-CA');
  15 |     });
  16 |     await bookAppointment(page, {
  17 |       patientName: patient.name,
  18 |       clinicBranch: 'Dabholi',
  19 |       appointmentDate: date,
  20 |       appointmentTime: '11:20',
  21 |     });
  22 | 
  23 |     await navigateTo(page, 'Today');
  24 |     // Ensure patient appears in queue and start consultation using robust selectors
  25 |     let patientQueueRows = page.locator('[data-testid^="queue-row-"]').filter({ hasText: patient.name });
  26 |     if ((await patientQueueRows.count()) === 0) {
  27 |       await page.click('[data-testid="add-patient-to-queue-btn"]');
  28 |       await expect(page.locator('[data-testid="queue-search-input"]')).toBeVisible();
  29 |       await page.fill('[data-testid="queue-search-input"]', patient.name);
  30 |       await page.locator('button').filter({ hasText: new RegExp(patient.name, 'i') }).first().click();
  31 |       await expect(page.locator('[data-testid^="queue-row-"]').filter({ hasText: patient.name })).toHaveCount(1);
  32 |       patientQueueRows = page.locator('[data-testid^="queue-row-"]').filter({ hasText: patient.name });
  33 |     }
  34 | 
  35 |     const queueRow = patientQueueRows.first();
  36 |     await queueRow.click();
  37 |     const queueId = await queueRow.getAttribute('data-testid');
  38 |     const expectedActiveSelector = queueId!.replace(/^queue-row-/, 'queue-row-active-');
  39 |     const activeRow = page.locator(`[data-testid="${expectedActiveSelector}"]`).first();
  40 |     await activeRow.waitFor({ state: 'visible', timeout: 2000 }).catch(() => {});
  41 |     const startBtn = activeRow.locator('[data-testid^="queue-start-consultation-"]');
  42 |     if ((await startBtn.count()) > 0) await startBtn.click();
  43 | 
  44 |     // attempt to find a visible WhatsApp share button (consultation UI may expose different labels)
  45 |     await page.evaluate(() => { (window as any)._opened = null; window.open = (u: any) => { (window as any)._opened = u; return null; }; });
  46 |     const waBtn = page.locator('button:has-text("WhatsApp")').first();
> 47 |     await expect(waBtn).toBeVisible({ timeout: 8000 });
     |                         ^ Error: expect(locator).toBeVisible() failed
  48 |     await waBtn.click().catch(async () => { await waBtn.click({ force: true }); });
  49 |     const opened = await page.evaluate(() => (window as any)._opened);
  50 |     expect(opened).toBeTruthy();
  51 |     expect(String(opened)).toContain('wa.me');
  52 |   });
  53 | });
  54 | 
```
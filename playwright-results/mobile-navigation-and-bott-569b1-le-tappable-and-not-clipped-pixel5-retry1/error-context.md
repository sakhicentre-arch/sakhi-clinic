# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: mobile\navigation-and-bottomnav.spec.ts >> Mobile navigation and bottom-nav usability >> bottom nav buttons are visible, tappable and not clipped
- Location: tests\mobile\navigation-and-bottomnav.spec.ts:5:7

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: locator.click: Target page, context or browser has been closed
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e6]: ⚕️
      - text: Sakhi
    - button "Dabholi" [ref=e9] [cursor=pointer]:
      - text: Dabholi
      - img [ref=e11]
    - generic [ref=e14]:
      - img [ref=e15]
      - textbox "Search patients... (press \"/\" to focus)" [ref=e18]
    - generic [ref=e19]:
      - img [ref=e20]
      - text: 10:46:05 AM
  - generic [ref=e24]:
    - generic [ref=e25]:
      - button "Dashboard" [ref=e27] [cursor=pointer]:
        - img [ref=e28]
      - button "Today" [ref=e34] [cursor=pointer]:
        - img [ref=e35]
        - generic [ref=e37]: NEW
      - button "Patients" [ref=e39] [cursor=pointer]:
        - img [ref=e40]
      - button "Appointments" [active] [ref=e46] [cursor=pointer]:
        - img [ref=e47]
      - button "Consultation" [ref=e52] [cursor=pointer]:
        - img [ref=e53]
      - button "Revenue" [ref=e58] [cursor=pointer]:
        - img [ref=e59]
    - button "Settings" [ref=e62] [cursor=pointer]:
      - img [ref=e63]
  - main [ref=e66]:
    - generic [ref=e67]:
      - generic [ref=e68]:
        - generic [ref=e69]:
          - generic [ref=e70]:
            - img [ref=e72]
            - heading "Scheduling Hub" [level=2] [ref=e74]
          - generic [ref=e75]:
            - textbox "Find in Registry..." [ref=e76]
            - img [ref=e77]
          - generic [ref=e80]: Patient Database Link
          - combobox [ref=e81]:
            - option "Select from Registry" [selected]
          - generic [ref=e82]: Clinic Branch Selection
          - combobox [ref=e83]:
            - option "🏥 Dabholi (11:00 - 14:00)" [selected]
            - option "🏥 City Light (14:30 - 18:30)"
          - generic [ref=e84]:
            - generic [ref=e85]:
              - generic [ref=e86]: Date
              - textbox [ref=e87]: 2026-05-21
            - generic [ref=e88]:
              - generic [ref=e89]: Time Slot
              - combobox [ref=e90]:
                - option "Select Time" [selected]
                - option "11:00 ✔ Available"
                - option "11:10 ✔ Available"
                - option "11:20 ✔ Available"
                - option "11:30 ✔ Available"
                - option "11:40 ✔ Available"
                - option "11:50 ✔ Available"
                - option "12:00 ✔ Available"
                - option "12:10 ✔ Available"
                - option "12:20 ✔ Available"
                - option "12:30 ✔ Available"
                - option "12:40 ✔ Available"
                - option "12:50 ✔ Available"
                - option "13:00 ✔ Available"
                - option "13:10 ✔ Available"
                - option "13:20 ✔ Available"
                - option "13:30 ✔ Available"
                - option "13:40 ✔ Available"
                - option "13:50 ✔ Available"
          - button "Secure Appointment Slot" [ref=e91] [cursor=pointer]
          - button "+ Emergency Walk-In Bypass" [ref=e92] [cursor=pointer]
        - generic [ref=e93]:
          - generic [ref=e94]:
            - img [ref=e95]
            - heading "Clinic Command" [level=3] [ref=e100]
          - button "Blast Sequential Reminders" [ref=e101] [cursor=pointer]:
            - img [ref=e102]
            - text: Blast Sequential Reminders
          - generic [ref=e105]:
            - paragraph [ref=e106]: Registry Forecast
            - generic [ref=e107]:
              - generic [ref=e108]:
                - generic [ref=e109]: Dabholi AM
                - generic [ref=e110]: 0 SESSIONS
              - generic [ref=e111]:
                - generic [ref=e112]: City Light PM
                - generic [ref=e113]: 0 SESSIONS
      - generic [ref=e114]:
        - generic [ref=e115]:
          - generic [ref=e116]:
            - 'heading "Roster: Thursday, May 21" [level=2] [ref=e117]'
            - generic [ref=e118]:
              - img [ref=e119]
              - paragraph [ref=e123]: Live Multi-Branch Roster — Sakhi Clinic Network
          - generic [ref=e125]:
            - paragraph [ref=e126]: Total Active Cases
            - paragraph [ref=e127]: "0"
        - generic [ref=e128]:
          - generic [ref=e129]:
            - generic [ref=e130]:
              - img [ref=e132]
              - heading "Dabholi Branch" [level=3] [ref=e136]
              - generic [ref=e137]: MORNING SESSIONS
            - generic [ref=e138]:
              - generic [ref=e140]:
                - generic [ref=e141]:
                  - generic [ref=e142]: 11:00
                  - text: SLOT
                - generic [ref=e143]: Open Appointment Slot
              - generic [ref=e145]:
                - generic [ref=e146]:
                  - generic [ref=e147]: 11:10
                  - text: SLOT
                - generic [ref=e148]: Open Appointment Slot
              - generic [ref=e150]:
                - generic [ref=e151]:
                  - generic [ref=e152]: 11:20
                  - text: SLOT
                - generic [ref=e153]: Open Appointment Slot
              - generic [ref=e155]:
                - generic [ref=e156]:
                  - generic [ref=e157]: 11:30
                  - text: SLOT
                - generic [ref=e158]: Open Appointment Slot
              - generic [ref=e160]:
                - generic [ref=e161]:
                  - generic [ref=e162]: 11:40
                  - text: SLOT
                - generic [ref=e163]: Open Appointment Slot
              - generic [ref=e165]:
                - generic [ref=e166]:
                  - generic [ref=e167]: 11:50
                  - text: SLOT
                - generic [ref=e168]: Open Appointment Slot
              - generic [ref=e170]:
                - generic [ref=e171]:
                  - generic [ref=e172]: 12:00
                  - text: SLOT
                - generic [ref=e173]: Open Appointment Slot
              - generic [ref=e175]:
                - generic [ref=e176]:
                  - generic [ref=e177]: 12:10
                  - text: SLOT
                - generic [ref=e178]: Open Appointment Slot
              - generic [ref=e180]:
                - generic [ref=e181]:
                  - generic [ref=e182]: 12:20
                  - text: SLOT
                - generic [ref=e183]: Open Appointment Slot
              - generic [ref=e185]:
                - generic [ref=e186]:
                  - generic [ref=e187]: 12:30
                  - text: SLOT
                - generic [ref=e188]: Open Appointment Slot
              - generic [ref=e190]:
                - generic [ref=e191]:
                  - generic [ref=e192]: 12:40
                  - text: SLOT
                - generic [ref=e193]: Open Appointment Slot
              - generic [ref=e195]:
                - generic [ref=e196]:
                  - generic [ref=e197]: 12:50
                  - text: SLOT
                - generic [ref=e198]: Open Appointment Slot
              - generic [ref=e200]:
                - generic [ref=e201]:
                  - generic [ref=e202]: 13:00
                  - text: SLOT
                - generic [ref=e203]: Open Appointment Slot
              - generic [ref=e205]:
                - generic [ref=e206]:
                  - generic [ref=e207]: 13:10
                  - text: SLOT
                - generic [ref=e208]: Open Appointment Slot
              - generic [ref=e210]:
                - generic [ref=e211]:
                  - generic [ref=e212]: 13:20
                  - text: SLOT
                - generic [ref=e213]: Open Appointment Slot
              - generic [ref=e215]:
                - generic [ref=e216]:
                  - generic [ref=e217]: 13:30
                  - text: SLOT
                - generic [ref=e218]: Open Appointment Slot
              - generic [ref=e220]:
                - generic [ref=e221]:
                  - generic [ref=e222]: 13:40
                  - text: SLOT
                - generic [ref=e223]: Open Appointment Slot
              - generic [ref=e225]:
                - generic [ref=e226]:
                  - generic [ref=e227]: 13:50
                  - text: SLOT
                - generic [ref=e228]: Open Appointment Slot
          - generic [ref=e229]:
            - generic [ref=e230]:
              - img [ref=e232]
              - heading "City Light" [level=3] [ref=e236]
              - generic [ref=e237]: EVENING SESSIONS
            - generic [ref=e238]:
              - generic [ref=e240]:
                - generic [ref=e241]:
                  - generic [ref=e242]: 14:30
                  - text: SLOT
                - generic [ref=e243]: Open Appointment Slot
              - generic [ref=e245]:
                - generic [ref=e246]:
                  - generic [ref=e247]: 14:40
                  - text: SLOT
                - generic [ref=e248]: Open Appointment Slot
              - generic [ref=e250]:
                - generic [ref=e251]:
                  - generic [ref=e252]: 14:50
                  - text: SLOT
                - generic [ref=e253]: Open Appointment Slot
              - generic [ref=e255]:
                - generic [ref=e256]:
                  - generic [ref=e257]: 15:00
                  - text: SLOT
                - generic [ref=e258]: Open Appointment Slot
              - generic [ref=e260]:
                - generic [ref=e261]:
                  - generic [ref=e262]: 15:10
                  - text: SLOT
                - generic [ref=e263]: Open Appointment Slot
              - generic [ref=e265]:
                - generic [ref=e266]:
                  - generic [ref=e267]: 15:20
                  - text: SLOT
                - generic [ref=e268]: Open Appointment Slot
              - generic [ref=e270]:
                - generic [ref=e271]:
                  - generic [ref=e272]: 15:30
                  - text: SLOT
                - generic [ref=e273]: Open Appointment Slot
              - generic [ref=e275]:
                - generic [ref=e276]:
                  - generic [ref=e277]: 15:40
                  - text: SLOT
                - generic [ref=e278]: Open Appointment Slot
              - generic [ref=e280]:
                - generic [ref=e281]:
                  - generic [ref=e282]: 15:50
                  - text: SLOT
                - generic [ref=e283]: Open Appointment Slot
              - generic [ref=e285]:
                - generic [ref=e286]:
                  - generic [ref=e287]: 16:00
                  - text: SLOT
                - generic [ref=e288]: Open Appointment Slot
              - generic [ref=e290]:
                - generic [ref=e291]:
                  - generic [ref=e292]: 16:10
                  - text: SLOT
                - generic [ref=e293]: Open Appointment Slot
              - generic [ref=e295]:
                - generic [ref=e296]:
                  - generic [ref=e297]: 16:20
                  - text: SLOT
                - generic [ref=e298]: Open Appointment Slot
              - generic [ref=e300]:
                - generic [ref=e301]:
                  - generic [ref=e302]: 16:30
                  - text: SLOT
                - generic [ref=e303]: Open Appointment Slot
              - generic [ref=e305]:
                - generic [ref=e306]:
                  - generic [ref=e307]: 16:40
                  - text: SLOT
                - generic [ref=e308]: Open Appointment Slot
              - generic [ref=e310]:
                - generic [ref=e311]:
                  - generic [ref=e312]: 16:50
                  - text: SLOT
                - generic [ref=e313]: Open Appointment Slot
              - generic [ref=e315]:
                - generic [ref=e316]:
                  - generic [ref=e317]: 17:00
                  - text: SLOT
                - generic [ref=e318]: Open Appointment Slot
              - generic [ref=e320]:
                - generic [ref=e321]:
                  - generic [ref=e322]: 17:10
                  - text: SLOT
                - generic [ref=e323]: Open Appointment Slot
              - generic [ref=e325]:
                - generic [ref=e326]:
                  - generic [ref=e327]: 17:20
                  - text: SLOT
                - generic [ref=e328]: Open Appointment Slot
              - generic [ref=e330]:
                - generic [ref=e331]:
                  - generic [ref=e332]: 17:30
                  - text: SLOT
                - generic [ref=e333]: Open Appointment Slot
              - generic [ref=e335]:
                - generic [ref=e336]:
                  - generic [ref=e337]: 17:40
                  - text: SLOT
                - generic [ref=e338]: Open Appointment Slot
              - generic [ref=e340]:
                - generic [ref=e341]:
                  - generic [ref=e342]: 17:50
                  - text: SLOT
                - generic [ref=e343]: Open Appointment Slot
              - generic [ref=e345]:
                - generic [ref=e346]:
                  - generic [ref=e347]: 18:00
                  - text: SLOT
                - generic [ref=e348]: Open Appointment Slot
              - generic [ref=e350]:
                - generic [ref=e351]:
                  - generic [ref=e352]: 18:10
                  - text: SLOT
                - generic [ref=e353]: Open Appointment Slot
              - generic [ref=e355]:
                - generic [ref=e356]:
                  - generic [ref=e357]: 18:20
                  - text: SLOT
                - generic [ref=e358]: Open Appointment Slot
  - navigation [ref=e359]:
    - button "Today" [ref=e360]
    - button "Patients" [ref=e361]
    - button "Consult" [ref=e362]
    - button "Appointments" [ref=e363]: Appt
    - button "More" [ref=e364]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('Mobile navigation and bottom-nav usability', () => {
  4  |   test.setTimeout(60000);
  5  |   test('bottom nav buttons are visible, tappable and not clipped', async ({ page }) => {
  6  |     await page.goto('/');
  7  |     const buttons = ['Today', 'Patients', 'Consult', 'Appointments', 'More'];
  8  |     for (const label of buttons) {
  9  |       const btn = page.locator(`button[aria-label="${label}"]`).first();
  10 |       await expect(btn).toBeVisible();
  11 |       const box = await btn.boundingBox();
  12 |       expect(box).not.toBeNull();
  13 |       if (box) {
  14 |         const vw = await page.evaluate(() => window.innerWidth);
  15 |         const vh = await page.evaluate(() => window.innerHeight);
  16 |         expect(box.x + box.width).toBeLessThanOrEqual(vw + 2);
  17 |         expect(box.y + box.height).toBeLessThanOrEqual(vh + 2);
  18 |       }
  19 |       // Ensure tappable: scroll into view then click with fallback
  20 |       await btn.scrollIntoViewIfNeeded();
> 21 |       await btn.click().catch(async () => { await btn.click({ force: true }); });
     |                                                       ^ Error: locator.click: Target page, context or browser has been closed
  22 |       await page.waitForTimeout(250);
  23 |     }
  24 |   });
  25 | });
  26 | 
```
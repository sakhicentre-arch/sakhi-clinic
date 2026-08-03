# Sakhi Clinic — RC1 Doctor UAT Package

This is for the doctor to run herself, on her own device, in a supervised session — not for an engineer to run pretending to be the doctor. Everything below was verified by automated tests first (`RC1_CERTIFICATION_REPORT.md` and `RC1_RELEASE_NOTES.md`), but automated tests cannot confirm the app actually *feels* right in a real doctor's hands on a real phone. That's what this is for.

This package covers every major area shipped in RC1: patient/queue workflow, consultation modes, payments, follow-ups, reminders, the dashboard, and backup/restore.

**Before you start:** make a backup export (Settings → Download Backup) so today's testing can never put real patient data at risk.

---

## How to report what you find

For each item below, note **Pass**, **Fail**, or **Unsure**. If something fails or feels wrong even if it "technically works," write down exactly what you tapped and what happened — screenshots help a lot if you can take one. Don't try to fix or work around anything yourself; just note it and keep going to the next item.

---

## 1. Registering a walk-in patient (mobile)

- [ ] Open the app on your phone, in your normal browser.
- [ ] Go to **Patients**. Register a new test patient (use an obviously fake name like "UAT Test 1" so it's easy to delete afterward).
- [ ] Confirm the patient appears in the list and the form clears/resets.
- [ ] **Specific thing to check:** the "Register Patient" button — is it always reachable, or does it ever feel hidden or cut off at the bottom of the screen? (This was investigated in detail during RC1 certification and confirmed not to be a defect, but it's exactly the kind of thing that's worth a real human's opinion, not just a pixel measurement.)

## 2. Adding a walk-in to today's queue (mobile)

- [ ] Go to **Today**. Tap the **+** (floating add button, bottom-right).
- [ ] Search for and add your test patient to the queue.
- [ ] Confirm the patient shows up in the "Queue" chip strip and in "Now Serving" (or update to "Now Serving" if the queue was empty before).
- [ ] Tap **Start Consultation** from "Now Serving."

## 3. First-visit consultation — Classic Mode (mobile)

- [ ] Confirm the consultation opens in **Classic Mode** by default for this brand-new patient (look for "📋 Classic Mode" highlighted at the top). This is intentional — the app defaults every first-visit patient to full documentation mode rather than the faster Quick Mode, on purpose, for thoroughness. Confirm this feels right to you as a clinical workflow, not just that it "works."
- [ ] Fill in a chief complaint and try switching to **⚡ Quick Mode** and back. Confirm nothing you typed is lost when switching modes.
- [ ] In Quick Mode, try tapping through the stage tabs (Complaint / Examination / Remedy / Follow-up). Confirm each section is fully visible and nothing is covered by the header or the bottom action bar.
- [ ] Add at least one medicine (name, potency, dosage, duration).
- [ ] If an AI remedy suggestion appears, confirm it requires your explicit approval before it's treated as accepted — it should never be applied silently.
- [ ] Tap the **📲 WhatsApp Rx** button (present in both Classic and Quick mode). Confirm it attempts to open WhatsApp with a prescription message (you don't need to actually send it).
- [ ] Record a payment for this consultation (full, partial, or waived — try one). Confirm it saves and reflects correctly.
- [ ] Save the consultation. Confirm a clear success indication.

## 4. Follow-up consultation — Quick Mode default (mobile)

- [ ] Start a second consultation for the *same* test patient (now that they have a visit on record).
- [ ] Confirm this one defaults to **Quick Mode** automatically (the opposite of the first visit — this is the intended behavior, not a bug).
- [ ] Confirm the previous visit's remedy/chief complaint is referenced or suggested somewhere, if that's the workflow you expect.

## 5. Duplicate booking protection

- [ ] Book an appointment for a patient at a specific clinic/date/time.
- [ ] Try to book a *different* patient at the exact same clinic/date/time.
- [ ] Confirm you get a clear "already booked" message, not a silent failure or a second booking that shouldn't exist.

## 6. Payment tracking and the Patient Ledger

- [ ] Open your test patient's Patient Ledger. Confirm the payment you recorded in section 3 shows up correctly.
- [ ] If you recorded a partial or waived payment, specifically confirm the ledger totals it correctly (this was a real bug fixed before RC1 — worth double-checking, not just assuming it's fine now).
- [ ] Go to the **Payment Dashboard** from the home dashboard. Confirm it shows the outstanding/collected figures you'd expect given what you just recorded.

## 7. Follow-up management

- [ ] Go to the **Follow-up** page. Confirm any follow-up you'd expect (from consultations with a follow-up date set) appears as due/upcoming.
- [ ] Mark a follow-up as **Completed**. Confirm the status updates clearly.
- [ ] Create another and mark it **Cancelled** using the quick action. Confirm you're taken to that patient's tab afterward, not left looking at an empty list.

## 8. Reminders

- [ ] Go to the **Reminders** page. Confirm pending reminders (e.g., for the follow-up you set above) appear.
- [ ] Open your test patient's profile/ledger and confirm their reminder history is visible there too, not only in the separate Reminders list.

## 9. Dashboard

- [ ] Open the home Dashboard. Confirm **Pending Reminders** and **Pending Payments** cards show numbers that match what you'd expect from the test data you've created today.
- [ ] Tap one of the action cards. Confirm it takes you directly to the correctly filtered list behind it (a deep link), not just to the general page.

## 10. Backup and recovery — the one thing that matters most if something goes wrong

- [ ] Go to **Settings** and make a real backup export using **Download Backup**. Confirm you can find the downloaded file afterward.
- [ ] If practical, try previewing/restoring from that backup file (the app validates and previews before actually restoring anything — nothing should be overwritten until you explicitly confirm).
- [ ] Read (or re-read) `DOCTOR_OPERATIONAL_GUIDE.md` — specifically the "What happens if you reinstall or replace something" table. Confirm you understand: **there is no automatic off-device backup unless Google Drive has been specifically set up for your deployment**, and if it hasn't, you are the entire backup system.
- [ ] If Google Drive backup **has** been set up for your deployment: go to Settings → Cloud Backup, confirm it shows as connected, and confirm a backup actually appears in your Drive after making a change.
- [ ] If Google Drive backup has **not** been set up: confirm Settings honestly says "not yet configured for this deployment" rather than pretending to work.
- [ ] Confirm the **Backup Health Dashboard** in Settings shows a plain-language status you can actually understand (not raw technical jargon).

## 11. Things that are known limitations right now (not bugs — don't report these, but do confirm you understand them)

- No automatic disaster recovery exists. A lost, reset, or damaged device with no recent manual backup means that data is genuinely gone.
- Settings → Cloud Backup is desktop-only by design in the current *automated test* coverage (the feature itself still works on mobile browsers — only its automated regression testing currently runs on desktop, so treat it with a bit more manual scrutiny than areas with full mobile test coverage).
- True offline mode (using the app with no internet at all) has not been verified against a real production install with the service worker active in this certification pass — treat offline behavior as unconfirmed until told otherwise.

---

## Sign-off

- [ ] Doctor confirms: all sections above completed, in her own words that she understands what she just tested (not just "yes it all passed").
- [ ] Doctor confirms: she has made a real backup, on her real device, using the real workflow, and knows exactly where the file is.
- [ ] Any Fail or Unsure items above have been written down with enough detail (what was tapped, what happened) that someone else could reproduce them without asking follow-up questions.

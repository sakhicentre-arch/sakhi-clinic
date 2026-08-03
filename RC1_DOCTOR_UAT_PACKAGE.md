# Sakhi Clinic — RC1 Doctor UAT Package

This is for the doctor to run herself, on her own device, in a supervised session — not for an engineer to run pretending to be the doctor. Everything below was verified by automated tests first (`RC1_CERTIFICATION_REPORT.md` and `RC1_RELEASE_NOTES.md`), but automated tests cannot confirm the app actually *feels* right in a real doctor's hands on a real phone. That's what this is for.

This package covers every major area shipped in RC1 (sections 1–10) plus the full Doctor Workflow Completion phase that followed it (sections 11–19): patient/queue workflow, consultation modes, payments, follow-ups, reminders, the dashboard, backup/restore, pinned/quick-access patients, quick notes, favorite medicines, the command palette, payment receipts, and bulk WhatsApp messaging.

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

## 11. Payment Ledger — reference, notes, and proof screenshot

- [ ] Open a consultation where you recorded a payment with a reference number, notes, and (if you have a sample image handy) a screenshot as proof.
- [ ] Open that patient's Patient Ledger → Finance tab. Confirm the reference number and notes appear as their own columns, not just the amount/status.
- [ ] Tap **View** on the Proof column for that payment. Confirm the screenshot opens in a clear, readable viewer (not a tiny thumbnail) and that you can close it and get back to the ledger without losing your place.

## 12. Follow-up per-row actions and intelligent alert tabs

- [ ] On the **Follow-up** page, confirm each patient row has Call, WhatsApp, Send Reminder, Reschedule, and Complete actions available directly on the row (not just Cancel, which was the only action before).
- [ ] Try **Reschedule** on a follow-up. Confirm it lets you pick a new date and the follow-up list updates to reflect it.
- [ ] Look for the three additional tabs beyond the basic due/overdue/upcoming buckets — **Needing Review**, **Multiple Missed Visits**, and **Never Returned** (exact wording may vary slightly). Confirm these surface patients you'd actually recognize as needing that kind of attention, not an empty or nonsensical list.

## 13. Reminder Productivity — preview, edit, and bulk actions

- [ ] On the **Reminders** page, open a pending reminder and confirm you can see its full message text before approving it.
- [ ] Tap **Edit** on a pending reminder, change the wording, and **Save**. Confirm the edited text is what actually gets sent later, and confirm you cannot save an empty/blank message (the Save button should stay disabled if you clear the text).
- [ ] Select several pending reminders using the checkboxes and try **Approve N selected**. Then, on the Approved tab, select several and try **Send N selected**. Confirm WhatsApp opens for each one in turn rather than all at once (a brief pause between each is intentional, not a glitch).
- [ ] If you can arrange for one message to fail (or ask the engineer to simulate this), confirm a bulk action that partly fails tells you clearly how many succeeded and how many didn't — it should never just go quiet.

## 14. Dashboard — live refresh and new widgets

- [ ] Open the home Dashboard, leave it open, and make a change elsewhere (e.g., record a new payment or add a patient) in another tab or after switching away and back. Confirm the Dashboard's numbers update on their own within about a minute, or immediately when you switch back to the app — you should not have to manually refresh the page to see current numbers.
- [ ] Confirm you can see **Today's Appointments** and **In-Consultation** counts (under "Operations"), a **System Health** section showing backup status/last backup date/storage used in plain language (or an honest "not configured" message if Drive backup isn't set up for you), plus separate **Recent Activity** and **Recent Payments** sections — each its own card, not mixed together confusingly.
- [ ] Confirm the new **Quick Access** widget shows patients you've pinned (marked with a star) at the top, followed by whoever you've seen most recently. If you haven't pinned anyone yet, confirm it says so clearly rather than showing a blank box.

## 15. Reports

- [ ] Open **Reports** from the left navigation (this is a genuinely new page — it didn't exist as a reachable page before this phase). Confirm it loads without an error and the revenue/payment figures shown match what you'd expect from your real data, not an obviously made-up or flat number.
- [ ] Try the **Daily / Monthly** toggle. Confirm the numbers actually change between the two views.
- [ ] Confirm you can see follow-up and reminder analytics on the same page, not just payment figures.

## 16. Payment Workflow — history, search, and export

- [ ] On the **Revenue** page, find the **Payment History** section. Try changing the date range and confirm the list updates to only show payments in that window.
- [ ] Use the search box to find a specific patient's payment by name. Confirm it filters correctly and clears back to the full list when you clear the search.
- [ ] Tap **Export CSV**. Confirm a file downloads and that opening it (in Excel or similar) shows readable columns with the payments you expect.

## 17. Pinned patients, quick notes, and favorite medicines

- [ ] Open any patient's profile. Tap the **Pin** button near their name. Confirm the star fills in and that patient now appears at the top of the Patients list and in the Dashboard's Quick Access widget. Unpin them and confirm they drop back out.
- [ ] On that same patient's profile, find the **Quick Note** box (near the top, above their visit history). Type a private note like "prefers evening appointments" and tap **Save Note**. Leave the patient and come back later (or switch to a different patient and back) — confirm your note is still there. Confirm this note is clearly separate from the clinical case record, not mixed into it.
- [ ] While prescribing a remedy during a consultation, tap the star next to a remedy you use often to mark it a favorite. Start a new prescription (for the same or a different patient) and confirm that favorited remedy now appears near the top of the suggestions with a star marker.

## 18. Command palette quick actions

- [ ] Press **Ctrl+K** (or **Cmd+K** on Mac) anywhere in the app, or tap the search bar at the top. Confirm a search panel opens.
- [ ] With nothing typed, confirm you see quick shortcuts like **New Patient**, **Today's Queue**, **Follow-ups**, **Reminders**, **Revenue**, and **Reports** — tap one and confirm it takes you straight there.
- [ ] Type a pinned patient's name. Confirm they're marked as pinned (★) in the results and appear ahead of similarly-named unpinned patients.

## 19. WhatsApp Productivity — payment receipts and bulk messages

- [ ] On a patient's Finance tab, find a payment row with an amount actually received and tap **Send** in the Receipt column. Confirm this does **not** immediately open WhatsApp — it should take you to the **Reminders** page where the receipt message is waiting for your review/approval first.
- [ ] Review that queued receipt message. Confirm it correctly shows the fee, amount received, payment mode, and reference number for that specific payment.
- [ ] On the **Reminders** page, tap **New Bulk Message**. Select two or three patients, write a message (e.g., a holiday closure notice), and add it to the queue. Confirm each selected patient gets their own separate queued message with your exact text, and that none of them send automatically — you still have to approve and send each one, same as any other reminder.
- [ ] Confirm you cannot add a bulk message to the queue with a blank message — the "Add to Queue" button should stay disabled until you've typed something.

## 20. Things that are known limitations right now (not bugs — don't report these, but do confirm you understand them)

- No automatic disaster recovery exists. A lost, reset, or damaged device with no recent manual backup means that data is genuinely gone.
- Settings → Cloud Backup is desktop-only by design in the current *automated test* coverage (the feature itself still works on mobile browsers — only its automated regression testing currently runs on desktop, so treat it with a bit more manual scrutiny than areas with full mobile test coverage).
- True offline mode (using the app with no internet at all) has not been verified against a real production install with the service worker active in this certification pass — treat offline behavior as unconfirmed until told otherwise.
- **Birthday Greeting messages do not exist yet.** This was deliberately left out of this phase — adding it properly requires a date-of-birth field the patient record doesn't currently have, plus a decision about how to handle existing patients who don't have one on file. It's tracked for a future release (`VISION_RC2.md`), not forgotten.
- Quick Notes and Favorite Medicines are stored on this specific device/browser. They're included in your manual backup export and will come back if you restore that backup, but they do **not** sync live to a second device the way patient records do — if you use the app from more than one device/browser, don't expect a note or favorite added on one to appear on the other until you back up and restore.

---

## Sign-off

- [ ] Doctor confirms: all sections above completed, in her own words that she understands what she just tested (not just "yes it all passed").
- [ ] Doctor confirms: she has made a real backup, on her real device, using the real workflow, and knows exactly where the file is.
- [ ] Any Fail or Unsure items above have been written down with enough detail (what was tapped, what happened) that someone else could reproduce them without asking follow-up questions.

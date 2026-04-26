# ✅ SAKHI CLINIC - MANUAL QA CHECKLIST

**Complete this checklist while running `npm run dev` at http://localhost:5173**

---

## 📋 PRE-TEST SETUP

- [ ] App is running: `npm run dev`
- [ ] Open browser to: http://localhost:5173
- [ ] Open DevTools: F12
- [ ] Check Console tab for any errors

---

## 1️⃣ PATIENT MANAGEMENT

### 1.1 Add New Patient ✏️
- [ ] Click on dashboard/patient list
- [ ] Click "Add Patient" or "+" button
- [ ] **Enter Name:** "Test Patient 001"
- [ ] **Enter Phone:** "9876543210"
- [ ] **Select Gender:** "Male" or "Female"
- [ ] **Enter Age:** "35" (optional)
- [ ] **Enter Address:** "123 Test Street" (optional)
- [ ] Click "Save" button
- [ ] **Verify:** Patient appears in list
- [ ] **Verify:** No error message shown
- [ ] **Verify:** Form clears or closes

### 1.2 Edit Patient 🖊️
- [ ] Click on the patient you just created
- [ ] Click "Edit" button
- [ ] Change name to "Test Patient Updated"
- [ ] Change phone to "9123456789"
- [ ] Click "Save"
- [ ] **Verify:** Changes are reflected in list
- [ ] **Verify:** No error message shown

### 1.3 Delete Patient 🗑️
- [ ] Click on a patient
- [ ] Click "Delete" button
- [ ] Confirm deletion if asked
- [ ] **Verify:** Patient removed from list
- [ ] **Verify:** No error shown

### 1.4 Field Validation ✓
- [ ] Try to save patient **without name**
- [ ] **Verify:** Error message appears
- [ ] Try to save **without phone**
- [ ] **Verify:** Error message appears
- [ ] Try to save with **invalid phone** (less than 10 digits)
- [ ] **Verify:** Error message appears

### 1.5 Persist Across Reload 🔄
- [ ] Create a patient
- [ ] Reload page (F5)
- [ ] **Verify:** Patient still exists in list
- [ ] **Verify:** All patient details preserved

---

## 2️⃣ CONSULTATION PAGE

### 2.1 Open Consultation 📖
- [ ] Select "Test Patient 001"
- [ ] Click "New Consultation" button
- [ ] **Verify:** Consultation form loads
- [ ] **Verify:** Patient name is displayed
- [ ] **Verify:** Form fields are visible

### 2.2 First Visit Mode 🆕
- [ ] Open consultation for patient with **no history**
- [ ] **Verify:** Form shows "First Visit" mode
- [ ] **Verify:** All fields are empty
- [ ] **Verify:** No previous data is suggested

### 2.3 Follow-up Mode 🔄
- [ ] Save a consultation (see section 5)
- [ ] Open consultation for **same patient again**
- [ ] **Verify:** Form shows "Follow-up" mode
- [ ] **Verify:** Last remedies are suggested
- [ ] **Verify:** Previous outcome is referenced

### 2.4 Quick vs Full Mode 🎯
- [ ] Look for "Mode" toggle or button
- [ ] Switch to "Quick Mode"
- [ ] **Verify:** Less fields visible
- [ ] Switch to "Full Mode"
- [ ] **Verify:** More fields visible
- [ ] **Verify:** Previously entered data is preserved

---

## 3️⃣ PRESCRIPTION SYSTEM

### 3.1 Add Remedy Row ➕
- [ ] In consultation form, find medicine section
- [ ] Click "Add Medicine" button
- [ ] **Verify:** New empty medicine row appears
- [ ] **Verify:** All fields are empty/default

### 3.2 Remove Remedy Row ➖
- [ ] Click delete/trash icon on any medicine row
- [ ] **Verify:** Row is removed
- [ ] **Verify:** Other rows remain unchanged

### 3.3 Potency Dropdown 💊
- [ ] Click potency dropdown
- [ ] **Verify:** Options appear: 6C, 12C, 30C, 200C, 1M, 10M, 50M, CM
- [ ] Select "200C"
- [ ] **Verify:** Selection is saved
- [ ] Select different potency
- [ ] **Verify:** No errors on selection

### 3.4 Dosage Dropdown 🥣
- [ ] Click dosage dropdown
- [ ] **Verify:** Options appear: 1-0-1, 0-0-1, 1-0-0, 0-1-0, 1-1-1, SOS, Weekly
- [ ] Select "0-0-1"
- [ ] **Verify:** Selection is saved

### 3.5 Duration Dropdown ⏱️
- [ ] Click duration dropdown
- [ ] **Verify:** Options appear: 3 Days, 5 Days, 7 Days, 10 Days, 15 Days, 30 Days, As needed
- [ ] Select "7 Days"
- [ ] **Verify:** Selection is saved

### 3.6 Remedy Search 🔍
- [ ] Click remedy name input field
- [ ] Type "nux"
- [ ] **Verify:** Dropdown appears with suggestions
- [ ] **Verify:** "Nux Vomica" is in list
- [ ] Click "Nux Vomica"
- [ ] **Verify:** Selection is saved

### 3.7 Last Remedies Suggestion 💡
- [ ] For patient with consultation history
- [ ] Open new consultation for follow-up
- [ ] Look for remedy quick-select chips/buttons
- [ ] **Verify:** Last 3 remedies appear
- [ ] Click any remedy chip
- [ ] **Verify:** Remedy is selected

### 3.8 Multiple Medicines 💊💊💊
- [ ] Add 3 different medicines:
  - Medicine 1: "Nux Vomica", 30C, 1-0-1, 5 Days
  - Medicine 2: "Lycopodium", 200C, 0-0-1, 7 Days
  - Medicine 3: "Pulsatilla", 12C, 1-0-0, 3 Days
- [ ] **Verify:** All 3 rows visible
- [ ] **Verify:** Data is not mixed between rows
- [ ] Save consultation
- [ ] **Verify:** All medicines are saved

---

## 4️⃣ CLINICAL DATA

### 4.1 Chief Complaint 📝
- [ ] Enter chief complaint: "Persistent headaches"
- [ ] **Verify:** Text is saved
- [ ] Reload page
- [ ] **Verify:** Text persists

### 4.2 Case Text & Details 📖
- [ ] Fill "Mind" field: "Patient is anxious"
- [ ] Fill "Generals" field: "Fatigue and poor digestion"
- [ ] Fill "Sleep" field: "Disturbed"
- [ ] Fill "Appetite" field: "Reduced"
- [ ] **Verify:** All text is saved
- [ ] Try very long text (copy-paste multiple times)
- [ ] **Verify:** Long text is handled correctly
- [ ] Try special characters: @#$%^&*() <>
- [ ] **Verify:** Special characters are preserved

### 4.3 Outcome Selection 🎯
- [ ] Click outcome dropdown
- [ ] **Verify:** Options appear: Improved, Partial, No Change, Worse
- [ ] Select "Improved"
- [ ] **Verify:** Selection is saved
- [ ] Select "Partial"
- [ ] **Verify:** Selection changes

### 4.4 Hering's Law Toggle ✔️
- [ ] Find "Hering's Law" checkbox
- [ ] Click to toggle ON
- [ ] **Verify:** Checkbox is checked
- [ ] Save consultation
- [ ] **Verify:** Status is saved

### 4.5 Follow-up Date 📅
- [ ] Click follow-up date picker
- [ ] **Verify:** Calendar appears
- [ ] Select date 15 days from today
- [ ] **Verify:** Date is selected
- [ ] **Verify:** Correct date is saved

---

## 5️⃣ SAVE CONSULTATION

### 5.1 Save Button 💾
- [ ] Fill minimum required fields:
  - Chief complaint: "Test case"
  - Add 1 medicine: "Nux Vomica", 30C
- [ ] Click "Save" button
- [ ] **Verify:** No error message
- [ ] **Verify:** Success message shown (if any)
- [ ] **Verify:** Form closes or resets

### 5.2 Data in Database 🗄️
- [ ] Save a consultation
- [ ] Reload page (F5)
- [ ] Click same patient
- [ ] Open "Consultation History"
- [ ] **Verify:** Saved consultation appears
- [ ] Click to view saved consultation
- [ ] **Verify:** All data is intact
- [ ] **Verify:** No data corruption

### 5.3 Patient Linking 🔗
- [ ] Save consultation for patient
- [ ] View patient profile
- [ ] **Verify:** Consultation appears in history
- [ ] **Verify:** Date and remedy are shown
- [ ] **Verify:** Correct patient linked

### 5.4 Last Visit Update 📌
- [ ] Save a consultation
- [ ] View patient sidebar/profile
- [ ] **Verify:** "Last Visit" date is updated
- [ ] **Verify:** Last remedy is displayed
- [ ] **Verify:** Shows correct consultation

---

## 6️⃣ DRAFT AUTO-SAVE

### 6.1 Draft Persistence 🔄
- [ ] Open new consultation
- [ ] Enter chief complaint: "Test draft"
- [ ] Add medicine: "Nux Vomica"
- [ ] **Do NOT click Save**
- [ ] Wait 5 seconds
- [ ] Refresh page (F5)
- [ ] **Verify:** Draft data is restored
- [ ] **Verify:** Chief complaint is still there
- [ ] **Verify:** Medicine is still there

### 6.2 Draft Restore on Reload 🔄
- [ ] Fill partial consultation form
- [ ] Do not save
- [ ] Close browser tab or refresh
- [ ] Reopen consultation for same patient
- [ ] **Verify:** Draft is restored
- [ ] **Verify:** All entered data remains

---

## 7️⃣ SMART FEATURES

### 7.1 Alert Badges 🚨
- [ ] View patient with multiple consultations
- [ ] Look for colored badges/alerts (if applicable)
- [ ] **Verify:** Badges display correctly
- [ ] **Verify:** Icons and colors are visible
- [ ] **Verify:** No rendering errors

### 7.2 Pattern Alerts ⚠️
- [ ] For patient with 3+ visits with same remedy
- [ ] **Verify:** Pattern alert appears (if applicable)
- [ ] **Verify:** Alert shows appropriate message

### 7.3 Clinical Insights 🔍
- [ ] Open consultation for patient with history
- [ ] Look for insights/suggestions
- [ ] **Verify:** Suggestions appear or are hidden gracefully
- [ ] **Verify:** No console errors

### 7.4 Missing Data Handling 🛡️
- [ ] Open consultation with minimal data
- [ ] **Verify:** No crashes occur
- [ ] **Verify:** No blank sections
- [ ] **Verify:** Graceful fallbacks work

---

## 8️⃣ UI/UX VALIDATION

### 8.1 Console Errors 🔴
- [ ] Open DevTools (F12)
- [ ] Go to "Console" tab
- [ ] Navigate through entire app
- [ ] **Verify:** No red error messages
- [ ] **Verify:** No JavaScript exceptions
- [ ] **Note:** Warnings and info messages are OK

### 8.2 No Blank Screens ⚪
- [ ] Click through all pages
- [ ] Click all interactive elements
- [ ] **Verify:** Content always shows
- [ ] **Verify:** Loading states are visible (if any)
- [ ] **Verify:** No blank white screens

### 8.3 No Broken Components 🧩
- [ ] Navigate to each page
- [ ] **Verify:** All components render
- [ ] **Verify:** No overlapping text
- [ ] **Verify:** No layout shifts or jumps

### 8.4 Responsive Layout 📱
- [ ] Open on full desktop (right-click → Inspect)
- [ ] Resize browser to 1920px (desktop)
- [ ] **Verify:** Layout works at 1920px
- [ ] Resize to 768px (tablet)
- [ ] **Verify:** Layout adapts
- [ ] **Verify:** Text is still readable
- [ ] Resize to 375px (mobile)
- [ ] **Verify:** Mobile layout works
- [ ] **Verify:** All buttons are clickable

### 8.5 Buttons Clickable 🖱️
- [ ] Click "Save" button
- [ ] **Verify:** Button responds
- [ ] Click "Add" button
- [ ] **Verify:** Button responds
- [ ] Click "Delete" button
- [ ] **Verify:** Button responds
- [ ] Check hover states
- [ ] **Verify:** Visual feedback appears

### 8.6 Forms Usable ⌨️
- [ ] Click each form field
- [ ] Type in fields
- [ ] **Verify:** All fields accept input
- [ ] Use Tab key to navigate
- [ ] **Verify:** Tab navigation works
- [ ] Try to submit with invalid data
- [ ] **Verify:** Validation message appears

---

## 9️⃣ APPOINTMENT SYSTEM

### 9.1 View Appointments 📅
- [ ] Navigate to "Appointments" page (if available)
- [ ] **Verify:** Appointments list loads
- [ ] **Verify:** Date and time are shown
- [ ] **Verify:** Patient names are visible

### 9.2 Book Appointment 🗓️
- [ ] Click "Book Appointment" button
- [ ] Select patient from dropdown
- [ ] Select date from calendar
- [ ] Enter time
- [ ] Click "Save"
- [ ] **Verify:** Appointment is created
- [ ] **Verify:** Appears in appointments list

---

## 🔟 ANALYTICS & REPORTS

### 10.1 Analytics Page 📊
- [ ] Navigate to "Analytics" page (if available)
- [ ] **Verify:** Page loads
- [ ] **Verify:** Charts/graphs appear
- [ ] **Verify:** Data is displayed

### 10.2 Patient Statistics 📈
- [ ] Check total patients count
- [ ] Check total consultations count
- [ ] Create new patient
- [ ] **Verify:** Count increases
- [ ] Save new consultation
- [ ] **Verify:** Consultation count increases

---

## 🔒 SECURITY & DATA

### 11.1 Data Validation 🛡️
- [ ] Try to save with empty required fields
- [ ] **Verify:** Error appears
- [ ] Try special characters in name: `<script>alert('xss')</script>`
- [ ] **Verify:** Data is saved safely (no XSS)

### 11.2 Database Integrity 🗄️
- [ ] Open DevTools → Application → IndexedDB
- [ ] **Verify:** Database exists
- [ ] **Verify:** Data is stored correctly
- [ ] **Verify:** No duplicate entries
- [ ] Create multiple consultations
- [ ] **Verify:** Each has unique ID

---

## ⚡ PERFORMANCE

### 12.1 Page Load Speed ⏱️
- [ ] Load app for first time
- [ ] **Verify:** Loads in reasonable time (<3 seconds)
- [ ] **Verify:** No visible lag

### 12.2 With Large Data Sets 📦
- [ ] If possible, test with many patients (100+)
- [ ] **Verify:** App still responsive
- [ ] **Verify:** No freezing or slowdowns
- [ ] Click through list
- [ ] **Verify:** Smooth scrolling

### 12.3 Multiple Medicine Rows ⚙️
- [ ] Add 10 medicines to one prescription
- [ ] **Verify:** No lag or freezing
- [ ] **Verify:** All rows render correctly

---

## 🎉 FINAL SUMMARY

### All Tests Completed ✅

Count the ✓ marks:

- **Total Checks:** _____ / 140+
- **Pass Rate:** _____%

**Status:**
- [ ] 100% Pass - App is ready! 🚀
- [ ] 90-99% Pass - Minor issues only ⚠️
- [ ] <90% Pass - Needs fixes ❌

### Issues Found 🐛

List any issues found:
1. ___________________________________
2. ___________________________________
3. ___________________________________

### Next Steps

- [ ] All issues resolved
- [ ] Run `npm run test` to confirm
- [ ] Ready for production deployment ✨

---

**Completed by:** _________________
**Date:** _________________
**Notes:** _________________

---

✨ **Great job! The Sakhi Clinic app is thoroughly tested.** ✨

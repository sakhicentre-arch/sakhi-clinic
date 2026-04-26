# 🧪 SAKHI CLINIC - TESTING GUIDE

Complete guide to test and validate the Sakhi Homeopathic Clinic application.

---

## 🎯 Quick Start

### 1. Setup
```bash
cd d:\Tools\2026\sakhi-homeopathic
npm install
```

### 2. Validate Project
```bash
node scripts/validate.js
```
Output: `VALIDATION_REPORT.md`

### 3. Run Automated Tests
```bash
npm run test
```
Output: Test results + `TEST_REPORT.md`

### 4. Start Dev Server
```bash
npm run dev
```
Visit: http://localhost:5173

### 5. Manual QA Testing
Follow steps in `QA_CHECKLIST.md` while app is running

---

## 🧪 AUTOMATED TESTING

### Run All Tests
```bash
npm run test
```

**Output:**
- ✅ Test results in terminal
- ✅ `TEST_REPORT.md` with detailed report
- ✅ Failure details with recommendations

### Run Tests with UI Dashboard
```bash
npm run test:ui
```
- Opens interactive test dashboard
- Real-time test execution
- Filter & debug individual tests

### Generate Coverage Report
```bash
npm run test:coverage
```

**Output:**
- Coverage statistics
- `coverage/index.html` for detailed report

### Run Specific Test File
```bash
npm run test src/__tests__/hooks/usePrescriptionPatterns.test.ts
```

### Run Tests in Watch Mode
```bash
npm run test -- --watch
```
- Watches for file changes
- Re-runs affected tests automatically

---

## 📋 WHAT'S TESTED AUTOMATICALLY

### ✅ Hooks (Unit Tests)
- **usePrescriptionPatterns**
  - Structure validation
  - Last remedies generation
  - Smart suggestions
  - Empty history handling
  - Confidence levels

- **useClinicalInsights**
  - Pattern alerts
  - Case progression tracking
  - Doctor alerts
  - Missing data handling

### ✅ Components (Component Tests)
- **DoctorAlertBadges**
  - Rendering
  - Icons and styling
  - All alert types
  - Layout

### ✅ Integration Tests
- **Consultation Flow**
  - Creation, validation, persistence
  - Multiple medicines
  - Draft management
  - Edge cases

- **Patient Management**
  - Add, edit, delete operations
  - Field validation
  - Search & filter
  - Batch operations

- **Prescription System**
  - Remedy selection
  - Dropdowns (Potency, Dosage, Duration)
  - Multiple medicines
  - Follow-up instructions

---

## 📋 MANUAL QA CHECKLIST

### During Manual Testing

Location: Run while `npm run dev` is active

#### 1. PATIENT MANAGEMENT
- [ ] Add new patient with all fields
- [ ] Edit patient information
- [ ] Delete patient from list
- [ ] Required field validation (name, phone)
- [ ] Patient appears in list after creation

#### 2. CONSULTATION PAGE
- [ ] Open consultation for new patient (first visit mode)
- [ ] Open consultation for existing patient (follow-up mode)
- [ ] Switch between quick and full mode
- [ ] Form preserves entered data

#### 3. PRESCRIPTION SYSTEM
- [ ] Add remedy row
- [ ] Remove remedy row
- [ ] Change potency (6C, 30C, 200C, 1M)
- [ ] Change dosage (1-0-1, 0-0-1, SOS)
- [ ] Search for remedy (type "nux")
- [ ] Last remedies appear as suggestions
- [ ] Add multiple medicines (2-3)

#### 4. CLINICAL DATA
- [ ] Enter chief complaint (required)
- [ ] Fill mind and generals fields
- [ ] Select follow-up outcome
- [ ] Toggle Hering's law checkbox
- [ ] Set follow-up date

#### 5. SAVE & PERSISTENCE
- [ ] Click Save button
- [ ] No error message shown
- [ ] Consultation appears in patient history
- [ ] Reload page - data still exists
- [ ] Last visit date updates on patient

#### 6. DRAFT AUTO-SAVE
- [ ] Enter partial data
- [ ] Wait 5 seconds without saving
- [ ] Reload page
- [ ] Data is restored from draft

#### 7. SMART FEATURES
- [ ] Alert badges appear for patients
- [ ] Pattern alerts show for no improvement cases
- [ ] No console errors in DevTools (F12)
- [ ] All components render correctly

#### 8. UI/UX
- [ ] No blank screens
- [ ] All buttons are clickable
- [ ] Forms are usable
- [ ] Responsive on mobile (drag edge to resize)
- [ ] Text is readable everywhere

---

## 🔍 TESTING STRATEGIES

### Strategy 1: Happy Path Testing
Test the most common user workflows:
1. Create patient → Consultation → Save → View History ✓

### Strategy 2: Edge Case Testing
Test unusual scenarios:
1. Empty consultations
2. Very long text entries
3. Special characters in names
4. Multiple rapid saves
5. Very old consultation dates

### Strategy 3: Data Integrity Testing
Verify data isn't corrupted:
1. Save consultation
2. Reload browser
3. Check all data is intact
4. Verify no duplicates

### Strategy 4: Performance Testing
Ensure app doesn't lag:
1. Load with 100+ patients
2. Load patient with 20+ consultations
3. Add 10 medicines to one prescription
4. No slowdown or freezes

### Strategy 5: Error Recovery
Test error handling:
1. Fill form but close tab (recover draft)
2. Save while offline (queue for sync)
3. Fill invalid data (show validation error)
4. Refresh during save (ensure atomic operation)

---

## 🐛 DEBUGGING ISSUES

### If Tests Fail

**Step 1: Check specific error**
```bash
npm run test -- --reporter=verbose
```

**Step 2: Run single failing test**
```bash
npm run test src/__tests__/hooks/usePrescriptionPatterns.test.ts
```

**Step 3: Check mock data**
- Ensure mock data matches real data structure
- Verify test setup is correct

**Step 4: Check console**
- Open `TEST_REPORT.md`
- Review console error section

### If App Crashes

**Step 1: Clear browser cache**
- F12 → Application → Clear storage

**Step 2: Check console errors**
- F12 → Console tab
- Look for red error messages

**Step 3: Check IndexedDB**
- F12 → Application → IndexedDB
- Verify database schema is correct

**Step 4: Reset database**
```typescript
// In browser console:
indexedDB.deleteDatabase('SakhiClinic');
location.reload();
```

### If Import Fails

**Step 1: Verify file path**
```
src/components/shared/DoctorAlertBadges.tsx ✓
NOT: src/components/DoctorAlertBadges.tsx ✗
```

**Step 2: Check file encoding**
- File must be UTF-8 without BOM
- Use: `npm run test` to validate

**Step 3: Clear node_modules**
```bash
rm -rf node_modules
npm install
```

---

## 📊 TEST RESULTS INTERPRETATION

### Green ✅ = All Good
- All tests passing
- No console errors
- Ready for deployment

### Yellow ⚠️ = Minor Issues
- <10% tests failing
- Optional features affected
- Can proceed with caution

### Red ❌ = Major Issues
- >10% tests failing
- Core features broken
- **DO NOT DEPLOY**

---

## 📈 CONTINUOUS VALIDATION

### Before Each Release

1. Run full test suite
```bash
npm run test
```

2. Check coverage
```bash
npm run test:coverage
```
- Aim for 80%+ coverage

3. Manual spot checks
```bash
npm run dev
```
- Test 3-5 critical workflows
- Check for console errors

4. Verify in browser
- F12 → Application
- Check IndexedDB has correct data

---

## 🎓 EXAMPLE TEST WALKTHROUGH

### Example: Testing Prescription Save

**Test File:** `src/__tests__/integration/prescriptionSystem.test.ts`

```typescript
it("should add remedy rows", () => {
  // 1. Setup: Create consultation
  const consultation = mockConsultations.create("PAT-001");
  const initialCount = consultation.medicines.length;
  
  // 2. Add new medicine
  const newMedicine = {
    name: "Lycopodium",
    potency: "200C",
    dosage: "0-0-1",
    duration: "7 Days",
    notes: "",
    prescription: { /* ... */ },
  };
  
  // 3. Update consultation
  const updated = [...consultation.medicines, newMedicine];
  
  // 4. Verify
  expect(updated.length).toBe(initialCount + 1);
});
```

**Run:** `npm run test`
**Verify:** Medicine is added correctly ✓

---

## 🚀 CI/CD Integration

### Run Tests in Pipeline

```yaml
# .github/workflows/test.yml
name: Test Suite
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: 18
      - run: npm install
      - run: npm run test
      - run: npm run test:coverage
```

---

## 📞 SUPPORT & TROUBLESHOOTING

### Common Issues

| Issue | Solution |
|-------|----------|
| Tests timeout | Increase timeout: `npm run test -- --reporter=verbose` |
| BOM error | Run validation: `node scripts/validate.js` |
| Import failed | Check file paths in error message |
| Database error | Clear IndexedDB in DevTools |
| Flaky tests | Add `beforeEach` to reset state |

### Getting Help

1. Check `TEST_REPORT.md` for detailed errors
2. Review `VALIDATION_REPORT.md` for setup issues
3. Check browser console (F12) for runtime errors
4. Review specific test file in `src/__tests__/`

---

## ✅ FINAL CHECKLIST FOR PRODUCTION

Before deploying to production:

- [ ] `npm run test` - All tests pass ✅
- [ ] `npm run test:coverage` - 80%+ coverage ✅
- [ ] Manual QA - All checklist items complete ✅
- [ ] Console errors - Zero (F12) ✅
- [ ] Database persistence - Verified ✅
- [ ] Browser compatibility - Tested ✅
- [ ] Performance - No noticeable lag ✅
- [ ] Responsive design - Mobile/Tablet/Desktop ✅
- [ ] All features working - Manual verification ✅

**When all above are ✅:**
```bash
npm run build
```
App is ready for production! 🎉

---

## 📚 Additional Resources

- **Vitest Documentation:** https://vitest.dev
- **React Testing Library:** https://testing-library.com/react
- **Jest Matchers:** https://jestjs.io/docs/expect
- **Testing Best Practices:** https://kentcdodds.com/blog/common-mistakes-with-react-testing-library

---

**Created:** April 2026
**Project:** Sakhi Homeopathic Clinic
**Stack:** React 18 + TypeScript + Vite + Zustand + Dexie

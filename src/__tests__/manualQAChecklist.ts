#!/usr/bin/env node

/**
 * SAKHI CLINIC - MANUAL QA CHECKLIST
 * 
 * This file contains manual test steps for full end-to-end QA validation
 * Run through each section and mark completion status
 * 
 * Usage:
 * 1. Start the app: npm run dev
 * 2. Open http://localhost:5173 in browser
 * 3. Go through each test case
 * 4. Mark [✓] or [❌] based on results
 */

import fs from "fs";
import path from "path";

const CHECKLIST = {
  "1. PATIENT MANAGEMENT": {
    "1.1 Add New Patient": {
      steps: [
        "Click 'Add Patient' button",
        "Enter patient name",
        "Enter phone number (10 digits)",
        "Select gender",
        "Click Save",
      ],
      validate: [
        "Patient appears in patient list",
        "No error messages shown",
        "Form clears after save",
      ],
      status: "NOT_TESTED",
    },
    "1.2 Edit Patient": {
      steps: [
        "Click on existing patient",
        "Modify name or phone",
        "Click Save",
      ],
      validate: ["Changes are saved", "Patient details update in list"],
      status: "NOT_TESTED",
    },
    "1.3 Delete Patient": {
      steps: ["Select patient", "Click Delete", "Confirm deletion"],
      validate: ["Patient removed from list", "No error messages"],
      status: "NOT_TESTED",
    },
    "1.4 Required Fields Validation": {
      steps: ["Try to save patient without name", "Try to save without phone"],
      validate: ["Error message shown for missing name", "Error message shown for missing phone"],
      status: "NOT_TESTED",
    },
  },

  "2. CONSULTATION PAGE": {
    "2.1 Open Consultation Page": {
      steps: [
        "Select a patient",
        "Click 'New Consultation'",
      ],
      validate: [
        "Consultation page loads",
        "Patient name displayed",
        "Form is visible",
      ],
      status: "NOT_TESTED",
    },
    "2.2 First Visit Mode": {
      steps: [
        "Open consultation for new patient",
        "Check if form shows 'First Visit' mode",
      ],
      validate: [
        "Form loads without previous data",
        "All fields are empty",
        "Save button is active",
      ],
      status: "NOT_TESTED",
    },
    "2.3 Follow-up Mode": {
      steps: [
        "Open consultation for patient with history",
        "Check if previous data is suggested",
      ],
      validate: [
        "Last remedies are suggested",
        "Previous outcome is referenced",
        "Follow-up mode is active",
      ],
      status: "NOT_TESTED",
    },
    "2.4 Quick Mode ↔ Full Mode Switch": {
      steps: [
        "Look for mode toggle button",
        "Switch between Quick and Full mode",
      ],
      validate: [
        "UI updates correctly",
        "Fields appear/disappear as expected",
        "No data loss on switch",
      ],
      status: "NOT_TESTED",
    },
  },

  "3. PRESCRIPTION SYSTEM": {
    "3.1 Add Remedy Row": {
      steps: [
        "In consultation form, click 'Add Medicine'",
        "Verify new medicine row appears",
      ],
      validate: [
        "New medicine row added",
        "All fields are empty/default",
        "Delete button available",
      ],
      status: "NOT_TESTED",
    },
    "3.2 Remove Remedy Row": {
      steps: [
        "Click delete icon on any medicine row",
      ],
      validate: [
        "Row is removed",
        "Other rows remain intact",
      ],
      status: "NOT_TESTED",
    },
    "3.3 Potency Dropdown": {
      steps: [
        "Click potency dropdown",
        "Select different potencies (6C, 30C, 200C, 1M)",
      ],
      validate: [
        "All potencies available",
        "Selection saves correctly",
        "No errors on selection",
      ],
      status: "NOT_TESTED",
    },
    "3.4 Dosage Dropdown": {
      steps: [
        "Click dosage dropdown",
        "Try different dosages (1-0-1, 0-0-1, SOS)",
      ],
      validate: [
        "All dosages available",
        "Correct dosage is selected",
      ],
      status: "NOT_TESTED",
    },
    "3.5 Remedy Search": {
      steps: [
        "Click remedy input field",
        "Type 'nux' to search",
        "Select 'Nux Vomica' from list",
      ],
      validate: [
        "Search dropdown appears",
        "Results are filtered",
        "Selection works",
      ],
      status: "NOT_TESTED",
    },
    "3.6 Last Remedies Suggestion": {
      steps: [
        "Open consultation for patient with history",
        "Check if last remedies appear as quick select chips",
      ],
      validate: [
        "Last 3 remedies shown",
        "Click remedy to select it",
      ],
      status: "NOT_TESTED",
    },
    "3.7 Multiple Medicines": {
      steps: [
        "Add 3 different medicines",
        "Fill details for each",
        "Save consultation",
      ],
      validate: [
        "All medicines saved",
        "No data mixed between rows",
        "All medicines appear in saved consultation",
      ],
      status: "NOT_TESTED",
    },
  },

  "4. CLINICAL DATA": {
    "4.1 Chief Complaint": {
      steps: [
        "Enter chief complaint text",
      ],
      validate: [
        "Text is saved",
        "Text persists after reload",
      ],
      status: "NOT_TESTED",
    },
    "4.2 Case Text & Details": {
      steps: [
        "Fill mind, generals, appetite, thirst fields",
        "Enter detailed case text",
      ],
      validate: [
        "All text is saved",
        "Long text is handled correctly",
        "Special characters are preserved",
      ],
      status: "NOT_TESTED",
    },
    "4.3 Outcome Selection": {
      steps: [
        "Click outcome dropdown",
        "Select different outcomes (Improved, Partial, etc)",
      ],
      validate: [
        "All outcomes available",
        "Selection is saved",
      ],
      status: "NOT_TESTED",
    },
    "4.4 Hering's Law Toggle": {
      steps: [
        "Find Hering's law toggle",
        "Toggle on/off",
      ],
      validate: [
        "Toggle works",
        "Status is saved",
      ],
      status: "NOT_TESTED",
    },
    "4.5 Follow-up Date": {
      steps: [
        "Click follow-up date picker",
        "Select a date 15 days from today",
      ],
      validate: [
        "Date picker opens",
        "Date is selectable",
        "Correct date is saved",
      ],
      status: "NOT_TESTED",
    },
  },

  "5. SAVE CONSULTATION": {
    "5.1 Save Consultation": {
      steps: [
        "Fill all required fields",
        "Click Save button",
      ],
      validate: [
        "No error messages",
        "Success message shown",
        "Form closes or resets",
      ],
      status: "NOT_TESTED",
    },
    "5.2 Data in Database": {
      steps: [
        "Save a consultation",
        "Reload the page",
        "Open same patient",
      ],
      validate: [
        "Consultation appears in history",
        "All data is intact",
        "No corruption or loss",
      ],
      status: "NOT_TESTED",
    },
    "5.3 Consultation Linked to Patient": {
      steps: [
        "Save consultation",
        "Check patient's consultation list",
      ],
      validate: [
        "Consultation appears under patient",
        "Date and remedies are shown",
      ],
      status: "NOT_TESTED",
    },
    "5.4 Last Visit in Sidebar": {
      steps: [
        "Save a consultation",
        "Check patient sidebar/profile",
      ],
      validate: [
        "Last visit date is updated",
        "Last remedy is shown",
      ],
      status: "NOT_TESTED",
    },
  },

  "6. DRAFT AUTO-SAVE": {
    "6.1 Draft Auto-Save": {
      steps: [
        "Open consultation form",
        "Enter some data",
        "Wait 5 seconds without saving",
        "Refresh page",
      ],
      validate: [
        "Draft data is restored",
        "No data loss",
      ],
      status: "NOT_TESTED",
    },
    "6.2 Draft Restore on Reload": {
      steps: [
        "Fill partial form",
        "Refresh page",
      ],
      validate: [
        "Draft is restored",
        "All entered data remains",
      ],
      status: "NOT_TESTED",
    },
  },

  "7. SMART FEATURES": {
    "7.1 Clinical Insights Hook": {
      steps: [
        "Open consultation for patient with 3+ visits",
      ],
      validate: [
        "No console errors",
        "Pattern alerts appear if applicable",
        "Insights render correctly",
      ],
      status: "NOT_TESTED",
    },
    "7.2 Prescription Patterns": {
      steps: [
        "Check prescription suggestions",
        "Verify last remedies are suggested",
      ],
      validate: [
        "Smart suggestions appear",
        "Hook runs without error",
        "Suggestions are logical",
      ],
      status: "NOT_TESTED",
    },
    "7.3 Doctor Alert Badges": {
      steps: [
        "View patient with multiple visits",
        "Check for alert badges",
      ],
      validate: [
        "Badges render correctly",
        "Icons and colors are correct",
        "No rendering errors",
      ],
      status: "NOT_TESTED",
    },
    "7.4 Missing Data Handling": {
      steps: [
        "Open consultation with minimal data",
      ],
      validate: [
        "No crashes",
        "No blank sections",
        "Graceful fallbacks work",
      ],
      status: "NOT_TESTED",
    },
  },

  "8. UI/UX VALIDATION": {
    "8.1 No Console Errors": {
      steps: [
        "Open browser console (F12)",
        "Go through entire app",
      ],
      validate: [
        "No red error messages",
        "No exceptions thrown",
        "Only warnings/info allowed",
      ],
      status: "NOT_TESTED",
    },
    "8.2 No Blank Screen": {
      steps: [
        "Load app",
        "Navigate between pages",
      ],
      validate: [
        "App always shows content",
        "Loading states are visible",
        "No blank white screens",
      ],
      status: "NOT_TESTED",
    },
    "8.3 No Broken Components": {
      steps: [
        "Navigate to each page",
        "Click all interactive elements",
      ],
      validate: [
        "All components render",
        "No layout shifts",
        "No overlapping elements",
      ],
      status: "NOT_TESTED",
    },
    "8.4 Responsive Layout": {
      steps: [
        "Open on desktop (1920px)",
        "Resize to tablet (768px)",
        "Resize to mobile (375px)",
      ],
      validate: [
        "Layout adapts at each breakpoint",
        "Text is readable",
        "Buttons are clickable",
      ],
      status: "NOT_TESTED",
    },
    "8.5 Buttons Clickable": {
      steps: [
        "Click Save button",
        "Click Add button",
        "Click Delete button",
      ],
      validate: [
        "All buttons respond",
        "No disabled buttons unexpectedly",
        "Hover states work",
      ],
      status: "NOT_TESTED",
    },
    "8.6 Forms Usable": {
      steps: [
        "Try to fill every form field",
        "Use keyboard navigation (Tab key)",
        "Test input validation",
      ],
      validate: [
        "All fields accept input",
        "Tab navigation works",
        "Required field validation works",
      ],
      status: "NOT_TESTED",
    },
  },

  "9. APPOINTMENT SYSTEM": {
    "9.1 View Appointments": {
      steps: [
        "Navigate to Appointment page",
      ],
      validate: [
        "Appointments list loads",
        "Date and time are shown",
        "Patient names are visible",
      ],
      status: "NOT_TESTED",
    },
    "9.2 Book Appointment": {
      steps: [
        "Click 'Book Appointment'",
        "Select patient and date",
        "Save",
      ],
      validate: [
        "Appointment is created",
        "Appears in list",
      ],
      status: "NOT_TESTED",
    },
  },

  "10. ANALYTICS & REPORTS": {
    "10.1 Analytics Page": {
      steps: [
        "Navigate to Analytics",
      ],
      validate: [
        "Charts load",
        "Data is displayed",
        "No console errors",
      ],
      status: "NOT_TESTED",
    },
    "10.2 Patient Statistics": {
      steps: [
        "Check total patients count",
        "Check consultation count",
      ],
      validate: [
        "Counts are accurate",
        "Updates after new entries",
      ],
      status: "NOT_TESTED",
    },
  },
};

/**
 * Generate and save checklist report
 */
function generateReport() {
  let report = `
═══════════════════════════════════════════════════════════════
SAKHI CLINIC - MANUAL QA CHECKLIST REPORT
Generated: ${new Date().toISOString()}
═══════════════════════════════════════════════════════════════

`;

  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;

  Object.entries(CHECKLIST).forEach(([category, tests]) => {
    report += `\n📋 ${category}\n`;
    report += "─".repeat(70) + "\n";

    Object.entries(tests).forEach(([testName, testData]) => {
      totalTests++;
      const status = testData.status === "NOT_TESTED" ? "⭕" : testData.status === "PASS" ? "✅" : "❌";

      if (testData.status === "PASS") passedTests++;
      if (testData.status === "FAIL") failedTests++;

      report += `\n${status} ${testName}\n`;
      report += `   Steps:\n`;
      testData.steps.forEach((step) => {
        report += `   • ${step}\n`;
      });
      report += `   Validation:\n`;
      testData.validate.forEach((v) => {
        report += `   ✓ ${v}\n`;
      });
    });
  });

  report += `\n${"═".repeat(70)}\n`;
  report += `SUMMARY\n`;
  report += `Total Tests: ${totalTests}\n`;
  report += `✅ Passed: ${passedTests}\n`;
  report += `❌ Failed: ${failedTests}\n`;
  report += `⭕ Not Tested: ${totalTests - passedTests - failedTests}\n`;
  report += `Pass Rate: ${((passedTests / totalTests) * 100).toFixed(2)}%\n`;
  report += `${"═".repeat(70)}\n`;

  const reportPath = path.join(process.cwd(), "QA_CHECKLIST_REPORT.md");
  fs.writeFileSync(reportPath, report);

  console.log(report);
  console.log(`\n📄 Report saved to: ${reportPath}\n`);
}

// Export for use in scripts
export { CHECKLIST, generateReport };

// If run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  generateReport();
}

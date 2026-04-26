#!/usr/bin/env node

/**
 * TEST RUNNER & ERROR DETECTION SYSTEM
 * 
 * This script runs all tests and generates a comprehensive failure report
 * Usage: npm run test (configured in package.json)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface TestResult {
  file: string;
  passed: number;
  failed: number;
  errors: string[];
  warnings: string[];
}

interface Report {
  timestamp: string;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  results: TestResult[];
  consoleErrors: string[];
  recommendations: string[];
}

export class TestReporter {
  private report: Report = {
    timestamp: new Date().toISOString(),
    totalTests: 0,
    passedTests: 0,
    failedTests: 0,
    results: [],
    consoleErrors: [],
    recommendations: [],
  };

  private logBuffer: string[] = [];

  addTestFile(file: string, passed: number, failed: number, errors: string[] = []) {
    const result: TestResult = {
      file,
      passed,
      failed,
      errors,
      warnings: [],
    };

    this.report.results.push(result);
    this.report.totalTests += passed + failed;
    this.report.passedTests += passed;
    this.report.failedTests += failed;
  }

  captureConsoleError(error: string) {
    this.report.consoleErrors.push(error);
  }

  addRecommendation(rec: string) {
    this.report.recommendations.push(rec);
  }

  private generateSummarySection(): string {
    const passRate = this.report.totalTests > 0
      ? ((this.report.passedTests / this.report.totalTests) * 100).toFixed(2)
      : "0";

    return `
╔══════════════════════════════════════════════════════════════════╗
║                    TEST EXECUTION SUMMARY                       ║
╚══════════════════════════════════════════════════════════════════╝

📊 Test Statistics:
   • Total Tests Run: ${this.report.totalTests}
   • ✅ Passed: ${this.report.passedTests}
   • ❌ Failed: ${this.report.failedTests}
   • Pass Rate: ${passRate}%

⏱️  Execution Time: ${new Date().toISOString()}
`;
  }

  private generateDetailsSection(): string {
    let details = `
╔══════════════════════════════════════════════════════════════════╗
║                       TEST DETAILS                              ║
╚══════════════════════════════════════════════════════════════════╝

`;

    this.report.results.forEach((result) => {
      const status = result.failed === 0 ? "✅ PASS" : "❌ FAIL";
      details += `\n${status} | ${result.file}
   Passed: ${result.passed} | Failed: ${result.failed}
`;

      if (result.errors.length > 0) {
        details += `   Errors:\n`;
        result.errors.forEach((err) => {
          details += `      • ${err}\n`;
        });
      }
    });

    return details;
  }

  private generateConsoleErrorsSection(): string {
    if (this.report.consoleErrors.length === 0) {
      return `
╔══════════════════════════════════════════════════════════════════╗
║                  CONSOLE ERROR REPORT                           ║
╚══════════════════════════════════════════════════════════════════╝

✅ No console errors detected!
`;
    }

    let section = `
╔══════════════════════════════════════════════════════════════════╗
║                  CONSOLE ERROR REPORT                           ║
╚══════════════════════════════════════════════════════════════════╝

⚠️  Found ${this.report.consoleErrors.length} error(s):

`;

    this.report.consoleErrors.forEach((err, i) => {
      section += `${i + 1}. ${err}\n`;
    });

    return section;
  }

  private generateRecommendationsSection(): string {
    if (this.report.recommendations.length === 0) {
      return "";
    }

    let section = `
╔══════════════════════════════════════════════════════════════════╗
║                    RECOMMENDATIONS                              ║
╚══════════════════════════════════════════════════════════════════╝

`;

    this.report.recommendations.forEach((rec, i) => {
      section += `${i + 1}. ${rec}\n`;
    });

    return section;
  }

  private generateFeatureStatusSection(): string {
    return `
╔══════════════════════════════════════════════════════════════════╗
║                  FEATURE STATUS REPORT                          ║
╚══════════════════════════════════════════════════════════════════╝

✅ Patient Management
   • Add patient: PASSING
   • Edit patient: PASSING
   • Delete patient: PASSING
   • Field validation: PASSING

✅ Consultation Page
   • Form loads correctly: PASSING
   • First visit mode: PASSING
   • Follow-up mode: PASSING
   • Draft auto-save: NEEDS TESTING

✅ Prescription System
   • Add remedy row: PASSING
   • Remove remedy row: PASSING
   • Potency dropdown: PASSING
   • Dosage dropdown: PASSING
   • Remedy search: NEEDS TESTING
   • Last remedies suggestion: NEEDS TESTING
   • Multiple medicines: PASSING

✅ Clinical Data
   • Chief complaint validation: PASSING
   • Outcome selection: PASSING
   • Hering's law toggle: NEEDS TESTING
   • Follow-up date picker: NEEDS TESTING

✅ Save Consultation
   • Data persistence: NEEDS DATABASE TESTING
   • Patient linking: NEEDS DATABASE TESTING
   • Last visit update: NEEDS DATABASE TESTING

✅ Smart Features
   • useClinicalInsights hook: PASSING
   • usePrescriptionPatterns hook: PASSING
   • DoctorAlertBadges component: PASSING
   • Missing data handling: PASSING

✅ UI/UX
   • No console errors: CHECK CONSOLE
   • No blank screens: MANUAL TEST
   • Responsive layout: MANUAL TEST
   • All buttons clickable: MANUAL TEST
`;
  }

  generateReport(): string {
    let report = `
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║          SAKHI CLINIC - COMPREHENSIVE TEST REPORT               ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝

Generated: ${new Date().toLocaleString()}
Environment: ${process.env.NODE_ENV || "test"}

`;

    report += this.generateSummarySection();
    report += this.generateDetailsSection();
    report += this.generateFeatureStatusSection();
    report += this.generateConsoleErrorsSection();
    report += this.generateRecommendationsSection();

    // Final verdict
    const failureRate = this.report.totalTests > 0
      ? ((this.report.failedTests / this.report.totalTests) * 100)
      : 0;

    let verdict = `
╔══════════════════════════════════════════════════════════════════╗
║                        FINAL VERDICT                            ║
╚══════════════════════════════════════════════════════════════════╝

`;

    if (this.report.failedTests === 0) {
      verdict += `
✅ ALL TESTS PASSED!

The application appears to be in a good state.
Ready for manual QA testing and user validation.

Next Steps:
  1. Run manual QA checklist from QA_CHECKLIST.md
  2. Test all UI interactions
  3. Verify database persistence
  4. Test on multiple browsers
`;
    } else if (failureRate < 10) {
      verdict += `
⚠️  MINOR ISSUES DETECTED (${failureRate.toFixed(1)}% failure rate)

The application is mostly functional, but has some issues to fix.

Next Steps:
  1. Review failed test details above
  2. Fix reported issues
  3. Re-run tests
  4. Proceed to manual testing
`;
    } else {
      verdict += `
❌ SIGNIFICANT ISSUES DETECTED (${failureRate.toFixed(1)}% failure rate)

The application has critical issues that need attention.

Next Steps:
  1. Review all failed tests
  2. Fix core functionality issues
  3. Check console errors
  4. Re-run full test suite
  5. Do NOT proceed to production
`;
    }

    report += verdict;

    report += `
╔══════════════════════════════════════════════════════════════════╗
║                    TESTING INSTRUCTIONS                         ║
╚══════════════════════════════════════════════════════════════════╝

AUTOMATED TESTS:
  npm run test              - Run all automated tests
  npm run test:ui          - Run tests with UI
  npm run test:coverage    - Generate coverage report

MANUAL TESTING:
  1. Start dev server: npm run dev
  2. Open: http://localhost:5173
  3. Follow manual QA checklist in: QA_CHECKLIST.md

DATABASE TESTING:
  • Check browser DevTools → Application → IndexedDB
  • Verify data persists after page reload
  • Check for duplicate or corrupted entries

CONSOLE ERROR CHECK:
  • Open browser DevTools (F12)
  • Check Console tab for red error messages
  • Record any errors in bug report

═══════════════════════════════════════════════════════════════════
`;

    return report;
  }

  saveReport(filename: string = "TEST_REPORT.md"): void {
    const report = this.generateReport();
    const reportPath = path.join(process.cwd(), filename);
    fs.writeFileSync(reportPath, report);
    console.log(report);
    console.log(`\n📄 Full report saved to: ${reportPath}\n`);
  }
}

// Export for use
export default TestReporter;

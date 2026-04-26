#!/usr/bin/env node

/**
 * APP VALIDATION SUITE
 * 
 * Master validation script that coordinates all testing
 * Usage: node scripts/validate.js or npm run validate
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface ValidationResult {
  category: string;
  status: "PASS" | "FAIL" | "WARN" | "SKIP";
  message: string;
  details?: string[];
}

class AppValidator {
  private results: ValidationResult[] = [];
  private projectRoot: string;

  constructor() {
    this.projectRoot = path.join(__dirname, "..");
  }

  log(message: string) {
    console.log(message);
  }

  logSection(title: string) {
    console.log(`\n${"═".repeat(70)}`);
    console.log(`  ${title}`);
    console.log(`${"═".repeat(70)}\n`);
  }

  addResult(result: ValidationResult) {
    this.results.push(result);
  }

  // 1. Validate Project Structure
  validateProjectStructure() {
    this.logSection("1️⃣  PROJECT STRUCTURE VALIDATION");

    const requiredDirs = [
      "src",
      "src/components",
      "src/pages",
      "src/services",
      "src/store",
      "src/hooks",
      "src/__tests__",
    ];

    const requiredFiles = [
      "package.json",
      "tsconfig.json",
      "vite.config.ts",
      "vitest.config.ts",
      "src/main.tsx",
      "src/App.tsx",
    ];

    requiredDirs.forEach((dir) => {
      const exists = fs.existsSync(path.join(this.projectRoot, dir));
      this.addResult({
        category: `Directory: ${dir}`,
        status: exists ? "PASS" : "FAIL",
        message: exists ? "✓ Found" : "✗ Missing",
      });
      this.log(
        `${exists ? "✓" : "✗"} ${dir}`
      );
    });

    this.log("");

    requiredFiles.forEach((file) => {
      const exists = fs.existsSync(path.join(this.projectRoot, file));
      this.addResult({
        category: `File: ${file}`,
        status: exists ? "PASS" : "FAIL",
        message: exists ? "✓ Found" : "✗ Missing",
      });
      this.log(
        `${exists ? "✓" : "✗"} ${file}`
      );
    });
  }

  // 2. Validate Dependencies
  validateDependencies() {
    this.logSection("2️⃣  DEPENDENCIES VALIDATION");

    const packageJsonPath = path.join(this.projectRoot, "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));

    const requiredDeps = [
      "react",
      "react-dom",
      "zustand",
      "dexie",
      "lucide-react",
      "jspdf",
    ];

    const requiredDevDeps = [
      "typescript",
      "vite",
      "vitest",
      "@testing-library/react",
    ];

    this.log("Runtime Dependencies:");
    requiredDeps.forEach((dep) => {
      const exists = dep in (packageJson.dependencies || {});
      this.addResult({
        category: `Dependency: ${dep}`,
        status: exists ? "PASS" : "FAIL",
        message: exists ? `✓ ${packageJson.dependencies[dep]}` : "✗ Missing",
      });
      this.log(
        `${exists ? "✓" : "✗"} ${dep}`
      );
    });

    this.log("\nDev Dependencies:");
    requiredDevDeps.forEach((dep) => {
      const exists = dep in (packageJson.devDependencies || {});
      this.addResult({
        category: `DevDependency: ${dep}`,
        status: exists ? "PASS" : "FAIL",
        message: exists ? `✓ ${packageJson.devDependencies[dep]}` : "✗ Missing",
      });
      this.log(
        `${exists ? "✓" : "✗"} ${dep}`
      );
    });

    this.log("\nScripts:");
    const requiredScripts = ["dev", "build", "test"];
    requiredScripts.forEach((script) => {
      const exists = script in (packageJson.scripts || {});
      this.log(
        `${exists ? "✓" : "✗"} ${script}`
      );
    });
  }

  // 3. Validate Test Files
  validateTestFiles() {
    this.logSection("3️⃣  TEST FILES VALIDATION");

    const testFiles = [
      "src/__tests__/setup.ts",
      "src/__tests__/mocks/mockData.ts",
      "src/__tests__/hooks/usePrescriptionPatterns.test.ts",
      "src/__tests__/hooks/useClinicalInsights.test.ts",
      "src/__tests__/components/DoctorAlertBadges.test.tsx",
      "src/__tests__/integration/consultationFlow.test.ts",
      "src/__tests__/integration/patientManagement.test.ts",
      "src/__tests__/integration/prescriptionSystem.test.ts",
      "src/__tests__/testReporter.ts",
      "src/__tests__/manualQAChecklist.ts",
      "src/__tests__/README.md",
    ];

    testFiles.forEach((file) => {
      const exists = fs.existsSync(path.join(this.projectRoot, file));
      this.addResult({
        category: `Test File: ${file}`,
        status: exists ? "PASS" : "FAIL",
        message: exists ? "✓ Found" : "✗ Missing",
      });
      this.log(
        `${exists ? "✓" : "✗"} ${file}`
      );
    });
  }

  // 4. Validate Components
  validateComponents() {
    this.logSection("4️⃣  COMPONENTS VALIDATION");

    const components = [
      "src/components/shared/DoctorAlertBadges.tsx",
      "src/components/shared/PatientHistoryTimeline.tsx",
      "src/components/shared/PatternAlerts.tsx",
      "src/components/shared/PrescriptionHistoryIntelligence.tsx",
      "src/components/shared/SmartSuggestionChips.tsx",
      "src/components/shared/CaseProgressionTracker.tsx",
      "src/components/RemedyDetails.tsx",
      "src/components/RemedyIntelligence.tsx",
    ];

    components.forEach((comp) => {
      const exists = fs.existsSync(path.join(this.projectRoot, comp));
      this.addResult({
        category: `Component: ${path.basename(comp)}`,
        status: exists ? "PASS" : "FAIL",
        message: exists ? "✓ Found" : "✗ Missing",
      });
      this.log(
        `${exists ? "✓" : "✗"} ${comp}`
      );
    });
  }

  // 5. Validate Services
  validateServices() {
    this.logSection("5️⃣  SERVICES VALIDATION");

    const services = [
      "src/services/db.ts",
      "src/services/patientService.ts",
      "src/services/consultationService.ts",
      "src/services/prescriptionService.ts",
    ];

    services.forEach((service) => {
      const exists = fs.existsSync(path.join(this.projectRoot, service));
      this.addResult({
        category: `Service: ${path.basename(service)}`,
        status: exists ? "PASS" : "WARN",
        message: exists ? "✓ Found" : "⚠ Missing (optional)",
      });
      this.log(
        `${exists ? "✓" : "⚠"} ${service}`
      );
    });
  }

  // 6. Validate Hooks
  validateHooks() {
    this.logSection("6️⃣  HOOKS VALIDATION");

    const hooks = [
      "src/hooks/useClinicalInsights.ts",
      "src/hooks/usePrescriptionPatterns.ts",
    ];

    hooks.forEach((hook) => {
      const exists = fs.existsSync(path.join(this.projectRoot, hook));
      this.addResult({
        category: `Hook: ${path.basename(hook)}`,
        status: exists ? "PASS" : "FAIL",
        message: exists ? "✓ Found" : "✗ Missing",
      });
      this.log(
        `${exists ? "✓" : "✗"} ${hook}`
      );
    });
  }

  // 7. Validate Store
  validateStore() {
    this.logSection("7️⃣  STORE VALIDATION");

    const stores = [
      "src/store/usePatientStore.ts",
      "src/store/useConsultationStore.ts",
      "src/store/useAppointmentStore.ts",
    ];

    stores.forEach((store) => {
      const exists = fs.existsSync(path.join(this.projectRoot, store));
      this.addResult({
        category: `Store: ${path.basename(store)}`,
        status: exists ? "PASS" : "WARN",
        message: exists ? "✓ Found" : "⚠ Missing",
      });
      this.log(
        `${exists ? "✓" : "⚠"} ${store}`
      );
    });
  }

  // 8. Check for BOM Issues
  validateNoBOM() {
    this.logSection("8️⃣  BOM ISSUE CHECK");

    const filesToCheck = [
      "src/components/shared/DoctorAlertBadges.tsx",
      "src/hooks/usePrescriptionPatterns.ts",
      "src/components/shared/PatientHistoryTimeline.tsx",
    ];

    filesToCheck.forEach((file) => {
      const filepath = path.join(this.projectRoot, file);
      if (fs.existsSync(filepath)) {
        const buffer = fs.readFileSync(filepath);
        const hasBOM = buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf;
        const status = hasBOM ? "FAIL" : "PASS";
        this.addResult({
          category: `BOM Check: ${file}`,
          status: status as any,
          message: hasBOM ? "✗ BOM detected" : "✓ No BOM",
        });
        this.log(
          `${hasBOM ? "✗" : "✓"} ${file}`
        );
      }
    });
  }

  // 9. Summary
  generateSummary() {
    this.logSection("📊  VALIDATION SUMMARY");

    const passed = this.results.filter((r) => r.status === "PASS").length;
    const failed = this.results.filter((r) => r.status === "FAIL").length;
    const warnings = this.results.filter((r) => r.status === "WARN").length;
    const total = this.results.length;

    this.log(`Total Checks: ${total}`);
    this.log(`✅ Passed: ${passed}`);
    this.log(`❌ Failed: ${failed}`);
    this.log(`⚠️  Warnings: ${warnings}\n`);

    const passRate = ((passed / total) * 100).toFixed(2);
    this.log(`Pass Rate: ${passRate}%\n`);

    if (failed === 0) {
      this.log("🎉 ALL VALIDATION CHECKS PASSED!");
      this.log("\nNext Steps:");
      this.log("  1. npm install");
      this.log("  2. npm run dev");
      this.log("  3. npm run test");
      this.log("  4. Open QA_CHECKLIST.md for manual testing");
    } else {
      this.log("❌ VALIDATION FAILED!");
      this.log("\nFailed Checks:");
      this.results
        .filter((r) => r.status === "FAIL")
        .forEach((r) => {
          this.log(`  • ${r.category}: ${r.message}`);
        });
    }
  }

  // Run all validations
  async run() {
    console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║            SAKHI CLINIC - APP VALIDATION SUITE                  ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝

Project Root: ${this.projectRoot}
Timestamp: ${new Date().toISOString()}
`);

    try {
      this.validateProjectStructure();
      this.validateDependencies();
      this.validateTestFiles();
      this.validateComponents();
      this.validateServices();
      this.validateHooks();
      this.validateStore();
      this.validateNoBOM();
      this.generateSummary();

      // Save summary
      this.saveReport();
    } catch (error) {
      console.error("Validation failed:", error);
      process.exit(1);
    }
  }

  saveReport() {
    const reportPath = path.join(this.projectRoot, "VALIDATION_REPORT.md");
    let report = `# SAKHI CLINIC - VALIDATION REPORT\n\nGenerated: ${new Date().toISOString()}\n\n`;

    this.results.forEach((r) => {
      report += `- ${r.status} ${r.category}: ${r.message}\n`;
    });

    fs.writeFileSync(reportPath, report);
    console.log(`\n📄 Report saved to: ${reportPath}`);
  }
}

// Run validation
const validator = new AppValidator();
validator.run().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

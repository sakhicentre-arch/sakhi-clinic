import { describe, expect, it } from "vitest";
import { planImportClinicBundle } from "../../services/clinicExportService";
import { verifyExportBundle } from "../../services/storageIntegrityService";

describe("backup/export bundle format", () => {
  it("accepts a valid clinic export bundle (v2) with operationalEvents", () => {
    const bundle: any = {
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      deviceId: "device-1",
      data: {
        patients: [{ id: "p1", name: "A", phone: "9999999999", gender: "Male" }],
        consultations: [{ id: "c1", patientId: "p1", date: "2026-01-01T10:00", clinicId: "Dabholi", chiefComplaint: "x", caseText: "", medicines: [], outcome: "NoChange" }],
        appointments: [],
        drafts: [],
        learning: [],
        caseMemory: [],
        syncOutbox: [],
        operationalEvents: [],
      },
    };

    const plan = planImportClinicBundle(bundle, "overwrite");
    expect(plan.incoming.patients).toBe(1);
    expect(plan.incoming.consultations).toBe(1);
    expect(plan.incoming.operationalEvents).toBe(0);

    const verified = verifyExportBundle(bundle);
    expect(verified.ok).toBe(true);
  });

  it("rejects malformed bundles missing data", () => {
    expect(() => planImportClinicBundle({ schemaVersion: 2 }, "overwrite")).toThrow();
  });

  it("verifyExportBundle rejects bundles missing operationalEvents", () => {
    const bundle: any = {
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      deviceId: "device-1",
      data: {
        patients: [],
        consultations: [],
        appointments: [],
        drafts: [],
        learning: [],
        caseMemory: [],
        syncOutbox: [],
      },
    };
    const verified = verifyExportBundle(bundle);
    expect(verified.ok).toBe(false);
  });
});


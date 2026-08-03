import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { indexedDB as fakeIndexedDB } from "fake-indexeddb";

/**
 * Payment Workflow completion: exportPaymentsCsv() is the only function in
 * csvExportService.ts this session added (exportPatientsCsv/exportAppointmentsCsv/
 * exportConsultationSummaryCsv already existed, wired into SettingsPage.tsx).
 * jsdom has no real Blob->text round-trip via URL.createObjectURL, so this
 * captures the Blob passed to it directly instead of trying to click the
 * download anchor and read a file.
 */

const DB_NAME = "SakhiClinicDB";

async function resetDatabase() {
  await new Promise<void>((resolve, reject) => {
    const req = fakeIndexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

let db: typeof import("../../services/db").db;
let svc: typeof import("../../services/csvExportService");

function readBlobAsText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

describe("csvExportService — exportPaymentsCsv", () => {
  let capturedBlob: Blob | null = null;

  beforeEach(async () => {
    vi.resetModules();
    await resetDatabase();
    const dbModule = await import("../../services/db");
    db = dbModule.db;
    await db.open();
    svc = await import("../../services/csvExportService");

    capturedBlob = null;
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn((blob: Blob) => {
        capturedBlob = blob;
        return "blob:mock-url";
      }),
      revokeObjectURL: vi.fn(),
    });
    // jsdom doesn't implement HTMLAnchorElement.click's default download
    // behavior -- stub it so the export function's a.click() is a no-op.
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });

  afterEach(async () => {
    db.close();
    await resetDatabase();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("includes only fee-bearing consultations, with patient names and payment fields resolved", async () => {
    await db.patients.add({
      id: "p1", name: "Deepa", gender: "Female", phone: "9000000000",
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    } as any);
    await db.consultations.add({
      id: "c1", patientId: "p1", date: "2026-01-05T10:00:00.000Z", clinicId: "Dabholi",
      chiefComplaint: "Test", caseText: "", medicines: [],
      fee: 500, amountReceived: 300, paymentStatus: "partial", paymentMode: "cash",
      paymentDate: "2026-01-05", paymentReferenceNumber: "REF-1", paymentNotes: "Partial",
    } as any);
    // No fee at all -- must be excluded from a payment export.
    await db.consultations.add({
      id: "c2", patientId: "p1", date: "2026-01-06T10:00:00.000Z", clinicId: "Dabholi",
      chiefComplaint: "Test", caseText: "", medicines: [], fee: 0,
    } as any);

    await svc.exportPaymentsCsv();

    expect(capturedBlob).not.toBeNull();
    const text = await readBlobAsText(capturedBlob!);
    expect(text).toContain("date,patientName,clinicId,fee,amountReceived,outstanding,paymentStatus,paymentMode,paymentDate,paymentReferenceNumber,paymentNotes");
    expect(text).toContain("Deepa");
    expect(text).toContain("REF-1");
    expect(text).toContain("200"); // outstanding = 500 - 300
    // Only one data row (c2 excluded) -- header + 1 line.
    expect(text.trim().split("\r\n")).toHaveLength(2);
  });

  it("produces a header-only CSV when there are no fee-bearing consultations", async () => {
    await svc.exportPaymentsCsv();
    const text = await readBlobAsText(capturedBlob!);
    expect(text.trim().split("\r\n")).toHaveLength(1);
  });
});

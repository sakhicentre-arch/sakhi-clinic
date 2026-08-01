import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { indexedDB as fakeIndexedDB } from "fake-indexeddb";

/**
 * Backup Engine architecture: StorageProvider abstraction + layered
 * pipeline (Planner -> Serializer -> Encryption -> Compression ->
 * IntegrityValidator -> StorageProvider), introduced ahead of Phase 3.
 *
 * Covers each layer in isolation, then an end-to-end export/import round
 * trip through the REAL pipeline (backupService.ts's public API, same as
 * SettingsPage/DashboardPage call), captured via the Blob passed to
 * URL.createObjectURL -- this is the actual file a doctor would download,
 * not a hand-built stand-in for it.
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

// jsdom does not implement URL.createObjectURL/revokeObjectURL at all (a
// known jsdom gap, not a Sakhi Clinic issue) -- define them fresh so
// downloadFile()'s real browser-standard call succeeds in tests the same
// way it does in an actual browser.
if (typeof URL.createObjectURL !== "function") {
  (URL as any).createObjectURL = () => "blob:test-url";
}
if (typeof URL.revokeObjectURL !== "function") {
  (URL as any).revokeObjectURL = () => {};
}

/** A minimal File-like object with a real, working text() -- avoids
 * depending on this jsdom version's File/Blob completeness, which is a
 * test-environment concern, not something the production code (which
 * correctly uses the standard File.text() API) should work around. */
function makeTestFile(content: string, name: string): File {
  return {
    name,
    size: content.length,
    text: async () => content,
  } as unknown as File;
}

describe("Backup Engine — compressionLayer", () => {
  it("round-trips arbitrary text through compress/decompress", async () => {
    const { compress, decompress } = await import("../../services/backup/compressionLayer");
    const original = JSON.stringify({ patients: [{ id: "P1", name: "Test Patient" }], note: "x".repeat(500) });

    const result = await compress(original);
    const restored = await decompress(result.content, result.compressed);

    expect(restored).toBe(original);
  });

  it("decompress is a no-op pass-through when the content was never compressed", async () => {
    const { decompress } = await import("../../services/backup/compressionLayer");
    const text = "plain uncompressed text";
    expect(await decompress(text, false)).toBe(text);
  });
});

describe("Backup Engine — encryptionLayer (honest no-op)", () => {
  it("never claims to encrypt", async () => {
    const { encrypt } = await import("../../services/backup/encryptionLayer");
    const result = await encrypt("secret-shaped content");
    expect(result.encrypted).toBe(false);
    expect(result.content).toBe("secret-shaped content");
  });

  it("refuses to silently pass through content claiming to be encrypted", async () => {
    const { decrypt } = await import("../../services/backup/encryptionLayer");
    await expect(decrypt("ciphertext-looking-data", true)).rejects.toThrow(/not yet implemented/i);
  });
});

describe("Backup Engine — integrityValidator", () => {
  it("computes a stable, deterministic checksum for identical content", async () => {
    const { computeChecksum } = await import("../../services/backup/integrityValidator");
    const a = await computeChecksum("same content");
    const b = await computeChecksum("same content");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/); // SHA-256 hex
  });

  it("detects tampering via verifyChecksum", async () => {
    const { computeChecksum, verifyChecksum } = await import("../../services/backup/integrityValidator");
    const checksum = await computeChecksum("original content");
    expect(await verifyChecksum("original content", checksum)).toBe(true);
    expect(await verifyChecksum("tampered content", checksum)).toBe(false);
  });

  it("validateBundleShape accepts a well-formed bundle and rejects a malformed one", async () => {
    const { validateBundleShape } = await import("../../services/backup/integrityValidator");
    const wellFormed: any = {
      schemaVersion: 2, exportedAt: new Date().toISOString(), deviceId: "d1",
      data: { patients: [], consultations: [], appointments: [], drafts: [], learning: [], caseMemory: [], syncOutbox: [], operationalEvents: [] },
    };
    expect((await validateBundleShape(wellFormed)).ok).toBe(true);

    const malformed: any = { schemaVersion: 2, data: {} };
    expect((await validateBundleShape(malformed)).ok).toBe(false);
  });
});

describe("Backup Engine — backupPlanner", () => {
  const originalGetItem = window.localStorage.getItem.bind(window.localStorage);

  afterEach(() => {
    window.localStorage.getItem = originalGetItem;
  });

  it("plans to run when no prior backup is recorded", async () => {
    vi.spyOn(window.localStorage, "getItem").mockReturnValue(null);
    const { planAutoBackup } = await import("../../services/backup/backupPlanner");
    const plan = planAutoBackup();
    expect(plan.shouldRun).toBe(true);
    expect(plan.kind).toBe("full");
  });

  it("does not plan to run when the last backup is recent", async () => {
    const now = new Date("2026-03-15T12:00:00.000Z");
    vi.spyOn(window.localStorage, "getItem").mockReturnValue(new Date(now.getTime() - 60_000).toISOString()); // 1 min ago
    const { planAutoBackup } = await import("../../services/backup/backupPlanner");
    const plan = planAutoBackup({ minHoursBetweenBackups: 6, now });
    expect(plan.shouldRun).toBe(false);
  });

  it("plans to run when the last backup is older than the threshold", async () => {
    const now = new Date("2026-03-15T12:00:00.000Z");
    vi.spyOn(window.localStorage, "getItem").mockReturnValue(new Date(now.getTime() - 7 * 3600_000).toISOString()); // 7h ago
    const { planAutoBackup } = await import("../../services/backup/backupPlanner");
    const plan = planAutoBackup({ minHoursBetweenBackups: 6, now });
    expect(plan.shouldRun).toBe(true);
  });

  it("manual backup always plans to run", async () => {
    const { planManualBackup } = await import("../../services/backup/backupPlanner");
    expect(planManualBackup().shouldRun).toBe(true);
  });
});

describe("Backup Engine — StorageProvider implementations", () => {
  it("localBackupProvider is always available and downloads on a non-silent save", async () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const { localBackupProvider } = await import("../../services/backup/providers/localBackupProvider");

    expect(localBackupProvider.available).toBe(true);
    const result = await localBackupProvider.save({ filename: "test.json", content: "{}", contentType: "application/json" });

    expect(result.ok).toBe(true);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    clickSpy.mockRestore();
  });

  it("localBackupProvider does not trigger a download for a silent save", async () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const { localBackupProvider } = await import("../../services/backup/providers/localBackupProvider");

    const result = await localBackupProvider.save({ filename: "test.json", content: "{}", contentType: "application/json", silent: true });

    expect(result.ok).toBe(true);
    expect(clickSpy).not.toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  it("googleDriveProvider is honestly unavailable and never claims to save", async () => {
    const { googleDriveProvider } = await import("../../services/backup/providers/googleDriveProvider");

    expect(googleDriveProvider.available).toBe(false);
    const result = await googleDriveProvider.save({ filename: "x.json", content: "{}", contentType: "application/json" });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not connected/i);

    expect(await googleDriveProvider.list?.()).toEqual([]);
    expect(await googleDriveProvider.load?.("anything")).toBeNull();
  });
});

describe("Backup Engine — end-to-end export/import through backupService.ts", () => {
  let db: typeof import("../../services/db").db;

  beforeEach(async () => {
    vi.resetModules();
    await resetDatabase();
    const dbModule = await import("../../services/db");
    db = dbModule.db;
    await db.open();
    await db.patients.add({
      id: "P-BACKUP-1", name: "Backup Test Patient", gender: "Female", phone: "9000000001",
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    } as any);
  });

  afterEach(async () => {
    db.close();
    await resetDatabase();
  });

  it("exports through the real pipeline, producing a compressed envelope that imports back cleanly", async () => {
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    vi.spyOn(URL, "createObjectURL").mockImplementation(() => "blob:mock-url");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    // Capture at the Blob constructor rather than reading the Blob back --
    // this jsdom/Node environment's Blob and Response don't interoperate
    // (a test-environment gap, not a production concern), but the parts
    // array passed into `new Blob([content], opts)` is exactly the string
    // downloadFile() was given, with no interop layer in between.
    const OriginalBlob = global.Blob;
    let capturedContent: string | null = null;
    vi.spyOn(global, "Blob").mockImplementation((parts: any, opts: any) => {
      capturedContent = Array.isArray(parts) ? parts.join("") : String(parts);
      return new OriginalBlob(parts, opts);
    });

    const { exportBackup, importBackup } = await import("../../services/backupService");
    await exportBackup();

    expect(capturedContent).not.toBeNull();
    const envelopeJson = capturedContent as unknown as string;
    const envelope = JSON.parse(envelopeJson);
    expect(envelope.sakhiBackupEnvelope).toBe(1);
    expect(envelope.encrypted).toBe(false); // honest -- encryption is not implemented yet

    // Wipe the DB clean, then restore from the exported file -- proves the
    // round trip actually recovers data, not just that export "succeeded."
    await db.patients.clear();
    expect(await db.patients.count()).toBe(0);

    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(window, "alert").mockImplementation(() => {});

    const file = makeTestFile(envelopeJson, "sakhi-backup-test.json");
    await importBackup(file);

    const restored = await db.patients.toArray();
    expect(restored).toHaveLength(1);
    expect(restored[0].name).toBe("Backup Test Patient");
  });

  it("still imports a plain, uncompressed legacy-format backup file (no envelope wrapper)", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(window, "alert").mockImplementation(() => {});

    const legacyBundle = {
      schemaVersion: 2,
      exportedAt: "2026-01-01T00:00:00.000Z",
      deviceId: "legacy-device",
      data: {
        patients: [{ id: "P-LEGACY-1", name: "Legacy Format Patient", phone: "9000000002", gender: "Male" }],
        consultations: [], appointments: [], drafts: [], learning: [], caseMemory: [], syncOutbox: [], operationalEvents: [],
      },
    };

    const { importBackup } = await import("../../services/backupService");
    const file = makeTestFile(JSON.stringify(legacyBundle), "legacy-backup.json");
    await importBackup(file);

    const patients = await db.patients.toArray();
    expect(patients.map((p) => p.id)).toContain("P-LEGACY-1");
  });

  it("does not restore anything if the doctor cancels the confirm dialog", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);

    const legacyBundle = {
      schemaVersion: 2, exportedAt: "2026-01-01T00:00:00.000Z", deviceId: "d1",
      data: {
        patients: [{ id: "P-SHOULD-NOT-IMPORT", name: "Should Not Appear", phone: "9", gender: "Male" }],
        consultations: [], appointments: [], drafts: [], learning: [], caseMemory: [], syncOutbox: [], operationalEvents: [],
      },
    };

    const { importBackup } = await import("../../services/backupService");
    const file = makeTestFile(JSON.stringify(legacyBundle), "backup.json");
    await importBackup(file);

    const patients = await db.patients.toArray();
    expect(patients.map((p) => p.id)).not.toContain("P-SHOULD-NOT-IMPORT");
    // The original patient (seeded in beforeEach) must still be there -- a
    // cancelled restore must not have touched existing data at all.
    expect(patients.map((p) => p.id)).toContain("P-BACKUP-1");
  });

  it("rejects an envelope whose checksum does not match (corruption detection)", async () => {
    vi.spyOn(window, "alert").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    const tamperedEnvelope = {
      sakhiBackupEnvelope: 1,
      compressed: false,
      encrypted: false,
      checksum: "0".repeat(64), // deliberately wrong
      payload: JSON.stringify({
        schemaVersion: 2, exportedAt: "2026-01-01T00:00:00.000Z", deviceId: "d1",
        data: { patients: [], consultations: [], appointments: [], drafts: [], learning: [], caseMemory: [], syncOutbox: [], operationalEvents: [] },
      }),
    };

    const { importBackup } = await import("../../services/backupService");
    const file = makeTestFile(JSON.stringify(tamperedEnvelope), "corrupt.json");
    await importBackup(file);

    expect(window.alert).toHaveBeenCalledWith(expect.stringMatching(/restore failed/i));
  });

  it("runAutoBackupIfDue never triggers a download (silent) and never alerts on failure", async () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    vi.spyOn(window.localStorage, "getItem").mockReturnValue(null); // no prior backup -> due

    const { runAutoBackupIfDue } = await import("../../services/backupService");
    await runAutoBackupIfDue({ reason: "test" });

    expect(clickSpy).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });
});

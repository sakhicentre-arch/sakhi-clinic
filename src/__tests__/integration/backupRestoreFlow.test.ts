import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { indexedDB as fakeIndexedDB } from "fake-indexeddb";
import type { StorageProvider } from "../../services/backup/storageProvider";

/**
 * Covers the restore-specific work in this iteration:
 *   - the pre-restore safety snapshot (a local backup taken right before
 *     every restore's destructive overwrite) shows up in history without
 *     displacing the restore job itself as "most recent" -- the exact
 *     bug that made an earlier attempt at this get reverted.
 *   - the preview/confirm restore flow (previewLocalFile/
 *     previewRemoteBackup + confirmPendingRestore/cancelPendingRestore),
 *     which replaced a blocking native window.confirm() with real in-app
 *     validation the doctor can review before committing.
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

if (typeof URL.createObjectURL !== "function") {
  (URL as any).createObjectURL = () => "blob:test-url";
}
if (typeof URL.revokeObjectURL !== "function") {
  (URL as any).revokeObjectURL = () => {};
}

function makeTestFile(content: string, name: string): File {
  return { name, size: content.length, text: async () => content } as unknown as File;
}

const VALID_BUNDLE = {
  schemaVersion: 2,
  exportedAt: "2026-01-15T09:30:00.000Z",
  deviceId: "device-restore-test",
  data: { patients: [{ id: "p1" }], consultations: [{ id: "c1" }, { id: "c2" }], appointments: [], drafts: [], learning: [], caseMemory: [], syncOutbox: [], operationalEvents: [] },
};

function makeFakeRemoteProvider(overrides?: Partial<StorageProvider>): StorageProvider {
  return {
    id: "fake-remote",
    label: "Fake Remote",
    available: true,
    save: vi.fn(async () => ({ ok: true, location: "Saved to Fake Remote" })),
    ...overrides,
  };
}

describe("Restore flow: safety snapshot + preview/confirm", () => {
  let db: typeof import("../../services/db").db;

  beforeEach(async () => {
    vi.resetModules();
    await resetDatabase();
    const dbModule = await import("../../services/db");
    db = dbModule.db;
    await db.open();
    await db.patients.add({
      id: "existing-1", name: "Pre-restore Patient", phone: "9000000000",
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    } as any);
    vi.spyOn(window, "alert").mockImplementation(() => {});
  });

  afterEach(async () => {
    const { resetActiveProviderToLocal } = await import("../../services/backup/backupManager");
    resetActiveProviderToLocal();
    db.close();
    await resetDatabase();
  });

  it("takes a local safety snapshot before a restore, without it displacing the restore job as most recent", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { runImport } = await import("../../services/backup/backupManager");
    const { listRecentJobs } = await import("../../services/backup/backupJobService");

    const file = makeTestFile(JSON.stringify(VALID_BUNDLE), "backup.json");
    await runImport(file);

    const jobs = await listRecentJobs(5);
    expect(jobs[0].kind).toBe("restore"); // still reported as most recent
    expect(jobs[0].status).toBe("succeeded");
    expect(jobs[0].providerId).toBe("local");

    const snapshotJob = jobs.find((j) => j.kind === "auto");
    expect(snapshotJob).toBeDefined(); // the safety snapshot really happened
    expect(snapshotJob?.status).toBe("succeeded");
  });

  it("previewLocalFile validates without restoring -- no data is overwritten until confirmed", async () => {
    const { previewLocalFile } = await import("../../services/backup/backupManager");

    const file = makeTestFile(JSON.stringify(VALID_BUNDLE), "my-backup.json");
    const result = await previewLocalFile(file);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.preview).toMatchObject({
      filename: "my-backup.json",
      exportedAt: "2026-01-15T09:30:00.000Z",
      deviceId: "device-restore-test",
      patients: 1,
      consultations: 2,
    });

    // Existing data untouched -- preview alone never restores.
    const existing = await db.patients.get("existing-1");
    expect(existing).toBeDefined();
  });

  it("confirmPendingRestore actually restores after a preview, including the safety snapshot", async () => {
    const { previewLocalFile, confirmPendingRestore } = await import("../../services/backup/backupManager");
    const { listRecentJobs } = await import("../../services/backup/backupJobService");

    const file = makeTestFile(JSON.stringify(VALID_BUNDLE), "backup.json");
    const preview = await previewLocalFile(file);
    expect(preview.ok).toBe(true);
    if (!preview.ok) throw new Error("expected ok");

    const result = await confirmPendingRestore(preview.token);
    expect(result.ok).toBe(true);

    // Original patient replaced by the restored bundle's data.
    const existing = await db.patients.get("existing-1");
    expect(existing).toBeUndefined();

    const jobs = await listRecentJobs(5);
    expect(jobs[0].kind).toBe("restore");
    expect(jobs.some((j) => j.kind === "auto")).toBe(true); // safety snapshot present here too
  });

  it("cancelPendingRestore discards the preview -- nothing is restored", async () => {
    const { previewLocalFile, cancelPendingRestore, confirmPendingRestore } = await import("../../services/backup/backupManager");

    const file = makeTestFile(JSON.stringify(VALID_BUNDLE), "backup.json");
    const preview = await previewLocalFile(file);
    if (!preview.ok) throw new Error("expected ok");

    cancelPendingRestore();

    const result = await confirmPendingRestore(preview.token);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/expired/i);

    const existing = await db.patients.get("existing-1");
    expect(existing).toBeDefined(); // untouched
  });

  it("confirmPendingRestore rejects a stale/unknown token cleanly", async () => {
    const { confirmPendingRestore } = await import("../../services/backup/backupManager");
    const result = await confirmPendingRestore("not-a-real-token");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/expired/i);
  });

  it("previewLocalFile fails cleanly on a corrupted checksum, without ever reaching restore", async () => {
    const { previewLocalFile } = await import("../../services/backup/backupManager");
    const corruptEnvelope = {
      sakhiBackupEnvelope: 1,
      compressed: false,
      encrypted: false,
      checksum: "definitely-wrong-checksum",
      payload: JSON.stringify(VALID_BUNDLE),
    };
    const file = makeTestFile(JSON.stringify(corruptEnvelope), "corrupt.json");
    const result = await previewLocalFile(file);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error).toMatch(/integrity check/i);

    const existing = await db.patients.get("existing-1");
    expect(existing).toBeDefined(); // untouched
  });

  it("previewRemoteBackup downloads via the active provider and validates, without restoring", async () => {
    const { setActiveProvider, previewRemoteBackup } = await import("../../services/backup/backupManager");

    setActiveProvider(
      makeFakeRemoteProvider({
        load: vi.fn(async (filename: string) => (filename === "cloud-backup.json" ? JSON.stringify(VALID_BUNDLE) : null)),
      })
    );

    const result = await previewRemoteBackup("cloud-backup.json");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.preview.patients).toBe(1);
    expect(result.preview.consultations).toBe(2);

    const existing = await db.patients.get("existing-1");
    expect(existing).toBeDefined(); // untouched -- preview only
  });

  it("previewRemoteBackup fails cleanly when the provider can't download", async () => {
    const { setActiveProvider, previewRemoteBackup } = await import("../../services/backup/backupManager");
    setActiveProvider(makeFakeRemoteProvider()); // no load()

    const result = await previewRemoteBackup("whatever.json");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error).toMatch(/does not support restoring directly/i);
  });
});

import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { indexedDB as fakeIndexedDB } from "fake-indexeddb";
import type { StorageProvider } from "../../services/backup/storageProvider";

/**
 * Covers the two pieces of the backup redesign that aren't plain
 * export/import: restore dispatch (listRestorableBackups /
 * runImportFromProvider -- "no UI branching outside BackupManager") and
 * the automatic-backup fallback (Automatic Backup targets the connected
 * destination, but silently falls back to local + logs a notification
 * if that destination is unavailable, rather than failing unattended).
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

function makeFakeRemoteProvider(overrides?: Partial<StorageProvider>): StorageProvider {
  return {
    id: "fake-remote",
    label: "Fake Remote",
    available: true,
    save: vi.fn(async () => ({ ok: true, location: "Saved to Fake Remote" })),
    ...overrides,
  };
}

describe("Backup provider dispatch (restore listing/download, auto-backup fallback)", () => {
  let db: typeof import("../../services/db").db;

  beforeEach(async () => {
    vi.resetModules();
    await resetDatabase();
    const dbModule = await import("../../services/db");
    db = dbModule.db;
    await db.open();
    // A real backup+restore round trip needs actual clinic data to
    // serialize -- one minimal patient is enough for the pipeline to run.
    await db.patients.add({
      id: "p1", name: "Test Patient", phone: "9999999999", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    } as any);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(window, "alert").mockImplementation(() => {});
  });

  afterEach(async () => {
    const { resetActiveProviderToLocal } = await import("../../services/backup/backupManager");
    resetActiveProviderToLocal();
    db.close();
    await resetDatabase();
  });

  it("listRestorableBackups() delegates to the active provider's list(), empty array if it can't list", async () => {
    const { setActiveProvider, listRestorableBackups } = await import("../../services/backup/backupManager");

    setActiveProvider(makeFakeRemoteProvider()); // no list() defined
    expect(await listRestorableBackups()).toEqual([]);

    setActiveProvider(
      makeFakeRemoteProvider({
        list: vi.fn(async () => [{ filename: "backup-1.json", sizeBytes: 1024, createdAt: "2026-01-01T00:00:00.000Z" }]),
      })
    );
    expect(await listRestorableBackups()).toEqual([{ filename: "backup-1.json", sizeBytes: 1024, createdAt: "2026-01-01T00:00:00.000Z" }]);
  });

  it("runImportFromProvider() downloads via load() and restores through the same core as a local restore", async () => {
    const { setActiveProvider, runExport, runImportFromProvider } = await import("../../services/backup/backupManager");
    const { listRecentJobs } = await import("../../services/backup/backupJobService");

    // Round-trip: export through the fake remote (captures exactly what
    // was uploaded), then feed that same content back through load().
    let uploaded = "";
    setActiveProvider(
      makeFakeRemoteProvider({
        save: vi.fn(async (input) => {
          uploaded = input.content;
          return { ok: true, location: "Saved to Fake Remote" };
        }),
        load: vi.fn(async () => uploaded),
      })
    );
    await runExport();

    const result = await runImportFromProvider("clinic-backup.json");
    expect(result.ok).toBe(true);

    const jobs = await listRecentJobs(2);
    const restoreJob = jobs.find((j) => j.kind === "restore");
    expect(restoreJob?.status).toBe("succeeded");
    expect(restoreJob?.providerId).toBe("fake-remote");
  });

  it("runImportFromProvider() fails clearly (no crash) when the provider can't download", async () => {
    const { setActiveProvider, runImportFromProvider } = await import("../../services/backup/backupManager");

    setActiveProvider(makeFakeRemoteProvider()); // no load()
    const result = await runImportFromProvider("whatever.json");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/does not support restoring directly/i);
  });

  it("automatic backup targets the connected destination when it's available", async () => {
    const { setActiveProvider, runAutoIfDue } = await import("../../services/backup/backupManager");
    const { listRecentJobs } = await import("../../services/backup/backupJobService");

    const provider = makeFakeRemoteProvider({ available: true });
    setActiveProvider(provider);

    await runAutoIfDue({ minHoursBetweenBackups: 0 });

    expect(provider.save).toHaveBeenCalledTimes(1);
    const [job] = await listRecentJobs(1);
    expect(job.providerId).toBe("fake-remote");
  });

  it("automatic backup falls back to local (and logs a notification) when the chosen destination is unavailable", async () => {
    const { setActiveProvider, runAutoIfDue } = await import("../../services/backup/backupManager");
    const { listRecentJobs } = await import("../../services/backup/backupJobService");
    const { getRecentOperationalEvents } = await import("../../services/operationalEventLogService");

    const disconnectedProvider = makeFakeRemoteProvider({ available: false });
    setActiveProvider(disconnectedProvider);

    await runAutoIfDue({ minHoursBetweenBackups: 0 });

    expect(disconnectedProvider.save).not.toHaveBeenCalled();
    const [job] = await listRecentJobs(1);
    expect(job.providerId).toBe("local"); // fell back, not a failed job against the unavailable provider
    expect(job.status).toBe("succeeded");

    const events = await getRecentOperationalEvents(20);
    expect(events.some((e) => e.type === "backup.auto.destination_unavailable")).toBe(true);
  });

  it("manual export does NOT fall back -- an unavailable destination fails visibly instead of silently redirecting", async () => {
    const { setActiveProvider, runExport } = await import("../../services/backup/backupManager");
    const { listRecentJobs } = await import("../../services/backup/backupJobService");

    setActiveProvider(
      makeFakeRemoteProvider({
        available: false,
        save: vi.fn(async () => ({ ok: false, error: "Fake Remote is not connected." })),
      })
    );

    await runExport();

    const [job] = await listRecentJobs(1);
    expect(job.providerId).toBe("fake-remote"); // NOT silently switched to local
    expect(job.status).toBe("failed");
  });
});

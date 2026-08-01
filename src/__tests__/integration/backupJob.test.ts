import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { indexedDB as fakeIndexedDB } from "fake-indexeddb";
import type { StorageProvider, StorageProviderSaveInput, StorageProviderSaveResult } from "../../services/backup/storageProvider";

/**
 * Pre-Phase-3: every backup operation produces a structured BackupJob
 * record with lifecycle states and progress events, and the Backup
 * Manager stays completely provider-agnostic -- proven here by actually
 * swapping in a fake StorageProvider (not just asserting it structurally
 * could be swapped) and confirming the exact same job-tracking behavior.
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

/** A fake provider that is NOT localBackupProvider -- used to prove the
 * manager genuinely routes through whichever provider is active, rather
 * than being hardcoded to the local one. Reports progress in two steps,
 * like a real chunked upload would. */
function makeFakeRemoteProvider(overrides?: Partial<StorageProvider>): StorageProvider {
  return {
    id: "fake-remote",
    label: "Fake Remote",
    available: true,
    save: vi.fn(async (input: StorageProviderSaveInput): Promise<StorageProviderSaveResult> => {
      input.onProgress?.(50, "Uploading... 50%");
      input.onProgress?.(100, "Upload complete");
      return { ok: true, location: "Saved to Fake Remote" };
    }),
    ...overrides,
  };
}

describe("BackupJob lifecycle (backupJobService)", () => {
  let db: typeof import("../../services/db").db;
  let jobSvc: typeof import("../../services/backup/backupJobService");

  beforeEach(async () => {
    vi.resetModules();
    await resetDatabase();
    const dbModule = await import("../../services/db");
    db = dbModule.db;
    await db.open();
    jobSvc = await import("../../services/backup/backupJobService");
  });

  afterEach(async () => {
    db.close();
    await resetDatabase();
  });

  it("creates a job in 'queued' status with no events", async () => {
    const job = await jobSvc.createJob("export", "local");
    expect(job.status).toBe("queued");
    expect(job.events).toEqual([]);
    expect(job.kind).toBe("export");
    expect(job.providerId).toBe("local");
  });

  it("moves a job to 'running' on its first recorded event, and appends subsequent events in order", async () => {
    const job = await jobSvc.createJob("export", "local");
    await jobSvc.recordEvent(job.id, "planning", "Planning backup");
    const afterFirst = await jobSvc.getJob(job.id);
    expect(afterFirst?.status).toBe("running");
    expect(afterFirst?.events).toHaveLength(1);

    await jobSvc.recordEvent(job.id, "serializing", "Serialized bundle", { progressPercent: 40 });
    const afterSecond = await jobSvc.getJob(job.id);
    expect(afterSecond?.events).toHaveLength(2);
    expect(afterSecond?.events[0].stage).toBe("planning");
    expect(afterSecond?.events[1].stage).toBe("serializing");
    expect(afterSecond?.events[1].progressPercent).toBe(40);
  });

  it("completeJob marks the job succeeded, records sizeBytes/filename, and appends a terminal event", async () => {
    const job = await jobSvc.createJob("export", "local");
    await jobSvc.recordEvent(job.id, "saving", "Saving");
    const completed = await jobSvc.completeJob(job.id, { sizeBytes: 1234, filename: "backup.json" });

    expect(completed?.status).toBe("succeeded");
    expect(completed?.sizeBytes).toBe(1234);
    expect(completed?.filename).toBe("backup.json");
    expect(completed?.completedAt).toBeDefined();
    expect(completed?.events[completed.events.length - 1].stage).toBe("done");
  });

  it("failJob marks the job failed and records the error on both the job and the terminal event", async () => {
    const job = await jobSvc.createJob("export", "local");
    const failed = await jobSvc.failJob(job.id, "Disk full");

    expect(failed?.status).toBe("failed");
    expect(failed?.error).toBe("Disk full");
    expect(failed?.events[failed.events.length - 1].message).toMatch(/disk full/i);
  });

  it("cancelJob marks the job cancelled, distinct from failed", async () => {
    const job = await jobSvc.createJob("restore", "local");
    const cancelled = await jobSvc.cancelJob(job.id, "Doctor declined");

    expect(cancelled?.status).toBe("cancelled");
    expect(cancelled?.status).not.toBe("failed");
  });

  it("listRecentJobs returns jobs newest-first and respects the limit", async () => {
    const j1 = await jobSvc.createJob("export", "local");
    await new Promise((r) => setTimeout(r, 2));
    const j2 = await jobSvc.createJob("export", "local");
    await new Promise((r) => setTimeout(r, 2));
    const j3 = await jobSvc.createJob("export", "local");

    const recent = await jobSvc.listRecentJobs(2);
    expect(recent).toHaveLength(2);
    expect(recent[0].id).toBe(j3.id);
    expect(recent[1].id).toBe(j2.id);
    expect(recent.find((j) => j.id === j1.id)).toBeUndefined();
  });
});

describe("Backup Manager provider-agnosticism", () => {
  let db: typeof import("../../services/db").db;

  beforeEach(async () => {
    vi.resetModules();
    await resetDatabase();
    const dbModule = await import("../../services/db");
    db = dbModule.db;
    await db.open();
    await db.patients.add({
      id: "P-JOB-1", name: "Job Test Patient", gender: "Female", phone: "9000000001",
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    } as any);
  });

  afterEach(async () => {
    const { resetActiveProviderToLocal } = await import("../../services/backup/backupManager");
    resetActiveProviderToLocal();
    db.close();
    await resetDatabase();
  });

  it("runs the exact same export pipeline through a completely different StorageProvider with zero manager code changes", async () => {
    const { setActiveProvider, getActiveProvider, runExport } = await import("../../services/backup/backupManager");
    const { listRecentJobs } = await import("../../services/backup/backupJobService");

    const fakeProvider = makeFakeRemoteProvider();
    setActiveProvider(fakeProvider);
    expect(getActiveProvider().id).toBe("fake-remote");

    await runExport();

    expect(fakeProvider.save).toHaveBeenCalledTimes(1);
    const [jobs] = [await listRecentJobs(1)];
    expect(jobs[0].providerId).toBe("fake-remote");
    expect(jobs[0].status).toBe("succeeded");
  });

  it("translates a provider's onProgress calls into BackupJob progress events, without the provider knowing jobs exist", async () => {
    const { setActiveProvider, runExport } = await import("../../services/backup/backupManager");
    const { listRecentJobs } = await import("../../services/backup/backupJobService");

    setActiveProvider(makeFakeRemoteProvider());
    await runExport();

    const [job] = await listRecentJobs(1);
    const savingEvents = job.events.filter((e) => e.stage === "saving");
    // Two onProgress calls (50%, 100%) plus the manager's own final "Saved" event.
    expect(savingEvents.length).toBeGreaterThanOrEqual(2);
    expect(savingEvents.some((e) => e.progressPercent === 50)).toBe(true);
  });

  it("a failing provider produces a failed BackupJob with the provider's own error message, and never crashes the app", async () => {
    const { setActiveProvider, runExport } = await import("../../services/backup/backupManager");
    const { listRecentJobs } = await import("../../services/backup/backupJobService");
    vi.spyOn(window, "alert").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    setActiveProvider(
      makeFakeRemoteProvider({
        save: vi.fn(async () => ({ ok: false, error: "Fake Remote: quota exceeded" })),
      })
    );

    await runExport();

    const [job] = await listRecentJobs(1);
    expect(job.status).toBe("failed");
    expect(job.error).toMatch(/quota exceeded/i);
    expect(window.alert).toHaveBeenCalled();
  });

  it("switching providers mid-session (e.g. Drive connects, then disconnects) is reflected on the very next job", async () => {
    const { setActiveProvider, resetActiveProviderToLocal, runExport } = await import("../../services/backup/backupManager");
    const { listRecentJobs } = await import("../../services/backup/backupJobService");
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    setActiveProvider(makeFakeRemoteProvider());
    await runExport();

    resetActiveProviderToLocal();
    await runExport();

    const jobs = await listRecentJobs(2);
    expect(jobs[0].providerId).toBe("local"); // most recent
    expect(jobs[1].providerId).toBe("fake-remote");
  });

  it("restore is also tracked as a BackupJob (kind 'restore')", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(window, "alert").mockImplementation(() => {});

    const { runImport } = await import("../../services/backup/backupManager");
    const { listRecentJobs } = await import("../../services/backup/backupJobService");

    const legacyBundle = {
      schemaVersion: 2, exportedAt: "2026-01-01T00:00:00.000Z", deviceId: "d1",
      data: { patients: [], consultations: [], appointments: [], drafts: [], learning: [], caseMemory: [], syncOutbox: [], operationalEvents: [] },
    };
    const file = makeTestFile(JSON.stringify(legacyBundle), "backup.json");
    await runImport(file);

    const [job] = await listRecentJobs(1);
    expect(job.kind).toBe("restore");
    expect(job.status).toBe("succeeded");
  });

  it("a cancelled restore (doctor declines the confirm dialog) produces a cancelled job, not a failed one", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);

    const { runImport } = await import("../../services/backup/backupManager");
    const { listRecentJobs } = await import("../../services/backup/backupJobService");

    const legacyBundle = {
      schemaVersion: 2, exportedAt: "2026-01-01T00:00:00.000Z", deviceId: "d1",
      data: { patients: [], consultations: [], appointments: [], drafts: [], learning: [], caseMemory: [], syncOutbox: [], operationalEvents: [] },
    };
    const file = makeTestFile(JSON.stringify(legacyBundle), "backup.json");
    await runImport(file);

    const [job] = await listRecentJobs(1);
    expect(job.status).toBe("cancelled");
  });
});

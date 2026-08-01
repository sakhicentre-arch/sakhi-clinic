import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { indexedDB as fakeIndexedDB } from "fake-indexeddb";
import type { StorageProvider, StorageProviderSaveInput, StorageProviderSaveResult } from "../../services/backup/storageProvider";

/**
 * Phase 3: retry/backoff scheduling and the new post-save verification
 * stage, exercised through the real backupManager pipeline (not just the
 * pure backoff-math function) so the auto-scheduling-on-first-failure
 * design gap identified during implementation -- a job that fails on its
 * FIRST attempt must still get nextRetryAt set, otherwise the retry sweep
 * (listJobsDueForRetry) would never find it -- is actually proven, not
 * just asserted by inspection.
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

const CAPS = {
  supportsUpload: true,
  supportsDownload: true,
  supportsDelete: false,
  supportsList: false,
  supportsVersioning: false,
  supportsIncremental: false,
  supportsStreaming: true,
  supportsEncryption: false,
  supportsConflictResolution: false,
};

function makeAlwaysFailingProvider(errorMessage = "Fake Remote: quota exceeded"): StorageProvider {
  return {
    id: "fake-remote",
    label: "Fake Remote",
    available: true,
    capabilities: CAPS,
    save: vi.fn(async (): Promise<StorageProviderSaveResult> => ({ ok: false, error: errorMessage })),
  };
}

/** Captures whatever content was saved and can play it back (correctly, or corrupted) via load(). */
function makeVerifyingProvider(input?: { corrupt?: boolean }): StorageProvider {
  let savedContent: string | null = null;
  return {
    id: "fake-verifying",
    label: "Fake Verifying",
    available: true,
    capabilities: CAPS,
    save: vi.fn(async (saveInput: StorageProviderSaveInput): Promise<StorageProviderSaveResult> => {
      savedContent = saveInput.content;
      return { ok: true, location: "Saved to Fake Verifying" };
    }),
    load: vi.fn(async (): Promise<string | null> => {
      if (savedContent == null) return null;
      return input?.corrupt ? savedContent + "-CORRUPTED" : savedContent;
    }),
  };
}

/** No load() at all -- proves the verification stage is skipped entirely for providers that can't support it. */
function makeNonVerifyingProvider(): StorageProvider {
  return {
    id: "fake-no-verify",
    label: "Fake No Verify",
    available: true,
    capabilities: CAPS,
    save: vi.fn(async (): Promise<StorageProviderSaveResult> => ({ ok: true, location: "Saved" })),
  };
}

describe("computeNextRetryDelayMs (pure backoff math)", () => {
  it("doubles from a 30s base and caps at 30 minutes", async () => {
    const { computeNextRetryDelayMs } = await import("../../services/backup/backupJobService");
    expect(computeNextRetryDelayMs(0)).toBe(30_000);
    expect(computeNextRetryDelayMs(1)).toBe(60_000);
    expect(computeNextRetryDelayMs(2)).toBe(120_000);
    expect(computeNextRetryDelayMs(3)).toBe(240_000);
    expect(computeNextRetryDelayMs(20)).toBe(30 * 60_000); // capped
  });
});

describe("Backup retry/backoff + post-save verification (via backupManager pipeline)", () => {
  let db: typeof import("../../services/db").db;

  beforeEach(async () => {
    vi.resetModules();
    await resetDatabase();
    const dbModule = await import("../../services/db");
    db = dbModule.db;
    await db.open();
    await db.patients.add({
      id: "P-RETRY-1",
      name: "Retry Test Patient",
      gender: "Female",
      phone: "9000000002",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    } as any);
    vi.spyOn(window, "alert").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(async () => {
    const { resetActiveProviderToLocal } = await import("../../services/backup/backupManager");
    resetActiveProviderToLocal();
    db.close();
    await resetDatabase();
    vi.restoreAllMocks();
  });

  it("a job that fails on its FIRST attempt is auto-scheduled for retry (retryCount=1, nextRetryAt set)", async () => {
    const { setActiveProvider, runExport } = await import("../../services/backup/backupManager");
    const { listRecentJobs } = await import("../../services/backup/backupJobService");

    setActiveProvider(makeAlwaysFailingProvider());
    await runExport();

    const [job] = await listRecentJobs(1);
    expect(job.status).toBe("failed");
    expect(job.retryCount).toBe(1);
    expect(job.nextRetryAt).toBeDefined();
    expect(job.failureReason).toBe("quota");
  });

  it("listJobsDueForRetry finds that first-failure job once its backoff window has passed, and not before", async () => {
    const { setActiveProvider, runExport } = await import("../../services/backup/backupManager");
    const { listJobsDueForRetry } = await import("../../services/backup/backupJobService");

    setActiveProvider(makeAlwaysFailingProvider());
    await runExport();

    const notYetDue = await listJobsDueForRetry(new Date("2026-01-01T00:00:00.000Z"));
    expect(notYetDue).toHaveLength(0);

    const due = await listJobsDueForRetry(new Date(Date.now() + 31_000));
    expect(due).toHaveLength(1);
  });

  it("retryEligibleBackupJobs sweeps due jobs, retries them via the SAME job id, and reschedules again on continued failure", async () => {
    const { setActiveProvider, runExport } = await import("../../services/backup/backupManager");
    const { listRecentJobs } = await import("../../services/backup/backupJobService");
    const { retryEligibleBackupJobs } = await import("../../services/backup/backupRetryService");

    setActiveProvider(makeAlwaysFailingProvider());
    await runExport();
    const [firstFailure] = await listRecentJobs(1);

    const summary = await retryEligibleBackupJobs(new Date(Date.now() + 31_000));
    expect(summary.attempted).toBe(1);
    expect(summary.stillFailed).toBe(1);
    expect(summary.succeeded).toBe(0);

    const [afterRetry] = await listRecentJobs(1);
    expect(afterRetry.id).toBe(firstFailure.id); // same job, not a new one
    expect(afterRetry.retryCount).toBe(2);
    expect(afterRetry.events.length).toBeGreaterThan(firstFailure.events.length);
  });

  it("retryEligibleBackupJobs marks a job succeeded once the provider (or connection) recovers", async () => {
    const { setActiveProvider, runExport } = await import("../../services/backup/backupManager");
    const { listRecentJobs } = await import("../../services/backup/backupJobService");
    const { retryEligibleBackupJobs } = await import("../../services/backup/backupRetryService");

    setActiveProvider(makeAlwaysFailingProvider());
    await runExport();

    // Provider comes back online before the retry sweep runs.
    setActiveProvider(makeNonVerifyingProvider());

    const summary = await retryEligibleBackupJobs(new Date(Date.now() + 31_000));
    expect(summary.succeeded).toBe(1);
    expect(summary.stillFailed).toBe(0);

    const [job] = await listRecentJobs(1);
    expect(job.status).toBe("succeeded");
  });

  it("a job under its retry cap is never abandoned, but a job at its cap is excluded from the sweep", async () => {
    const { setActiveProvider, runExport } = await import("../../services/backup/backupManager");
    const { listRecentJobs, getJob } = await import("../../services/backup/backupJobService");
    const { retryEligibleBackupJobs } = await import("../../services/backup/backupRetryService");

    setActiveProvider(makeAlwaysFailingProvider());
    await runExport();
    const [job] = await listRecentJobs(1);
    expect(job.maxRetries).toBe(3);

    // Exhaust all retries (retryCount 1 -> 2 -> 3, hitting the cap).
    await retryEligibleBackupJobs(new Date(Date.now() + 31_000));
    await retryEligibleBackupJobs(new Date(Date.now() + 5 * 60_000));
    const capped = await getJob(job.id);
    expect(capped?.retryCount).toBe(3);

    const finalSummary = await retryEligibleBackupJobs(new Date(Date.now() + 60 * 60_000));
    expect(finalSummary.attempted).toBe(0); // capped job is no longer eligible
  });

  it("retryJob refuses to retry a restore job", async () => {
    const { retryJob } = await import("../../services/backup/backupManager");
    const { createJob, failJob } = await import("../../services/backup/backupJobService");

    const job = await createJob("restore", "local");
    await failJob(job.id, "Some restore failure");

    const result = await retryJob(job.id);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/restore/i);
  });

  it("retryJob refuses to retry a job that is not currently failed", async () => {
    const { retryJob } = await import("../../services/backup/backupManager");
    const { createJob } = await import("../../services/backup/backupJobService");

    const queuedJob = await createJob("export", "local");
    const result = await retryJob(queuedJob.id);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/failed/i);
  });

  it("post-save verification passes when the readback checksum matches, and the job succeeds with a 'verifying' event", async () => {
    const { setActiveProvider, runExport } = await import("../../services/backup/backupManager");
    const { listRecentJobs } = await import("../../services/backup/backupJobService");

    setActiveProvider(makeVerifyingProvider());
    await runExport();

    const [job] = await listRecentJobs(1);
    expect(job.status).toBe("succeeded");
    const verifyEvents = job.events.filter((e) => e.stage === "verifying");
    expect(verifyEvents.length).toBeGreaterThan(0);
    expect(verifyEvents.some((e) => e.data?.verified === true)).toBe(true);
  });

  it("post-save verification FAILS the job when the readback checksum does not match (simulated corruption)", async () => {
    const { setActiveProvider, runExport } = await import("../../services/backup/backupManager");
    const { listRecentJobs } = await import("../../services/backup/backupJobService");

    setActiveProvider(makeVerifyingProvider({ corrupt: true }));
    await runExport();

    const [job] = await listRecentJobs(1);
    expect(job.status).toBe("failed");
    expect(job.failureReason).toBe("corruption");
    const verifyEvents = job.events.filter((e) => e.stage === "verifying");
    expect(verifyEvents.some((e) => e.data?.verified === false)).toBe(true);
    expect(job.error).toMatch(/verification/i);
  });

  it("providers without load() skip the verification stage entirely, and the job still succeeds", async () => {
    const { setActiveProvider, runExport } = await import("../../services/backup/backupManager");
    const { listRecentJobs } = await import("../../services/backup/backupJobService");

    setActiveProvider(makeNonVerifyingProvider());
    await runExport();

    const [job] = await listRecentJobs(1);
    expect(job.status).toBe("succeeded");
    expect(job.events.some((e) => e.stage === "verifying")).toBe(false);
  });
});

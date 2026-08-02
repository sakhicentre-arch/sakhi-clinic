import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Before this file existed, runAutoIfDue only ever ran at app-start and
 * on visibility-resume (see appLifecycleRuntimeService.ts) -- correct for
 * "catch up when the doctor opens the app," but never a real periodic
 * schedule: a single long-open session would never trigger a due backup
 * on its own. This proves the scheduler actually calls runAutoBackupIfDue
 * on a real interval, and that stopping it actually stops it.
 */

const runAutoBackupIfDueMock = vi.fn(async () => {});
vi.mock("../../services/backupService", () => ({
  runAutoBackupIfDue: (...args: unknown[]) => runAutoBackupIfDueMock(...args),
}));

describe("backupSchedulerService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    runAutoBackupIfDueMock.mockClear();
  });

  afterEach(async () => {
    const { stopBackupScheduler } = await import("../../services/backup/backupSchedulerService");
    stopBackupScheduler();
    vi.useRealTimers();
  });

  // startBackupScheduler enforces a 60s floor on the interval (a real
  // production safety guard against absurdly frequent scheduling) -- these
  // tests use exactly that floor rather than fighting it, so they exercise
  // the actual clamped behavior a real caller would get.
  const MIN_INTERVAL_MS = 60_000;

  it("calls runAutoBackupIfDue on a real periodic interval, not just once", async () => {
    const { startBackupScheduler } = await import("../../services/backup/backupSchedulerService");
    startBackupScheduler(MIN_INTERVAL_MS);

    expect(runAutoBackupIfDueMock).not.toHaveBeenCalled(); // not immediately -- waits for the first interval

    await vi.advanceTimersByTimeAsync(MIN_INTERVAL_MS);
    expect(runAutoBackupIfDueMock).toHaveBeenCalledTimes(1);
    expect(runAutoBackupIfDueMock).toHaveBeenCalledWith({ reason: "scheduled" });

    await vi.advanceTimersByTimeAsync(MIN_INTERVAL_MS);
    expect(runAutoBackupIfDueMock).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(MIN_INTERVAL_MS * 3);
    expect(runAutoBackupIfDueMock).toHaveBeenCalledTimes(5); // real recurring schedule, not a one-shot
  });

  it("stopBackupScheduler actually stops future calls", async () => {
    const { startBackupScheduler, stopBackupScheduler } = await import("../../services/backup/backupSchedulerService");
    startBackupScheduler(MIN_INTERVAL_MS);

    await vi.advanceTimersByTimeAsync(MIN_INTERVAL_MS);
    expect(runAutoBackupIfDueMock).toHaveBeenCalledTimes(1);

    stopBackupScheduler();
    await vi.advanceTimersByTimeAsync(MIN_INTERVAL_MS * 5);
    expect(runAutoBackupIfDueMock).toHaveBeenCalledTimes(1); // no further calls after stopping
  });

  it("calling startBackupScheduler twice does not double the interval", async () => {
    const { startBackupScheduler } = await import("../../services/backup/backupSchedulerService");
    startBackupScheduler(MIN_INTERVAL_MS);
    startBackupScheduler(MIN_INTERVAL_MS);

    await vi.advanceTimersByTimeAsync(MIN_INTERVAL_MS);
    expect(runAutoBackupIfDueMock).toHaveBeenCalledTimes(1); // not 2
  });

  it("a requested interval below the 60s floor is clamped, not honored literally", async () => {
    const { startBackupScheduler } = await import("../../services/backup/backupSchedulerService");
    startBackupScheduler(1_000); // requests 1s

    await vi.advanceTimersByTimeAsync(1_000);
    expect(runAutoBackupIfDueMock).not.toHaveBeenCalled(); // clamped to 60s, not 1s

    await vi.advanceTimersByTimeAsync(MIN_INTERVAL_MS - 1_000);
    expect(runAutoBackupIfDueMock).toHaveBeenCalledTimes(1);
  });

  it("isBackupSchedulerRunning reflects start/stop state", async () => {
    const { startBackupScheduler, stopBackupScheduler, isBackupSchedulerRunning } = await import("../../services/backup/backupSchedulerService");
    expect(isBackupSchedulerRunning()).toBe(false);
    startBackupScheduler(MIN_INTERVAL_MS);
    expect(isBackupSchedulerRunning()).toBe(true);
    stopBackupScheduler();
    expect(isBackupSchedulerRunning()).toBe(false);
  });
});

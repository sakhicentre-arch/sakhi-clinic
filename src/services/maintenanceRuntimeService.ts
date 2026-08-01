import { DEFAULT_MAINTENANCE_POLICIES, MaintenanceRuntimePolicies, mergeMaintenancePolicies } from "./maintenancePolicies";
import { enforceOutboxCap, getOutboxHealthReport, pruneSynced, retryFailed } from "./outboxMaintenanceService";
import { getBackupAgeDays, isBackupStale } from "./storageHealthService";
import { runDexieHealthCheck, verifyExportBundle } from "./storageIntegrityService";
import { exportClinicBundle } from "./clinicExportService";
import { getRecentOperationalEvents, logOperationalEvent, pruneOperationalEvents } from "./operationalEventLogService";
import { scheduleFollowUpReminders } from "./reminderSchedulerService";
import { retryFailedReminders } from "./reminderMaintenanceService";
import { retryEligibleBackupJobs } from "./backup/backupRetryService";

export type MaintenanceRunReason = "manual" | "app-start" | "interval" | "pre-export" | "post-import" | "diagnostic";

export type MaintenanceRunResult = {
  ranAt: string;
  reason: MaintenanceRunReason;
  policies: MaintenanceRuntimePolicies;
  actions: {
    prunedSynced: number;
    retriedFailed: number;
    cappedOutbox: number;
    eventsPruned: number;
    integrityChecked: boolean;
    remindersScheduled: number;
    remindersRetried: number;
    backupJobsRetried: number;
  };
  errors: Array<{ area: string; message: string }>;
};

export type MaintenanceRuntimeReport = {
  generatedAt: string;
  lastRun?: MaintenanceRunResult;
  outbox: Awaited<ReturnType<typeof getOutboxHealthReport>>;
  storage: {
    dexie: Awaited<ReturnType<typeof runDexieHealthCheck>>;
  };
  backup: {
    ageDays: number | null;
    stale: boolean;
  };
  events: {
    recent: Awaited<ReturnType<typeof getRecentOperationalEvents>>;
  };
};

let lastReport: MaintenanceRuntimeReport | null = null;
let lastIntegrityCheckAtMs = 0;
let intervalHandle: number | null = null;

function nowIso() {
  return new Date().toISOString();
}

function shouldRunIntegrityCheck(policies: MaintenanceRuntimePolicies): boolean {
  const minMs = Math.max(0, policies.integrity.minMinutesBetweenChecks) * 60_000;
  if (minMs === 0) return true;
  return Date.now() - lastIntegrityCheckAtMs >= minMs;
}

export async function runMaintenanceOnce(input?: {
  reason?: MaintenanceRunReason;
  policiesOverride?: Partial<MaintenanceRuntimePolicies>;
  // If true, forces integrity checks even if cadence says "not yet".
  forceIntegrityCheck?: boolean;
}): Promise<MaintenanceRunResult> {
  const ranAt = nowIso();
  const reason = input?.reason || "manual";
  const policies = mergeMaintenancePolicies(DEFAULT_MAINTENANCE_POLICIES, input?.policiesOverride);

  const errors: Array<{ area: string; message: string }> = [];
  let prunedSyncedCount = 0;
  let retriedFailedCount = 0;
  let cappedOutboxCount = 0;
  let eventsPruned = 0;
  let integrityChecked = false;
  let remindersScheduled = 0;
  let remindersRetried = 0;
  let backupJobsRetried = 0;

  await logOperationalEvent({
    level: "info",
    type: "maintenance.run.start",
    message: `Maintenance run started (${reason})`,
    data: { reason },
    timestamp: ranAt,
  }).catch(() => {
    // Never block maintenance on event logging.
  });

  try {
    const outbox = await getOutboxHealthReport(0);

    // Conservative default: only prune SYNCED entries when there's meaningful growth.
    if (outbox.synced >= policies.prune.minSyncedEntriesToPrune) {
      prunedSyncedCount = await pruneSynced(policies.prune.keepLatestSyncedPerEntity);
    }

    // Retry only marks failed->pending (local-only); safe and future-replay-ready.
    retriedFailedCount = await retryFailed(policies.retry.maxRetryCount);

    // Module A: enforce the declared row cap here, in the periodic background
    // run -- NOT on the clinical write path (see outboxService.ts's comment
    // for why: measured 100+ seconds at the real cap in this test harness,
    // unacceptable to run inside the same await chain as a patient save).
    cappedOutboxCount = await enforceOutboxCap(policies.maxOutboxEntries);
  } catch (error) {
    errors.push({
      area: "outbox",
      message: error instanceof Error ? error.message : String(error),
    });
  }

  // Reminder Engine (Phase 2): scheduling and retries piggyback on this
  // same periodic tick rather than introducing a second timer. Isolated in
  // its own try/catch so a reminder-engine failure can never block outbox
  // maintenance (or vice versa) -- each area degrades independently.
  try {
    const created = await scheduleFollowUpReminders();
    remindersScheduled = created.length;
    remindersRetried = await retryFailedReminders();
  } catch (error) {
    errors.push({
      area: "reminders",
      message: error instanceof Error ? error.message : String(error),
    });
  }

  // Backup Engine (Phase 3): failed export/auto BackupJobs whose backoff
  // window has arrived get retried on this same tick. Isolated in its own
  // try/catch for the same reason as reminders above -- a Drive-connected
  // provider having a bad day must never block outbox/reminder maintenance.
  try {
    const retrySummary = await retryEligibleBackupJobs();
    backupJobsRetried = retrySummary.attempted;
  } catch (error) {
    errors.push({
      area: "backupJobs",
      message: error instanceof Error ? error.message : String(error),
    });
  }

  const shouldIntegrity = Boolean(input?.forceIntegrityCheck) || shouldRunIntegrityCheck(policies);
  if (shouldIntegrity) {
    integrityChecked = true;
    lastIntegrityCheckAtMs = Date.now();
    try {
      // Health check is read-only.
      await runDexieHealthCheck();

      // Export verification is intentionally conservative: build bundle then verify its shape/JSON-ability.
      // This does NOT download anything; it simply exercises export code paths to catch corruption early.
      const bundle = await exportClinicBundle();
      const verified = verifyExportBundle(bundle);
      if (!verified.ok) {
        errors.push({ area: "integrity.export", message: verified.error || "Export verification failed" });
        await logOperationalEvent({
          level: "warn",
          type: "integrity.export.verify_failed",
          message: verified.error || "Export verification failed",
          data: { schemaVersion: bundle.schemaVersion },
        }).catch(() => {});
      }
    } catch (error) {
      errors.push({
        area: "integrity",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  try {
    eventsPruned = await pruneOperationalEvents(policies.events.maxRows);
  } catch (error) {
    errors.push({
      area: "events",
      message: error instanceof Error ? error.message : String(error),
    });
  }

  const result: MaintenanceRunResult = {
    ranAt,
    reason,
    policies,
    actions: {
      prunedSynced: prunedSyncedCount,
      retriedFailed: retriedFailedCount,
      cappedOutbox: cappedOutboxCount,
      eventsPruned,
      integrityChecked,
      remindersScheduled,
      remindersRetried,
      backupJobsRetried,
    },
    errors,
  };

  await logOperationalEvent({
    level: errors.length ? "warn" : "info",
    type: "maintenance.run.finish",
    message: errors.length ? "Maintenance run finished with warnings" : "Maintenance run finished",
    data: { reason, actions: result.actions, errors },
    timestamp: nowIso(),
  }).catch(() => {});

  return result;
}

export async function getMaintenanceRuntimeReport(input?: {
  includeRecentEvents?: number;
  lastRun?: MaintenanceRunResult;
}): Promise<MaintenanceRuntimeReport> {
  const generatedAt = nowIso();
  const includeRecentEvents = input?.includeRecentEvents ?? 25;

  const [outbox, dexie, recentEvents] = await Promise.all([
    getOutboxHealthReport(20),
    runDexieHealthCheck(),
    getRecentOperationalEvents(includeRecentEvents),
  ]);

  const staleAfterDays = input?.lastRun?.policies.backup.staleAfterDays ?? DEFAULT_MAINTENANCE_POLICIES.backup.staleAfterDays;

  return {
    generatedAt,
    lastRun: input?.lastRun,
    outbox,
    storage: { dexie },
    backup: {
      ageDays: getBackupAgeDays(),
      stale: isBackupStale(staleAfterDays),
    },
    events: { recent: recentEvents },
  };
}

export async function runMaintenanceAndReport(input?: {
  reason?: MaintenanceRunReason;
  policiesOverride?: Partial<MaintenanceRuntimePolicies>;
  forceIntegrityCheck?: boolean;
}): Promise<MaintenanceRuntimeReport> {
  const lastRun = await runMaintenanceOnce(input);
  const report = await getMaintenanceRuntimeReport({ lastRun });
  lastReport = report;
  return report;
}

export function getLastMaintenanceReport(): MaintenanceRuntimeReport | null {
  return lastReport;
}

export function startMaintenanceRuntime(input?: {
  intervalMs?: number;
  reason?: MaintenanceRunReason;
  policiesOverride?: Partial<MaintenanceRuntimePolicies>;
}): void {
  if (intervalHandle != null) return;
  const intervalMs = Math.max(5_000, input?.intervalMs ?? 5 * 60_000);
  const reason = input?.reason ?? "interval";

  intervalHandle = window.setInterval(() => {
    runMaintenanceAndReport({ reason, policiesOverride: input?.policiesOverride }).catch(() => {
      // Deliberately swallow - logging is handled internally.
    });
  }, intervalMs);
}

export function stopMaintenanceRuntime(): void {
  if (intervalHandle == null) return;
  window.clearInterval(intervalHandle);
  intervalHandle = null;
}

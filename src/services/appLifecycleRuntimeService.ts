import { logOperationalEvent } from "./operationalEventLogService";
import { DEFAULT_MAINTENANCE_POLICIES } from "./maintenancePolicies";
import {
  runMaintenanceAndReport,
  runMaintenanceOnce,
  startMaintenanceRuntime,
  stopMaintenanceRuntime,
} from "./maintenanceRuntimeService";
import { computeRuntimeStatus, setLastRuntimeStatus } from "./runtimeStatusService";
import { runAutoBackupIfDue } from "./backupService";

type IdleCallbackHandle = any;

function nowIso() {
  return new Date().toISOString();
}

function runWhenIdle(task: () => void, timeoutMs = 2_000): IdleCallbackHandle {
  try {
    const ric = (window as any).requestIdleCallback as undefined | ((cb: () => void, opts?: any) => any);
    if (typeof ric === "function") {
      return ric(task, { timeout: timeoutMs });
    }
  } catch {
    // ignore
  }
  return window.setTimeout(task, Math.min(2_000, timeoutMs));
}

function cancelIdle(handle: IdleCallbackHandle) {
  try {
    const cic = (window as any).cancelIdleCallback as undefined | ((h: any) => void);
    if (typeof cic === "function") {
      cic(handle);
      return;
    }
  } catch {
    // ignore
  }
  clearTimeout(handle);
}

let initialized = false;
let scheduledIntegrityIdleHandle: IdleCallbackHandle | null = null;

async function refreshRuntimeSnapshot(reason: string) {
  try {
    const report = await runMaintenanceAndReport({ reason: "diagnostic" });
    const status = computeRuntimeStatus(report);
    setLastRuntimeStatus(status);

    if (status.flags.backupStale) {
      await logOperationalEvent({
        level: "warn",
        type: "backup.stale",
        message: "Backup is stale",
        data: { ageDays: report.backup.ageDays, staleAfterDays: DEFAULT_MAINTENANCE_POLICIES.backup.staleAfterDays, reason },
      });
    }

    // Best-effort local auto-backup snapshots (non-blocking and never user-visible).
    // Uses Cache Storage, not Dexie tables, to avoid schema changes.
    runAutoBackupIfDue({ reason }).catch(() => {});
  } catch (error) {
    await logOperationalEvent({
      level: "error",
      type: "runtime.snapshot.failure",
      message: "Failed to refresh runtime snapshot",
      data: { reason, error: error instanceof Error ? error.message : String(error) },
    }).catch(() => {});
  }
}

export function initAppLifecycleRuntime() {
  if (initialized) return;
  initialized = true;

  // Startup lifecycle event
  logOperationalEvent({
    level: "info",
    type: "app.start",
    message: "App started",
    data: { visibility: document.visibilityState },
    timestamp: nowIso(),
  }).catch(() => {});

  // Start lightweight periodic maintenance only while visible.
  if (document.visibilityState === "visible") {
    startMaintenanceRuntime({ intervalMs: 5 * 60_000, reason: "interval" });
  }

  // Non-blocking maintenance: do not force integrity checks on the critical path.
  window.setTimeout(() => {
    runMaintenanceOnce({ reason: "app-start", forceIntegrityCheck: false })
      .then(() => refreshRuntimeSnapshot("app-start"))
      .catch(() => {});
  }, 250);

  // Idle-time integrity verification (export verification can be heavier).
  scheduledIntegrityIdleHandle = runWhenIdle(() => {
    runMaintenanceOnce({ reason: "diagnostic", forceIntegrityCheck: true })
      .then(() => refreshRuntimeSnapshot("idle-integrity"))
      .catch(() => {});
  }, 3_000);

  const onVisibility = () => {
    const state = document.visibilityState;
    logOperationalEvent({
      level: "info",
      type: "app.visibility",
      message: `Visibility changed: ${state}`,
      data: { state },
    }).catch(() => {});

    if (state === "visible") {
      startMaintenanceRuntime({ intervalMs: 5 * 60_000, reason: "interval" });
      // On resume: lightweight run + snapshot refresh.
      runMaintenanceOnce({ reason: "app-start", forceIntegrityCheck: false })
        .then(() => refreshRuntimeSnapshot("resume"))
        .catch(() => {});
    } else {
      stopMaintenanceRuntime();
    }
  };

  document.addEventListener("visibilitychange", onVisibility);

  // pagehide is more reliable than beforeunload for PWA lifecycle.
  window.addEventListener("pagehide", () => {
    logOperationalEvent({
      level: "info",
      type: "app.pagehide",
      message: "Page hidden",
    }).catch(() => {});

    if (scheduledIntegrityIdleHandle != null) {
      cancelIdle(scheduledIntegrityIdleHandle);
      scheduledIntegrityIdleHandle = null;
    }
  });
}

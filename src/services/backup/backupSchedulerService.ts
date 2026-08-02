/**
 * backupSchedulerService.ts
 * Sakhi Clinic — Backup Engine: automatic backup scheduling.
 *
 * The real periodic trigger for "Automatic Backup" (see
 * backupSettingsService.ts's autoBackupEnabled/frequency). Before this
 * file existed, runAutoIfDue only ever ran at app-start and when the tab
 * became visible again (see appLifecycleRuntimeService.ts) -- correct
 * for "catch up on a stale backup when the doctor opens the app," but
 * not a real schedule: a single long-open session would never trigger a
 * due backup on its own.
 *
 * This adds exactly that: a periodic check, while the tab is visible,
 * that calls the SAME runAutoBackupIfDue() the app-start/resume paths
 * already use. All of the actual "is it due yet" logic (the
 * autoBackupEnabled gate, the daily/weekly staleness window, the
 * fallback-to-local-on-failure) already lives in backupManager.ts's
 * runAutoIfDue -- this file only decides WHEN to ask, never how to
 * decide. Mirrors maintenanceRuntimeService.ts's own start/stop-on-
 * visibility pattern exactly, kept as a separate interval (not folded
 * into that file's) so backup scheduling stays independently
 * start-/stoppable and testable, matching this subsystem's existing
 * separation-of-concerns rule.
 *
 * Ceiling, honestly: this only runs while the tab is open and visible,
 * like every other periodic mechanism in this app (see
 * maintenanceRuntimeService.ts). A closed tab does not back up. True
 * background execution would need Service Worker periodic background
 * sync, which has partial browser support and requires the PWA to be
 * installed -- a real future enhancement, not implemented here (see
 * docs/BACKUP_ARCHITECTURE.md).
 */

import { runAutoBackupIfDue } from "../backupService";

const DEFAULT_INTERVAL_MS = 15 * 60_000; // 15 minutes

let intervalHandle: number | null = null;

export function startBackupScheduler(intervalMs: number = DEFAULT_INTERVAL_MS): void {
  if (intervalHandle != null) return;
  intervalHandle = window.setInterval(() => {
    runAutoBackupIfDue({ reason: "scheduled" }).catch(() => {
      // Deliberately swallowed -- runAutoIfDue already logs its own failures.
    });
  }, Math.max(60_000, intervalMs));
}

export function stopBackupScheduler(): void {
  if (intervalHandle == null) return;
  window.clearInterval(intervalHandle);
  intervalHandle = null;
}

export function isBackupSchedulerRunning(): boolean {
  return intervalHandle != null;
}

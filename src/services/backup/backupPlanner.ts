/**
 * backupPlanner.ts
 * Sakhi Clinic — Backup Engine: planning layer.
 *
 * Decides WHETHER an automatic backup should run right now, and what kind.
 * Manual backups (the doctor clicking "Export Backup") always run
 * immediately and never consult this planner -- planning only gates the
 * unattended, periodic path.
 *
 * Staleness logic moved from backupService.ts's old runAutoBackupIfDue,
 * reusing storageHealthService.ts's existing getLastBackupAt() rather than
 * re-reading its localStorage key directly.
 */

import { getLastBackupAt } from "../storageHealthService";

export type BackupKind = "full";
// "incremental" is a real, named future enhancement (see
// PRODUCTION_V1_ARCHITECTURE_ASSESSMENT.md's Module 1 design) -- no
// incremental-diff mechanism exists yet, so this planner only ever
// produces "full" today. Adding it later is a planner-only change; nothing
// downstream (serializer, encryption, compression, integrity, storage)
// needs to know the difference in advance.

export type BackupPlan = {
  shouldRun: boolean;
  kind: BackupKind;
  reason: string;
};

export function planAutoBackup(input?: { minHoursBetweenBackups?: number; now?: Date }): BackupPlan {
  const minHours = Math.max(1, input?.minHoursBetweenBackups ?? 6);
  const now = input?.now ?? new Date();

  const last = getLastBackupAt();
  const lastMs = last ? Date.parse(last) : NaN;
  const dueByAge = !Number.isFinite(lastMs) || now.getTime() - lastMs >= minHours * 3600_000;

  if (!dueByAge) {
    return { shouldRun: false, kind: "full", reason: `Last backup is within the last ${minHours}h` };
  }

  return {
    shouldRun: true,
    kind: "full",
    reason: last ? `Last backup was more than ${minHours}h ago` : "No prior backup recorded",
  };
}

/** Manual export always runs -- this exists so callers have one consistent Plan-shaped decision to log, not a special case. */
export function planManualBackup(): BackupPlan {
  return { shouldRun: true, kind: "full", reason: "Doctor-initiated export" };
}

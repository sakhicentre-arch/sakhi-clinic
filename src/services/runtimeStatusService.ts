import type { MaintenanceRuntimeReport } from "./maintenanceRuntimeService";

export type RuntimeHealthLevel = "healthy" | "warning" | "degraded";

export type RuntimeStatus = {
  generatedAt: string;
  level: RuntimeHealthLevel;
  flags: {
    maintenanceRunning: boolean;
    backupStale: boolean;
    integrityWarning: boolean;
    pendingOperations: boolean;
    failedOperations: boolean;
    conflictOperations: boolean;
  };
  counts: {
    outboxPending: number;
    outboxFailed: number;
    outboxConflict: number;
    outboxTotal: number;
  };
  notes: string[];
};

let lastStatus: RuntimeStatus | null = null;

export function computeRuntimeStatus(report: MaintenanceRuntimeReport): RuntimeStatus {
  const outbox = report.outbox;
  const dexieOk = report.storage.dexie.ok;
  const backupStale = report.backup.stale;

  const pendingOperations = outbox.pending > 0;
  const failedOperations = outbox.failed > 0;
  const conflictOperations = outbox.conflict > 0;

  const integrityWarning = !dexieOk;

  const notes: string[] = [];
  if (backupStale) notes.push("Backup is stale");
  if (!dexieOk) notes.push("Storage health check failed");
  if (failedOperations) notes.push("Outbox has failed operations");
  if (conflictOperations) notes.push("Outbox has conflicts");

  let level: RuntimeHealthLevel = "healthy";
  if (integrityWarning || conflictOperations) level = "degraded";
  else if (backupStale || failedOperations) level = "warning";

  return {
    generatedAt: report.generatedAt,
    level,
    flags: {
      maintenanceRunning: false,
      backupStale,
      integrityWarning,
      pendingOperations,
      failedOperations,
      conflictOperations,
    },
    counts: {
      outboxPending: outbox.pending,
      outboxFailed: outbox.failed,
      outboxConflict: outbox.conflict,
      outboxTotal: outbox.total,
    },
    notes,
  };
}

export function setLastRuntimeStatus(status: RuntimeStatus) {
  lastStatus = status;
}

export function getLastRuntimeStatus(): RuntimeStatus | null {
  return lastStatus;
}


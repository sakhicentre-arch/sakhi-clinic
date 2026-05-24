const KEY_LAST_BACKUP_AT = "sakhi.health.lastBackupAt.v1";
const KEY_LAST_BACKUP_SIZE = "sakhi.health.lastBackupSizeBytes.v1";
const KEY_LAST_BACKUP_COUNTS = "sakhi.health.lastBackupCounts.v1";
const KEY_LAST_RESTORE_AT = "sakhi.health.lastRestoreAt.v1";
const DEFAULT_STALE_DAYS = 7;

export function recordBackupSuccess(exportedAtIso: string) {
  try {
    window.localStorage.setItem(KEY_LAST_BACKUP_AT, exportedAtIso);
  } catch {
    // ignore
  }
}

export function recordBackupSuccessDetails(input: {
  exportedAtIso: string;
  sizeBytes?: number;
  counts?: Record<string, number>;
}) {
  recordBackupSuccess(input.exportedAtIso);
  try {
    if (typeof input.sizeBytes === "number" && Number.isFinite(input.sizeBytes)) {
      window.localStorage.setItem(KEY_LAST_BACKUP_SIZE, String(Math.max(0, Math.floor(input.sizeBytes))));
    }
    if (input.counts && typeof input.counts === "object") {
      window.localStorage.setItem(KEY_LAST_BACKUP_COUNTS, JSON.stringify(input.counts));
    }
  } catch {
    // ignore
  }
}

export function recordRestoreSuccess(restoredAtIso: string) {
  try {
    window.localStorage.setItem(KEY_LAST_RESTORE_AT, restoredAtIso);
  } catch {
    // ignore
  }
}

export function getLastBackupAt(): string | null {
  try {
    return window.localStorage.getItem(KEY_LAST_BACKUP_AT);
  } catch {
    return null;
  }
}

export function getLastBackupSizeBytes(): number | null {
  try {
    const raw = window.localStorage.getItem(KEY_LAST_BACKUP_SIZE);
    if (!raw) return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.floor(n);
  } catch {
    return null;
  }
}

export function getLastBackupCounts(): Record<string, number> | null {
  try {
    const raw = window.localStorage.getItem(KEY_LAST_BACKUP_COUNTS);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as Record<string, number>;
  } catch {
    return null;
  }
}

export function getLastRestoreAt(): string | null {
  try {
    return window.localStorage.getItem(KEY_LAST_RESTORE_AT);
  } catch {
    return null;
  }
}

export function getBackupAgeDays(now = new Date()): number | null {
  const last = getLastBackupAt();
  if (!last) return null;
  const ts = Date.parse(last);
  if (!Number.isFinite(ts)) return null;
  const diffMs = now.getTime() - ts;
  return Math.max(0, Math.floor(diffMs / 86400000));
}

export function isBackupStale(staleAfterDays = DEFAULT_STALE_DAYS): boolean {
  const age = getBackupAgeDays();
  if (age == null) return true;
  return age >= staleAfterDays;
}

export function getRecommendedBackupCadenceDays(): number {
  return DEFAULT_STALE_DAYS;
}

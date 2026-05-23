const KEY_LAST_BACKUP_AT = "sakhi.health.lastBackupAt.v1";
const DEFAULT_STALE_DAYS = 7;

export function recordBackupSuccess(exportedAtIso: string) {
  try {
    window.localStorage.setItem(KEY_LAST_BACKUP_AT, exportedAtIso);
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

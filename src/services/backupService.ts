/**
 * backupService.ts
 * Sakhi Clinic — public backup API.
 *
 * Thin compatibility layer: every export here has the exact signature
 * SettingsPage.tsx, DashboardPage.tsx, DiagnosticsPanel.tsx, and
 * appLifecycleRuntimeService.ts already call. The real implementation is
 * the layered Backup Engine in src/services/backup/ (Planner -> Serializer
 * -> Encryption -> Compression -> IntegrityValidator -> StorageProvider) --
 * this file exists so none of those call sites needed to change when the
 * engine was introduced, and so nothing outside src/services/backup/ needs
 * to know the engine exists.
 */

import {
  runExport,
  runImport,
  runImportFromProvider,
  listRestorableBackups,
  runAutoIfDue,
  getLocalSnapshotSummary,
  previewLocalFile,
  previewRemoteBackup,
  confirmPendingRestore,
  cancelPendingRestore,
  deleteRemoteBackup,
  type BackupPreview,
} from "./backup/backupManager";
import type { StorageProviderListEntry } from "./backup/storageProvider";

export type { BackupPreview };

/**
 * Deliberately a flat shape (every field optional, not a discriminated
 * union on `ok`) -- this project's root tsconfig has strictNullChecks
 * disabled, under which TypeScript's control-flow narrowing of
 * discriminated unions (`if (result.ok) result.token` / `if (!result.ok)
 * result.error`) does not reliably eliminate the other branch's shape.
 * A flat optional-fields type sidesteps that entirely: every field is
 * always a valid, typed property access regardless of `ok`, no narrowing
 * required. backupManager.ts's own internal union type is unaffected --
 * this flattening happens only at this UI-facing boundary.
 */
export interface RestorePreviewResult {
  ok: boolean;
  token?: string;
  preview?: BackupPreview;
  error?: string;
}

export async function exportBackup(): Promise<void> {
  return runExport();
}

export async function importBackup(file: File): Promise<void> {
  return runImport(file);
}

/** Destination = a remote provider (Google Drive today): what the doctor
 * picks a backup to restore from, instead of a local file input. */
export async function listRemoteBackups(): Promise<StorageProviderListEntry[]> {
  return listRestorableBackups();
}

/** Destination = a remote provider: downloads + restores the chosen backup. */
export async function restoreFromRemote(filename: string): Promise<{ ok: boolean; error?: string }> {
  return runImportFromProvider(filename);
}

/**
 * Preview/confirm restore flow -- the current UI's actual restore path,
 * for both destinations. Validates (and, for a remote backup, downloads)
 * the chosen file WITHOUT restoring it, returning enough detail (exported
 * date, patient/consultation counts, checksum status) for the doctor to
 * review before committing via confirmRestorePreview.
 */
/** Casts to read whichever fields backupManager.ts's internal
 * discriminated union actually populated -- see RestorePreviewResult's
 * own comment for why (strictNullChecks: false defeats normal narrowing
 * here). A plain runtime property read; genuinely absent fields are
 * just undefined, exactly matching this flat type's optional fields. */
function flattenPreviewResult(result: unknown): RestorePreviewResult {
  const r = result as { ok: boolean; token?: string; preview?: BackupPreview; error?: string };
  return { ok: r.ok, token: r.token, preview: r.preview, error: r.error };
}

export async function previewLocalRestore(file: File): Promise<RestorePreviewResult> {
  return flattenPreviewResult(await previewLocalFile(file));
}

export async function previewRemoteRestore(filename: string): Promise<RestorePreviewResult> {
  return flattenPreviewResult(await previewRemoteBackup(filename));
}

export async function confirmRestorePreview(token: string): Promise<{ ok: boolean; error?: string }> {
  return confirmPendingRestore(token);
}

export function cancelRestorePreview(): void {
  cancelPendingRestore();
}

/** Destination = a remote provider: removes a listed backup (Drive backup browser). */
export async function deleteRemoteBackupFile(filename: string): Promise<{ ok: boolean; error?: string }> {
  return deleteRemoteBackup(filename);
}

export async function runAutoBackupIfDue(input?: { reason?: string; minHoursBetweenBackups?: number }): Promise<void> {
  return runAutoIfDue(input);
}

export async function getLocalBackupSnapshotSummary(): Promise<{ count: number; filenames: string[] }> {
  return getLocalSnapshotSummary();
}

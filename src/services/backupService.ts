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

import { runExport, runImport, runAutoIfDue, getLocalSnapshotSummary } from "./backup/backupManager";

export async function exportBackup(): Promise<void> {
  return runExport();
}

export async function importBackup(file: File): Promise<void> {
  return runImport(file);
}

export async function runAutoBackupIfDue(input?: { reason?: string; minHoursBetweenBackups?: number }): Promise<void> {
  return runAutoIfDue(input);
}

export async function getLocalBackupSnapshotSummary(): Promise<{ count: number; filenames: string[] }> {
  return getLocalSnapshotSummary();
}

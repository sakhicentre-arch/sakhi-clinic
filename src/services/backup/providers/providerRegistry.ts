/**
 * providerRegistry.ts
 * Sakhi Clinic — Backup Engine: provider id -> StorageProvider lookup.
 *
 * The ONE file allowed to import concrete providers by name.
 * backupManager.ts resolves the active provider through this registry
 * only, never through a direct provider import -- adding OneDrive,
 * Dropbox, S3, or iCloud later is exactly one new line here plus one new
 * file implementing StorageProvider; nothing in backupManager.ts changes.
 */

import type { StorageProvider } from "../storageProvider";
import { localBackupProvider } from "./localBackupProvider";
import { googleDriveProvider } from "./googleDriveProvider";

const REGISTRY: Record<string, StorageProvider> = {
  [localBackupProvider.id]: localBackupProvider,
  [googleDriveProvider.id]: googleDriveProvider,
};

/** All providers the doctor could pick as a destination today, regardless
 * of whether each is currently connected/configured -- the UI decides
 * what to do with .available itself. */
export function listRegisteredProviders(): StorageProvider[] {
  return Object.values(REGISTRY);
}

export function getProviderById(id: string): StorageProvider | undefined {
  return REGISTRY[id];
}

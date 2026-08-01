/**
 * googleDriveProvider.ts
 * Sakhi Clinic — Backup Engine: Google Drive StorageProvider (STUB).
 *
 * Deliberately non-functional. This app has no Google OAuth client
 * configured and no credentials -- a genuine external dependency (see the
 * Phase 3 checkpoint discussion: "Build Drive Sync against a placeholder
 * auth"). This file exists so the StorageProvider abstraction and the
 * backup pipeline can be built, wired, and tested NOW against a real
 * second provider, without pretending a Drive connection exists.
 *
 * `available` is always false until a real OAuth flow is implemented and
 * wired in. Every method fails loudly and honestly rather than silently
 * no-op-ing, so a caller can never mistake "not connected" for "succeeded."
 */

import type { StorageProvider, StorageProviderSaveInput, StorageProviderSaveResult } from "../storageProvider";

const NOT_CONNECTED_MESSAGE =
  "Google Drive is not connected. This requires a Google OAuth sign-in that has not been configured yet.";

export const googleDriveProvider: StorageProvider = {
  id: "google-drive",
  label: "Google Drive",
  available: false,

  async save(_input: StorageProviderSaveInput): Promise<StorageProviderSaveResult> {
    return { ok: false, error: NOT_CONNECTED_MESSAGE };
  },

  async list() {
    return [];
  },

  async load(_filename: string) {
    return null;
  },
};

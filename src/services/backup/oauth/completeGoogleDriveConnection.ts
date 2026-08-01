/**
 * completeGoogleDriveConnection.ts
 * Sakhi Clinic — Backup Engine: OAuth redirect landing (Phase 3).
 *
 * Google redirects the doctor back to /oauth/google/callback after
 * consent. This is the ONLY place that turns a completed OAuth exchange
 * into an active Google Drive backup destination -- App.tsx detects the
 * path and calls this once on load. Nothing else in the app calls
 * setActiveProvider(googleDriveProvider) automatically; connecting Drive
 * is always this one explicit, doctor-initiated transition.
 *
 * This file is allowed to know about both googleOAuthService and
 * googleDriveProvider (unlike backupManager.ts, which deliberately never
 * imports either) -- it is UI-adjacent glue, not part of the
 * provider-agnostic pipeline.
 */

import { googleOAuthService } from "./googleOAuthService";
import { googleDriveProvider } from "../providers/googleDriveProvider";
import { setActiveProvider } from "../backupManager";
import { logOperationalEvent } from "../../operationalEventLogService";

export const GOOGLE_OAUTH_CALLBACK_PATH = "/oauth/google/callback";

export async function completeGoogleDriveConnection(search: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await googleOAuthService.handleRedirectCallback(new URLSearchParams(search));
    setActiveProvider(googleDriveProvider);
    await logOperationalEvent({
      level: "info",
      type: "backup.drive.connected",
      message: "Google Drive connected and set as the active backup destination",
    }).catch(() => {});
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await logOperationalEvent({
      level: "error",
      type: "backup.drive.connect_failed",
      message: "Google Drive connection failed",
      data: { error: message },
    }).catch(() => {});
    return { ok: false, error: message };
  }
}

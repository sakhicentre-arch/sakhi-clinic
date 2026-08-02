/**
 * completeGoogleDriveConnection.ts
 * Sakhi Clinic — Backup Engine: OAuth redirect landing.
 *
 * Google redirects the doctor back to /oauth/google/callback after
 * consent. This file's ONLY job is completing that token exchange --
 * authentication, and nothing else. It never touches the backup
 * destination preference (see backupSettingsService.ts): connecting
 * Google Drive only ever means "Google Drive is now available to pick as
 * a destination," never "Google Drive is now where backups go." Choosing
 * Google Drive as the destination is always a separate, explicit action
 * the doctor takes in Settings (setBackupDestination), independent of
 * when or whether they connected it.
 */

import { googleOAuthService } from "./googleOAuthService";
import { logOperationalEvent } from "../../operationalEventLogService";

export const GOOGLE_OAUTH_CALLBACK_PATH = "/oauth/google/callback";

export async function completeGoogleDriveConnection(search: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await googleOAuthService.handleRedirectCallback(new URLSearchParams(search));
    await logOperationalEvent({
      level: "info",
      type: "backup.drive.connected",
      message: "Google Drive connected (authentication only -- backup destination unchanged)",
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

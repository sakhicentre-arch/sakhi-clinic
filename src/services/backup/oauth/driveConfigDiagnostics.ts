/**
 * driveConfigDiagnostics.ts
 * Sakhi Clinic — Backup Engine: startup configuration diagnostic.
 *
 * One-shot, non-blocking operational log entry reporting whether Google
 * Drive OAuth is configured for this deployment. This makes the
 * configuration state visible in the operational event log (Settings >
 * Diagnostics is built on the same log) from the moment the app boots,
 * without anyone having to open Settings > Cloud Backup first to see the
 * "not configured" pill. Purely diagnostic: it never blocks startup, never
 * throws, and never changes app behavior either way.
 *
 * Allowed to import googleOAuthService directly, like
 * completeGoogleDriveConnection.ts is -- this is startup glue, not part of
 * the provider-agnostic backup pipeline that backupManager.ts deliberately
 * stays ignorant of Drive to preserve.
 */

import { googleOAuthService } from "./googleOAuthService";
import { logOperationalEvent } from "../../operationalEventLogService";

export async function logDriveConfigurationDiagnostic(): Promise<void> {
  const configured = googleOAuthService.isConfigured();
  await logOperationalEvent({
    level: "info",
    type: "backup.drive.configuration_status",
    message: configured
      ? "Google Drive OAuth is configured for this deployment"
      : "Google Drive OAuth is not configured for this deployment -- local backups only",
    data: { configured },
  }).catch(() => {});
}

/**
 * originIdentityService.ts
 * Module A — Production Data Layer: origin-identity self-check.
 *
 * IndexedDB storage is scoped per browser origin (protocol+host+port). A
 * silent change of origin (e.g. a hosting migration, a switch between
 * http/https, or a different port during local testing) leaves the doctor
 * looking at a blank app with no visible error -- the old data is still on
 * disk, just under a different origin's storage bucket. This is the
 * highest-probability mechanism identified for a prior patient-data-loss
 * incident (Blueprint Phase B.3/A.5).
 *
 * This check is detection, not prevention: it warns, it never blocks.
 */

import { db, AppMeta } from "./db";
import { generateId } from "../utils/generateId";
import { logOperationalEvent } from "./operationalEventLogService";

const APP_META_ID = "app-meta";

export type OriginCheckStatus = "first-run" | "match" | "mismatch";

export interface OriginCheckResult {
  status: OriginCheckStatus;
  currentOrigin: string;
  recordedOrigin: string;
}

const currentOrigin = (): string => {
  try {
    return window.location.origin;
  } catch {
    return "unknown";
  }
};

/**
 * Ensures a single appMeta row exists, backfilling it on first read after the
 * v50 upgrade using the CURRENT origin as the new baseline. The baseline is
 * flagged as post-upgrade (not a true first-run value) purely for audit-trail
 * honesty -- a mismatch is structurally impossible on the very same call that
 * creates the baseline, since the baseline IS the current origin at that
 * moment, so this flag does not itself prevent a false positive; it prevents
 * a future reader of appMeta from mistaking this timestamp for when the
 * doctor first ever opened the app.
 */
async function ensureAppMeta(): Promise<AppMeta> {
  // Read-then-write inside one transaction: the same shape of race as the
  // appointment-slot bug this module fixed elsewhere. Currently benign here —
  // nothing reads installId back today, so two racing callers still agree on
  // every field that's actually used — but it would stop being benign the
  // moment a future module (backup provenance) depends on installId being
  // stable across a cold start where React StrictMode double-invokes effects.
  let created = false;
  const meta = await db.transaction("rw", db.appMeta, async () => {
    const existing = await db.appMeta.get(APP_META_ID);
    if (existing) return existing;

    const origin = currentOrigin();
    const fresh: AppMeta = {
      id: APP_META_ID,
      installId: generateId(),
      firstRunOrigin: origin,
      firstRunAt: new Date().toISOString(),
      baselineIsPostUpgrade: true,
    };
    await db.appMeta.put(fresh);
    created = true;
    return fresh;
  });

  if (!created) return meta;

  try {
    await logOperationalEvent({
      level: "info",
      type: "origin.baseline.recorded",
      message: "appMeta baseline recorded post-upgrade (not a true first run)",
      data: { origin: meta.firstRunOrigin, installId: meta.installId },
    });
  } catch {
    // Non-critical: the baseline row itself is already persisted.
  }

  return meta;
}

/**
 * Run once on app start. Never throws and never blocks — a failure here
 * must not prevent the doctor from using the app for actual clinical work.
 */
export async function checkOriginIdentity(): Promise<OriginCheckResult> {
  try {
    const meta = await ensureAppMeta();
    const origin = currentOrigin();

    if (meta.baselineIsPostUpgrade) {
      return { status: "first-run", currentOrigin: origin, recordedOrigin: meta.firstRunOrigin };
    }
    if (origin !== meta.firstRunOrigin) {
      return { status: "mismatch", currentOrigin: origin, recordedOrigin: meta.firstRunOrigin };
    }
    return { status: "match", currentOrigin: origin, recordedOrigin: meta.firstRunOrigin };
  } catch (error) {
    console.error("[originIdentityService] checkOriginIdentity failed:", error);
    return { status: "first-run", currentOrigin: currentOrigin(), recordedOrigin: "" };
  }
}

/**
 * Doctor-dismissible action for a genuine, expected origin change (e.g. a
 * planned domain migration): updates the baseline to the current origin so
 * the warning does not reappear on the next start. This is the mitigation
 * the contract requires in place of a hard block.
 */
export async function acknowledgeOriginChange(): Promise<void> {
  const origin = currentOrigin();
  const existing = await db.appMeta.get(APP_META_ID);
  await db.appMeta.put({
    id: APP_META_ID,
    installId: existing?.installId || generateId(),
    firstRunOrigin: origin,
    firstRunAt: existing?.firstRunAt || new Date().toISOString(),
    baselineIsPostUpgrade: false,
  });

  try {
    await logOperationalEvent({
      level: "info",
      type: "origin.baseline.acknowledged",
      message: "Doctor acknowledged origin change and updated baseline",
      data: { origin, previousOrigin: existing?.firstRunOrigin },
    });
  } catch {
    // Non-critical.
  }
}

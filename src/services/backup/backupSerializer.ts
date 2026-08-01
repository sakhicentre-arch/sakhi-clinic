/**
 * backupSerializer.ts
 * Sakhi Clinic — Backup Engine: serialization layer.
 *
 * Turns the live database into the on-disk backup file shape, and back.
 * The actual table-gathering and merge/overwrite logic already existed and
 * is fully reused from clinicExportService.ts, unchanged -- this layer
 * only owns the outer envelope (metadata + JSON encoding) that
 * backupService.ts used to build inline.
 */

import { db } from "../db";
import { exportClinicBundle, importClinicBundleWithOptions, planImportClinicBundle, ImportMode, ClinicExportBundleV2 } from "../clinicExportService";
import { getDeviceId } from "../../utils/deviceId";

export type SakhiBackupMetadataV1 = {
  format: "sakhi.backup.v1";
  appVersion?: string;
  exportedAt: string;
  schemaVersion: number;
  device: {
    deviceId: string;
    userAgent?: string;
    tzOffsetMin?: number;
  };
  totals: Record<string, number>;
};

export type SakhiBackupFileV1 = {
  metadata: SakhiBackupMetadataV1;
  data: {
    bundle: ClinicExportBundleV2;
  };
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function makeBackupFilename(exportedAt: Date, extension = "json"): string {
  const y = exportedAt.getFullYear();
  const m = pad2(exportedAt.getMonth() + 1);
  const d = pad2(exportedAt.getDate());
  const hh = pad2(exportedAt.getHours());
  const mm = pad2(exportedAt.getMinutes());
  return `sakhi-backup-${y}-${m}-${d}-${hh}${mm}.${extension}`;
}

async function computeTotalsForBundle(bundle: ClinicExportBundleV2): Promise<Record<string, number>> {
  const t: Record<string, number> = {
    patients: bundle.data.patients.length,
    consultations: bundle.data.consultations.length,
    appointments: bundle.data.appointments.length,
    drafts: bundle.data.drafts.length,
    learning: bundle.data.learning.length,
    caseMemory: bundle.data.caseMemory.length,
    syncOutbox: bundle.data.syncOutbox.length,
    operationalEvents: (bundle.data as any).operationalEvents?.length || 0,
  };
  try {
    const tableCounts = await Promise.all(db.tables.map(async (tbl) => ({ name: tbl.name, count: await tbl.count() })));
    tableCounts.forEach((r) => {
      t[`dexie.${r.name}`] = r.count;
    });
  } catch {
    // ignore -- totals are diagnostic, never block a backup
  }
  return t;
}

/**
 * Builds the full backup file (metadata + bundle) and its JSON encoding.
 * The JSON parse-back is a deliberate corruption check: if JSON.stringify
 * produced something JSON.parse can't read back (shouldn't happen, but
 * this is a data-safety path), fail loudly here rather than silently
 * handing a broken file to a storage provider.
 */
export async function serializeBackup(): Promise<{ file: SakhiBackupFileV1; json: string }> {
  const bundle = await exportClinicBundle();
  const totals = await computeTotalsForBundle(bundle);

  const metadata: SakhiBackupMetadataV1 = {
    format: "sakhi.backup.v1",
    appVersion: (() => {
      try {
        return (import.meta as any).env?.VITE_APP_VERSION;
      } catch {
        return undefined;
      }
    })(),
    exportedAt: bundle.exportedAt,
    schemaVersion: db.verno,
    device: (() => {
      try {
        return {
          deviceId: getDeviceId(),
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
          tzOffsetMin: new Date().getTimezoneOffset(),
        };
      } catch {
        return { deviceId: getDeviceId() };
      }
    })(),
    totals,
  };

  const file: SakhiBackupFileV1 = { metadata, data: { bundle } };
  const json = JSON.stringify(file);
  JSON.parse(json); // roundtrip corruption check

  return { file, json };
}

export type ParsedBackupFile = {
  bundleLike: any;
  exportedAt: string;
  deviceId: string;
};

/** Accepts the same multiple formats importBackup always has (new metadata-wrapped, legacy V2, legacy V1). */
export function parseBackupJson(text: string): ParsedBackupFile {
  const parsed: any = JSON.parse(text);
  const bundleLike = parsed?.data?.bundle ? parsed.data.bundle : parsed;
  return {
    bundleLike,
    exportedAt: String(bundleLike?.exportedAt || parsed?.metadata?.exportedAt || ""),
    deviceId: String(bundleLike?.deviceId || parsed?.metadata?.device?.deviceId || ""),
  };
}

export function planRestore(bundleLike: any, mode: ImportMode = "overwrite") {
  return planImportClinicBundle(bundleLike, mode);
}

export async function deserializeAndRestore(bundleLike: any, mode: ImportMode = "overwrite"): Promise<void> {
  await importClinicBundleWithOptions(bundleLike, { mode });
}

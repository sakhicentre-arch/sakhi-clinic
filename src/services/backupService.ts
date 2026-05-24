import { exportClinicBundle, importClinicBundleWithOptions, planImportClinicBundle } from "./clinicExportService";
import { recordBackupSuccessDetails, recordRestoreSuccess } from "./storageHealthService";
import { logOperationalEvent } from "./operationalEventLogService";
import { getDeviceId } from "../utils/deviceId";
import { db } from "./db";

function downloadFile(data: string, filename: string) {
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}

type SakhiBackupMetadataV1 = {
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

type SakhiBackupFileV1 = {
  metadata: SakhiBackupMetadataV1;
  data: {
    bundle: Awaited<ReturnType<typeof exportClinicBundle>>;
  };
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function makeBackupFilename(exportedAt: Date) {
  const y = exportedAt.getFullYear();
  const m = pad2(exportedAt.getMonth() + 1);
  const d = pad2(exportedAt.getDate());
  const hh = pad2(exportedAt.getHours());
  const mm = pad2(exportedAt.getMinutes());
  return `sakhi-backup-${y}-${m}-${d}-${hh}${mm}.json`;
}

async function computeTotalsForBundle(bundle: Awaited<ReturnType<typeof exportClinicBundle>>): Promise<Record<string, number>> {
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
  // Also include Dexie table counts (helps detect missing tables in bundle).
  try {
    const tableCounts = await Promise.all(db.tables.map(async (t) => ({ name: t.name, count: await t.count() })));
    tableCounts.forEach((r) => {
      t[`dexie.${r.name}`] = r.count;
    });
  } catch {
    // ignore
  }
  return t;
}

async function storeLocalBackupSnapshot(json: string, filename: string) {
  // Local-first auto-backup retention without touching Dexie schema:
  // Use Cache Storage as a durable blob store when available.
  try {
    if (typeof caches === "undefined" || !caches.open) return;
    const cache = await caches.open("sakhi-backups-v1");
    const req = new Request(`${location.origin}/__sakhi_backup__/${filename}`);
    await cache.put(req, new Response(new Blob([json], { type: "application/json" }), { headers: { "Content-Type": "application/json" } }));
  } catch {
    // ignore
  }
}

async function listLocalBackups(): Promise<Array<{ filename: string; exportedAt?: string; sizeBytes?: number }>> {
  try {
    if (typeof caches === "undefined" || !caches.open) return [];
    const cache = await caches.open("sakhi-backups-v1");
    const keys = await cache.keys();
    const out: Array<{ filename: string; exportedAt?: string; sizeBytes?: number }> = [];
    for (const k of keys) {
      const url = new URL(k.url);
      const filename = url.pathname.split("/").pop() || url.pathname;
      const res = await cache.match(k);
      const sizeBytes = res ? Number(res.headers.get("Content-Length") || "") : undefined;
      out.push({ filename, sizeBytes: Number.isFinite(sizeBytes as any) ? (sizeBytes as number) : undefined });
    }
    return out;
  } catch {
    return [];
  }
}

async function pruneLocalBackups(keepLatest = 5) {
  try {
    if (typeof caches === "undefined" || !caches.open) return;
    const cache = await caches.open("sakhi-backups-v1");
    const keys = await cache.keys();
    const items = keys
      .map((k) => {
        const url = new URL(k.url);
        return { key: k, url, filename: url.pathname.split("/").pop() || url.pathname };
      })
      .sort((a, b) => a.filename.localeCompare(b.filename));
    const excess = Math.max(0, items.length - keepLatest);
    for (let i = 0; i < excess; i++) {
      await cache.delete(items[i].key);
    }
  } catch {
    // ignore
  }
}

export async function getLocalBackupSnapshotSummary(): Promise<{ count: number; filenames: string[] }> {
  const items = await listLocalBackups();
  return { count: items.length, filenames: items.map((i) => i.filename).sort() };
}

export async function exportBackup(): Promise<void> {
  try {
    await logOperationalEvent({
      level: "info",
      type: "backup.export.start",
      message: "Backup export started",
    });

    const bundle = await exportClinicBundle();
    const exportedAtIso = bundle.exportedAt;
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
      exportedAt: exportedAtIso,
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

    const backupFile: SakhiBackupFileV1 = { metadata, data: { bundle } };

    // Size-safe + corruption-prevention: JSON roundtrip check before download.
    const json = JSON.stringify(backupFile);
    JSON.parse(json);

    const exportedAtDate = new Date(exportedAtIso);
    const filename = makeBackupFilename(Number.isFinite(exportedAtDate.getTime()) ? exportedAtDate : new Date());

    // Store a local snapshot for retention (no download required for auto-backup later).
    await storeLocalBackupSnapshot(json, filename);
    await pruneLocalBackups(5);

    downloadFile(json, filename);

    recordBackupSuccessDetails({
      exportedAtIso,
      sizeBytes: new Blob([json], { type: "application/json" }).size,
      counts: totals,
    });
    await logOperationalEvent({
      level: "info",
      type: "backup.export.success",
      message: "Backup export completed",
      data: { exportedAt: exportedAtIso, schemaVersion: db.verno, totals },
    });
  } catch (error) {
    console.error("[backupService] exportBackup failed:", error);
    await logOperationalEvent({
      level: "error",
      type: "backup.export.failure",
      message: "Backup export failed",
      data: { error: error instanceof Error ? error.message : String(error) },
    }).catch(() => {});
    alert("Clinic backup could not be created. Please retry.");
  }
}

export async function importBackup(file: File): Promise<void> {
  try {
    await logOperationalEvent({
      level: "info",
      type: "backup.import.start",
      message: "Backup import started",
      data: { filename: file.name, size: file.size },
    });
    const text = await file.text();
    const parsed: any = JSON.parse(text);

    // Accept multiple formats:
    // - New: { metadata, data: { bundle } }
    // - Legacy V2: ClinicExportBundleV2 itself
    // - Legacy V1: { version: "1.0", exportedAt, data: {...} }
    const bundleLike = parsed?.data?.bundle ? parsed.data.bundle : parsed;

    // Dry-run plan (validates structure before destructive action).
    const plan = planImportClinicBundle(bundleLike, "overwrite");

    const exportedAt = String(bundleLike?.exportedAt || parsed?.metadata?.exportedAt || "");
    const deviceId = String(bundleLike?.deviceId || parsed?.metadata?.device?.deviceId || "");
    const patientsCount = plan.incoming.patients ?? 0;
    const consultationsCount = plan.incoming.consultations ?? 0;

    const confirmRestore = window.confirm(
      [
        "Restore clinic backup?",
        "",
        `Exported: ${exportedAt || "Unknown date"}`,
        `Device: ${deviceId || "Unknown device"}`,
        `Patients: ${patientsCount}`,
        `Consultations: ${consultationsCount}`,
        "",
        "This will overwrite ALL existing clinic data on this device.",
        "Continue?",
      ].join("\n")
    );
    if (!confirmRestore) return;

    await importClinicBundleWithOptions(bundleLike, { mode: "overwrite" });
    await logOperationalEvent({
      level: "info",
      type: "backup.import.success",
      message: "Backup import completed",
      data: { filename: file.name },
    });
    recordRestoreSuccess(new Date().toISOString());
    alert("Clinic backup restored.");
  } catch (error) {
    console.error("[backupService] importBackup failed:", error);
    await logOperationalEvent({
      level: "error",
      type: "backup.import.failure",
      message: "Backup import failed",
      data: { filename: file.name, error: error instanceof Error ? error.message : String(error) },
    }).catch(() => {});
    alert("Restore failed. The backup file looks invalid or incomplete.");
  }
}

export async function runAutoBackupIfDue(input?: { reason?: string; minHoursBetweenBackups?: number }) {
  const minHours = Math.max(1, input?.minHoursBetweenBackups ?? 6);
  try {
    // Best-effort: read last backup time; if stale, create a local snapshot only (no download).
    const last = (() => {
      try {
        return window.localStorage.getItem("sakhi.health.lastBackupAt.v1");
      } catch {
        return null;
      }
    })();
    const lastMs = last ? Date.parse(last) : NaN;
    const due = !Number.isFinite(lastMs) || (Date.now() - lastMs) >= minHours * 3600_000;
    if (!due) return;

    const bundle = await exportClinicBundle();
    const totals = await computeTotalsForBundle(bundle);
    const metadata: SakhiBackupMetadataV1 = {
      format: "sakhi.backup.v1",
      exportedAt: bundle.exportedAt,
      schemaVersion: db.verno,
      device: { deviceId: getDeviceId() },
      totals,
    };
    const backupFile: SakhiBackupFileV1 = { metadata, data: { bundle } };
    const json = JSON.stringify(backupFile);
    JSON.parse(json);

    const exportedAtDate = new Date(bundle.exportedAt);
    const filename = makeBackupFilename(Number.isFinite(exportedAtDate.getTime()) ? exportedAtDate : new Date());
    await storeLocalBackupSnapshot(json, filename);
    await pruneLocalBackups(5);

    recordBackupSuccessDetails({
      exportedAtIso: bundle.exportedAt,
      sizeBytes: new Blob([json], { type: "application/json" }).size,
      counts: totals,
    });

    await logOperationalEvent({
      level: "info",
      type: "backup.auto.success",
      message: "Automatic local backup snapshot created",
      data: { reason: input?.reason || "auto", filename, minHours },
    }).catch(() => {});
  } catch (error) {
    await logOperationalEvent({
      level: "warn",
      type: "backup.auto.failure",
      message: "Automatic backup snapshot failed",
      data: { reason: input?.reason || "auto", error: error instanceof Error ? error.message : String(error) },
    }).catch(() => {});
  }
}

import { exportClinicBundle, importClinicBundle } from "./clinicExportService";
import { recordBackupSuccess } from "./storageHealthService";
import { logOperationalEvent } from "./operationalEventLogService";

function downloadFile(data: string, filename: string) {
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}

export async function exportBackup(): Promise<void> {
  try {
    await logOperationalEvent({
      level: "info",
      type: "backup.export.start",
      message: "Backup export started",
    });
    const bundle = await exportClinicBundle();
    const json = JSON.stringify(bundle, null, 2);

    const date = new Date().toISOString().split("T")[0];
    const filename = `clinic-backup-${date}.json`;
    downloadFile(json, filename);
    recordBackupSuccess(bundle.exportedAt);
    await logOperationalEvent({
      level: "info",
      type: "backup.export.success",
      message: "Backup export completed",
      data: { exportedAt: bundle.exportedAt, schemaVersion: bundle.schemaVersion },
    });
  } catch (error) {
    console.error("[backupService] exportBackup failed:", error);
    await logOperationalEvent({
      level: "error",
      type: "backup.export.failure",
      message: "Backup export failed",
      data: { error: error instanceof Error ? error.message : String(error) },
    }).catch(() => {});
    alert("Backup failed. Check console.");
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
    const backup: any = JSON.parse(text);

    const confirmRestore = window.confirm("This will overwrite ALL existing data. Continue?");
    if (!confirmRestore) return;

    await importClinicBundle(backup);
    await logOperationalEvent({
      level: "info",
      type: "backup.import.success",
      message: "Backup import completed",
      data: { filename: file.name },
    });
    alert("Data restored successfully!");
  } catch (error) {
    console.error("[backupService] importBackup failed:", error);
    await logOperationalEvent({
      level: "error",
      type: "backup.import.failure",
      message: "Backup import failed",
      data: { filename: file.name, error: error instanceof Error ? error.message : String(error) },
    }).catch(() => {});
    alert("Restore failed. Invalid file.");
  }
}

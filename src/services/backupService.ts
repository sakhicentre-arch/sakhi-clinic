import { db } from "./db";

// 📥 Helper: download JSON file
function downloadFile(data: string, filename: string) {
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}

// 📦 EXPORT BACKUP
export async function exportBackup(): Promise<void> {
  try {
    const backup: any = {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      data: {}
    };

    // ✅ SAFE TABLE ACCESS
    backup.data.patients = await db.patients.toArray();
    backup.data.consultations = await db.consultations.toArray();

    if (db.appointments) {
      backup.data.appointments = await db.appointments.toArray();
    }

    if (db.medicines) {
      backup.data.medicines = await db.medicines.toArray();
    }

    if (db.caseMemory) {
      backup.data.caseMemory = await db.caseMemory.toArray();
    }

    const json = JSON.stringify(backup, null, 2);

    const date = new Date().toISOString().split("T")[0];
    const filename = `clinic-backup-${date}.json`;

    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();

    URL.revokeObjectURL(url);

  } catch (error) {
    console.error("🔥 Backup error details:", error); // IMPORTANT
    alert("Backup failed. Check console.");
  }
}
// 📥 IMPORT BACKUP
export async function importBackup(file: File): Promise<void> {
  try {
    const text = await file.text();
    const backup: any = JSON.parse(text); // ✅ FIX: allow flexible type

    // ✅ VALIDATION
    if (!backup || !backup.data) {
      throw new Error("Invalid backup file");
    }

    const confirmRestore = window.confirm(
      "This will overwrite ALL existing data. Continue?"
    );

    if (!confirmRestore) return;

    // ✅ FIX: Proper Dexie transaction typing
    await db.transaction("rw", db.tables, async () => {
      // 🧹 CLEAR
      for (const table of db.tables) {
        await table.clear();
      }

      // 📥 RESTORE
      if (backup.data.patients) {
        await db.patients.bulkPut(backup.data.patients);
      }
      if (backup.data.consultations) {
        await db.consultations.bulkPut(backup.data.consultations);
      }
      if (backup.data.appointments) {
        await db.appointments.bulkPut(backup.data.appointments);
      }
      if (backup.data.medicines) {
        await db.medicines.bulkPut(backup.data.medicines);
      }
      if (db.caseMemory && backup.data.caseMemory) {
        await db.caseMemory.bulkPut(backup.data.caseMemory);
      }
    });

    alert("Data restored successfully!");
  } catch (error) {
    console.error("Restore failed:", error);
    alert("Restore failed. Invalid file.");
  }
}
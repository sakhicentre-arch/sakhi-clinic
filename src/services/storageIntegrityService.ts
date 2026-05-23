import { db } from "./db";
import type { ClinicExportBundleV2 } from "./clinicExportService";

export type DexieHealthReport = {
  ok: boolean;
  schemaVersion?: number;
  tables: Array<{ name: string; count: number }>;
  error?: string;
};

export async function runDexieHealthCheck(): Promise<DexieHealthReport> {
  try {
    // Ensure DB is opened and schema is readable.
    await db.open();

    const tables = await Promise.all(
      db.tables.map(async (t) => {
        const count = await t.count();
        return { name: t.name, count };
      })
    );

    return {
      ok: true,
      schemaVersion: db.verno,
      tables,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      tables: [],
    };
  }
}

export function verifyExportBundle(bundle: ClinicExportBundleV2): { ok: boolean; error?: string } {
  try {
    if (!bundle || typeof bundle !== "object") throw new Error("Bundle is not an object");
    if (typeof bundle.schemaVersion !== "number") throw new Error("Missing schemaVersion");
    if (!bundle.exportedAt || typeof bundle.exportedAt !== "string") throw new Error("Missing exportedAt");
    if (!bundle.deviceId || typeof bundle.deviceId !== "string") throw new Error("Missing deviceId");
    if (!bundle.data || typeof bundle.data !== "object") throw new Error("Missing data");
    const keys = ["patients", "consultations", "appointments", "drafts", "learning", "caseMemory", "syncOutbox"] as const;
    for (const k of keys) {
      const v: any = (bundle.data as any)[k];
      if (!Array.isArray(v)) throw new Error(`data.${k} must be an array`);
    }

    // Roundtrip JSON serialization check (prevents cyclic payloads in outbox).
    const json = JSON.stringify(bundle);
    const parsed = JSON.parse(json);
    if (!parsed || !parsed.data) throw new Error("Bundle JSON roundtrip failed");

    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}


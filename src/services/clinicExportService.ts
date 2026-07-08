import { db } from "./db";
import type {
  Appointment,
  Consultation,
  ConsultationDraft,
  LearningPattern,
  Patient,
  CaseMemoryEntry,
  SyncOutboxEntry,
  OperationalEvent,
} from "./db";
import { ensureMeta } from "../repositories/metadata";
import { getDeviceId } from "../utils/deviceId";

export const CLINIC_EXPORT_SCHEMA_VERSION = 2 as const;

export type ClinicExportBundleV2 = {
  schemaVersion: typeof CLINIC_EXPORT_SCHEMA_VERSION;
  exportedAt: string;
  deviceId: string;
  provenance?: {
    userAgent?: string;
    tzOffsetMin?: number;
  };
  storage?: Record<string, string>;
  data: {
    patients: Patient[];
    consultations: Consultation[];
    appointments: Appointment[];
    drafts: ConsultationDraft[];
    learning: LearningPattern[];
    caseMemory: CaseMemoryEntry[];
    syncOutbox: SyncOutboxEntry[];
    operationalEvents: OperationalEvent[];
  };
};

const nowIso = () => new Date().toISOString();

function sortById<T extends { id?: any }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function sortConsultations(rows: Consultation[]): Consultation[] {
  return [...rows].sort((a, b) => {
    const ad = String(a.date || "");
    const bd = String(b.date || "");
    const cmp = ad.localeCompare(bd);
    if (cmp !== 0) return cmp;
    return String(a.id).localeCompare(String(b.id));
  });
}

function sortOutbox(rows: SyncOutboxEntry[]): SyncOutboxEntry[] {
  return [...rows].sort((a, b) => {
    const cmp = String(a.timestamp || "").localeCompare(String(b.timestamp || ""));
    if (cmp !== 0) return cmp;
    return String(a.id).localeCompare(String(b.id));
  });
}

export async function exportClinicBundle(): Promise<ClinicExportBundleV2> {
  const exportedAt = nowIso();
  const deviceId = getDeviceId();

  const [patients, consultations, appointments, drafts, learning, caseMemory, syncOutbox, operationalEvents] = await Promise.all([
    db.patients.toArray(),
    db.consultations.toArray(),
    db.appointments.toArray(),
    db.drafts.toArray(),
    db.learning.toArray(),
    db.caseMemory.toArray(),
    db.syncOutbox.toArray(),
    db.operationalEvents.toArray(),
  ]);

  return {
    schemaVersion: CLINIC_EXPORT_SCHEMA_VERSION,
    exportedAt,
    deviceId,
    provenance: (() => {
      try {
        return {
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
          tzOffsetMin: new Date().getTimezoneOffset(),
        };
      } catch {
        return undefined;
      }
    })(),
    storage: (() => {
      try {
        const keys = [
          "sakhi-queue",
          "sakhi.rxTemplates.v1",
          "sakhi.remedyDefaults.v1",
          "sakhi_followups",
          "sakhi.remedyComposer.autoAdvance.v1",
        ];
        const out: Record<string, string> = {};
        keys.forEach((k) => {
          const v = window.localStorage.getItem(k);
          if (typeof v === "string" && v.length > 0) out[k] = v;
        });
        return out;
      } catch {
        return undefined;
      }
    })(),
    data: {
      patients: sortById(patients.map((p) => ensureMeta(p as any, { exportedAt }))),
      consultations: sortConsultations(consultations.map((c) => ensureMeta(c as any, { exportedAt }))),
      appointments: sortById(appointments.map((a) => ensureMeta(a as any, { exportedAt }))),
      drafts,
      learning,
      caseMemory: sortById(caseMemory.map((m) => ensureMeta(m, { exportedAt }))),
      syncOutbox: sortOutbox(syncOutbox),
      operationalEvents: sortById((operationalEvents || []) as any),
    },
  };
}

function isRecordArray(value: any): value is any[] {
  return Array.isArray(value);
}

function assertBundleDataShape(data: any) {
  if (!data) throw new Error("Invalid backup: missing data");
  const requiredArrays = ["patients", "consultations", "appointments", "drafts", "learning", "caseMemory", "syncOutbox", "operationalEvents"];
  for (const key of requiredArrays) {
    if (data[key] === undefined) continue; // allow partials for legacy imports
    if (!isRecordArray(data[key])) throw new Error(`Invalid backup: data.${key} must be an array`);
  }
}

export type ImportMode = "overwrite" | "merge" | "dry-run";
export type ImportPlan = {
  mode: ImportMode;
  incoming: Record<string, number>;
  warnings: string[];
};

function countIncoming(data: any): Record<string, number> {
  const keys = ["patients", "consultations", "appointments", "drafts", "learning", "caseMemory", "syncOutbox", "operationalEvents"] as const;
  const out: Record<string, number> = {};
  keys.forEach((k) => {
    out[k] = Array.isArray((data as any)[k]) ? (data as any)[k].length : 0;
  });
  return out;
}

export function planImportClinicBundle(bundle: any, mode: ImportMode = "overwrite"): ImportPlan {
  if (!bundle) throw new Error("Invalid backup file");

  const isV1 = typeof bundle.version === "string" && bundle.data;
  const isV2 = bundle.schemaVersion === CLINIC_EXPORT_SCHEMA_VERSION && bundle.data;
  const data = isV2 ? (bundle as ClinicExportBundleV2).data : isV1 ? (bundle.data as any) : null;
  if (!data) throw new Error("Invalid backup format");
  assertBundleDataShape(data);

  const warnings: string[] = [];
  const counts = countIncoming(data);

  if (mode === "merge") {
    warnings.push("Merge mode is best-effort and currently prefers newer updatedAt when available.");
  }

  return { mode, incoming: counts, warnings };
}

function upsertByIdPreferNewer<T extends { id: any; updatedAt?: string; deletedAt?: number }>(
  existing: T[],
  incoming: T[]
): T[] {
  const map = new Map<string, T>();
  existing.forEach((r) => map.set(String(r.id), r));
  incoming.forEach((r) => {
    const key = String(r.id);
    const prev = map.get(key);
    if (!prev) {
      map.set(key, r);
      return;
    }
    const pu = Date.parse(String(prev.updatedAt || ""));
    const nu = Date.parse(String(r.updatedAt || ""));
    if (Number.isFinite(nu) && (!Number.isFinite(pu) || nu >= pu)) {
      map.set(key, r);
      return;
    }
    // If updatedAt isn't trustworthy, prefer non-deleted over deleted.
    if (prev.deletedAt && !r.deletedAt) {
      map.set(key, r);
    }
  });
  return Array.from(map.values());
}

export async function importClinicBundle(bundle: any): Promise<void> {
  await importClinicBundleWithOptions(bundle, { mode: "overwrite" });
}

export async function importClinicBundleWithOptions(bundle: any, opts: { mode: ImportMode }): Promise<void> {
  if (!bundle) throw new Error("Invalid backup file");

  // Back-compat: accept v1 format { version: "1.0", exportedAt, data: {...} }
  const isV1 = typeof bundle.version === "string" && bundle.data;
  const isV2 = bundle.schemaVersion === CLINIC_EXPORT_SCHEMA_VERSION && bundle.data;

  const data = isV2
    ? (bundle as ClinicExportBundleV2).data
    : isV1
      ? (bundle.data as any)
      : null;

  if (!data) throw new Error("Invalid backup format");
  assertBundleDataShape(data);

  const exportedAt = String(bundle.exportedAt || nowIso());

  if (opts.mode === "dry-run") {
    // Only validation and plan; no writes.
    return;
  }

  if (opts.mode === "overwrite") {
    await db.transaction("rw", db.tables, async () => {
      for (const table of db.tables) {
        await table.clear();
      }

      if (data.patients) await db.patients.bulkPut((data.patients as Patient[]).map((p) => ensureMeta(p as any, { exportedAt })));
      if (data.consultations) await db.consultations.bulkPut((data.consultations as Consultation[]).map((c) => ensureMeta(c as any, { exportedAt })));
      if (data.appointments) await db.appointments.bulkPut((data.appointments as Appointment[]).map((a) => ensureMeta(a as any, { exportedAt })));
      if (data.drafts) await db.drafts.bulkPut(data.drafts as ConsultationDraft[]);
      if (data.learning) await db.learning.bulkPut(data.learning as LearningPattern[]);
      if (data.caseMemory && db.caseMemory) await db.caseMemory.bulkPut((data.caseMemory as CaseMemoryEntry[]).map((m) => ensureMeta(m as any, { exportedAt })));
      if (data.syncOutbox) await db.syncOutbox.bulkPut(data.syncOutbox as SyncOutboxEntry[]);
      if (data.operationalEvents) await db.operationalEvents.bulkPut(data.operationalEvents as OperationalEvent[]);
    });
  }

  if (opts.mode === "merge") {
    await db.transaction("rw", db.tables, async () => {
      const existingPatients = await db.patients.toArray();
      const existingConsultations = await db.consultations.toArray();
      const existingAppointments = await db.appointments.toArray();
      const existingDrafts = await db.drafts.toArray();
      const existingLearning = await db.learning.toArray();
      const existingCaseMemory = await db.caseMemory.toArray();
      const existingOutbox = await db.syncOutbox.toArray();
      const existingEvents = await db.operationalEvents.toArray();

      const mergedPatients = upsertByIdPreferNewer(existingPatients, (data.patients || []) as any).map((p) => ensureMeta(p as any, { exportedAt }));
      const mergedConsultations = upsertByIdPreferNewer(existingConsultations, (data.consultations || []) as any).map((c) => ensureMeta(c as any, { exportedAt }));
      const mergedAppointments = upsertByIdPreferNewer(existingAppointments, (data.appointments || []) as any).map((a) => ensureMeta(a as any, { exportedAt }));

      // Drafts: prefer newer savedAt for same id.
      const draftById = new Map<string, ConsultationDraft>();
      (existingDrafts || []).forEach((d) => draftById.set(d.id, d));
      ((data.drafts || []) as ConsultationDraft[]).forEach((d) => {
        const prev = draftById.get(d.id);
        if (!prev) return draftById.set(d.id, d);
        if (String(d.savedAt || "").localeCompare(String(prev.savedAt || "")) >= 0) draftById.set(d.id, d);
      });
      const mergedDrafts = Array.from(draftById.values());

      // Learning/caseMemory/outbox: union by primary key/id where possible.
      const mergedLearning = (() => {
        const byKey = new Map<string, LearningPattern>();
        (existingLearning || []).forEach((l) => byKey.set(String((l as any).id ?? `${l.remedy}|${l.symptomKey}`), l));
        ((data.learning || []) as LearningPattern[]).forEach((l) => byKey.set(String((l as any).id ?? `${l.remedy}|${l.symptomKey}`), l));
        return Array.from(byKey.values());
      })();
      const mergedCaseMemory = upsertByIdPreferNewer(existingCaseMemory as any, (data.caseMemory || []) as any).map((m) => ensureMeta(m as any, { exportedAt }));
      const outboxById = new Map<string, SyncOutboxEntry>();
      (existingOutbox || []).forEach((o) => outboxById.set(o.id, o));
      ((data.syncOutbox || []) as SyncOutboxEntry[]).forEach((o) => outboxById.set(o.id, o));
      const mergedOutbox = Array.from(outboxById.values());

      const eventsById = new Map<string, OperationalEvent>();
      (existingEvents || []).forEach((e) => eventsById.set(e.id, e));
      ((data.operationalEvents || []) as OperationalEvent[]).forEach((e) => eventsById.set(e.id, e));
      const mergedEvents = Array.from(eventsById.values());

      await db.patients.clear();
      await db.consultations.clear();
      await db.appointments.clear();
      await db.drafts.clear();
      await db.learning.clear();
      await db.caseMemory.clear();
      await db.syncOutbox.clear();
      await db.operationalEvents.clear();

      await db.patients.bulkPut(mergedPatients as any);
      await db.consultations.bulkPut(mergedConsultations as any);
      await db.appointments.bulkPut(mergedAppointments as any);
      await db.drafts.bulkPut(mergedDrafts as any);
      await db.learning.bulkPut(mergedLearning as any);
      await db.caseMemory.bulkPut(mergedCaseMemory as any);
      await db.syncOutbox.bulkPut(mergedOutbox as any);
      await db.operationalEvents.bulkPut(mergedEvents as any);
    });
  }

  // Restore localStorage-backed operational state (queue, templates, defaults).
  try {
    const storage = (isV2 ? (bundle as ClinicExportBundleV2).storage : bundle.storage) as Record<string, string> | undefined;
    if (storage && typeof window !== "undefined") {
      Object.entries(storage).forEach(([k, v]) => {
        if (typeof v !== "string") return;
        if (opts.mode === "merge") {
          // Merge: don't overwrite existing operational keys by default.
          if (window.localStorage.getItem(k) != null) return;
        }
        window.localStorage.setItem(k, v);
      });
    }
  } catch {
    // ignore
  }
}

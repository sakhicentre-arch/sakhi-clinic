import Dexie from "dexie";

/**
 * SAKHI CLINIC DATABASE - V45.0 (Doctor Usability Layer)
 * Production-ready schema for high-integrity Homeopathic practice.
 *
 * V43 Additions:
 * - Patient: education, maritalStatus, occupation, caste, familyHistory, pastHistory
 * - Consultation: urine, stool, perspiration
 *
 * V44 Additions:
 * - Patient: allergies
 *
 * V45 Additions:
 * - Consultation: allergy, familyHistory, pastHistory, surgicalHistory
 * All new fields are optional — full backward compatibility with V44 data.
 */

export enum ConsultationOutcome {
  IMPROVED = "Improved",
  PARTIAL = "Partial",
  NO_CHANGE = "NoChange",
  WORSE = "Worse",
  FIRST_VISIT = "FirstVisit"
}

export type ClinicId = "Dabholi" | "City Light";
export type PaymentStatus = "paid" | "pending" | "waived";
export type AppointmentStatus = "booked" | "arrived" | "in-progress" | "done" | "missed" | "cancelled";
export type AppointmentType = "scheduled" | "walk-in";

export interface Report {
  id: string;
  name: string;
  fileUrl: string;
  uploadedAt: string;
}

export function normalizeOutcome(value: any): ConsultationOutcome {
  if (!value) return ConsultationOutcome.NO_CHANGE;

  const raw = String(value).toLowerCase().replace(/[\s_-]/g, "");

  const map: Record<string, ConsultationOutcome> = {
    improved: ConsultationOutcome.IMPROVED,
    recovered: ConsultationOutcome.IMPROVED,
    significant_improvement: ConsultationOutcome.IMPROVED,
    partial: ConsultationOutcome.PARTIAL,
    aggravation: ConsultationOutcome.PARTIAL,
    aggravationimprovement: ConsultationOutcome.PARTIAL,
    nochange: ConsultationOutcome.NO_CHANGE,
    no_change: ConsultationOutcome.NO_CHANGE,
    same: ConsultationOutcome.NO_CHANGE,
    worse: ConsultationOutcome.WORSE,
    worsening: ConsultationOutcome.WORSE,
    firstvisit: ConsultationOutcome.FIRST_VISIT,
    first_visit: ConsultationOutcome.FIRST_VISIT,
  };

  return map[raw] || ConsultationOutcome.NO_CHANGE;
}

export interface Medicine {
  id: string;
  name: string;
  potency?: string;
  dosage?: string;
  duration?: string;
  notes?: string;
  prescription?: {
    dietAdvice?: string[];
    precautions?: string[];
    instructions?: string;
    followUpDays?: string;
  };
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: number;
  version?: number;
  deviceId?: string;
  syncStatus?: "local" | "pending" | "synced" | "conflict";
}

export interface Consultation {
  id: string;
  patientId: string;
  appointmentId?: string;
  date: string;
  clinicId: ClinicId;
  language?: string;

  // Clinical core
  chiefComplaint: string;
  caseText: string;

  // Homeopathic structured capture
  mind?: string;
  generals?: string;
  appetite?: string;
  thirst?: string;
  sleep?: string;
  thermal?: string;
  desire?: string;
  aversion?: string;
  dream?: string;

  // Observations
  physicalObservation?: string;
  behaviour?: string;
  communication?: string;
  posture?: string;
  gesture?: string;

  // V43: Physical examination fields
  urine?: string;
  stool?: string;
  perspiration?: string;

  // Clinical dynamics
  sensation?: string;
  onset?: string;
  timeModal?: string;
  periodicity?: string;
  miasm?: string;
  caseType?: "acute" | "chronic";

  // ✅ V45: Consultation-specific medical history fields
  allergy?: string;
  familyHistory?: string;
  pastHistory?: string;
  surgicalHistory?: string;

  medicines: Medicine[];
  followUpDate?: string;
  outcome: ConsultationOutcome;
  heringsLawMatch?: boolean;
  fee?: number;
  paymentStatus?: PaymentStatus;
  paymentMode?: "cash" | "upi" | "card";

  createdAt?: string;
  updatedAt?: string;
  deletedAt?: number;
  version?: number;
  deviceId?: string;
  syncStatus?: "local" | "pending" | "synced" | "conflict";

  // Idempotency stamp for AI Learning Engine
  learnedAt?: string;
}

export interface Patient {
  id: string;
  name: string;
  gender: string;
  phone: string;
  age?: string | number;
  address?: string;
  referredBy?: string;
  referredTo?: string;
  reports?: Report[];
  lastVisit?: string;
  nextFollowUpDate?: string;
  miasm?: string;

  // V43: Extended patient profile
  education?: string;
  maritalStatus?: string;
  occupation?: string;
  caste?: string;
  familyHistory?: string;
  pastHistory?: string;

  // ✅ V44: Allergy record — patient-level, permanent clinical fact
  allergies?: string;   // e.g. "Penicillin, Sulfa drugs, Dust mites"

  createdAt?: string;
  updatedAt?: string;
  deletedAt?: number;
  version?: number;
  deviceId?: string;
  syncStatus?: "local" | "pending" | "synced" | "conflict";
}

export interface Appointment {
  id: string;
  patientId: string;
  patientName: string;
  clinic: ClinicId;
  date: string;
  time: string;
  type: AppointmentType;
  status: AppointmentStatus;
  reminderSent?: boolean;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: number;
  version?: number;
  deviceId?: string;
  syncStatus?: "local" | "pending" | "synced" | "conflict";
}

export interface LearningPattern {
  id?: number;
  remedy: string;
  symptomKey: string;
  score: number;
  count: number;
}

export interface LearningEntry extends LearningPattern {
  keywords?: string[];
}

export interface PrescriptionEntry extends Medicine {}

export interface CaseEntry extends Consultation {}

export interface CaseMemoryEntry {
  id?: number;
  patientId?: string;
  caseText: string;
  remedy: string;
  outcome: string;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: number;
  version?: number;
  deviceId?: string;
  syncStatus?: "local" | "pending" | "synced" | "conflict";
}

// ✅ V47: Draft persistence for consultation auto-save
export type OutboxOperationType = "create" | "update" | "delete";
export type OutboxSyncStatus = "pending" | "synced" | "failed" | "conflict";

export interface SyncOutboxEntry {
  id: string;
  entityType: "patient" | "consultation" | "appointment" | "queue" | "draft" | "caseMemory" | "learning";
  entityId: string;
  operationType: OutboxOperationType;
  payload: any;
  version: number;
  deviceId: string;
  timestamp: string;
  syncStatus: OutboxSyncStatus;
  retryCount: number;
  lastAttemptAt?: string;
}

export type OperationalEventLevel = "info" | "warn" | "error";

export interface OperationalEvent {
  id: string;
  timestamp: string;
  level: OperationalEventLevel;
  type: string;
  message: string;
  data?: any;
}

export interface ConsultationDraft {
  id: string;  // "draft-${patientId}"
  patientId: string;
  formData: any;  // Serialized FormData from ConsultationPage
  savedAt: string;  // ISO timestamp
}

// Module A: single-row install/identity record, used by originIdentityService
// to detect a change of browser origin (the most probable mechanism behind a
// prior patient-data-loss incident, since IndexedDB storage is scoped per
// origin). Not an auth/account record -- see Module B for that.
export interface AppMeta {
  id: string; // fixed singleton key, "app-meta"
  installId: string;
  firstRunOrigin: string;
  firstRunAt: string;
  baselineIsPostUpgrade?: boolean; // true if firstRunOrigin was backfilled on v50 upgrade, not a true first run
}

// Phase 2 — Reminder Engine. Generic over `type`/`channel`, not
// follow-up-specific: today's only scheduler (reminderSchedulerService.ts)
// generates "follow_up" reminders, but "appointment"/"custom" are real,
// modeled variants the same queue/delivery/analytics code already handles.
export type ReminderType = "follow_up" | "appointment" | "custom";
export type ReminderChannel = "whatsapp";
export type ReminderStatus = "pending" | "approved" | "sent" | "failed" | "cancelled" | "rejected";

export interface ReminderQueueEntry {
  id: string;
  patientId: string;
  patientName: string;
  phone?: string;
  type: ReminderType;
  channel: ReminderChannel;
  message: string;
  dueAt: string; // ISO timestamp -- when this reminder should be reviewed/sent
  status: ReminderStatus;
  sourceRef?: string; // traceability back to the alert/bucket that generated this, if any
  retryCount: number;
  createdAt: string;
  updatedAt: string;
}

export type ReminderHistoryAction = "sent" | "failed" | "cancelled";

export interface ReminderHistoryEntry {
  id: string;
  reminderId: string;
  patientId: string;
  patientName: string;
  channel: ReminderChannel;
  action: ReminderHistoryAction;
  message: string;
  attemptedAt: string;
  note?: string; // e.g. failure reason -- best-effort; no real delivery receipts exist without a WhatsApp Business API
}

class SakhiDB extends Dexie {
  patients!: Dexie.Table<Patient, string>;
  consultations!: Dexie.Table<Consultation, string>;
  learning!: Dexie.Table<LearningPattern, number>;
  caseMemory!: Dexie.Table<CaseMemoryEntry, number>;
  appointments!: Dexie.Table<Appointment, string>;
  drafts!: Dexie.Table<ConsultationDraft, string>;
  syncOutbox!: Dexie.Table<SyncOutboxEntry, string>;
  operationalEvents!: Dexie.Table<OperationalEvent, string>;
  appMeta!: Dexie.Table<AppMeta, string>;
  reminderQueue!: Dexie.Table<ReminderQueueEntry, string>;
  reminderHistory!: Dexie.Table<ReminderHistoryEntry, string>;

  constructor() {
    super("SakhiClinicDB");

    this.version(42).stores({
      patients: "id, name, phone, nextFollowUpDate, lastVisit",
      consultations: "id, patientId, date, outcome, clinicId, learnedAt",
      learning: "++id, [remedy+symptomKey], remedy, symptomKey",
      appointments: "id, date, patientId, status, clinic"
    });

    // V43: Extended patient profile + physical examination fields
    this.version(43).stores({
      patients: "id, name, phone, nextFollowUpDate, lastVisit",
      consultations: "id, patientId, date, outcome, clinicId, learnedAt",
      learning: "++id, [remedy+symptomKey], remedy, symptomKey",
      appointments: "id, date, patientId, status, clinic"
    }).upgrade(() => {
      // No migration required — new optional fields default to undefined
    });

    // ✅ V44: Allergies field on Patient — unindexed optional string
    // No structural index changes. Empty upgrade() is intentional.
    this.version(44).stores({
      patients: "id, name, phone, nextFollowUpDate, lastVisit",
      consultations: "id, patientId, date, outcome, clinicId, learnedAt",
      learning: "++id, [remedy+symptomKey], remedy, symptomKey",
      appointments: "id, date, patientId, status, clinic"
    }).upgrade(() => {
      // No migration required — allergies defaults to undefined on existing records
    });

    // ✅ V45: Consultation-specific history fields (allergy, familyHistory, pastHistory, surgicalHistory)
    // No structural index changes — new optional fields default to undefined
    this.version(45).stores({
      patients: "id, name, phone, nextFollowUpDate, lastVisit",
      consultations: "id, patientId, date, outcome, clinicId, learnedAt",
      learning: "++id, [remedy+symptomKey], remedy, symptomKey",
      appointments: "id, date, patientId, status, clinic"
    }).upgrade(() => {
      // No migration required — new fields default to undefined on existing records
    });

    this.version(46).stores({
      patients: "id, name, phone, nextFollowUpDate, lastVisit, deletedAt, createdAt, updatedAt",
      consultations: "id, patientId, appointmentId, date, outcome, clinicId, learnedAt, deletedAt, createdAt, updatedAt",
      learning: "++id, [remedy+symptomKey], remedy, symptomKey",
      caseMemory: "++id, patientId, remedy, outcome, deletedAt, createdAt, updatedAt",
      appointments: "id, date, patientId, status, clinic, [date+time+clinic], [clinic+date], deletedAt, createdAt, updatedAt"
    }).upgrade(async (tx) => {
      const now = new Date().toISOString();
      await tx.table("patients").toCollection().modify((patient) => {
        patient.createdAt = patient.createdAt || now;
        patient.updatedAt = patient.updatedAt || patient.createdAt || now;
      });
      await tx.table("consultations").toCollection().modify((consultation) => {
        consultation.createdAt = consultation.createdAt || consultation.date || now;
        consultation.updatedAt = consultation.updatedAt || consultation.createdAt || now;
      });
      await tx.table("appointments").toCollection().modify((appointment) => {
        appointment.createdAt = appointment.createdAt || now;
        appointment.updatedAt = appointment.updatedAt || appointment.createdAt || now;
      });
    });

    // V47: Consultation draft persistence (non-breaking)
    this.version(47).stores({
      patients: "id, name, phone, nextFollowUpDate, lastVisit, deletedAt, createdAt, updatedAt",
      consultations: "id, patientId, appointmentId, date, outcome, clinicId, learnedAt, deletedAt, createdAt, updatedAt",
      learning: "++id, [remedy+symptomKey], remedy, symptomKey",
      caseMemory: "++id, patientId, remedy, outcome, deletedAt, createdAt, updatedAt",
      appointments: "id, date, patientId, status, clinic, [date+time+clinic], [clinic+date], deletedAt, createdAt, updatedAt",
      drafts: "id, patientId, savedAt"
    }).upgrade(() => {
      // No migration - drafts table starts empty
    });

    // V48: Local mutation outbox (sync-ready, non-breaking)
    this.version(48).stores({
      patients: "id, name, phone, nextFollowUpDate, lastVisit, deletedAt, createdAt, updatedAt",
      consultations: "id, patientId, appointmentId, date, outcome, clinicId, learnedAt, deletedAt, createdAt, updatedAt",
      learning: "++id, [remedy+symptomKey], remedy, symptomKey",
      caseMemory: "++id, patientId, remedy, outcome, deletedAt, createdAt, updatedAt",
      appointments: "id, date, patientId, status, clinic, [date+time+clinic], [clinic+date], deletedAt, createdAt, updatedAt",
      drafts: "id, patientId, savedAt",
      syncOutbox: "id, entityType, entityId, operationType, timestamp, syncStatus, retryCount"
    }).upgrade(() => {
      // No migration - outbox starts empty
    });

    // V49: Local operational event log (non-breaking)
    this.version(49).stores({
      patients: "id, name, phone, nextFollowUpDate, lastVisit, deletedAt, createdAt, updatedAt",
      consultations: "id, patientId, appointmentId, date, outcome, clinicId, learnedAt, deletedAt, createdAt, updatedAt",
      learning: "++id, [remedy+symptomKey], remedy, symptomKey",
      caseMemory: "++id, patientId, remedy, outcome, deletedAt, createdAt, updatedAt",
      appointments: "id, date, patientId, status, clinic, [date+time+clinic], [clinic+date], deletedAt, createdAt, updatedAt",
      drafts: "id, patientId, savedAt",
      syncOutbox: "id, entityType, entityId, operationType, timestamp, syncStatus, retryCount",
      operationalEvents: "id, timestamp, level, type"
    }).upgrade(() => {
      // No migration - operational log starts empty
    });

    // V50 (Module A — Production Data Layer): single-row appMeta table for the
    // origin-identity self-check. Purely additive -- no existing table's shape
    // changes, no .upgrade() data transform, since there is nothing in any
    // existing table to migrate INTO appMeta from. Populating the single row
    // (with the "this is a post-upgrade baseline, not a true first run" flag)
    // happens in originIdentityService.ts at app start, not here, since that
    // logic needs logOperationalEvent() (in operationalEventLogService.ts),
    // which itself imports `db` from this file -- importing it back here would
    // be circular.
    this.version(50).stores({
      patients: "id, name, phone, nextFollowUpDate, lastVisit, deletedAt, createdAt, updatedAt",
      consultations: "id, patientId, appointmentId, date, outcome, clinicId, learnedAt, deletedAt, createdAt, updatedAt",
      learning: "++id, [remedy+symptomKey], remedy, symptomKey",
      caseMemory: "++id, patientId, remedy, outcome, deletedAt, createdAt, updatedAt",
      appointments: "id, date, patientId, status, clinic, [date+time+clinic], [clinic+date], deletedAt, createdAt, updatedAt",
      drafts: "id, patientId, savedAt",
      syncOutbox: "id, entityType, entityId, operationType, timestamp, syncStatus, retryCount",
      operationalEvents: "id, timestamp, level, type",
      appMeta: "id"
    });

    // V51 (Phase 2 — Reminder Engine): reminderQueue + reminderHistory.
    // Purely additive, same pattern as V50 -- no existing table's shape
    // changes, no .upgrade() data transform, since there is nothing in any
    // existing table to migrate INTO these from.
    this.version(51).stores({
      patients: "id, name, phone, nextFollowUpDate, lastVisit, deletedAt, createdAt, updatedAt",
      consultations: "id, patientId, appointmentId, date, outcome, clinicId, learnedAt, deletedAt, createdAt, updatedAt",
      learning: "++id, [remedy+symptomKey], remedy, symptomKey",
      caseMemory: "++id, patientId, remedy, outcome, deletedAt, createdAt, updatedAt",
      appointments: "id, date, patientId, status, clinic, [date+time+clinic], [clinic+date], deletedAt, createdAt, updatedAt",
      drafts: "id, patientId, savedAt",
      syncOutbox: "id, entityType, entityId, operationType, timestamp, syncStatus, retryCount",
      operationalEvents: "id, timestamp, level, type",
      appMeta: "id",
      reminderQueue: "id, patientId, type, status, dueAt, channel",
      reminderHistory: "id, reminderId, patientId, attemptedAt, action"
    });
  }
}

export const db = new SakhiDB();

// Convenience helper: fetch all non-deleted patients from the canonical DB
export async function getAllPatientsFromDB() {
  return db.patients.filter((p) => !p.deletedAt).toArray();
}

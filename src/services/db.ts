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
export type PaymentStatus = "paid" | "pending" | "partial" | "waived";
export type PaymentMode = "cash" | "upi" | "card" | "bank_transfer";
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
  paymentMode?: PaymentMode;
  // V54: operational payment tracking -- evidence/record-keeping only, never
  // accounting (see docs/CLINIC_WORKFLOW_MODULES.md). amountReceived can be
  // less than fee for "partial"; paymentScreenshotDataUrl is a client-side-
  // compressed data URL (never a raw multi-MB photo -- see paymentService.ts),
  // stored as evidence only, not a receipt/invoice document.
  paymentDate?: string;
  amountReceived?: number;
  paymentReferenceNumber?: string;
  paymentNotes?: string;
  paymentScreenshotDataUrl?: string;

  createdAt?: string;
  updatedAt?: string;
  deletedAt?: number;
  version?: number;
  deviceId?: string;
  syncStatus?: "local" | "pending" | "synced" | "conflict";

  // Idempotency stamp for AI Learning Engine
  learnedAt?: string;

  // Idempotency stamp for the Rubric Intelligence Engine (RC2 Phase 1) --
  // same convention as learnedAt above: prevents regenerating duplicate
  // pending rubric rows every time an already-processed consultation is
  // re-saved. Set once rubricParserService/rubricMatcherService have run
  // for this consultation.
  rubricsGeneratedAt?: string;
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
  /** Marks nextFollowUpDate as doctor-cancelled rather than simply unset --
   * only meaningful while it equals the current nextFollowUpDate (see
   * followUpIntelligenceService.ts's "cancelled" bucket and
   * patientService.ts's cancelFollowUp/syncPatientFollowUp). Recomputing
   * nextFollowUpDate to a genuinely new date naturally "un-cancels" it,
   * since the two values no longer match. */
  followUpCancelledDate?: string;
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

  // Doctor Productivity: pinned patients shown first in Recent Patients /
  // Quick Actions. Plain unindexed property -- no version bump needed,
  // same pattern as the V54 payment fields.
  pinned?: boolean;

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

// RC2 Phase 1 -- Rubric Intelligence Engine. Converts free-text consultation
// findings into structured homeopathic rubric categories for doctor review.
// NOT the same feature as the "Rubric Suggestion Automation (Module 7)" test
// naming elsewhere in this codebase, which is really learningEngine.ts's
// historical remedy-pattern matching (colloquial use of the word "rubric") --
// see RUBRIC_ENGINE_ARCHITECTURE.md's terminology section. This feature
// identifies which homeopathic category a symptom statement belongs to
// (Mind, Generals, Particulars, Modalities, ...); it never suggests or
// ranks remedies, and it does not match against a licensed repertory
// (that's a separate, later, data-licensing-gated phase).
//
// One normalized table with a status field, deliberately mirroring
// ReminderQueueEntry/ReminderStatus's proven shape above rather than
// separate approved/rejected tables -- see RUBRIC_ENGINE_ARCHITECTURE.md's
// domain-model section for why each requested "entity" (Rubric Category,
// Rubric Source, Rubric Match, Rubric Confidence, Approved/Rejected
// Rubric, Rubric Group, Doctor Notes) is a field here rather than a table.
export type RubricCategory =
  | "mind"
  | "generals"
  | "particulars"
  | "modalities"
  | "sensations"
  | "locations"
  | "concomitants"
  | "etiology"
  | "sleep"
  | "foodDesires"
  | "foodAversions"
  | "thermals"
  | "perspiration"
  | "menses"
  | "pregnancy"
  | "children"
  | "oldAge"
  | "familyHistory";

export type RubricSource = "ai" | "manual";
export type RubricStatus = "pending" | "approved" | "rejected";

export interface RubricEntry {
  id: string;
  consultationId: string;
  patientId: string; // denormalized, same convention as ReminderQueueEntry.patientId
  category: RubricCategory;
  text: string; // the rubric phrase itself, e.g. "Desires: sweets"
  matchedSentence?: string; // AI only: the source text snippet that triggered this suggestion
  reason?: string; // AI only: human-readable why this was suggested
  confidence?: number; // AI only: 0-1
  evidence?: string; // AI only: supporting detail beyond the reason summary
  priority?: number; // ranking among suggestions generated for the same consultation
  source: RubricSource;
  status: RubricStatus;
  pinned?: boolean;
  doctorNote?: string;
  // Merge/Split audit trail -- parent pointers rather than a separate join
  // table, per RUBRIC_ENGINE_ARCHITECTURE.md's "Rubric Group" mapping.
  mergedFromIds?: string[];
  splitFromId?: string;
  decidedAt?: string; // set when status transitions to approved/rejected; cleared on undo
  createdAt: string;
  updatedAt: string;
  deletedAt?: number;
  version?: number;
  deviceId?: string;
  syncStatus?: "local" | "pending" | "synced" | "conflict";
}

// Pre-Phase-3 (Backup Engine): every backup/restore operation produces a
// structured, persisted job record with lifecycle states and a progress
// event log -- not just a fire-and-forget async function call. This is
// what lets a future real Google Drive upload (slow, multi-step, needs a
// progress indicator) plug into the SAME engine a synchronous local
// download uses today: only backupManager.ts and backupJobService.ts know
// this type exists. StorageProvider implementations (including a future
// real GoogleDriveProvider) only ever see a plain onProgress callback --
// see storageProvider.ts -- never this record itself.
export type BackupJobKind = "export" | "auto" | "restore";
export type BackupJobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";
export type BackupJobStage =
  | "queued"
  | "planning"
  | "serializing"
  | "encrypting"
  | "compressing"
  | "validating"
  | "saving"
  | "verifying"
  | "parsing"
  | "decrypting"
  | "decompressing"
  | "restoring"
  | "done";

// Phase 3: a coarse, machine-readable category alongside the free-text
// `error` message -- lets retry logic (backupRetryService.ts) and the UI
// distinguish "worth retrying automatically" (network) from "retrying
// won't help without doctor action" (auth, quota) without parsing error
// text.
export type BackupJobFailureReason = "network" | "auth" | "quota" | "validation" | "corruption" | "cancelled" | "unknown";

export interface BackupJobEvent {
  id: string;
  stage: BackupJobStage;
  message: string;
  timestamp: string;
  progressPercent?: number; // 0-100; most local stages are instant and omit this, a real Drive upload would report it per chunk
  data?: Record<string, any>;
}

export interface BackupJob {
  id: string;
  kind: BackupJobKind;
  providerId: string;
  status: BackupJobStatus;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  error?: string;
  sizeBytes?: number;
  filename?: string;
  events: BackupJobEvent[]; // append-only progress log for this job -- events are only ever appended, never rewritten or removed

  // Phase 3: cloud-ready fields. All optional/defaulted so existing v52
  // job records (before this migration) remain valid without a data
  // transform -- see the v53 .stores() block below, purely additive.
  retryCount: number;
  maxRetries: number;
  nextRetryAt?: string;
  failureReason?: BackupJobFailureReason;
  /** Provider-specific data opaque to the engine (e.g. a Drive file ID). Never inspected by backupManager.ts's own logic. */
  providerMetadata?: Record<string, any>;
  /** Mirrors the most recent "saving" stage event's progressPercent, kept as its own field for cheap UI reads without scanning the full event log. */
  uploadProgressPercent?: number;
  /** Mirrors the most recent "verifying" stage event's progressPercent. */
  verificationProgressPercent?: number;
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
  backupJobs!: Dexie.Table<BackupJob, string>;
  rubrics!: Dexie.Table<RubricEntry, string>;

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

    // V52 (pre-Phase-3 — Backup Engine job tracking): backupJobs. Purely
    // additive, same pattern as V50/V51.
    this.version(52).stores({
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
      reminderHistory: "id, reminderId, patientId, attemptedAt, action",
      backupJobs: "id, kind, providerId, status, createdAt"
    });

    // V53 (Phase 3 — cloud-ready BackupJob fields): adds a nextRetryAt
    // index to backupJobs so backupRetryService.ts can efficiently query
    // "which jobs are due for retry" instead of scanning every job. The
    // new BackupJob fields themselves (retryCount, maxRetries,
    // failureReason, providerMetadata, uploadProgressPercent,
    // verificationProgressPercent) are plain object properties, not new
    // indexes -- they don't require a version bump on their own, but the
    // new index does. Purely additive: existing v52 job rows are read
    // with these fields simply absent/undefined, which every reader
    // already treats as "not yet retried" / "no provider metadata."
    this.version(53).stores({
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
      reminderHistory: "id, reminderId, patientId, attemptedAt, action",
      backupJobs: "id, kind, providerId, status, createdAt, nextRetryAt"
    });

    // V54 (Clinic Workflow Modules -- Payment Tracker): adds a paymentStatus
    // index to consultations so the Payment Dashboard/Patient Ledger can
    // efficiently query "which consultations are pending/partial" instead of
    // scanning every row. The new Consultation fields themselves
    // (paymentDate, amountReceived, paymentReferenceNumber, paymentNotes,
    // paymentScreenshotDataUrl) are plain object properties, not new
    // indexes -- same "purely additive" pattern as V53's BackupJob fields.
    // Existing rows are read with these simply absent/undefined, which
    // paymentService.ts treats as "no payment recorded yet."
    this.version(54).stores({
      patients: "id, name, phone, nextFollowUpDate, lastVisit, deletedAt, createdAt, updatedAt",
      consultations: "id, patientId, appointmentId, date, outcome, clinicId, paymentStatus, learnedAt, deletedAt, createdAt, updatedAt",
      learning: "++id, [remedy+symptomKey], remedy, symptomKey",
      caseMemory: "++id, patientId, remedy, outcome, deletedAt, createdAt, updatedAt",
      appointments: "id, date, patientId, status, clinic, [date+time+clinic], [clinic+date], deletedAt, createdAt, updatedAt",
      drafts: "id, patientId, savedAt",
      syncOutbox: "id, entityType, entityId, operationType, timestamp, syncStatus, retryCount",
      operationalEvents: "id, timestamp, level, type",
      appMeta: "id",
      reminderQueue: "id, patientId, type, status, dueAt, channel",
      reminderHistory: "id, reminderId, patientId, attemptedAt, action",
      backupJobs: "id, kind, providerId, status, createdAt, nextRetryAt"
    });

    // V55 (RC2 Phase 1 -- Rubric Intelligence Engine): rubrics. Purely
    // additive, same pattern as V51/V52 -- no existing table's shape
    // changes, no .upgrade() data transform, since there is nothing in any
    // existing table to migrate INTO this from. The new Consultation field
    // (rubricsGeneratedAt) is a plain optional property, not an index, same
    // "purely additive" treatment as V53/V54's new fields -- it doesn't
    // need to appear in the .stores() string.
    this.version(55).stores({
      patients: "id, name, phone, nextFollowUpDate, lastVisit, deletedAt, createdAt, updatedAt",
      consultations: "id, patientId, appointmentId, date, outcome, clinicId, paymentStatus, learnedAt, deletedAt, createdAt, updatedAt",
      learning: "++id, [remedy+symptomKey], remedy, symptomKey",
      caseMemory: "++id, patientId, remedy, outcome, deletedAt, createdAt, updatedAt",
      appointments: "id, date, patientId, status, clinic, [date+time+clinic], [clinic+date], deletedAt, createdAt, updatedAt",
      drafts: "id, patientId, savedAt",
      syncOutbox: "id, entityType, entityId, operationType, timestamp, syncStatus, retryCount",
      operationalEvents: "id, timestamp, level, type",
      appMeta: "id",
      reminderQueue: "id, patientId, type, status, dueAt, channel",
      reminderHistory: "id, reminderId, patientId, attemptedAt, action",
      backupJobs: "id, kind, providerId, status, createdAt, nextRetryAt",
      rubrics: "id, consultationId, patientId, category, status, source, createdAt, deletedAt"
    });
  }
}

export const db = new SakhiDB();

// Convenience helper: fetch all non-deleted patients from the canonical DB
export async function getAllPatientsFromDB() {
  return db.patients.filter((p) => !p.deletedAt).toArray();
}

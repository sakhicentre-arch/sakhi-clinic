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
}

class SakhiDB extends Dexie {
  patients!: Dexie.Table<Patient, string>;
  consultations!: Dexie.Table<Consultation, string>;
  learning!: Dexie.Table<LearningPattern, number>;
  caseMemory!: Dexie.Table<CaseMemoryEntry, number>;
  appointments!: Dexie.Table<Appointment, string>;

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
  }
}

export const db = new SakhiDB();

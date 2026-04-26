import Dexie from "dexie";

/**
 * SAKHI CLINIC DATABASE - V42.0 (Clinical Hardened)
 * Production-ready schema for high-integrity Homeopathic practice.
 * * This version includes the 'learnedAt' stamp for AI idempotency.
 */

export enum ConsultationOutcome {
  IMPROVED = "Improved",
  PARTIAL = "Partial",
  NO_CHANGE = "NoChange",
  WORSE = "Worse",
  FIRST_VISIT = "FirstVisit"
}

/**
 * Validates and maps string values to strict ConsultationOutcome enums.
 */
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
  potency: string;
  dosage: string;
  duration: string;
  notes?: string;
}

export interface Consultation {
  id: string;
  patientId: string;
  date: string;
  clinicId: "Dabholi" | "City Light";
  
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
  
  // Clinical dynamics
  sensation?: string;
  onset?: string;
  timeModal?: string;
  periodicity?: string;
  miasm?: string;
  caseType?: "acute" | "chronic";
  
  medicines: Medicine[];
  followUpDate?: string;
  outcome: ConsultationOutcome; 
  heringsLawMatch?: boolean;
  fee?: number;
  paymentStatus?: "paid" | "pending" | "waived";

  // ✅ SEAL OF EXCELLENCE FIX: Idempotency stamp for AI Learning Engine
  // Prevents duplicate pattern counting during consultation edits.
  learnedAt?: string; 
}

export interface Patient {
  id: string;
  name: string;
  gender: string;
  phone: string;
  age?: string | number;
  address?: string;
  lastVisit?: string;
  nextFollowUpDate?: string;
  miasm?: string;
}

export interface LearningPattern {
  id?: number;
  remedy: string;
  symptomKey: string;
  score: number;
  count: number;
}

class SakhiDB extends Dexie {
  patients!: Dexie.Table<Patient, string>;
  consultations!: Dexie.Table<Consultation, string>;
  learning!: Dexie.Table<LearningPattern, number>;
  appointments!: Dexie.Table<any, string>;

  constructor() {
    super("SakhiClinicDB");

    // Version 42: Optimized for AI lookup and follow-up tracking
    this.version(42).stores({
      patients: "id, name, phone, nextFollowUpDate, lastVisit",
      consultations: "id, patientId, date, outcome, clinicId, learnedAt",
      learning: "++id, [remedy+symptomKey], remedy, symptomKey",
      appointments: "id, date, patientId, status, clinic"
    });
  }
}

export const db = new SakhiDB();
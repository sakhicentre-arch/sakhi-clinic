// Re-export all types from db.ts (single source of truth)
export type {
  Medicine,
  ConsultationOutcome,
  Patient,
  Appointment,
  Consultation,
  PrescriptionEntry,
  CaseEntry,
  LearningEntry,
} from "../services/db";

// Re-export service types
export type { DbPrescription } from "../services/prescriptionService";

// Re-export database instance
export { db } from "../services/db";

// Re-export service objects
export { appointmentService } from "../services/appointmentService";
export { consultationService } from "../services/consultationService";
export { prescriptionService } from "../services/prescriptionService";
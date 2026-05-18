import type {
  Appointment,
  ClinicId,
  Consultation,
  ConsultationOutcome,
  LearningEntry,
  LearningPattern,
  Medicine,
  Patient,
  PaymentStatus,
  PrescriptionEntry,
  Report,
  CaseEntry,
  CaseMemoryEntry,
  AppointmentStatus,
  AppointmentType,
} from "../services/db";

export type {
  Appointment,
  ClinicId,
  Consultation,
  ConsultationOutcome,
  LearningEntry,
  LearningPattern,
  Medicine,
  Patient,
  PaymentStatus,
  PrescriptionEntry,
  Report,
  CaseEntry,
  CaseMemoryEntry,
  AppointmentStatus,
  AppointmentType,
};

export type PatientId = string;
export type ConsultationId = string;
export type AppointmentId = string;
export type ReportId = string;
export type MedicineId = string;
export type CaseMemoryId = number;

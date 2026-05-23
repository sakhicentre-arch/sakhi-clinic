import type { Appointment, Consultation, Patient } from "../services/db";

export type EntityType = "patient" | "consultation" | "appointment";
export type OperationType = "create" | "update" | "delete";

export type MutationContract<T> = {
  entityType: EntityType;
  entityId: string;
  operationType: OperationType;
  entity: T;
  version: number;
  // Stored in outbox payload; must be migration-safe and JSON-serializable.
  payload: any;
};

export function createPatientMutation(patient: Patient): MutationContract<Patient> {
  return {
    entityType: "patient",
    entityId: patient.id,
    operationType: "create",
    entity: patient,
    version: typeof patient.version === "number" ? patient.version : 1,
    payload: patient,
  };
}

export function updatePatientMutation(patient: Patient): MutationContract<Patient> {
  return {
    entityType: "patient",
    entityId: patient.id,
    operationType: "update",
    entity: patient,
    version: typeof patient.version === "number" ? patient.version : 1,
    payload: patient,
  };
}

export function deletePatientMutation(patientId: string, meta: { version: number }): MutationContract<{ id: string }> {
  return {
    entityType: "patient",
    entityId: patientId,
    operationType: "delete",
    entity: { id: patientId },
    version: meta.version,
    payload: { id: patientId },
  };
}

export function upsertConsultationMutation(c: Consultation): MutationContract<Consultation> {
  return {
    entityType: "consultation",
    entityId: c.id,
    operationType: "update",
    entity: c,
    version: typeof c.version === "number" ? c.version : 1,
    payload: c,
  };
}

export function completeAppointmentMutation(a: Appointment): MutationContract<Appointment> {
  return {
    entityType: "appointment",
    entityId: a.id,
    operationType: "update",
    entity: a,
    version: typeof a.version === "number" ? a.version : 1,
    payload: a,
  };
}


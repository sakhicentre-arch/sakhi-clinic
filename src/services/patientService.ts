/**
 * patientService.ts
 * Sakhi Clinic — Production Patient Integrity Layer (V12.0)
 * Logic: Automated Metadata Synchronization & Follow-up Recalculation
 * V12.1: Added restorePatient function
 */

import { db, Patient } from "./db";

const nowIso = () => new Date().toISOString();

export async function syncPatientFollowUp(patientId: string): Promise<void> {
  const now = new Date().toISOString().split("T")[0];
  
  const consultations = await db.consultations
    .where("patientId")
    .equals(patientId)
    .filter((c) => !c.deletedAt)
    .toArray();

  if (consultations.length === 0) return;

  const futureFollowUps = consultations
    .filter(c => c.followUpDate && c.followUpDate >= now)
    .map(c => c.followUpDate as string)
    .sort();

  const nextDate = futureFollowUps[0] || ""; 

  const lastVisitRecord = consultations.sort((a, b) => 
    b.date.localeCompare(a.date)
  )[0];

  await db.patients.update(patientId, {
    nextFollowUpDate: nextDate,
    lastVisit: lastVisitRecord?.date || "",
    updatedAt: nowIso()
  });
}

export async function getAllPatients(): Promise<Patient[]> {
  return db.patients.filter((p) => !p.deletedAt).toArray();
}

export async function getPatientById(id: string): Promise<Patient | undefined> {
  const patient = await db.patients.get(id);
  return patient?.deletedAt ? undefined : patient;
}

export async function addPatient(patient: Patient): Promise<void> {
  const timestamp = nowIso();
  const record: Patient = {
    ...patient,
    createdAt: patient.createdAt || timestamp,
    updatedAt: timestamp,
  };
  await db.patients.add(record);
}

export async function updatePatient(id: string, updates: Partial<Patient>): Promise<void> {
  const changed = await db.patients.update(id, {
    ...updates,
    updatedAt: nowIso(),
  });
  if (changed === 0) {
    throw new Error(`[patientService] Patient not found: ${id}`);
  }
}

export async function deletePatient(id: string): Promise<void> {
  const timestamp = Date.now();
  const updatedAt = nowIso();
  await db.transaction("rw", [db.patients, db.consultations, db.appointments], async () => {
    const changed = await db.patients.update(id, { deletedAt: timestamp, updatedAt });
    if (changed === 0) {
      throw new Error(`[patientService] Patient not found: ${id}`);
    }
    await db.consultations.where("patientId").equals(id).modify({ deletedAt: timestamp, updatedAt });
    await db.appointments.where("patientId").equals(id).modify({ deletedAt: timestamp, updatedAt });
  });
}

// ✅ V12.1: Restore a soft-deleted patient and all their related records
export async function restorePatient(id: string): Promise<void> {
  const updatedAt = nowIso();
  await db.transaction("rw", [db.patients, db.consultations, db.appointments], async () => {
    const changed = await db.patients.update(id, { deletedAt: undefined, updatedAt });
    if (changed === 0) {
      throw new Error(`[patientService] Patient not found for restore: ${id}`);
    }
    await db.consultations.where("patientId").equals(id).modify({ deletedAt: undefined, updatedAt });
    await db.appointments.where("patientId").equals(id).modify({ deletedAt: undefined, updatedAt });
  });
}
export async function getDeletedPatients(): Promise<Patient[]> {
  return db.patients.filter((p) => !!p.deletedAt).toArray();
}
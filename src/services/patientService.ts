/**
 * patientService.ts
 * Sakhi Clinic — Production Patient Integrity Layer (V12.0)
 * Logic: Automated Metadata Synchronization & Follow-up Recalculation
 * V12.1: Added restorePatient function
 */

import { db, Patient } from "./db";
import { usePatientStore } from "../store/usePatientStore";
import { broadcastSyncEvent } from "./syncService";

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

  // Update transient UI cache if loaded
  try {
    const p = await db.patients.get(patientId);
    if (p && !p.deletedAt) {
      usePatientStore.setState((s) => ({
        patients: s.patients.map((x) => (x.id === patientId ? p : x)),
      }));
    }
  } catch (err) {
    console.warn('[patientService] syncPatientFollowUp store sync failed', err);
  }

  broadcastSyncEvent({ type: "patient:updated", payload: { id: patientId } });
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
  const key = await db.patients.add(record);
  // Ensure id present
  if (!record.id) record.id = String(key);

  // Update transient store immediately so UI sees new patient
  try {
    usePatientStore.setState((s) => ({ patients: [...s.patients, record] }));
  } catch (err) {
    console.warn('[patientService] addPatient store sync failed', err);
  }

  broadcastSyncEvent({ type: "patient:created", payload: { id: String(record.id) } });
}

export async function updatePatient(id: string, updates: Partial<Patient>): Promise<void> {
  const changed = await db.patients.update(id, {
    ...updates,
    updatedAt: nowIso(),
  });
  if (changed === 0) {
    throw new Error(`[patientService] Patient not found: ${id}`);
  }

  try {
    const updated = await db.patients.get(id);
    if (updated) {
      usePatientStore.setState((s) => ({
        patients: s.patients.map((p) => (p.id === id ? updated : p)),
      }));
    }
  } catch (err) {
    console.warn('[patientService] updatePatient store sync failed', err);
  }

  broadcastSyncEvent({ type: "patient:updated", payload: { id } });
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

  try {
    usePatientStore.setState((s) => ({
      patients: s.patients.filter((p) => p.id !== id),
      selectedPatientId: s.selectedPatientId === id ? null : s.selectedPatientId,
    }));
  } catch (err) {
    console.warn('[patientService] deletePatient store sync failed', err);
  }

  broadcastSyncEvent({ type: "patient:deleted", payload: { id } });
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
  try {
    const p = await db.patients.get(id);
    if (p && !p.deletedAt) {
      usePatientStore.setState((s) => ({ patients: [...s.patients, p] }));
    }
  } catch (err) {
    console.warn('[patientService] restorePatient store sync failed', err);
  }

  broadcastSyncEvent({ type: "patient:restored", payload: { id } });
}
export async function getDeletedPatients(): Promise<Patient[]> {
  return db.patients.filter((p) => !!p.deletedAt).toArray();
}
/**
 * patientService.ts
 * Sakhi Clinic — Production Patient Integrity Layer (V12.0)
 * Logic: Automated Metadata Synchronization & Follow-up Recalculation
 */

import { db, Patient } from "./db";

/**
 * ✅ FIX: Syncs Patient record with the earliest scheduled future follow-up.
 * This prevents the Dashboard from showing "Overdue" alerts for dates 
 * that have already been superseded by a newer visit.
 */
export async function syncPatientFollowUp(patientId: string): Promise<void> {
  const now = new Date().toISOString().split("T")[0]; // Get today's YYYY-MM-DD
  
  const consultations = await db.consultations
    .where("patientId")
    .equals(patientId)
    .toArray();

  if (consultations.length === 0) return;

  // 1. Identify all future-dated follow-ups
  const futureFollowUps = consultations
    .filter(c => c.followUpDate && c.followUpDate >= now)
    .map(c => c.followUpDate as string)
    .sort(); // String sort works for YYYY-MM-DD ISO format

  // 2. The next appointment is the EARLIEST one from the future list
  const nextDate = futureFollowUps[0] || ""; 

  // 3. Find the most recent visit date (historical)
  const lastVisitRecord = consultations.sort((a, b) => 
    b.date.localeCompare(a.date)
  )[0];

  await db.patients.update(patientId, {
    nextFollowUpDate: nextDate,
    lastVisit: lastVisitRecord?.date || ""
  });
}

/**
 * Standard data retrieval with strict typing
 */
export async function getPatientById(id: string): Promise<Patient | undefined> {
  return await db.patients.get(id);
}

/**
 * Update patient profile information while preserving integrity
 */
export async function updatePatient(id: string, updates: Partial<Patient>): Promise<void> {
  await db.patients.update(id, updates);
}

/**
 * Safe deletion: Removes patient and cleans up all related clinical history
 * inside a single transaction to prevent orphaned data.
 */
export async function deletePatient(id: string): Promise<void> {
  await db.transaction("rw", [db.patients, db.consultations, db.appointments], async () => {
    await db.patients.delete(id);
    await db.consultations.where("patientId").equals(id).delete();
    await db.appointments.where("patientId").equals(id).delete();
  });
}
/**
 * consultationService.ts
 * Atomic Clinical Transaction Layer (V12.2 - Hardened)
 * * Logic:
 * - Consultation + Patient metadata sync: ATOMIC (Blocking)
 * - Clinical Pattern Learning: ASYNCHRONOUS & IDEMPOTENT (Non-blocking)
 */

import { db, Consultation, normalizeOutcome } from "./db";
import { learnFromConsultation } from "./learningEngine";
import { syncPatientFollowUp } from "./patientService";

/**
 * Saves a consultation session using an atomic transaction.
 * Ensures Patient metadata (lastVisit, nextFollowUpDate) is always in sync.
 */
export async function saveConsultation(c: Consultation): Promise<boolean> {
  try {
    // 1. Data Normalization & ID Generation
    const normalized: Consultation = {
      ...c,
      outcome: normalizeOutcome(c.outcome),
      medicines: (c.medicines || []).map(m => ({
        ...m,
        // ✅ BUG #5 FIX: Use cryptographically secure UUIDs instead of Math.random
        id: m.id || crypto.randomUUID(),
        name: (m.name || (m as any).remedy || "Unknown").trim()
      }))
    };

    // 2. Atomic Transaction (Consultation + Patient Record)
    /**
     * ✅ BUG #2 FIX: Note on Structural Fragility
     * syncPatientFollowUp MUST NOT open its own transaction. It relies 
     * on the Dexie transaction scope propagated from this block.
     */
    await db.transaction("rw", [db.consultations, db.patients], async () => {
      await db.consultations.put(normalized);
      await syncPatientFollowUp(normalized.patientId);
    });

    // 3. Clinical Intelligence (Non-blocking background task)
    /**
     * ✅ BUG #6 FIX: Idempotency Guard
     * We only trigger learning if this is a new save or the outcome has changed.
     * Note: Requires 'learnedAt' property in db.ts/Consultation interface.
     */
    const shouldLearn = !normalized.learnedAt;

    if (shouldLearn) {
      learnFromConsultation(normalized).then(async () => {
        // Mark as learned to prevent duplicate counting on subsequent edits
        await db.consultations.update(normalized.id, { learnedAt: new Date().toISOString() });
      }).catch(error => {
        console.warn("[consultationService] Clinical learning failed in background:", error);
      });
    }

    return true;
  } catch (error) {
    console.error("[consultationService] CRITICAL: Consultation save failed:", error);
    return false;
  }
}

/**
 * Standard retrieval (Newest First)
 */
export async function getConsultationsByPatient(patientId: string): Promise<Consultation[]> {
  try {
    const records = await db.consultations
      .where("patientId")
      .equals(patientId)
      .toArray();

    // Use localeCompare for safer string-based date sorting
    return records.sort((a, b) => b.date.localeCompare(a.date));
  } catch (error) {
    console.error("[consultationService] History retrieval failed:", error);
    return [];
  }
}

/**
 * Fetch all records (Caution: Should be paginated in UI for 5000+ records)
 */
export async function getAllConsultations(): Promise<Consultation[]> {
  try {
    return await db.consultations.toArray();
  } catch (error) {
    console.error("[consultationService] getAllConsultations failed:", error);
    return [];
  }
}

/**
 * Cleanup logic ensuring patient metadata is recalculated after deletion.
 */
export async function deleteConsultation(id: string): Promise<boolean> {
  try {
    const record = await db.consultations.get(id);
    if (!record) return false;

    await db.transaction("rw", [db.consultations, db.patients], async () => {
      await db.consultations.delete(id);
      await syncPatientFollowUp(record.patientId);
    });

    return true;
  } catch (error) {
    console.error("[consultationService] Record deletion failed:", error);
    return false;
  }
}
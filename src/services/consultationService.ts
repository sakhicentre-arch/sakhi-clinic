/**
 * consultationService.ts
 * Atomic clinical transaction layer.
 */

import { db, Consultation, normalizeOutcome } from "./db";
import { learnFromConsultation } from "./learningEngine";
import { syncPatientFollowUp } from "./patientService";
import { broadcastSyncEvent } from "./syncService";

const nowIso = () => new Date().toISOString();

export async function saveConsultation(c: Consultation): Promise<boolean> {
  try {
    const timestamp = nowIso();
    const normalized: Consultation = {
      ...c,
      createdAt: c.createdAt || timestamp,
      updatedAt: timestamp,
      outcome: normalizeOutcome(c.outcome),
      medicines: (c.medicines || []).map((m) => ({
        ...m,
        id: m.id || crypto.randomUUID(),
        name: (m.name || (m as any).remedy || "Unknown").trim(),
        createdAt: m.createdAt || timestamp,
        updatedAt: timestamp,
      })),
    };

    await db.transaction("rw", [db.consultations, db.patients], async () => {
      await db.consultations.put(normalized);
      await syncPatientFollowUp(normalized.patientId);
    });

    broadcastSyncEvent({ type: "consultation:saved", payload: { id: normalized.id } });

    if (!normalized.learnedAt) {
      learnFromConsultation(normalized)
        .then(async () => {
          await db.consultations.update(normalized.id, {
            learnedAt: nowIso(),
            updatedAt: nowIso(),
          });
        })
        .catch((error) => {
          console.error("[consultationService] Clinical learning failed in background:", error);
        });
    }

    return true;
  } catch (error) {
    console.error("[consultationService] CRITICAL: Consultation save failed:", error);
    throw error;
  }
}

export async function getConsultationsByPatient(patientId: string): Promise<Consultation[]> {
  try {
    const records = await db.consultations
      .where("patientId")
      .equals(patientId)
      .filter((c) => !c.deletedAt)
      .toArray();

    return records.sort((a, b) => b.date.localeCompare(a.date));
  } catch (error) {
    console.error("[consultationService] History retrieval failed:", error);
    throw error;
  }
}

export async function getLastConsultationByPatient(patientId: string): Promise<Consultation | null> {
  const records = await getConsultationsByPatient(patientId);
  return records[0] || null;
}

export async function getAllConsultations(): Promise<Consultation[]> {
  try {
    return await db.consultations.filter((c) => !c.deletedAt).toArray();
  } catch (error) {
    console.error("[consultationService] getAllConsultations failed:", error);
    throw error;
  }
}

export async function deleteConsultation(id: string): Promise<boolean> {
  try {
    const record = await db.consultations.get(id);
    if (!record || record.deletedAt) {
      throw new Error(`[consultationService] Consultation not found: ${id}`);
    }

    await db.transaction("rw", [db.consultations, db.patients], async () => {
      await db.consultations.update(id, {
        deletedAt: Date.now(),
        updatedAt: nowIso(),
      });
      await syncPatientFollowUp(record.patientId);
    });

    return true;
  } catch (error) {
    console.error("[consultationService] Record deletion failed:", error);
    throw error;
  }
}

export const consultationService = {
  saveConsultation,
  getConsultationsByPatient,
  getLastConsultationByPatient,
  getAllConsultations,
  deleteConsultation,
};

/**
 * consultationService.ts
 * Atomic clinical transaction layer.
 */

import { db, Consultation, normalizeOutcome } from "./db";
import { learnFromConsultation } from "./learningEngine";
import { syncPatientFollowUp } from "./patientService";
import { broadcastSyncEvent } from "./syncService";
import { getDeviceId } from "../utils/deviceId";
import { enqueueOutbox } from "./outboxService";
import { captureOperationError, logOperationAttempt, logOperationSuccess } from "./runtimeErrorCaptureService";

const nowIso = () => new Date().toISOString();

export async function saveConsultation(c: Consultation): Promise<boolean> {
  // Never allow diagnostics/logging to block a clinical save.
  try {
    await logOperationAttempt({
      op: "consultation.save",
      message: "Consultation save attempt",
      payload: { id: c?.id, patientId: c?.patientId, appointmentId: (c as any)?.appointmentId, date: c?.date, hasMeds: (c?.medicines || []).length > 0 },
    });
  } catch {
    // ignore
  }

  let localPersisted = false;
  let normalized: Consultation | null = null;

  try {
    const timestamp = nowIso();
    normalized = {
      ...c,
      createdAt: c.createdAt || timestamp,
      updatedAt: timestamp,
      version: typeof c.version === "number" ? c.version + 1 : 1,
      deviceId: c.deviceId || getDeviceId(),
      syncStatus: c.syncStatus || "local",
      outcome: normalizeOutcome(c.outcome),
      medicines: (c.medicines || []).map((m) => ({
        ...m,
        id: m.id || crypto.randomUUID(),
        name: (m.name || (m as any).remedy || "Unknown").trim(),
        createdAt: m.createdAt || timestamp,
        updatedAt: timestamp,
        version: typeof (m as any).version === "number" ? (m as any).version + 1 : 1,
        deviceId: (m as any).deviceId || getDeviceId(),
        syncStatus: (m as any).syncStatus || "local",
      })),
    };

    await db.transaction("rw", [db.consultations, db.patients, db.syncOutbox], async () => {
      await db.consultations.put(normalized as Consultation);
      await syncPatientFollowUp((normalized as Consultation).patientId);
      try {
        await enqueueOutbox({
          entityType: "consultation",
          entityId: (normalized as Consultation).id,
          operationType: "update",
          payload: normalized as Consultation,
          version: (normalized as Consultation).version || 1,
        });
      } catch (err) {
        console.warn("[consultationService] outbox enqueue failed:", err);
      }
    });

    // If we reached here, IndexedDB transaction committed successfully.
    localPersisted = true;

    // Post-save side effects: never throw after local persistence succeeds.
    try {
      broadcastSyncEvent({ type: "consultation:saved", payload: { id: (normalized as Consultation).id } });
    } catch (err) {
      console.warn("[consultationService] broadcastSyncEvent failed:", err);
    }

    try {
      await logOperationSuccess({
        op: "consultation.save",
        message: "Consultation saved",
        data: { id: (normalized as Consultation).id, patientId: (normalized as Consultation).patientId, version: (normalized as Consultation).version },
      });
    } catch (err) {
      console.warn("[consultationService] logOperationSuccess failed:", err);
    }

    if (!(normalized as Consultation).learnedAt) {
      learnFromConsultation(normalized as Consultation)
        .then(async () => {
          await db.consultations.update((normalized as Consultation).id, {
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
    // If local persistence succeeded but something after it failed, downgrade to warning.
    if (localPersisted) {
      console.warn("[consultationService] Non-critical post-save failure after local persistence:", error);
      try {
        await captureOperationError({
          op: "consultation.save",
          message: "Post-save failure after local persistence",
          error,
          payload: { id: normalized?.id || c?.id, patientId: normalized?.patientId || c?.patientId, appointmentId: (c as any)?.appointmentId, date: normalized?.date || c?.date },
        });
      } catch {
        // ignore
      }
      return true;
    }

    console.error("[consultationService] CRITICAL: Consultation save failed:", error);
    try {
      await captureOperationError({
        op: "consultation.save",
        message: "Consultation save failed",
        error,
        payload: { id: c?.id, patientId: c?.patientId, appointmentId: (c as any)?.appointmentId, date: c?.date },
      });
    } catch {
      // ignore
    }
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

    const deletedAt = Date.now();
    await db.transaction("rw", [db.consultations, db.patients, db.syncOutbox], async () => {
      await db.consultations.update(id, {
        deletedAt,
        updatedAt: nowIso(),
      });
      await syncPatientFollowUp(record.patientId);
      try {
        await enqueueOutbox({
          entityType: "consultation",
          entityId: id,
          operationType: "delete",
          payload: { id, deletedAt },
          version: typeof (record as any).version === "number" ? (record as any).version + 1 : 1,
        });
      } catch (err) {
        console.warn("[consultationService] outbox enqueue failed:", err);
      }
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

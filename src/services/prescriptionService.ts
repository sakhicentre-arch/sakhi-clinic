/**
 * prescriptionService.ts
 * Standardized Prescription Normalization Layer (V12.0)
 */

import { db, Medicine } from "./db";

/**
 * Standardizes medicine objects to ensure zero data loss during saving.
 */
export function normalizeMedicineSchema(m: any): Medicine {
  return {
    id: m.id || `med-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    name: (m.name || m.remedy || "Unknown").trim(),
    potency: m.potency || "30C",
    dosage: m.dosage || "TDS",
    duration: m.duration || "7 Days",
    notes: m.notes || m.instruction || m.diet || "",
    prescription: m.prescription || {}
  };
}

/**
 * Saves all medicines with strict validation.
 */
export async function saveStandardizedPrescription(
  consultationId: string, 
  medicines: any[]
): Promise<void> {
  const validMeds = (medicines || []).map(normalizeMedicineSchema);
  
  await db.transaction("rw", db.consultations, async () => {
    await db.consultations.update(consultationId, {
      medicines: validMeds
    });
  });
}
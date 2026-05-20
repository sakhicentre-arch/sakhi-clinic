/**
 * draftService.ts
 * Consultation Draft Auto-Save Persistence
 * 
 * Saves consultation form state to IndexedDB automatically.
 * Allows recovery of unsaved work on page refresh or crash.
 */

import { db, ConsultationDraft } from "./db";

const nowIso = () => new Date().toISOString();

/**
 * Save draft to IndexedDB
 * Called every 30 seconds while editing a consultation
 */
export async function saveDraft(patientId: string, formData: any): Promise<void> {
  try {
    const draftId = `draft-${patientId}`;
    const draft: ConsultationDraft = {
      id: draftId,
      patientId,
      formData: JSON.parse(JSON.stringify(formData)), // Deep clone to ensure serializable
      savedAt: nowIso(),
    };
    await db.drafts.put(draft);
  } catch (error) {
    console.error("[draftService] saveDraft failed:", error);
    // Silently fail — don't break user's form
  }
}

/**
 * Load draft from IndexedDB if it exists
 * Returns null if no draft found
 */
export async function loadDraft(patientId: string): Promise<any | null> {
  try {
    const draftId = `draft-${patientId}`;
    const draft = await db.drafts.get(draftId);
    if (draft) return draft.formData;
    return null;
  } catch (error) {
    console.error("[draftService] loadDraft failed:", error);
    return null;
  }
}

/**
 * Delete draft after successful consultation save
 */
export async function deleteDraft(patientId: string): Promise<void> {
  try {
    const draftId = `draft-${patientId}`;
    await db.drafts.delete(draftId);
  } catch (error) {
    console.error("[draftService] deleteDraft failed:", error);
    // Silently fail — draft deletion is non-critical
  }
}

/**
 * Check if a draft exists (for UI indicators)
 */
export async function hasDraft(patientId: string): Promise<boolean> {
  try {
    const draftId = `draft-${patientId}`;
    const draft = await db.drafts.get(draftId);
    return !!draft;
  } catch (error) {
    console.error("[draftService] hasDraft check failed:", error);
    return false;
  }
}

/**
 * Get draft metadata (for UI display of "last saved")
 */
export async function getDraftMetadata(patientId: string): Promise<{ savedAt: string } | null> {
  try {
    const draftId = `draft-${patientId}`;
    const draft = await db.drafts.get(draftId);
    if (draft) {
      return { savedAt: draft.savedAt };
    }
    return null;
  } catch (error) {
    console.error("[draftService] getDraftMetadata failed:", error);
    return null;
  }
}

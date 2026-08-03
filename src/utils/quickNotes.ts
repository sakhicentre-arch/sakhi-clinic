/**
 * Doctor Productivity: Quick Notes are a per-patient scratchpad for
 * operational reminders ("prefers evening slots", "call about lab results")
 * -- deliberately NOT part of the clinical record (Consultation), so they
 * never get mistaken for documented case history. Mirrors rxTemplates.ts's
 * localStorage pattern rather than adding a new Dexie table for a feature
 * that's explicitly non-clinical scratch data.
 */

const KEY = "sakhi.quickNotes.v1";

type QuickNotesMap = Record<string, string>;

function safeJsonParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function loadAll(): QuickNotesMap {
  const parsed = safeJsonParse<QuickNotesMap>(window.localStorage.getItem(KEY));
  return parsed && typeof parsed === "object" ? parsed : {};
}

export function getQuickNote(patientId: string): string {
  return loadAll()[patientId] || "";
}

export function saveQuickNote(patientId: string, text: string): void {
  const all = loadAll();
  const trimmed = text.trim();
  if (trimmed) {
    all[patientId] = trimmed;
  } else {
    delete all[patientId];
  }
  try {
    window.localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
}

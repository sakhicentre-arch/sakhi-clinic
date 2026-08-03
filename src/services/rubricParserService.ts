import { Consultation, Patient, RubricCategory } from "./db";
import { FIELD_MAPPED_CATEGORIES } from "../data/rubricVocabulary";

/**
 * rubricParserService.ts — Rubric Intelligence Engine (RC2 Phase 1).
 *
 * Pure functions only: no DB access, no side effects. Responsible for
 * segmenting consultation text into candidate phrases/sentences and
 * routing structured fields to their directly-mapped category. Vocabulary
 * matching within a category (free-text -> category) lives in
 * rubricMatcherService.ts; this module only prepares the input for that.
 */

export interface FieldMappedPhrase {
  category: RubricCategory;
  phrase: string;
  fieldSource: string; // e.g. "mind" -- the Consultation field name this came from
}

export interface CandidateSentence {
  sentence: string;
  fieldSource: string;
}

/** Splits a short structured field (e.g. "irritable, weeping, forsaken
 * feeling") into individual candidate phrases on common list delimiters.
 * Deliberately simple -- these fields are short, doctor-entered lists, not
 * prose needing real NLP sentence splitting. */
export function splitIntoPhrases(text: string): string[] {
  if (!text || !text.trim()) return [];
  return text
    .split(/[,;]|(?:\band\b)/i)
    .map((p) => p.trim())
    .filter((p) => p.length >= 3);
}

/** Splits longer free-text prose (chief complaint, case story) into
 * sentence-level candidates for keyword scanning. */
export function splitIntoSentences(text: string): string[] {
  if (!text || !text.trim()) return [];
  return text
    .split(/[.!?\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 5);
}

/** Structured fields the doctor already entered under a specific
 * homeopathic heading -- a direct, high-confidence category signal, no
 * keyword inference needed. See FIELD_MAPPED_CATEGORIES for the mapping. */
export function extractFieldMappedPhrases(consultation: Partial<Consultation>): FieldMappedPhrase[] {
  const out: FieldMappedPhrase[] = [];
  for (const [category, fieldName] of Object.entries(FIELD_MAPPED_CATEGORIES) as [RubricCategory, string][]) {
    const raw = (consultation as any)[fieldName];
    if (typeof raw !== "string" || !raw.trim()) continue;
    for (const phrase of splitIntoPhrases(raw)) {
      out.push({ category, phrase, fieldSource: fieldName });
    }
  }
  return out;
}

/** Free-text fields worth scanning for category keywords -- chief
 * complaint and case story are the primary sources; sensation/timeModal/
 * periodicity/onset are already semi-structured (short phrases, not
 * prose) but still benefit from the same sentence-level scan since they
 * commonly hold modality/etiology language ("worse at night", "since
 * grief"). */
const FREE_TEXT_FIELDS = ["chiefComplaint", "caseText", "sensation", "timeModal", "periodicity", "onset"] as const;

export function extractFreeTextSentences(consultation: Partial<Consultation>): CandidateSentence[] {
  const out: CandidateSentence[] = [];
  for (const fieldName of FREE_TEXT_FIELDS) {
    const raw = (consultation as any)[fieldName];
    if (typeof raw !== "string" || !raw.trim()) continue;
    for (const sentence of splitIntoSentences(raw)) {
      out.push({ sentence, fieldSource: fieldName });
    }
  }
  return out;
}

/** Age/gender context needed for the three demographic-gated categories
 * (children/oldAge/pregnancy) -- these require keyword evidence AND a
 * plausible patient context, not keywords alone (a 70-year-old's case
 * text mentioning "my grandchild is teething" should not tag the patient
 * themselves as "children"). */
export interface PatientContext {
  ageYears: number | null;
  isFemale: boolean;
}

export function derivePatientContext(patient: Pick<Patient, "age" | "gender"> | undefined | null): PatientContext {
  if (!patient) return { ageYears: null, isFemale: false };
  const parsedAge = typeof patient.age === "number" ? patient.age : parseInt(String(patient.age || ""), 10);
  return {
    ageYears: Number.isFinite(parsedAge) ? parsedAge : null,
    isFemale: String(patient.gender || "").toLowerCase().startsWith("f"),
  };
}

/**
 * rubricConfidenceService.ts — Rubric Intelligence Engine (RC2 Phase 1).
 *
 * Pure scoring functions, no DB access. Field-mapped rubrics (the doctor
 * already entered this content under exactly this heading) are inherently
 * more trustworthy than free-text keyword inference, so they're scored on
 * a separate, higher baseline. The "cluster bonus" for multiple keyword
 * hits in one sentence mirrors learningEngine.ts's existing confidence-
 * scoring convention (evidence from multiple independent signals should
 * score higher than a single weak match) without reusing its code, since
 * that engine's domain (remedy pattern frequency) is unrelated.
 */

const FIELD_MAPPED_BASELINE = 0.85;
const FIELD_MAPPED_MIN = 0.6;
const FIELD_MAPPED_SHORT_PHRASE_THRESHOLD = 6;

const KEYWORD_MATCH_BASELINE = 0.45;
const KEYWORD_MATCH_CLUSTER_BONUS = 0.08;
const KEYWORD_MATCH_MAX = 0.75;

/** A direct field-to-category mapping is high confidence by construction
 * (the doctor labeled it themselves), reduced slightly for very short
 * phrases that are more likely noise than a real symptom statement. */
export function scoreFieldMappedConfidence(phrase: string): number {
  const trimmed = phrase.trim();
  if (trimmed.length < FIELD_MAPPED_SHORT_PHRASE_THRESHOLD) {
    return FIELD_MAPPED_MIN;
  }
  return FIELD_MAPPED_BASELINE;
}

/** Free-text keyword matches start lower (it's an inference, not a
 * doctor-labeled field) and gain a small bonus for each additional
 * distinct keyword matched within the same sentence -- multiple
 * independent signals in one statement are stronger evidence than one. */
export function scoreKeywordMatchConfidence(distinctKeywordHitsInSentence: number): number {
  const bonus = Math.max(0, distinctKeywordHitsInSentence - 1) * KEYWORD_MATCH_CLUSTER_BONUS;
  return Math.min(KEYWORD_MATCH_MAX, KEYWORD_MATCH_BASELINE + bonus);
}

export type ConfidenceLabel = "Strong" | "Moderate" | "Weak";

/** Human-readable label for the doctor-facing review UI, mirroring the
 * "Strong Match / Good Correlation / Weak Signal" badge convention
 * already used for learningEngine.ts's remedy suggestions in
 * ConsultationPage.tsx, so a doctor sees a consistent vocabulary for
 * "how much should I trust this AI suggestion" across both features. */
export function confidenceLabel(confidence: number): ConfidenceLabel {
  if (confidence >= 0.75) return "Strong";
  if (confidence >= 0.5) return "Moderate";
  return "Weak";
}

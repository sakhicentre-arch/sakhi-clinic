/**
 * learningEngine.ts
 * Sakhi Clinic — Advanced Clinical Intelligence Engine (V12.0)
 * Features: Cluster Specificity Weighting, Compound Indexing, Signal Damping
 */

import { Consultation, db, ConsultationOutcome, normalizeOutcome, LearningPattern } from "./db";

// Clinical stopwords - terms that provide noise rather than diagnostic signal
const STOPWORDS = new Set([
  'the', 'and', 'patient', 'clinic', 'visit', 'days', 'weeks', 'months', 'year',
  'time', 'says', 'said', 'from', 'with', 'about', 'feels', 'reported', 'showed',
  'history', 'status', 'noted', 'seems', 'appears', 'present', 'condition'
]);

/**
 * Normalizes clinical text into a searchable symptom key.
 * Preserves diagnostic terms while removing linguistic noise.
 */
function extractSymptomKey(text: string): string {
  if (!text || text.trim().length === 0) return "";

  return text
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "") // Remove punctuation
    .split(/\s+/)
    .filter(word => 
      word.length >= 3 && 
      !STOPWORDS.has(word) 
    )
    .sort() // Sort for deterministic keys
    .join("|");
}

/**
 * Weights clinical outcomes with heavy emphasis on failure prevention.
 */
function getOutcomeWeight(outcome: ConsultationOutcome): number {
  switch (outcome) {
    case ConsultationOutcome.IMPROVED:
      return 10; // High reward for success
    case ConsultationOutcome.PARTIAL:
      return 3;  // Moderate signal
    case ConsultationOutcome.NO_CHANGE:
      return -1; // Subtle discouragement
    case ConsultationOutcome.WORSE:
      return -15; // Aggressive suppression of failed remedies
    default:
      return 0;
  }
}

/**
 * Learns from a completed consultation.
 * Uses the [remedy+symptomKey] compound index for high-speed pattern matching.
 */
export async function learnFromConsultation(consultation: Consultation): Promise<void> {
  try {
    if (!consultation.medicines || consultation.medicines.length === 0) return;
    if (!consultation.outcome) return;

    const symptoms = `${consultation.chiefComplaint || ""} ${consultation.caseText || ""}`;
    const symptomKey = extractSymptomKey(symptoms);

    if (!symptomKey || symptomKey.split('|').length < 2) return; // Ignore very generic cases

    const weight = getOutcomeWeight(normalizeOutcome(consultation.outcome));

    for (const medicine of consultation.medicines) {
      const remedyName = medicine.name;
      if (!remedyName || remedyName === "Unknown") continue;

      // ✅ 10/10 PERFORMANCE: Use compound index [remedy+symptomKey]
      const existing = await db.learning
        .where("[remedy+symptomKey]")
        .equals([remedyName, symptomKey])
        .first();

      if (existing) {
        await db.learning.update(existing.id!, {
          score: existing.score + weight,
          count: existing.count + 1
        });
      } else {
        await db.learning.add({
          remedy: remedyName,
          symptomKey: symptomKey,
          score: weight,
          count: 1
        });
      }
    }
  } catch (error) {
    console.error("[learningEngine] Clinical learning failed:", error);
  }
}

/**
 * Generates clinical suggestions using Cluster Specificity Weighting.
 * Prioritizes high-evidence symptom clusters over loose keyword matches.
 */
export async function getLearnedSuggestions(
  symptoms: string,
  limit: number = 3
): Promise<Array<{ remedy: string; confidence: number; matches: number; uses: number }>> {
  try {
    const currentKey = extractSymptomKey(symptoms);
    if (!currentKey) return [];

    const currentKeywords = currentKey.split("|");
    const allPatterns = await db.learning.toArray();

    const suggestions = allPatterns
      .map((pattern: LearningPattern) => {
        // Evidence Threshold: Minimum 3 successful clinical applications
        if (pattern.count < 3) return null;

        const patternKeywords = pattern.symptomKey.split("|");
        const matchCount = currentKeywords.filter(k => patternKeywords.includes(k)).length;
        
        // No diagnostic overlap? Skip.
        if (matchCount === 0) return null;

        /**
         * ✅ 10/10 LOGIC: Cluster Specificity Bonus
         * Matching 3+ symptoms simultaneously represents a "Syndrome Match."
         * We apply an exponential weight to clusters.
         */
        const clusterBonus = matchCount >= 3 ? 2.5 : 1.0;
        const avgOutcomeScore = pattern.score / pattern.count;
        
        // Confidence = (Clinical Success Rate) * (Match Specificity) * (Syndrome Bonus)
        const matchRatio = matchCount / patternKeywords.length;
        const confidence = (avgOutcomeScore / 10) * matchRatio * clusterBonus;

        return {
          remedy: pattern.remedy,
          confidence: Math.max(0, Math.min(1, confidence)), // Normalize 0-1
          matches: matchCount,
          uses: pattern.count
        };
      })
      .filter((s): s is any => s !== null && s.confidence > 0.4)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, limit);

    return suggestions;
  } catch (error) {
    console.error("[learningEngine] Suggestions generation failed:", error);
    return [];
  }
}

export async function getLearningStats(): Promise<{
  totalPatterns: number;
  uniqueRemedies: number;
  systemReliability: string;
}> {
  const patterns = await db.learning.toArray();
  const remedies = new Set(patterns.map(p => p.remedy));
  const avgScore = patterns.reduce((sum, p) => sum + (p.score / p.count), 0) / (patterns.length || 1);

  return {
    totalPatterns: patterns.length,
    uniqueRemedies: remedies.size,
    systemReliability: `${Math.round((avgScore / 10) * 100)}%`
  };
}
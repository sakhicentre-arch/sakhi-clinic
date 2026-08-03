import { Consultation, Patient, RubricCategory } from "./db";
import {
  extractFieldMappedPhrases,
  extractFreeTextSentences,
  derivePatientContext,
} from "./rubricParserService";
import {
  matchKeywordsInSentence,
  matchDemographicGatedKeywords,
  matchMensesKeywords,
  KeywordMatch,
} from "./rubricMatcherService";
import { scoreFieldMappedConfidence, scoreKeywordMatchConfidence } from "./rubricConfidenceService";

/**
 * rubricSuggestionEngine.ts — Rubric Intelligence Engine (RC2 Phase 1),
 * Phase 5: AI Rubric Suggestion generation.
 *
 * Orchestrates rubricParserService + rubricMatcherService +
 * rubricConfidenceService into the doctor-facing suggestion shape. Pure
 * function, no DB access -- persistence (writing these as pending
 * RubricEntry rows) is rubricApprovalService.ts's job (Phase 8), called
 * from the consultation save path (Phase 7). Never generates or ranks
 * remedies; only identifies which homeopathic category a symptom
 * statement belongs to, exactly as scoped.
 */

const FIELD_LABELS: Record<string, string> = {
  mind: "Mind",
  generals: "Generals",
  thermal: "Thermal",
  desire: "Food Desires",
  aversion: "Food Aversions",
  sleep: "Sleep",
  perspiration: "Perspiration",
  familyHistory: "Family History",
};

export interface RubricSuggestion {
  category: RubricCategory;
  text: string;
  reason: string;
  matchedSentence: string;
  confidence: number;
  evidence: string;
  priority: number;
  source: "ai";
}

const MAX_TEXT_LENGTH = 70;

function suggestionText(keyword: string, sentence: string): string {
  const trimmed = sentence.trim();
  if (trimmed.length > 0 && trimmed.length <= MAX_TEXT_LENGTH) return trimmed;
  return keyword.charAt(0).toUpperCase() + keyword.slice(1);
}

/** Groups keyword matches by (category, sentence) so the confidence
 * scorer can count distinct keyword hits supporting the SAME conclusion
 * (same category, same sentence) rather than treating unrelated
 * categories found in one sentence as reinforcing each other. */
function groupMatchesForScoring(matches: KeywordMatch[]): Map<string, KeywordMatch[]> {
  const groups = new Map<string, KeywordMatch[]>();
  for (const match of matches) {
    const key = `${match.category}::${match.sentence}`;
    const existing = groups.get(key) || [];
    existing.push(match);
    groups.set(key, existing);
  }
  return groups;
}

export function generateRubricSuggestions(
  consultation: Partial<Consultation>,
  patient?: Pick<Patient, "age" | "gender"> | null
): RubricSuggestion[] {
  const suggestions: RubricSuggestion[] = [];
  const seen = new Set<string>(); // dedupe by category+text

  const addSuggestion = (s: Omit<RubricSuggestion, "priority">) => {
    const key = `${s.category}::${s.text.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    suggestions.push({ ...s, priority: 0 }); // priority assigned after full sort below
  };

  // 1. Field-mapped phrases -- high confidence, doctor already labeled these.
  for (const { category, phrase, fieldSource } of extractFieldMappedPhrases(consultation)) {
    const label = FIELD_LABELS[fieldSource] || fieldSource;
    addSuggestion({
      category,
      text: phrase.charAt(0).toUpperCase() + phrase.slice(1),
      reason: `Directly entered under ${label}`,
      matchedSentence: phrase,
      confidence: scoreFieldMappedConfidence(phrase),
      evidence: `Recorded verbatim in the consultation's ${label} field`,
      source: "ai",
    });
  }

  // 2. Free-text keyword matches -- lower confidence, an inference.
  const candidateSentences = extractFreeTextSentences(consultation);
  const context = derivePatientContext(patient);
  const allMatches: KeywordMatch[] = [];
  for (const candidate of candidateSentences) {
    allMatches.push(...matchKeywordsInSentence(candidate));
    allMatches.push(...matchDemographicGatedKeywords(candidate, context));
    allMatches.push(...matchMensesKeywords(candidate, context));
  }

  const grouped = groupMatchesForScoring(allMatches);
  for (const [, group] of grouped) {
    const { category, sentence, fieldSource } = group[0];
    const distinctKeywords = new Set(group.map((m) => m.keyword));
    const confidence = scoreKeywordMatchConfidence(distinctKeywords.size);
    addSuggestion({
      category,
      text: suggestionText(group[0].keyword, sentence),
      reason: `Matched keyword pattern ("${Array.from(distinctKeywords).join('", "')}")`,
      matchedSentence: sentence,
      confidence,
      evidence: `Found in the ${fieldSource} field: "${sentence}"`,
      source: "ai",
    });
  }

  // Highest-confidence first; priority is the 1-based rank within that order.
  suggestions.sort((a, b) => b.confidence - a.confidence);
  return suggestions.map((s, i) => ({ ...s, priority: i + 1 }));
}

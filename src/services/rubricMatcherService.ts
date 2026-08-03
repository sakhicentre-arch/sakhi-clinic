import { RubricCategory } from "./db";
import { RUBRIC_KEYWORDS } from "../data/rubricVocabulary";
import { CandidateSentence, PatientContext } from "./rubricParserService";

/**
 * rubricMatcherService.ts — Rubric Intelligence Engine (RC2 Phase 1).
 *
 * Pure functions only. Matches candidate sentences (from
 * rubricParserService.ts) against rubricVocabulary.ts's heuristic keyword
 * lists, producing category hits. Demographic-gated categories
 * (children/oldAge/pregnancy) require both a keyword hit and a plausible
 * patient context -- see matchDemographicGatedKeywords.
 */

export interface KeywordMatch {
  category: RubricCategory;
  keyword: string;
  sentence: string;
  fieldSource: string;
}

const DEMOGRAPHIC_CATEGORIES: RubricCategory[] = ["children", "oldAge", "pregnancy"];
const CHILD_AGE_CEILING = 14;
const OLD_AGE_FLOOR = 60;

/** Scans one candidate sentence against every non-demographic category's
 * keyword list. A sentence can match more than one category (e.g. "worse
 * from cold, since a fright" hits both modalities and etiology) -- that's
 * intentional, each becomes its own suggestion for the doctor to judge. */
export function matchKeywordsInSentence(candidate: CandidateSentence): KeywordMatch[] {
  const lower = candidate.sentence.toLowerCase();
  const matches: KeywordMatch[] = [];
  for (const [category, keywords] of Object.entries(RUBRIC_KEYWORDS) as [RubricCategory, string[]][]) {
    if (DEMOGRAPHIC_CATEGORIES.includes(category)) continue; // handled separately, needs patient context
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        matches.push({ category, keyword, sentence: candidate.sentence, fieldSource: candidate.fieldSource });
      }
    }
  }
  return matches;
}

/** Demographic-gated categories: a keyword hit alone isn't enough --
 * "children" only applies if the patient themselves is plausibly a child,
 * "oldAge" only if plausibly elderly, "pregnancy" only for a female
 * patient. Without patient context (ageYears === null), these are
 * skipped entirely rather than guessed. */
export function matchDemographicGatedKeywords(candidate: CandidateSentence, context: PatientContext): KeywordMatch[] {
  const lower = candidate.sentence.toLowerCase();
  const matches: KeywordMatch[] = [];

  const childKeywords = RUBRIC_KEYWORDS.children || [];
  if (context.ageYears !== null && context.ageYears <= CHILD_AGE_CEILING) {
    for (const keyword of childKeywords) {
      if (lower.includes(keyword)) matches.push({ category: "children", keyword, sentence: candidate.sentence, fieldSource: candidate.fieldSource });
    }
  }

  const oldAgeKeywords = RUBRIC_KEYWORDS.oldAge || [];
  if (context.ageYears !== null && context.ageYears >= OLD_AGE_FLOOR) {
    for (const keyword of oldAgeKeywords) {
      if (lower.includes(keyword)) matches.push({ category: "oldAge", keyword, sentence: candidate.sentence, fieldSource: candidate.fieldSource });
    }
  }

  const pregnancyKeywords = RUBRIC_KEYWORDS.pregnancy || [];
  if (context.isFemale) {
    for (const keyword of pregnancyKeywords) {
      if (lower.includes(keyword)) matches.push({ category: "pregnancy", keyword, sentence: candidate.sentence, fieldSource: candidate.fieldSource });
    }
  }

  return matches;
}

/** menses keywords are female-gated the same way pregnancy is, but are
 * not age-restricted the way children/oldAge are (a menses rubric can
 * apply across a wide age range) -- kept as a fourth, simpler gate rather
 * than folded into matchKeywordsInSentence's ungated loop. */
export function matchMensesKeywords(candidate: CandidateSentence, context: PatientContext): KeywordMatch[] {
  if (!context.isFemale) return [];
  const lower = candidate.sentence.toLowerCase();
  const mensesKeywords = RUBRIC_KEYWORDS.menses || [];
  return mensesKeywords
    .filter((keyword) => lower.includes(keyword))
    .map((keyword) => ({ category: "menses" as RubricCategory, keyword, sentence: candidate.sentence, fieldSource: candidate.fieldSource }));
}

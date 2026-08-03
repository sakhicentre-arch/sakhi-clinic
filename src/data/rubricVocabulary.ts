import { RubricCategory } from "../services/db";

/**
 * rubricVocabulary.ts — Rubric Intelligence Engine (RC2 Phase 1).
 *
 * Original heuristic keyword/phrase lists used to detect which homeopathic
 * rubric category a piece of free-text consultation content belongs to.
 * This is deliberately NOT a licensed repertory (Kent's, Synthesis, etc.)
 * and makes no claim to canonical rubric paths — it is a first-pass
 * classifier so a doctor's own case notes can be sorted into the 18
 * requested categories for review, nothing more. Matching against a real
 * repertory is a separate, later, data-licensing-gated phase (see
 * RUBRIC_ENGINE_ARCHITECTURE.md's "Module 9" note).
 *
 * Each entry is a lowercase keyword or short phrase; matching is
 * case-insensitive substring search against sentence-level text (see
 * rubricMatcherService.ts). Kept intentionally small and readable rather
 * than exhaustive — false negatives here just mean the doctor adds a
 * manual rubric instead, which is always available.
 */

export const RUBRIC_KEYWORDS: Partial<Record<RubricCategory, string[]>> = {
  modalities: [
    "better from", "worse from", "aggravat", "amelior", "relieved by",
    "improves with", "worsens with", "increases with", "decreases with",
    "on motion", "on rest", "at night", "in morning", "in evening",
    "before menses", "after eating", "from touch", "from pressure",
  ],
  sensations: [
    "burning", "throbbing", "stitching", "cramping", "pressing", "tearing",
    "shooting", "stiffness", "numbness", "tingling", "heaviness",
    "constriction", "pulsating", "gnawing pain", "dull ache",
  ],
  locations: [
    "in the head", "in the abdomen", "in the chest", "in the back",
    "in the joints", "in the throat", "in the stomach", "left side",
    "right side", "radiating to", "in the knee", "in the shoulder",
  ],
  concomitants: [
    "accompanied by", "along with", "together with", "at the same time as",
    "followed by", "preceded by",
  ],
  etiology: [
    "after grief", "after fright", "after anger", "since childhood",
    "after delivery", "after surgery", "after vaccination", "after injury",
    "since exam", "after exposure to cold", "after suppression",
    "following a shock", "since the loss of",
  ],
  particulars: [
    "pain in", "swelling of", "discharge from", "eruption on",
    "redness of", "itching of", "weakness of",
  ],
  menses: [
    "menses", "menstrual", "period", "cycle irregular", "amenorrhea",
    "dysmenorrhea", "menorrhagia", "clots", "pms",
  ],
  pregnancy: [
    "pregnant", "pregnancy", "morning sickness", "trimester", "gestation",
    "expecting", "antenatal",
  ],
  children: [
    "teething", "cries constantly", "clingy", "school refusal", "bedwetting",
    "tantrum", "developmental delay",
  ],
  oldAge: [
    "age-related", "since old age", "since retirement", "memory loss",
    "since menopause",
  ],
};

/** Human-readable labels for the 18 rubric categories -- shared across the
 * Review page, Dashboard widgets, and Reports so the taxonomy reads
 * consistently everywhere rather than each surface inventing its own
 * casing/wording. */
export const RUBRIC_CATEGORY_LABELS: Record<RubricCategory, string> = {
  mind: "Mind",
  generals: "Generals",
  particulars: "Particulars",
  modalities: "Modalities",
  sensations: "Sensations",
  locations: "Locations",
  concomitants: "Concomitants",
  etiology: "Etiology",
  sleep: "Sleep",
  foodDesires: "Food Desires",
  foodAversions: "Food Aversions",
  thermals: "Thermals",
  perspiration: "Perspiration",
  menses: "Menses",
  pregnancy: "Pregnancy",
  children: "Children",
  oldAge: "Old Age",
  familyHistory: "Family History",
};

export const ALL_RUBRIC_CATEGORIES: RubricCategory[] = Object.keys(RUBRIC_CATEGORY_LABELS) as RubricCategory[];

/** Structured Consultation fields that map directly to a rubric category
 * with no free-text keyword search needed — the doctor already entered
 * this content under exactly this heading, so it's a direct, high-
 * confidence signal rather than an inference. See rubricParserService.ts. */
export const FIELD_MAPPED_CATEGORIES: Partial<Record<RubricCategory, string>> = {
  mind: "mind",
  generals: "generals",
  thermals: "thermal",
  foodDesires: "desire",
  foodAversions: "aversion",
  sleep: "sleep",
  perspiration: "perspiration",
  familyHistory: "familyHistory",
};

/**
 * clinicalSuggestions.ts
 * Sakhi Clinic — Clinical Suggestion Lists
 *
 * Single source of truth for all SmartInput dropdown suggestions.
 * Imported by SmartInput component — never hardcoded in page files.
 *
 * Structure:
 *   SUGGESTIONS.<category>  →  string[]
 *
 * To add a new category:
 *   1. Add a new key to the SUGGESTIONS object below
 *   2. Pass it as the `suggestions` prop to SmartInput
 *   No other file needs to change.
 *
 * Curation principles:
 *   - Homeopathic practice vocabulary (not allopathic)
 *   - Sorted: most commonly used first, then alphabetical
 *   - Doctor can always type freely — these are acceleration aids only
 *
 * Version history:
 *   v1 — Initial: chiefComplaint, mind, physicalGenerals, pastHistory,
 *         familyHistory, allergies
 *   v2 — physicalGenerals split into 7 granular keys: thermal, thirst,
 *         appetite, desire, aversion, sleep, modalities.
 *         chiefComplaint gains short quick-entry terms at top.
 */

// ─────────────────────────────────────────────────────────────────────────────
// TYPE
// Auto-derived from SUGGESTIONS keys — always stays in sync.
// ─────────────────────────────────────────────────────────────────────────────

export type SuggestionCategory = keyof typeof SUGGESTIONS;

// ─────────────────────────────────────────────────────────────────────────────
// CHIEF COMPLAINT
// Most frequent presenting problems in a homeopathic general practice.
// SHORT TERMS at top for fastest entry — long-form below by category.
// ─────────────────────────────────────────────────────────────────────────────

const CHIEF_COMPLAINT: string[] = [
  // ── Quick entry — single-word / short terms (added v2, always at top) ──
  "Fever",
  "Cough",
  "Cold",
  "Headache",
  "Pain",
  "Weakness",
  "Skin problem",
  "Stomach problem",
  "Back pain",
  "Stress",
  "Anxiety",
  "Allergy",
  "Weight gain",
  "Hair fall",
  "Child complaint",

  // ── Digestive ──
  "Acidity and gastric complaints",
  "Bloating and flatulence",
  "Constipation",
  "Diarrhoea",
  "Irritable bowel",
  "Nausea and vomiting",
  "Piles and fissure",

  // ── Respiratory ──
  "Allergic rhinitis",
  "Asthma and breathlessness",
  "Chronic cough",
  "Recurrent cold and sneezing",
  "Sinusitis",
  "Tonsillitis",

  // ── Musculoskeletal ──
  "Backache and lumbar pain",
  "Cervical spondylosis",
  "Joint pain and arthritis",
  "Knee pain",
  "Sciatica",
  "Shoulder pain",

  // ── Skin ──
  "Acne and pimples",
  "Eczema and dermatitis",
  "Hair fall and alopecia",
  "Psoriasis",
  "Urticaria and hives",
  "Vitiligo",
  "Warts and corns",

  // ── Neurological / Psychosomatic ──
  "Anxiety and nervousness",
  "Depression and sadness",
  "Headache and migraine",
  "Insomnia and disturbed sleep",
  "Vertigo and dizziness",

  // ── Urogenital ──
  "Kidney stone",
  "Recurrent UTI",
  "Leucorrhoea",
  "Menstrual irregularity",
  "PCOD / PCOS",
  "Prostate complaints",

  // ── Metabolic / General ──
  "Diabetes management",
  "Fatigue and weakness",
  "Hypertension",
  "Obesity and weight gain",
  "Thyroid complaints",

  // ── Paediatric ──
  "Bedwetting in children",
  "Recurrent fever in child",
  "Recurrent infections in child",
  "Teething complaints",
  "Tonsil and adenoids",
];

// ─────────────────────────────────────────────────────────────────────────────
// MIND SYMPTOMS
// Homeopathic mental and emotional rubrics — repertory-aligned.
// Unchanged from v1.
// ─────────────────────────────────────────────────────────────────────────────

const MIND: string[] = [
  // ── Emotional state ──
  "Anxious about health",
  "Anxious about future",
  "Anxious about family",
  "Anticipatory anxiety",
  "Fear of death",
  "Fear of disease",
  "Fear of being alone",
  "Fear of dark",
  "Fear of crowd",
  "Grief and loss",
  "Weeping tendency",
  "Irritable and impatient",
  "Anger with violence",
  "Anger suppressed",
  "Sadness without cause",
  "Hopeless and despairing",

  // ── Disposition ──
  "Conscientious about trifles",
  "Fastidious and over-neat",
  "Hurried and restless",
  "Obstinate and stubborn",
  "Reserved and closed",
  "Sympathetic to others",
  "Indifferent to everything",
  "Mild and yielding",
  "Domineering",

  // ── Concentration and memory ──
  "Forgetful",
  "Difficulty concentrating",
  "Mental fatigue",
  "Confusion of mind",
  "Dullness of intellect",

  // ── Sleep-related mind ──
  "Sleeplessness from thoughts",
  "Sleeplessness from anxiety",
  "Dreams frightful",
  "Dreams vivid and disturbing",

  // ── Stress and causation ──
  "Complaints from grief",
  "Complaints from fright",
  "Complaints from anger",
  "Complaints from overwork",
  "Complaints from business failure",
  "Complaints from disappointed love",
];

// ─────────────────────────────────────────────────────────────────────────────
// THERMAL
// Patient's constitutional heat relationship.
// Extracted from physicalGenerals v1 — all 5 entries preserved.
// ─────────────────────────────────────────────────────────────────────────────

const THERMAL: string[] = [
  "Chilly patient",
  "Hot patient",
  "Ambithermal",
  "Chilly but craves open air",
  "Hot but desires warmth",
];

// ─────────────────────────────────────────────────────────────────────────────
// THIRST
// Quantity, quality, and pattern of fluid intake.
// Extracted from physicalGenerals v1 — all 7 entries preserved.
// ─────────────────────────────────────────────────────────────────────────────

const THIRST: string[] = [
  "Thirstless",
  "Thirst for large quantities",
  "Thirst for small quantities frequently",
  "Thirst for cold water",
  "Thirst for warm drinks",
  "Excessive thirst",
  "Thirst during fever only",
];

// ─────────────────────────────────────────────────────────────────────────────
// APPETITE
// Hunger patterns and eating behaviour.
// Extracted from physicalGenerals v1 — all 7 entries preserved.
// ─────────────────────────────────────────────────────────────────────────────

const APPETITE: string[] = [
  "Appetite normal",
  "Appetite increased",
  "Appetite decreased",
  "Appetite lost completely",
  "Appetite increased but loses weight",
  "Hungry soon after eating",
  "Appetite worse in morning",
];

// ─────────────────────────────────────────────────────────────────────────────
// DESIRE
// Food and drink cravings — constitutional and symptomatic.
// Extracted from physicalGenerals v1 (// Desires block) — all 12 entries preserved.
// ─────────────────────────────────────────────────────────────────────────────

const DESIRE: string[] = [
  "Desires sweets",
  "Desires salt",
  "Desires sour",
  "Desires spicy food",
  "Desires cold drinks",
  "Desires warm food",
  "Desires meat",
  "Desires eggs",
  "Desires milk",
  "Desires bread",
  "Desires fruits",
  "Desires ice cream",
];

// ─────────────────────────────────────────────────────────────────────────────
// AVERSION
// Food and drink aversions — constitutional and symptomatic.
// Extracted from physicalGenerals v1 (// Aversions block) — all 8 entries preserved.
// ─────────────────────────────────────────────────────────────────────────────

const AVERSION: string[] = [
  "Aversion to milk",
  "Aversion to meat",
  "Aversion to eggs",
  "Aversion to fat and rich food",
  "Aversion to vegetables",
  "Aversion to salt",
  "Aversion to sweets",
  "Aversion to fish",
];

// ─────────────────────────────────────────────────────────────────────────────
// SLEEP
// Sleep posture, pattern, and energy/stamina at rest.
// Extracted from physicalGenerals v1 (// Sleep block + // Energy and stamina block).
// All 15 entries preserved — energy/stamina grouped here as rest-state patterns.
// ─────────────────────────────────────────────────────────────────────────────

const SLEEP: string[] = [
  // ── Posture ──
  "Sleeps on right side",
  "Sleeps on left side",
  "Sleeps on abdomen",
  "Sleeps in knee-chest position",

  // ── Pattern ──
  "Sleepless before midnight",
  "Sleepless after midnight",
  "Wakes at 3 AM",
  "Unrefreshing sleep",
  "Sleepy during day",
  "Restless sleep",

  // ── Energy and stamina (rest-state) ──
  "Fatigue in morning",
  "Fatigue in evening",
  "Fatigue after slight exertion",
  "Fatigue better by rest",
  "Second wind — better after continued motion",
];

// ─────────────────────────────────────────────────────────────────────────────
// MODALITIES
// General aggravations and ameliorations — weather, time, position, motion.
// Extracted from physicalGenerals v1 (// Modalities — general block).
// All 15 entries preserved.
// ─────────────────────────────────────────────────────────────────────────────

const MODALITIES: string[] = [
  // ── Ameliorations ──
  "Better in open air",
  "Better by warmth",
  "Better by cold",
  "Better by motion",
  "Better by rest",

  // ── Aggravations — position / motion ──
  "Worse in open air",
  "Worse by warmth",
  "Worse by cold",
  "Worse by motion",
  "Worse on waking",

  // ── Aggravations — time ──
  "Worse in morning",
  "Worse in evening",
  "Worse at night",

  // ── Aggravations — weather ──
  "Worse before storms",
  "Worse in damp weather",
];

// ─────────────────────────────────────────────────────────────────────────────
// PAST HISTORY
// Common surgical and medical history entries.
// Unchanged from v1.
// ─────────────────────────────────────────────────────────────────────────────

const PAST_HISTORY: string[] = [
  // ── Surgical ──
  "Appendectomy",
  "Caesarean section",
  "Cholecystectomy (gallbladder removal)",
  "Hernia repair",
  "Hysterectomy",
  "Knee replacement",
  "Thyroidectomy",
  "Tonsillectomy",
  "Tubectomy",
  "Vasectomy",

  // ── Medical conditions ──
  "Asthma in childhood",
  "Chickenpox",
  "Dengue fever",
  "Diabetes mellitus",
  "Hepatitis B",
  "Hepatitis C",
  "Hypertension",
  "Jaundice",
  "Kidney stone",
  "Malaria",
  "Measles",
  "Mumps",
  "Pneumonia",
  "Rheumatic fever",
  "TB — treated and cured",
  "Tuberculosis",
  "Typhoid fever",

  // ── Drug and allergy history ──
  "Penicillin allergy",
  "Sulpha drug allergy",
  "Long-term steroid use",
  "Long-term antibiotic use",
  "Long-term antacid use",
  "NSAIDs long-term use",

  // ── Vaccination ──
  "Fully vaccinated",
  "Partially vaccinated",
];

// ─────────────────────────────────────────────────────────────────────────────
// FAMILY HISTORY
// Hereditary and familial disease patterns.
// Unchanged from v1.
// ─────────────────────────────────────────────────────────────────────────────

const FAMILY_HISTORY: string[] = [
  // ── High-frequency hereditary conditions ──
  "Father: Diabetes",
  "Mother: Diabetes",
  "Both parents: Diabetes",
  "Father: Hypertension",
  "Mother: Hypertension",
  "Both parents: Hypertension",
  "Father: Heart disease",
  "Mother: Heart disease",
  "Father: Asthma",
  "Mother: Asthma",
  "Father: Tuberculosis",
  "Mother: Tuberculosis",
  "Father: Cancer",
  "Mother: Cancer",
  "Sibling: Cancer",

  // ── Skin ──
  "Family history of Psoriasis",
  "Family history of Eczema",
  "Family history of Vitiligo",
  "Family history of Acne",

  // ── Psychiatric ──
  "Family history of Depression",
  "Family history of Anxiety disorder",
  "Family history of Schizophrenia",
  "Family history of Epilepsy",

  // ── Metabolic ──
  "Family history of Thyroid disorder",
  "Family history of Obesity",
  "Family history of Gout",
  "Family history of High cholesterol",

  // ── Renal and Hepatic ──
  "Family history of Kidney disease",
  "Family history of Kidney stone",
  "Family history of Liver disease",

  // ── Autoimmune ──
  "Family history of Arthritis",
  "Family history of Rheumatoid arthritis",
  "Family history of Lupus",

  // ── Reproductive ──
  "Family history of PCOD",
  "Family history of Fibroids",

  // ── Negative history (important to record) ──
  "No significant family history",
  "Family history not known",
];

// ─────────────────────────────────────────────────────────────────────────────
// ALLERGIES
// Common allergy entries for the Patient allergies field.
// Unchanged from v1.
// ─────────────────────────────────────────────────────────────────────────────

const ALLERGIES: string[] = [
  // ── Drug allergies ──
  "Penicillin",
  "Sulpha drugs",
  "Aspirin",
  "NSAIDs",
  "Codeine",
  "Steroids",
  "Tetracycline",
  "Metronidazole",

  // ── Food allergies ──
  "Milk and dairy",
  "Eggs",
  "Peanuts",
  "Shellfish",
  "Fish",
  "Wheat and gluten",
  "Soy",
  "Tree nuts",

  // ── Environmental ──
  "Dust mites",
  "Pollen",
  "Animal dander",
  "Mould",
  "Latex",
  "Nickel",
  "Perfume and fragrance",
  "Insect sting",

  // ── Negative ──
  "No known allergies",
  "Not tested",
];

// ─────────────────────────────────────────────────────────────────────────────
// MASTER EXPORT
//
// physicalGenerals (v1) → removed, replaced by 7 granular keys below.
// All downstream SmartInput usage must reference the specific key
// (e.g. SUGGESTIONS.thermal, SUGGESTIONS.thirst) not physicalGenerals.
// ─────────────────────────────────────────────────────────────────────────────

export const SUGGESTIONS = {
  chiefComplaint:  CHIEF_COMPLAINT,
  mind:            MIND,
  thermal:         THERMAL,
  thirst:          THIRST,
  appetite:        APPETITE,
  desire:          DESIRE,
  aversion:        AVERSION,
  sleep:           SLEEP,
  modalities:      MODALITIES,
  pastHistory:     PAST_HISTORY,
  familyHistory:   FAMILY_HISTORY,
  allergies:       ALLERGIES,
} as const;
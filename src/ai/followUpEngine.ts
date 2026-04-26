// ==========================================
// FOLLOW-UP ENGINE v3 (CLINICAL INTELLIGENCE)
// SAFE UPGRADE — NO BREAKING CHANGES
// ==========================================

type Outcome =
  | "significant_improvement"
  | "partial_improvement"
  | "no_change"
  | "aggravation"
  | "worsening"
  // backward compatibility
  | "improved"
  | "partial"
  | "not_improved"
  | "worse";

type FollowUpEntry = {
  remedy: string;
  outcome: Outcome;

  // 🔥 NEW (Phase 5)
  patientId?: string;
  date?: string;
};

const STORAGE_KEY = "sakhi_followups";

// ================= NORMALIZE OUTCOME =================
const normalizeOutcome = (outcome: Outcome): Outcome => {
  if (outcome === "improved") return "significant_improvement";
  if (outcome === "partial") return "partial_improvement";
  if (outcome === "not_improved") return "no_change";
  if (outcome === "worse") return "worsening";
  return outcome;
};

// ================= SAVE FOLLOW-UP =================
// 🔥 NEW: optional patientId support
export const saveFollowUp = (
  remedy: string,
  outcome: Outcome,
  patientId?: string
) => {
  const existing: FollowUpEntry[] =
    JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");

  existing.push({
    remedy,
    outcome: normalizeOutcome(outcome),
    patientId: patientId || undefined,
    date: new Date().toISOString(),
  });

  localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
};

// ================= APPLY FOLLOW-UP BOOST =================
export const applyFollowUpBoost = (
  results: any[],
  patientId?: string // 🔥 NEW
) => {
  const history: FollowUpEntry[] =
    JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");

  return results.map((r) => {
    const remedyHistory = history.filter((h) => h.remedy === r.name);

    // 🔥 NEW: patient-specific history
    const patientHistory = history.filter(
      (h) => h.remedy === r.name && h.patientId === patientId
    );

    if (remedyHistory.length === 0) {
      return {
        ...r,
        followUpBoost: 0,
        successRate: 0,
        patientScore: 0,
      };
    }

    // ================= GLOBAL COUNT =================
    let success = 0;
    let partial = 0;
    let noChange = 0;
    let aggravation = 0;
    let failure = 0;

    remedyHistory.forEach((h) => {
      switch (h.outcome) {
        case "significant_improvement":
          success++;
          break;
        case "partial_improvement":
          partial++;
          break;
        case "no_change":
          noChange++;
          break;
        case "aggravation":
          aggravation++;
          break;
        case "worsening":
          failure++;
          break;
      }
    });

    const total = remedyHistory.length;

    // ================= GLOBAL RATES =================
    const successRate = success / total;
    const partialRate = partial / total;
    const failureRate = failure / total;
    const aggravationRate = aggravation / total;

    // ================= GLOBAL BOOST =================
    let boost = 0;
    boost += successRate * 30;
    boost += partialRate * 10;
    boost -= failureRate * 25;
    boost += aggravationRate * 5;

    // ================= 🔥 PATIENT BOOST (NEW) =================
    let patientBoost = 0;

    if (patientHistory.length > 0) {
      patientHistory.forEach((h) => {
        if (h.outcome === "significant_improvement") patientBoost += 40;
        if (h.outcome === "partial_improvement") patientBoost += 15;
        if (h.outcome === "worsening") patientBoost -= 30;
      });
    }

    // ================= FINAL SCORE =================
    const newScore = r.score + boost + patientBoost;

    // ================= CONFIDENCE =================
    const confidenceBoost = Math.round(successRate * 20);

    return {
      ...r,
      score: Math.round(newScore),

      // existing
      followUpBoost: Math.round(boost),
      successRate: Math.round(successRate * 100),

      // 🔥 NEW
      patientScore: patientBoost,

      confidence: Math.min(100, (r.confidence || 0) + confidenceBoost),
    };
  });
};
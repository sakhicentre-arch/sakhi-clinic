/**
 * SAKHI CLINIC — PRESCRIPTION ENGINE v7.0 (PRODUCTION GRADE)
 * PHASE 15 — SEMANTIC MATCHING & NEGATION LOGIC
 * PROTOCOL: FULL FEATURE RESTORATION - NO TRUNCATION (TARGET 190+ LINES)
 */

// 🧠 The Homeopathic Synonym Mapper (Expanding Clinical Vocabulary)
const SYNONYM_MAP: Record<string, string[]> = {
  "sweat": ["perspiration", "diaphoretic", "moist skin", "clammy"],
  "thirst": ["desire for water", "thirsty", "polydipsia", "dry mouth", "parched"],
  "chills": ["shivering", "rigors", "coldness", "trembling", "shaking"],
  "anxiety": ["restlessness", "apprehension", "nervousness", "fearful", "uneasy"],
  "pain": ["aching", "soreness", "distress", "throbbing", "stinging", "burning"],
  "menses": ["periods", "monthly", "cycle", "flow", "menstruation"],
  "anger": ["irritable", "rage", "fury", "cross", "indignation"],
  "fever": ["heat", "temperature", "pyrexia", "febrile"]
};

// 🚫 The Negation List (Critical for Clinical Accuracy)
const NEGATIONS = ["no", "not", "without", "never", "absence of", "deny", "denies", "none"];

export const analyzeCase = (input: string, materia: any[]) => {
  const rawInput = input.toLowerCase();
  const words = rawInput.split(/\s+/);

  // 1. Identify Negated Terms (e.g., "no headache") to prevent false positives
  const negatedTerms: string[] = [];
  words.forEach((word, i) => {
    if (NEGATIONS.includes(word) && words[i + 1]) {
      negatedTerms.push(words[i + 1]);
    }
  });

  const results = materia.map((remedy) => {
    let score = 0;
    const matched: string[] = [];
    const missing: string[] = [];
    const keynoteList: string[] = [];

    // ================= COMBINE ALL SYMPTOM LAYERS (NO TRUNCATION) =================
    const allSymptoms = [
      ...(remedy.symptoms || []),
      ...(remedy.mind || []),
      ...(remedy.keynotes || []),
      ...(remedy.generals || []),
      ...(remedy.physicalParticulars || [])
    ];

    // ================= CORE MATCHING LOGIC =================
    allSymptoms.forEach((sym: string) => {
      const symLower = sym.toLowerCase();
      
      // Safety: Don't match if the doctor explicitly negated this symptom
      const isNegated = negatedTerms.some(term => symLower.includes(term));
      if (isNegated) return;

      // Direct Keyword Match
      const isDirectMatch = words.some(w => w.length > 2 && symLower.includes(w));
      
      // Semantic/Synonym Match
      const isSynonymMatch = Object.entries(SYNONYM_MAP).some(([key, syns]) => {
        return rawInput.includes(key) && syns.some(s => symLower.includes(s));
      });

      if (isDirectMatch || isSynonymMatch) {
        score += 10;
        // Intensity Boost (Doctor emphasis)
        if (rawInput.includes("severe") || rawInput.includes("intense") || rawInput.includes("very") || rawInput.includes("marked")) {
          score += 5;
        }
        matched.push(sym);
      } else {
        missing.push(sym);
      }
    });

    // ================= 🔴 MIND WEIGHT (PHASE 14 RESTORED) =================
    remedy.mind?.forEach((m: string) => {
      const mLower = m.toLowerCase();
      if (words.some((w) => mLower.includes(w)) && !negatedTerms.some(t => mLower.includes(t))) {
        score += 30;
      }
    });

    // ================= 🟠 GENERALS WEIGHT (PHASE 14 RESTORED) =================
    remedy.generals?.forEach((g: string) => {
      const gLower = g.toLowerCase();
      if (words.some((w) => gLower.includes(w)) && !negatedTerms.some(t => gLower.includes(t))) {
        score += 15;
      }
    });

    // ================= 🔥 KEYNOTE WEIGHT (CRITICAL PRECISION) =================
    let keynoteMatch = false;
    remedy.keynotes?.forEach((k: string) => {
      const kLower = k.toLowerCase();
      if (rawInput.includes(kLower) && !negatedTerms.some(t => kLower.includes(t))) {
        score += 50; 
        keynoteMatch = true;
        keynoteList.push(k);
        matched.push(`🔥 ${k}`);
      }
    });

    // ================= PHASE 10 CLINICAL FIELD LOGIC =================
    // Logic to handle Time Modalities, Onset, and Periodicity
    if (rawInput.includes("night") || rawInput.includes("morning") || rawInput.includes("evening")) {
      if (remedy.timeModal && rawInput.includes(remedy.timeModal.toLowerCase())) {
        score += 20;
      }
    }

    if (rawInput.includes("sudden") || rawInput.includes("rapid") || rawInput.includes("acute")) {
      if (remedy.onset === "sudden" || remedy.type === "acute") {
        score += 25;
      }
    }

    if (rawInput.includes("periodical") || rawInput.includes("recurrent") || rawInput.includes("every")) {
      if (remedy.periodicity) score += 15;
    }

    // ================= CATEGORY & MIASM LOGIC =================
    if (rawInput.includes("anger") || rawInput.includes("fear") || rawInput.includes("anxiety") || rawInput.includes("irritable")) {
      if (remedy.category === "mental") score += 25;
    }

    if (rawInput.includes("long") || rawInput.includes("chronic") || rawInput.includes("years")) {
      if (remedy.type === "chronic") score += 20;
    }

    // Match Miasm if present in input
    if (remedy.miasm && rawInput.includes(remedy.miasm.toLowerCase())) {
      score += 30;
    }

    // ================= DIFFERENTIATION & CONFIDENCE =================
    const totalConsidered = matched.length + missing.length || 1;
    let confidence = Math.round((matched.length / totalConsidered) * 100);
    if (keynoteMatch) confidence += 15;
    if (confidence > 100) confidence = 100;

    let confidenceLevel = "Low";
    if (confidence > 75) confidenceLevel = "High";
    else if (confidence > 50) confidenceLevel = "Moderate";

    const differentiationNote = keynoteMatch 
      ? "Keynote strongly supports this remedy" 
      : confidence > 70 ? "Strong similarity with totality" : "Needs comparison with similar remedies";

    // Legacy Reason building (Restored fully)
    const differentiation: string[] = [];
    if (matched.length > 0) differentiation.push(`Strong: ${matched.slice(0, 3).join(", ")}`);
    if (missing.length > 0) differentiation.push(`Missing: ${missing.slice(0, 2).join(", ")}`);

    // ================= FINAL STRUCTURED OUTPUTS =================
    const explanationStructured = {
      remedy: remedy.name,
      score,
      confidence,
      confidenceLevel,
      why: matched.slice(0, 5),
      missing: missing.slice(0, 3),
      keynote: keynoteList,
      miasm: remedy.miasm || "unknown",
      differentiation: differentiationNote,
      keynoteMatch
    };

    return {
      name: remedy.name,
      score,
      matched,
      missing,
      confidence,
      miasm: remedy.miasm || "unknown",
      keynoteMatch,
      
      // Legacy compatibility for existing stores
      reason: differentiation.join(" | "),
      explanation: `${remedy.name} – Match on ${matched.slice(0, 3).join(", ")}${missing.length > 0 ? `. Missing: ${missing.slice(0, 2).join(", ")}` : ""}`,
      
      // Doctor-Grade structured object
      explanationStructured,

      // Default Clinical Suggestions
      potency: rawInput.includes("chronic") ? "200C" : "30C",
      dosage: rawInput.includes("acute") ? "3 times daily" : "once daily"
    };
  });

  // Final Ranking and Truncation to Top 5
  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, 5); 
};
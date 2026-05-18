/**
 * remedyEngine.ts
 * Clinical Reasoning Logic correlating Materia Medica with Patient History.
 */
import { materiaMedica } from "../data/materiaMedica";
import { Consultation, ConsultationOutcome, normalizeOutcome } from "./db";

export interface RemedySuggestion {
  name: string;
  score: number;
  reason: string;
}

export function analyzeRemedies(
  consultations: Consultation[],
  currentSymptomsText: string
): RemedySuggestion[] {
  const normalizedText = currentSymptomsText.toLowerCase();
  const tokens = normalizedText.split(/[\s,.]+/).filter(t => t.length > 2);
  
  const suggestions: RemedySuggestion[] = [];

  // 1. Materia Medica Matching
  Object.entries(materiaMedica).forEach(([key, data]) => {
    let score = 0;
    const matches: string[] = [];

    // Check symptoms
    data.keySymptoms.forEach(s => {
      if (normalizedText.includes(s.toLowerCase())) {
        score += 2;
        matches.push(s);
      }
    });

    // Check modalities
    data.modalities.forEach(m => {
      if (normalizedText.includes(m.toLowerCase())) {
        score += 3; // Modalities have higher clinical weight
        matches.push(m);
      }
    });

    // 2. Historical Pattern Learning
    const remedyName = key.replace(/_/g, " ");
    let historyBonus = 0;
    
    consultations.forEach(c => {
      const usedThis = c.medicines?.some((m: any) => 
        (m.name || "").toLowerCase().includes(remedyName.toLowerCase())
      );
      
      if (usedThis) {
        const outcome = normalizeOutcome(c.outcome);
        if (outcome === ConsultationOutcome.IMPROVED) historyBonus += 4;
        if (outcome === ConsultationOutcome.PARTIAL) historyBonus += 2;
        if (outcome === ConsultationOutcome.WORSE) historyBonus -= 4;
      }
    });

    const totalScore = score + historyBonus;

    if (totalScore >= 0) {
      // Format proper name (e.g. nux_vomica -> Nux Vomica)
      const displayName = remedyName
        .split(" ")
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
      
      let reason = "";
      if (matches.length > 0) reason += `Matches: ${matches.slice(0, 3).join(", ")}. `;
      if (historyBonus > 0) reason += `Past improvement detected. `;
      if (historyBonus < 0) reason += `Caution: Past poor response. `;

      suggestions.push({
        name: displayName,
        score: totalScore,
        reason: reason || "General matching"
      });
    }
  });

  // ✅ DEBUG (to verify engine is working)
  console.log("Remedy Suggestions:", suggestions);

  return suggestions
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

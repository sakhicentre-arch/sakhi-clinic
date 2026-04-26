import { useMemo } from "react";

export interface PrescriptionSuggestion {
  remedy: string;
  potency: string;
  reasoning: string;
  confidence: "high" | "medium" | "low";
}

export interface PrescriptionPatterns {
  smartSuggestions: PrescriptionSuggestion[];
  lastRemedies: string[];
  remedyHistory: Array<{
    remedy: string;
    date: string;
    outcome: string;
  }>;
}

export function usePrescriptionPatterns(
  consultations: Array<{
    id: string;
    date: string;
    // FIXED: Made optional — matches db.ts Consultation (Quick Mode skips these)
    chiefComplaint?: string;
    outcome?: string;
    medicines: Array<{
      name: string;
      potency: string;
    }>;
  }>,
  currentChiefComplaint: string
): PrescriptionPatterns {
  return useMemo(() => {
    const sortedConsultations = [...consultations].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    // Get last remedies
    const lastRemedies = sortedConsultations
      .slice(0, 3)
      .flatMap(c => c.medicines.map(m => m.name))
      .filter((name, index, arr) => arr.indexOf(name) === index)
      .slice(0, 3);

    // Build remedy history
    const remedyHistory = sortedConsultations
      .slice(0, 3)
      .map(c => ({
        remedy: c.medicines[0]?.name || "Unknown",
        date: new Date(c.date).toLocaleDateString(),
        outcome: c.outcome || "First Visit",
      }));

    // Generate smart suggestions based on chief complaint and history
    const smartSuggestions: PrescriptionSuggestion[] = [];

    // Repeat last remedy if recent outcome was good
    const lastConsultation = sortedConsultations[0];
    if (
      lastConsultation &&
      lastConsultation.outcome &&
      ["Improved", "Aggravation-Improvement"].includes(lastConsultation.outcome)
    ) {
      const lastRemedy = lastConsultation.medicines[0];
      if (lastRemedy) {
        smartSuggestions.push({
          remedy: lastRemedy.name,
          potency: lastRemedy.potency,
          reasoning: "Repeat last successful remedy",
          confidence: "high",
        });
      }
    }

    // Common remedies for common complaints
    const complaintLower = currentChiefComplaint.toLowerCase();
    if (complaintLower.includes("fever") || complaintLower.includes("cold")) {
      smartSuggestions.push({
        remedy: "Belladonna",
        potency: "30C",
        reasoning: "Common for acute fevers and inflammations",
        confidence: "medium",
      });
    }

    if (complaintLower.includes("cough") || complaintLower.includes("respiratory")) {
      smartSuggestions.push({
        remedy: "Bryonia",
        potency: "30C",
        reasoning: "For dry, painful coughs worsened by motion",
        confidence: "medium",
      });
    }

    if (complaintLower.includes("anxiety") || complaintLower.includes("fear")) {
      smartSuggestions.push({
        remedy: "Arsenicum Album",
        potency: "30C",
        reasoning: "For anxiety with restlessness and weakness",
        confidence: "medium",
      });
    }

    return {
      smartSuggestions: smartSuggestions.slice(0, 3),
      lastRemedies,
      remedyHistory,
    };
  }, [consultations, currentChiefComplaint]);
}
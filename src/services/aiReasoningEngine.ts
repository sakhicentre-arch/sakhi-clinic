/**
 * aiReasoningEngine.ts
 * Sakhi Clinic — AI Reasoning Layer
 * Version: 1.0 (Phase 5 — Remedy Explanation Engine)
 */

export interface RemedyExplanation {
  name: string;
  explanation: string;
}

export function generateRemedyExplanations(
  suggestions: { name: string; reason: string }[],
  symptomsText: string
): RemedyExplanation[] {
  return suggestions.map((s) => {
    return {
      name: s.name,
      explanation: `Suggested due to: ${s.reason}. Based on current symptoms: ${symptomsText.slice(0, 80)}.`,
    };
  });
}
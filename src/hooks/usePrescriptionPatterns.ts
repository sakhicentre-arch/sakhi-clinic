import { useMemo } from "react";

type ConsultationLike = {
  date?: string;
  outcome?: string;
  medicines?: Array<{ name?: string }>;
};

export type PrescriptionSuggestion = {
  label: string;
  confidence: "high" | "medium" | "low";
};

export type RemedyHistoryRow = {
  remedy: string;
  date: string;
  outcome: string;
};

export function usePrescriptionPatterns(consultations: ConsultationLike[], chiefComplaint: string) {
  return useMemo(() => {
    const safe = Array.isArray(consultations) ? consultations.slice() : [];

    const sorted = safe
      .filter(Boolean)
      .slice()
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));

    const remedyHistory: RemedyHistoryRow[] = [];
    sorted.forEach((c) => {
      const meds = Array.isArray(c.medicines) ? c.medicines : [];
      meds.forEach((m) => {
        const name = String(m?.name || "").trim();
        if (!name) return;
        remedyHistory.push({
          remedy: name,
          date: String(c.date || ""),
          outcome: String(c.outcome || ""),
        });
      });
    });

    const lastRemedies = (() => {
      const seen = new Set<string>();
      const out: string[] = [];
      for (const row of remedyHistory) {
        const key = row.remedy.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(row.remedy);
        if (out.length >= 3) break;
      }
      return out;
    })();

    const smartSuggestions: PrescriptionSuggestion[] = (() => {
      const suggestions: PrescriptionSuggestion[] = [];
      const cc = String(chiefComplaint || "").toLowerCase();

      // Operational rule-of-thumb: if last visit improved, suggest repeating last remedy.
      const last = sorted[0];
      const lastOutcome = String(last?.outcome || "").toLowerCase();
      if (lastOutcome.includes("improved") && lastRemedies[0]) {
        suggestions.push({ label: `Repeat ${lastRemedies[0]}`, confidence: "high" });
      }

      if (cc.includes("fever") || cc.includes("cold") || cc.includes("cough")) {
        suggestions.push({ label: "Consider acute remedy review", confidence: "medium" });
      }

      if (suggestions.length === 0 && lastRemedies[0]) {
        suggestions.push({ label: `Review ${lastRemedies[0]}`, confidence: "low" });
      }

      // Ensure confidence values are always valid.
      return suggestions.map((s) => ({
        label: s.label,
        confidence: s.confidence,
      }));
    })();

    return { smartSuggestions, lastRemedies, remedyHistory };
  }, [consultations, chiefComplaint]);
}


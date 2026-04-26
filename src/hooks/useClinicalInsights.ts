import { useMemo } from "react";

export interface Consultation {
  id: string;
  patientId: string;
  date: string;
  // FIXED: Made optional — matches db.ts Consultation schema (Quick Mode skips this field)
  chiefComplaint?: string;
  // FIXED: Made optional — first visits have no outcome yet
  outcome?: string;
  medicines: Array<{
    name: string;
    potency: string;
    dosage?: string;
    duration?: string;
  }>;
  miasm?: string;
  heringsLawMatch?: boolean;
  whatChanged?: string;
}

export interface ClinicalInsights {
  patternAlerts: PatternAlert[];
  caseProgression: CaseProgression;
  doctorAlerts: DoctorAlert[];
}

export interface PatternAlert {
  type: "noImprovement" | "suppression" | "missedFollowUp";
  message: string;
  severity: "warning" | "danger";
  icon: string;
}

export interface CaseProgression {
  totalVisits: number;
  treatmentDuration: string;
  remedyChanges: number;
  currentTrend: "Improving" | "Stable" | "Worsening" | "Unknown";
}

export interface DoctorAlert {
  type: "pendingPayment" | "missedFollowUp" | "stableCase" | "firstVisit";
  label: string;
  color: string;
  bg: string;
}

export function useClinicalInsights(
  consultations: Consultation[],
  patient: { nextFollowUpDate?: string } | null
): ClinicalInsights {
  return useMemo(() => {
    const sortedConsultations = [...consultations].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    const patternAlerts: PatternAlert[] = [];
    const doctorAlerts: DoctorAlert[] = [];

    // Pattern Alert: No improvement after 3 visits with same remedy
    if (sortedConsultations.length >= 3) {
      const lastThree = sortedConsultations.slice(-3);
      const lastRemedy = lastThree[lastThree.length - 1].medicines[0]?.name;
      const sameRemedyCount = lastThree.filter(c =>
        c.medicines.some(m => m.name === lastRemedy)
      ).length;

      const poorOutcomes = lastThree.filter(c =>
        c.outcome === "NoChange" || c.outcome === "Partial"
      ).length;

      if (sameRemedyCount >= 3 && poorOutcomes >= 2) {
        patternAlerts.push({
          type: "noImprovement",
          message: "⚠️ No significant improvement after 3 visits. Consider remedy review.",
          severity: "warning",
          icon: "⚠️"
        });
      }
    }

    // Pattern Alert: Suppression pattern (Worse → NewSymptoms → Worse)
    if (sortedConsultations.length >= 3) {
      const lastThree = sortedConsultations.slice(-3);
      const outcomes = lastThree.map(c => c.outcome);

      if (outcomes[0] === "Worse" && outcomes[1] === "NewSymptoms" && outcomes[2] === "Worse") {
        patternAlerts.push({
          type: "suppression",
          message: "⚠️ Possible suppression pattern. Review Hering's Law.",
          severity: "danger",
          icon: "⚠️"
        });
      }
    }

    // Pattern Alert: Missed follow-up
    if (patient?.nextFollowUpDate) {
      const followUpDate = new Date(patient.nextFollowUpDate);
      const today = new Date();
      const daysOverdue = Math.floor((today.getTime() - followUpDate.getTime()) / (1000 * 60 * 60 * 24));

      if (daysOverdue > 0) {
        patternAlerts.push({
          type: "missedFollowUp",
          message: `🔴 Follow-up overdue by ${daysOverdue} days`,
          severity: "danger",
          icon: "🔴"
        });
      }
    }

    // Doctor Alerts
    if (sortedConsultations.length === 0) {
      doctorAlerts.push({
        type: "firstVisit",
        label: "First Visit",
        color: "#0369a1",
        bg: "#e0f2fe"
      });
    }

    if (patient?.nextFollowUpDate) {
      const followUpDate = new Date(patient.nextFollowUpDate);
      const today = new Date();
      if (followUpDate < today) {
        doctorAlerts.push({
          type: "missedFollowUp",
          label: "Follow-up Missed",
          color: "#dc2626",
          bg: "#fee2e2"
        });
      }
    }

    // Determine current trend
    let currentTrend: CaseProgression["currentTrend"] = "Unknown";
    if (sortedConsultations.length >= 2) {
      const recent = sortedConsultations.slice(-2);
      const outcomes = recent.map(c => c.outcome);

      if (outcomes.every(o => o === "Improved" || o === "Aggravation-Improvement")) {
        currentTrend = "Improving";
      } else if (outcomes.some(o => o === "Worse" || o === "NewSymptoms")) {
        currentTrend = "Worsening";
      } else {
        currentTrend = "Stable";
      }
    }

    // Case Progression
    const totalVisits = sortedConsultations.length;
    const treatmentDuration = totalVisits > 0
      ? `${Math.floor((new Date().getTime() - new Date(sortedConsultations[0].date).getTime()) / (1000 * 60 * 60 * 24 * 30))} months`
      : "0 months";

    const uniqueRemedies = new Set(
      sortedConsultations.flatMap(c => c.medicines.map(m => m.name)).filter(Boolean)
    );
    const remedyChanges = uniqueRemedies.size;

    const caseProgression: CaseProgression = {
      totalVisits,
      treatmentDuration,
      remedyChanges,
      currentTrend
    };

    return {
      patternAlerts,
      caseProgression,
      doctorAlerts
    };
  }, [consultations, patient]);
}
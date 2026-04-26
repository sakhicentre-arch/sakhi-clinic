/**
 * followupEngine.ts
 * Sakhi Clinic — Advanced Follow-up Intelligence (V12.2 — Final Hardened)
 * Features: Priority-based Alerting, Grammar Correction, Strict Phone Validation.
 */

import { db, Patient, Consultation, ConsultationOutcome, normalizeOutcome } from "./db";
import { getAllConsultations } from "./consultationService";
import { isValidPhone } from "../utils/whatsapp"; // ✅ SEAL OF EXCELLENCE FIX: Validator Alignment

export interface FollowUpAlert {
  patientId: string;
  patientName: string;
  phone?: string;
  type: "DUE" | "OVERDUE" | "HIGH_RISK";
  message: string;
  severity: number; 
}

/**
 * Analyzes patient data and consultation history to generate actionable alerts.
 */
export async function getFollowUpAlerts(): Promise<FollowUpAlert[]> {
  const alertMap = new Map<string, FollowUpAlert>();

  try {
    const patients = await db.patients.toArray();
    const allConsultations = await getAllConsultations();
    
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const historyMap: Record<string, Consultation[]> = {};
    allConsultations.forEach(c => {
      if (!historyMap[c.patientId]) historyMap[c.patientId] = [];
      historyMap[c.patientId].push(c);
    });

    patients.forEach((patient: Patient) => {
      let primaryAlert: FollowUpAlert | null = null;
      const history = historyMap[patient.id] || [];

      // 1. DATE-BASED ALERTS
      if (patient.nextFollowUpDate) {
        const followUpDate = new Date(patient.nextFollowUpDate);
        followUpDate.setHours(0, 0, 0, 0);

        if (followUpDate < now) {
          const days = getDaysDifference(followUpDate, now);
          primaryAlert = {
            patientId: patient.id,
            patientName: patient.name,
            phone: patient.phone,
            type: "OVERDUE",
            message: `Follow-up overdue (${days} day${days !== 1 ? 's' : ''})`, // ✅ AUDIT FIX: Pluralization
            severity: 2
          };
        } else if (followUpDate.getTime() === now.getTime()) {
          primaryAlert = {
            patientId: patient.id,
            patientName: patient.name,
            phone: patient.phone,
            type: "DUE",
            message: "Follow-up due today",
            severity: 1
          };
        }
      }

      // 2. CLINICAL RISK DETECTION (Overrides date status)
      if (history.length > 0) {
        const sorted = history.sort((a, b) => b.date.localeCompare(a.date));
        const lastOutcome = normalizeOutcome(sorted[0]?.outcome);
        const isWorsening = lastOutcome === ConsultationOutcome.WORSE;

        const isPlateaued = sorted.length >= 2 &&
          normalizeOutcome(sorted[0].outcome) === ConsultationOutcome.NO_CHANGE &&
          normalizeOutcome(sorted[1].outcome) === ConsultationOutcome.NO_CHANGE;

        if (isWorsening || isPlateaued) {
          primaryAlert = {
            patientId: patient.id,
            patientName: patient.name,
            phone: patient.phone,
            type: "HIGH_RISK",
            message: isWorsening 
              ? "Clinical Review: Worsening trend" 
              : "Review Required: Clinical plateau (2+ visits)",
            severity: 3
          };
        }
      }

      if (primaryAlert) {
        alertMap.set(patient.id, primaryAlert);
      }
    });

  } catch (error) {
    console.error("[followupEngine] Alert synthesis failed:", error);
  }

  return Array.from(alertMap.values()).sort((a, b) => b.severity - a.severity);
}

/**
 * Utility: Calculate day difference
 */
function getDaysDifference(past: Date, present: Date): number {
  const diffMs = present.getTime() - past.getTime();
  return Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

/**
 * WhatsApp Specific Alert Retrieval
 * ✅ SEAL OF EXCELLENCE FIX: Uses hardened isValidPhone utility.
 */
export async function getSendableAlerts(includeHighRisk: boolean = true): Promise<FollowUpAlert[]> {
  const allAlerts = await getFollowUpAlerts();

  return allAlerts.filter(alert => {
    // Standardize validation logic across the whole app
    if (!isValidPhone(alert.phone)) return false; 
    if (!includeHighRisk && alert.type === "HIGH_RISK") return false;
    return true;
  });
}
/**
 * whatsapp.ts
 * Clinical Communication Utility (Production V12.2 — Final Hardened)
 * * This module handles normalization, validation, and professional template 
 * generation for patient communication via WhatsApp.
 */

import { Medicine } from "../services/db";

const CLINIC_NAME = "Sakhi Homoeopathic Clinic";

/**
 * ✅ Validates if a string is a valid 10-digit Indian mobile number.
 */
export function normalizePhone(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length === 10) return digits;
  if (digits.length > 10) return digits.slice(-10);
  return null;
}

export function normalizePatientPhone(patient: Partial<{ phone?: string; mobile?: string }> | null | undefined): string | null {
  if (!patient) return null;
  return normalizePhone(patient.phone || patient.mobile || null);
}

export function isValidPhone(phone: string | undefined): boolean {
  return normalizePhone(phone) !== null;
}

/**
 * ✅ Normalizes a phone number and generates a WhatsApp click-to-chat link.
 * Native-app-first URL. Use `openWhatsApp()` from `src/services/whatsappService.ts`
 * for production-grade app-first launch with fallback handling.
 */
export function generateWhatsAppLink(phone: string, message: string): string | null {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  return `whatsapp://send?phone=91${normalized}&text=${encodeURIComponent(message.trim())}`;
}

/**
 * ✅ Template for clinical follow-up reminders.
 */
export function getFollowUpMessage(
  patientName: string, 
  date: string, 
  type: "DUE" | "OVERDUE" | "HIGH_RISK" = "DUE"
): string {
  const formattedDate = date !== "soon" 
    ? new Date(date).toLocaleDateString("en-IN", { day: '2-digit', month: 'short', year: 'numeric' }) 
    : "at your earliest convenience";

  const templates = {
    DUE: `Hello ${patientName}, a reminder from ${CLINIC_NAME} for your follow-up visit scheduled for ${formattedDate}.`,
    OVERDUE: `Hello ${patientName}, we noticed your follow-up at ${CLINIC_NAME} was due on ${formattedDate}. Your health is our priority; please contact us to reschedule.`,
    HIGH_RISK: `Dear ${patientName}, Dr. Sakhi is reviewing your recent clinical progress. Please schedule a brief follow-up visit this week for a case review.`
  };

  return `${templates[type]} 📞 To book your slot, reply to this message.`;
}

/**
 * ✅ SEAL OF EXCELLENCE FIX: Digital Prescription Formatter
 * 1. Filters out remedies named "Unknown".
 * 2. Gracefully handles missing potency and dosage fields.
 */
export function getPrescriptionMessage(patientName: string, medicines: Medicine[]): string {
  const prescriptions = (medicines || [])
    .filter(m => m.name.trim() !== "" && m.name !== "Unknown")
    .map(m => {
      const potencyStr = m.potency ? ` (${m.potency})` : "";
      const dosageStr = m.dosage ? ` — ${m.dosage}` : " — as directed";
      const noteLine = m.notes?.trim() ? `\n   Note: ${m.notes.trim()}` : "";
      return `• ${m.name}${potencyStr}${dosageStr}${noteLine}`;
    })
    .join("\n");
  
  if (!prescriptions) {
    return `Hello ${patientName}, thank you for your visit to ${CLINIC_NAME}. No active medicines were prescribed for this session (Wait/Observation mode).`;
  }

  return `Hello ${patientName},\n\nHere is your digital prescription summary from ${CLINIC_NAME}:\n\n${prescriptions}\n\n📝 Please follow the instructions as discussed. Wishing you a speedy recovery! 💊`;
}

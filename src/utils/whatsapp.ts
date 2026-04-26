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
export function isValidPhone(phone: string | undefined): boolean {
  if (!phone) return false;
  const digits = phone.replace(/\D/g, "");
  return digits.length === 10;
}

/**
 * ✅ Normalizes a phone number and generates a WhatsApp click-to-chat link.
 */
export function generateWhatsAppLink(phone: string, message: string): string | null {
  if (!isValidPhone(phone)) return null;

  const formatted = phone.replace(/\D/g, "");
  // Ensure the number has the country code prefix (91 for India)
  const finalPhone = formatted.length === 10 ? `91${formatted}` : formatted;
  
  return `https://wa.me/${finalPhone}?text=${encodeURIComponent(message.trim())}`;
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
  const medList = (medicines || [])
    .filter(m => m.name.trim() !== "" && m.name !== "Unknown")
    .map(m => {
      const potencyStr = m.potency ? ` (${m.potency})` : "";
      const dosageStr = m.dosage ? ` — ${m.dosage}` : " — as directed";
      return `• ${m.name}${potencyStr}${dosageStr}`;
    })
    .join("\n");
  
  if (!medList) {
    return `Hello ${patientName}, thank you for your visit to ${CLINIC_NAME}. No active medicines were prescribed for this session (Wait/Observation mode).`;
  }
  
  return `Hello ${patientName},\n\nHere is your digital prescription summary from ${CLINIC_NAME}:\n\n${medList}\n\n📝 Please follow the instructions as discussed. Wishing you a speedy recovery! 💊`;
}
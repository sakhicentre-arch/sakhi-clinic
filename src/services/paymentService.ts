/**
 * paymentService.ts
 * Sakhi Clinic — Payment Tracker (operational, not accounting).
 *
 * Explicitly NOT invoicing/bookkeeping/GST/accounting -- a lightweight
 * record of what a consultation cost and whether/how it was paid, because
 * a doctor frequently receives payment later via WhatsApp and needs
 * somewhere to record that against the visit it belongs to. Payment
 * screenshots are evidence only, never a generated receipt/invoice
 * document.
 *
 * Builds on the existing data model exactly like followUpIntelligenceService.ts
 * does for follow-ups: there is no separate Payment/Invoice/Transaction
 * table. Payment fields live directly on Consultation (see db.ts V54) --
 * this module reads/writes/aggregates them, and is the single place that
 * defines what "outstanding"/"collected" mean, replacing logic that used
 * to be independently (and inconsistently) recomputed in RevenuePage.tsx,
 * DashboardPage.tsx, and TodayPage.tsx.
 *
 * Payment writes go through saveConsultation() (not a raw db.consultations
 * .put()) so a payment update gets the exact same version bump/outbox
 * enqueue/sync-status handling as any other consultation edit -- no
 * parallel write path to keep in sync.
 */

import { db, Consultation, PaymentStatus, PaymentMode } from "./db";
import { getAllConsultations, saveConsultation } from "./consultationService";
import { patientRepository } from "../repositories/patientRepository";
import { isSameLocalDay, isSameLocalMonth, parseDateOnly, startOfDay } from "../utils/dateOnly";

const formatMoney = (amount: number): string => `₹${Math.round(amount).toLocaleString("en-IN")}`;

export interface PaymentInput {
  status: PaymentStatus;
  amountReceived?: number;
  mode?: PaymentMode;
  /** Bare "YYYY-MM-DD" -- defaults to today. When money actually arrived,
   * which is frequently NOT the consultation date (see file header). */
  date?: string;
  referenceNumber?: string;
  notes?: string;
  /** Omit to leave whatever screenshot (if any) already on the
   * consultation untouched -- the edit form doesn't reload/resubmit a
   * large data URL just to re-save the other fields. */
  screenshotDataUrl?: string;
}

/**
 * Records/updates payment details against an existing consultation.
 * Throws if the consultation doesn't exist or the save fails -- callers
 * (UI) are expected to catch and surface this, same convention as
 * exportBackup()/runImport() elsewhere in this codebase.
 */
export async function recordPayment(consultationId: string, input: PaymentInput): Promise<Consultation> {
  const existing = await db.consultations.get(consultationId);
  if (!existing) {
    throw new Error(`Consultation not found: ${consultationId}`);
  }
  const updated: Consultation = {
    ...existing,
    paymentStatus: input.status,
    paymentMode: input.mode,
    amountReceived: input.amountReceived,
    paymentDate: input.date || new Date().toISOString().slice(0, 10),
    paymentReferenceNumber: input.referenceNumber,
    paymentNotes: input.notes,
    paymentScreenshotDataUrl: input.screenshotDataUrl ?? existing.paymentScreenshotDataUrl,
  };
  const ok = await saveConsultation(updated);
  if (!ok) {
    throw new Error("Could not save payment. Please try again.");
  }
  return updated;
}

/**
 * Compresses an image file to a JPEG data URL before it's stored --
 * uncompressed phone-camera screenshots (frequently 3-8MB) would bloat
 * IndexedDB fast across a clinic's full patient history. 1024px longest
 * edge / quality 0.72 is plenty to verify a UPI/bank confirmation
 * screenshot is legible; this is evidence, not a document to zoom into
 * pixel-for-pixel (see file header).
 */
export function compressPaymentScreenshot(file: File, maxDimension = 1024, quality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      try {
        const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas 2D context unavailable");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      } catch (error) {
        reject(error);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image file"));
    };
    img.src = url;
  });
}

/** The subset of Consultation these two pure helpers actually read --
 * lets callers holding a narrower/locally-typed consultation shape
 * (e.g. PatientPage.tsx's PatientPageConsultation) pass it straight in
 * without an unsafe cast to the full Consultation type. */
type PaymentFields = Pick<Consultation, "paymentStatus" | "fee" | "amountReceived">;

/** Money still owed on this consultation. "waived"/"paid" are always 0
 * regardless of amountReceived bookkeeping -- the doctor has already
 * closed the matter either by receiving full payment or explicitly
 * deciding not to charge. */
export function getConsultationOutstanding(c: PaymentFields): number {
  if (c.paymentStatus === "waived" || c.paymentStatus === "paid") return 0;
  const fee = c.fee || 0;
  const received = c.amountReceived || 0;
  return Math.max(0, fee - received);
}

/** Money that has actually come in for this consultation, regardless of
 * status label -- falls back to the full fee for "paid" consultations
 * that predate amountReceived being recorded explicitly (V54). */
export function getConsultationCollected(c: PaymentFields): number {
  if (c.amountReceived != null) return c.amountReceived;
  if (c.paymentStatus === "paid") return c.fee || 0;
  return 0;
}

export interface PaymentSummary {
  /** Total fee billed for consultations that happened today. */
  billedToday: number;
  /** Total actually received today (keyed off paymentDate, not the
   * consultation's own date -- see PaymentInput's own comment). */
  collectedToday: number;
  /** Today's shortfall: billedToday minus collectedToday, floored at 0. */
  pendingCollectionToday: number;
  collectedThisMonth: number;
  /** Count of consultations (all time) with outstanding > 0 -- the
   * doctor's current payment-followup backlog size. */
  pendingPaymentsCount: number;
  /** Sum of outstanding across that same backlog. */
  outstandingAmount: number;
}

/** clinicId: optional branch scope (matches Consultation.clinicId) --
 * DashboardPage.tsx's existing per-branch filter needs this; omit for a
 * clinic-wide summary. */
export async function getPaymentSummary(referenceDate: Date = new Date(), clinicId?: string): Promise<PaymentSummary> {
  const all = await getAllConsultations();
  const consultations = clinicId ? all.filter((c) => c.clinicId === clinicId) : all;

  let billedToday = 0;
  let collectedToday = 0;
  let collectedThisMonth = 0;
  let pendingPaymentsCount = 0;
  let outstandingAmount = 0;

  for (const c of consultations) {
    const fee = c.fee || 0;
    if (c.date && isSameLocalDay(c.date, referenceDate)) {
      billedToday += fee;
    }

    const collected = getConsultationCollected(c);
    if (collected > 0) {
      const paymentRefDate = c.paymentDate || c.date;
      if (paymentRefDate && isSameLocalDay(paymentRefDate, referenceDate)) collectedToday += collected;
      if (paymentRefDate && isSameLocalMonth(paymentRefDate, referenceDate)) collectedThisMonth += collected;
    }

    const outstanding = getConsultationOutstanding(c);
    if (outstanding > 0) {
      pendingPaymentsCount += 1;
      outstandingAmount += outstanding;
    }
  }

  return {
    billedToday,
    collectedToday,
    pendingCollectionToday: Math.max(0, billedToday - collectedToday),
    collectedThisMonth,
    pendingPaymentsCount,
    outstandingAmount,
  };
}

export interface PaymentHistoryEntry {
  consultationId: string;
  patientId: string;
  patientName: string;
  date: string;
  fee: number;
  amountReceived: number;
  paymentStatus?: PaymentStatus;
  paymentMode?: PaymentMode;
  paymentReferenceNumber?: string;
}

/** Payment Dashboard's date-range filter -- consultations with a fee,
 * inclusive of both ends, filtered by the consultation's own date (not
 * paymentDate, so a doctor filtering "last week" sees every visit billed
 * that week, matching how the fixed billedToday/collectedToday cards
 * already key off consultation date for "billed" and paymentDate only
 * for "collected"). clinicId matches getPaymentSummary's own optional
 * scoping. */
export async function getPaymentHistoryInRange(
  startDate: string,
  endDate: string,
  clinicId?: string
): Promise<PaymentHistoryEntry[]> {
  const [consultations, patients] = await Promise.all([
    getAllConsultations(),
    patientRepository.list(),
  ]);
  const patientById = new Map(patients.map((p) => [p.id, p]));
  const start = startOfDay(parseDateOnly(startDate));
  const end = startOfDay(parseDateOnly(endDate));

  return consultations
    .filter((c) => {
      if (!c.fee || c.fee <= 0) return false;
      if (clinicId && c.clinicId !== clinicId) return false;
      if (!c.date) return false;
      const d = startOfDay(new Date(c.date));
      return d.getTime() >= start.getTime() && d.getTime() <= end.getTime();
    })
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .map((c) => ({
      consultationId: c.id,
      patientId: c.patientId,
      patientName: patientById.get(c.patientId)?.name || "Unknown Patient",
      date: c.date,
      fee: c.fee || 0,
      amountReceived: c.amountReceived || 0,
      paymentStatus: c.paymentStatus,
      paymentMode: c.paymentMode,
      paymentReferenceNumber: c.paymentReferenceNumber,
    }));
}

export interface OutstandingPatientEntry {
  patientId: string;
  name: string;
  phone: string;
  amount: number;
  consultationCount: number;
}

/** Per-patient breakdown of the same backlog PaymentSummary counts,
 * sorted highest-outstanding first -- what the Payment Dashboard's
 * "Pending Payments"/"Outstanding Amount" cards drill into. */
export async function getOutstandingPatients(clinicId?: string): Promise<OutstandingPatientEntry[]> {
  const [allConsultations, patients] = await Promise.all([
    getAllConsultations(),
    db.patients.filter((p) => !p.deletedAt).toArray(),
  ]);
  const consultations = clinicId ? allConsultations.filter((c) => c.clinicId === clinicId) : allConsultations;
  const patientById = new Map(patients.map((p) => [p.id, p]));

  const byPatient = new Map<string, { amount: number; count: number }>();
  for (const c of consultations) {
    const outstanding = getConsultationOutstanding(c);
    if (outstanding <= 0) continue;
    const entry = byPatient.get(c.patientId) || { amount: 0, count: 0 };
    entry.amount += outstanding;
    entry.count += 1;
    byPatient.set(c.patientId, entry);
  }

  return Array.from(byPatient.entries())
    .map(([patientId, { amount, count }]) => {
      const p = patientById.get(patientId);
      return { patientId, name: p?.name || "Unknown", phone: p?.phone || "", amount, consultationCount: count };
    })
    .sort((a, b) => b.amount - a.amount);
}

export interface PaymentPatientRef {
  patientId: string;
  name: string;
  phone?: string;
  detail: string;
}

/** Per-patient breakdowns behind the Payment Dashboard's "Payments Today"/
 * "Collected Today"/"Collected This Month"/"Pending Collection" cards
 * (Module 6) -- the narrower today/this-month slices getOutstandingPatients()
 * (all-time backlog) doesn't cover. Reuses the exact same
 * outstanding/collected rules as getPaymentSummary() so the card totals and
 * this drill-down never disagree with each other. */
export async function getPaymentDashboardDrilldowns(
  referenceDate: Date = new Date(),
  clinicId?: string
): Promise<{
  billedToday: PaymentPatientRef[];
  collectedToday: PaymentPatientRef[];
  collectedThisMonth: PaymentPatientRef[];
  pendingCollectionToday: PaymentPatientRef[];
}> {
  const [allConsultations, patients] = await Promise.all([
    getAllConsultations(),
    db.patients.filter((p) => !p.deletedAt).toArray(),
  ]);
  const consultations = clinicId ? allConsultations.filter((c) => c.clinicId === clinicId) : allConsultations;
  const patientById = new Map(patients.map((p) => [p.id, p]));

  const billedToday: PaymentPatientRef[] = [];
  const collectedToday: PaymentPatientRef[] = [];
  const collectedThisMonth: PaymentPatientRef[] = [];
  const pendingCollectionToday: PaymentPatientRef[] = [];

  for (const c of consultations) {
    const p = patientById.get(c.patientId);
    if (!p) continue;
    const fee = c.fee || 0;

    if (fee > 0 && c.date && isSameLocalDay(c.date, referenceDate)) {
      billedToday.push({ patientId: p.id, name: p.name, phone: p.phone, detail: `${formatMoney(fee)} billed today` });
      const outstanding = getConsultationOutstanding(c);
      if (outstanding > 0) {
        pendingCollectionToday.push({ patientId: p.id, name: p.name, phone: p.phone, detail: `${formatMoney(outstanding)} pending from today's visit` });
      }
    }

    const collected = getConsultationCollected(c);
    if (collected > 0) {
      const paymentRefDate = c.paymentDate || c.date;
      if (paymentRefDate && isSameLocalDay(paymentRefDate, referenceDate)) {
        collectedToday.push({ patientId: p.id, name: p.name, phone: p.phone, detail: `${formatMoney(collected)} collected today` });
      }
      if (paymentRefDate && isSameLocalMonth(paymentRefDate, referenceDate)) {
        collectedThisMonth.push({ patientId: p.id, name: p.name, phone: p.phone, detail: `${formatMoney(collected)} collected this month` });
      }
    }
  }

  return { billedToday, collectedToday, collectedThisMonth, pendingCollectionToday };
}

/** All consultations (all patients) whose current payment status is any
 * of `statuses` -- the Payment Dashboard's filtered drill-down lists. */
export async function getConsultationsByPaymentStatus(statuses: PaymentStatus[]): Promise<Consultation[]> {
  const consultations = await getAllConsultations();
  const set = new Set(statuses);
  return consultations.filter((c) => set.has(c.paymentStatus || "pending"));
}

export interface RecentPaymentEntry {
  consultationId: string;
  patientId: string;
  patientName: string;
  amount: number;
  mode?: PaymentMode;
  paymentDate: string;
}

/** Doctor Operations Dashboard "Recent Payments" widget: the most recent
 * actual money-received events (amountReceived > 0), most recent first --
 * distinct from getConsultationsByPaymentStatus, which lists consultations
 * by their CURRENT status rather than individual payment events. */
export async function getRecentPayments(limit = 10): Promise<RecentPaymentEntry[]> {
  const [consultations, patients] = await Promise.all([
    getAllConsultations(),
    patientRepository.list(),
  ]);
  const patientById = new Map(patients.map((p) => [p.id, p]));

  return consultations
    .filter((c) => (c.amountReceived || 0) > 0 && c.paymentDate)
    .sort((a, b) => (b.paymentDate || "").localeCompare(a.paymentDate || ""))
    .slice(0, limit)
    .map((c) => ({
      consultationId: c.id,
      patientId: c.patientId,
      patientName: patientById.get(c.patientId)?.name || "Unknown Patient",
      amount: c.amountReceived || 0,
      mode: c.paymentMode,
      paymentDate: c.paymentDate!,
    }));
}

export interface PatientPaymentSummary {
  totalFees: number;
  totalPaid: number;
  outstanding: number;
  consultations: Consultation[];
}

/** The Patient Ledger's data source: this one patient's full payment
 * picture, consultations sorted most-recent-first. */
export async function getPatientPaymentSummary(patientId: string): Promise<PatientPaymentSummary> {
  const all = await getAllConsultations();
  const consultations = all
    .filter((c) => c.patientId === patientId)
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  let totalFees = 0;
  let totalPaid = 0;
  let outstanding = 0;
  for (const c of consultations) {
    totalFees += c.fee || 0;
    totalPaid += getConsultationCollected(c);
    outstanding += getConsultationOutstanding(c);
  }

  return { totalFees, totalPaid, outstanding, consultations };
}

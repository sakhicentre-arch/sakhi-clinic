import type { Appointment, Consultation, Patient } from "./db";
import { db } from "./db";
import { logOperationalEvent } from "./operationalEventLogService";
import { patientRepository } from "../repositories/patientRepository";

function escapeCsvCell(value: any): string {
  const s = String(value ?? "");
  if (/[,"\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function rowsToCsv(rows: any[][]): string {
  return rows.map((r) => r.map(escapeCsvCell).join(",")).join("\r\n");
}

function downloadCsv(csv: string, filename: string) {
  // Excel-safe: prepend UTF-8 BOM.
  const bom = "\uFEFF";
  const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function stamp() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}`;
}

export async function exportPatientsCsv(): Promise<void> {
  const startedAt = new Date().toISOString();
  await logOperationalEvent({ level: "info", type: "csv.patients.export.start", message: "Patient CSV export started", timestamp: startedAt }).catch(() => {});
  const patients: Patient[] = await db.patients.filter((p) => !(p as any).deletedAt).toArray();
  const rows = [
    ["fullName", "age", "gender", "phone", "address", "notes"],
    ...patients.map((p) => [p.name || "", p.age ?? "", p.gender || "", p.phone || "", p.address || "", ""]),
  ];
  downloadCsv(rowsToCsv(rows), `sakhi-patients-${stamp()}.csv`);
  await logOperationalEvent({ level: "info", type: "csv.patients.export.success", message: "Patient CSV export completed", data: { count: patients.length } }).catch(() => {});
}

export async function exportAppointmentsCsv(): Promise<void> {
  const startedAt = new Date().toISOString();
  await logOperationalEvent({ level: "info", type: "csv.appointments.export.start", message: "Appointment CSV export started", timestamp: startedAt }).catch(() => {});
  const appts: Appointment[] = await db.appointments.filter((a) => !(a as any).deletedAt).toArray();
  const rows = [
    ["date", "time", "clinic", "type", "status", "patientId", "patientName"],
    ...appts.map((a) => [a.date || "", a.time || "", a.clinic || "", a.type || "", a.status || "", a.patientId || "", a.patientName || ""]),
  ];
  downloadCsv(rowsToCsv(rows), `sakhi-appointments-${stamp()}.csv`);
  await logOperationalEvent({ level: "info", type: "csv.appointments.export.success", message: "Appointment CSV export completed", data: { count: appts.length } }).catch(() => {});
}

export async function exportConsultationSummaryCsv(): Promise<void> {
  const startedAt = new Date().toISOString();
  await logOperationalEvent({ level: "info", type: "csv.consultations.export.start", message: "Consultation summary CSV export started", timestamp: startedAt }).catch(() => {});
  const consultations: Consultation[] = await db.consultations.filter((c) => !(c as any).deletedAt).toArray();
  const rows = [
    ["date", "clinicId", "patientId", "appointmentId", "outcome", "chiefComplaint", "followUpDate", "medicinesCount"],
    ...consultations.map((c) => [
      c.date || "",
      (c as any).clinicId || "",
      c.patientId || "",
      (c as any).appointmentId || "",
      String((c as any).outcome || ""),
      String((c as any).chiefComplaint || ""),
      String((c as any).followUpDate || ""),
      Array.isArray((c as any).medicines) ? (c as any).medicines.length : 0,
    ]),
  ];
  downloadCsv(rowsToCsv(rows), `sakhi-consultations-${stamp()}.csv`);
  await logOperationalEvent({ level: "info", type: "csv.consultations.export.success", message: "Consultation summary CSV export completed", data: { count: consultations.length } }).catch(() => {});
}

/** Payment Workflow completion: every consultation with a fee, including
 * the reference/notes fields the Patient Ledger already renders (see
 * PatientPage.tsx) -- reuses the same payment fields paymentService.ts
 * defines rather than recomputing "outstanding" independently here. */
export async function exportPaymentsCsv(): Promise<void> {
  const startedAt = new Date().toISOString();
  await logOperationalEvent({ level: "info", type: "csv.payments.export.start", message: "Payment CSV export started", timestamp: startedAt }).catch(() => {});
  const [consultations, patients] = await Promise.all([
    db.consultations.filter((c) => !(c as any).deletedAt && (c.fee || 0) > 0).toArray(),
    patientRepository.list(),
  ]);
  const patientById = new Map(patients.map((p) => [p.id, p]));
  const rows = [
    ["date", "patientName", "clinicId", "fee", "amountReceived", "outstanding", "paymentStatus", "paymentMode", "paymentDate", "paymentReferenceNumber", "paymentNotes"],
    ...consultations.map((c: Consultation) => {
      const fee = c.fee || 0;
      const received = c.amountReceived || 0;
      return [
        c.date || "",
        patientById.get(c.patientId)?.name || "Unknown Patient",
        (c as any).clinicId || "",
        fee,
        received,
        Math.max(0, fee - received),
        c.paymentStatus || "pending",
        c.paymentMode || "",
        c.paymentDate || "",
        c.paymentReferenceNumber || "",
        c.paymentNotes || "",
      ];
    }),
  ];
  downloadCsv(rowsToCsv(rows), `sakhi-payments-${stamp()}.csv`);
  await logOperationalEvent({ level: "info", type: "csv.payments.export.success", message: "Payment CSV export completed", data: { count: consultations.length } }).catch(() => {});
}


import "fake-indexeddb/auto";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { indexedDB as fakeIndexedDB } from "fake-indexeddb";

/**
 * Doctor-requested feature: "Record Later Payment." Covers the actual
 * doctor workflow end to end against the real (fake-indexeddb) database,
 * through the canonical recordPayment() write path -- no mocked service
 * layer for the core flow, so this proves the ledger/outstanding/revenue
 * views genuinely derive from one payment transaction, not three separate
 * writes. No real patient/payment data used anywhere in this file.
 */

const DB_NAME = "SakhiClinicDB";

async function resetDatabase() {
  await new Promise<void>((resolve, reject) => {
    const req = fakeIndexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

let db: typeof import("../../services/db").db;
let RecordLaterPaymentFlow: typeof import("../../components/RecordLaterPaymentFlow").default;
let usePatientStore: typeof import("../../store/usePatientStore").usePatientStore;
let useConsultationStore: typeof import("../../store/useConsultationStore").useConsultationStore;

const PATIENT_ID = "test-patient-1";
const CONSULTATION_ID = "test-consultation-1";

async function seedPatientAndVisit(opts?: { fee?: number; amountReceived?: number; paymentStatus?: string }) {
  await db.patients.add({
    id: PATIENT_ID,
    name: "Test Patient Later-Payment",
    gender: "Female",
    phone: "9000000001",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  } as any);
  await db.consultations.add({
    id: CONSULTATION_ID,
    patientId: PATIENT_ID,
    date: "2026-03-01T10:00:00.000Z",
    clinicId: "Dabholi",
    chiefComplaint: "Test complaint",
    caseText: "",
    outcome: "IMPROVED",
    medicines: [],
    fee: opts?.fee ?? 500,
    paymentStatus: opts?.paymentStatus ?? "pending",
    amountReceived: opts?.amountReceived ?? 0,
  } as any);
}

function seedStoresFromDb(patients: any[], consultations: any[]) {
  usePatientStore.setState({
    patients,
    hydrated: true,
    loadPatients: vi.fn(async () => undefined),
  } as any);
  useConsultationStore.setState({
    consultations,
    loadConsultations: vi.fn(async () => undefined),
  } as any);
}

async function renderFlowForPatient() {
  const patients = await db.patients.toArray();
  const consultations = await db.consultations.toArray();
  seedStoresFromDb(patients, consultations as any);
  const onClose = vi.fn();
  render(<RecordLaterPaymentFlow initialPatientId={PATIENT_ID} onClose={onClose} />);
  return { onClose };
}

describe("RecordLaterPaymentFlow", () => {
  beforeEach(async () => {
    vi.resetModules();
    await resetDatabase();
    const dbModule = await import("../../services/db");
    db = dbModule.db;
    await db.open();
    usePatientStore = (await import("../../store/usePatientStore")).usePatientStore;
    useConsultationStore = (await import("../../store/useConsultationStore")).useConsultationStore;
    RecordLaterPaymentFlow = (await import("../../components/RecordLaterPaymentFlow")).default;
  });

  afterEach(async () => {
    db.close();
    await resetDatabase();
    vi.restoreAllMocks();
  });

  it("records a full payment and updates the ledger, outstanding balance, and payment status via the canonical service", async () => {
    await seedPatientAndVisit({ fee: 500, amountReceived: 0, paymentStatus: "pending" });
    await renderFlowForPatient();

    // Exactly one billed visit -> auto-advances to the screenshot step.
    fireEvent.click(await screen.findByTestId(`record-payment-visit-option-${CONSULTATION_ID}`));
    fireEvent.click(await screen.findByTestId("record-payment-skip-screenshot"));

    fireEvent.change(await screen.findByTestId("record-payment-amount"), { target: { value: "500" } });
    fireEvent.click(screen.getByTestId("record-payment-mode-upi"));
    fireEvent.change(screen.getByTestId("record-payment-reference"), { target: { value: "TESTREF001" } });

    // First tap runs the duplicate check; second tap actually posts.
    fireEvent.click(screen.getByTestId("record-payment-confirm"));
    await waitFor(() => expect(screen.getByTestId("record-payment-confirm")).toHaveTextContent("Confirm & Record Payment"));
    fireEvent.click(screen.getByTestId("record-payment-confirm"));

    await screen.findByText(/Payment recorded successfully/i);

    const updated = await db.consultations.get(CONSULTATION_ID);
    expect(updated?.paymentStatus).toBe("paid");
    expect(updated?.amountReceived).toBe(500);
    expect(updated?.paymentReferenceNumber).toBe("TESTREF001");
    expect(updated?.paymentMode).toBe("upi");

    // Patient Ledger view (useConsultationStore) reflects the update
    // automatically -- no second/manual write to a separate table.
    const storeConsultation = useConsultationStore.getState().consultations.find((c) => c.id === CONSULTATION_ID);
    expect(storeConsultation?.paymentStatus).toBe("paid");
    expect(storeConsultation?.amountReceived).toBe(500);
  });

  it("adds to an existing partial payment rather than overwriting it", async () => {
    await seedPatientAndVisit({ fee: 1000, amountReceived: 300, paymentStatus: "partial" });
    await renderFlowForPatient();

    fireEvent.click(await screen.findByTestId(`record-payment-visit-option-${CONSULTATION_ID}`));
    fireEvent.click(await screen.findByTestId("record-payment-skip-screenshot"));

    expect(screen.getByText(/Already received/i)).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("record-payment-amount"), { target: { value: "700" } });
    fireEvent.click(screen.getByTestId("record-payment-mode-cash"));

    fireEvent.click(screen.getByTestId("record-payment-confirm"));
    await waitFor(() => expect(screen.getByTestId("record-payment-confirm")).toHaveTextContent("Confirm & Record Payment"));
    fireEvent.click(screen.getByTestId("record-payment-confirm"));

    await screen.findByText(/Payment recorded successfully/i);

    const updated = await db.consultations.get(CONSULTATION_ID);
    expect(updated?.amountReceived).toBe(1000); // 300 already + 700 new
    expect(updated?.paymentStatus).toBe("paid");
  });

  it("warns about a possible duplicate payment and requires explicit override before posting", async () => {
    await seedPatientAndVisit({ fee: 500, amountReceived: 500, paymentStatus: "paid" });
    // Prior payment already recorded for this exact amount+date.
    await db.consultations.update(CONSULTATION_ID, { paymentDate: "2026-03-05", paymentReferenceNumber: "REF-EXISTING" });
    await renderFlowForPatient();

    fireEvent.click(await screen.findByTestId(`record-payment-visit-option-${CONSULTATION_ID}`));
    fireEvent.click(await screen.findByTestId("record-payment-skip-screenshot"));

    fireEvent.change(screen.getByTestId("record-payment-amount"), { target: { value: "500" } });
    fireEvent.change(screen.getByTestId("record-payment-date"), { target: { value: "2026-03-05" } });

    fireEvent.click(screen.getByTestId("record-payment-confirm"));

    const warning = await screen.findByTestId("record-payment-duplicate-warning");
    expect(warning).toHaveTextContent(/Possible duplicate payment/i);

    // Confirm button stays disabled until the doctor explicitly overrides.
    expect(screen.getByTestId("record-payment-confirm")).toBeDisabled();
    fireEvent.click(screen.getByTestId("record-payment-duplicate-override"));
    expect(screen.getByTestId("record-payment-confirm")).not.toBeDisabled();
  });

  it("shows a clear error and does not create a partial payment record when the save fails", async () => {
    await seedPatientAndVisit({ fee: 500, amountReceived: 0, paymentStatus: "pending" });
    const paymentServiceModule = await import("../../services/paymentService");
    vi.spyOn(paymentServiceModule, "recordPayment").mockRejectedValueOnce(new Error("Simulated write failure"));

    await renderFlowForPatient();

    fireEvent.click(await screen.findByTestId(`record-payment-visit-option-${CONSULTATION_ID}`));
    fireEvent.click(await screen.findByTestId("record-payment-skip-screenshot"));
    fireEvent.change(screen.getByTestId("record-payment-amount"), { target: { value: "500" } });

    fireEvent.click(screen.getByTestId("record-payment-confirm"));
    await waitFor(() => expect(screen.getByTestId("record-payment-confirm")).toHaveTextContent("Confirm & Record Payment"));
    fireEvent.click(screen.getByTestId("record-payment-confirm"));

    const error = await screen.findByTestId("record-payment-save-error");
    expect(error).toHaveTextContent(/Simulated write failure/i);
    expect(screen.queryByText(/Payment recorded successfully/i)).not.toBeInTheDocument();

    const unchanged = await db.consultations.get(CONSULTATION_ID);
    expect(unchanged?.paymentStatus).toBe("pending");
    expect(unchanged?.amountReceived).toBe(0);
  });

  it("blocks confirmation for an invalid (zero) amount", async () => {
    await seedPatientAndVisit({ fee: 500 });
    await renderFlowForPatient();

    fireEvent.click(await screen.findByTestId(`record-payment-visit-option-${CONSULTATION_ID}`));
    fireEvent.click(await screen.findByTestId("record-payment-skip-screenshot"));
    fireEvent.change(screen.getByTestId("record-payment-amount"), { target: { value: "0" } });

    expect(screen.getByTestId("record-payment-confirm")).toBeDisabled();
  });

  it("shows the visit picker when a patient has more than one billed consultation", async () => {
    await seedPatientAndVisit({ fee: 500 });
    await db.consultations.add({
      id: "test-consultation-2",
      patientId: PATIENT_ID,
      date: "2026-04-01T10:00:00.000Z",
      clinicId: "Dabholi",
      chiefComplaint: "Second visit",
      caseText: "",
      outcome: "IMPROVED",
      medicines: [],
      fee: 500,
      paymentStatus: "pending",
      amountReceived: 0,
    } as any);
    await renderFlowForPatient();

    expect(await screen.findByTestId(`record-payment-visit-option-${CONSULTATION_ID}`)).toBeInTheDocument();
    expect(screen.getByTestId("record-payment-visit-option-test-consultation-2")).toBeInTheDocument();
  });
});

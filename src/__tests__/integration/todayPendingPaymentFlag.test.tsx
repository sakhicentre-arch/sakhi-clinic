import "fake-indexeddb/auto";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { indexedDB as fakeIndexedDB } from "fake-indexeddb";

/**
 * Doctor-reported UX bug: Today's queue pending-payment indicator (the red
 * dot on a queue entry, per AlertDots in TodayPage.tsx) is the doctor's
 * at-a-glance signal that "this patient still owes money." It was computed
 * with `paymentStatus === "pending"` at four separate call sites in
 * TodayPage.tsx, which silently excludes `paymentStatus === "partial"`
 * (the status Record-Later-Payment sets when only part of the fee is
 * collected -- RecordLaterPaymentFlow.tsx) and summed the FULL fee instead
 * of the true remaining balance. paymentService.ts's own header comment
 * documents getConsultationOutstanding()/getConsultationCollected() as the
 * canonical replacement for exactly this kind of independently-recomputed
 * logic. This test proves a partial payment now shows correctly.
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

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

const patient = { id: "PAT-PENDING-PARTIAL", name: "Partial Payer", gender: "Female", phone: "9876511111", age: 35 };

describe("TodayPage — pending-payment queue indicator accounts for partial payments", () => {
  let db: typeof import("../../services/db").db;

  beforeEach(async () => {
    vi.resetModules();
    await resetDatabase();
    const dbModule = await import("../../services/db");
    db = dbModule.db;
    await db.open();
    await db.patients.add(patient as any);

    const patientStoreModule = await import("../../store/usePatientStore");
    patientStoreModule.usePatientStore.setState({
      patients: [patient] as any,
      loadPatients: vi.fn(async () => undefined),
      addPatient: vi.fn(async () => undefined),
      updatePatient: vi.fn(async () => undefined),
      deletePatient: vi.fn(async () => undefined),
    });

    const consultationStoreModule = await import("../../store/useConsultationStore");
    consultationStoreModule.useConsultationStore.setState({
      // fee 300, only 100 received -- status "partial". The old
      // `paymentStatus === "pending"` filter excluded this consultation
      // entirely, so no pending-payment dot was ever shown for it.
      consultations: [
        {
          id: "CONS-PARTIAL-1",
          patientId: patient.id,
          date: new Date().toISOString(),
          clinicId: "Dabholi",
          chiefComplaint: "Test",
          caseText: "",
          medicines: [],
          fee: 300,
          amountReceived: 100,
          paymentStatus: "partial",
        },
      ] as any,
      activeSession: null,
      loadConsultations: vi.fn(async () => undefined),
      loadPatientConsultations: vi.fn(async () => undefined),
      saveConsultation: vi.fn(async () => true),
      clearSession: vi.fn(),
    });

    const appointmentStoreModule = await import("../../store/useAppointmentStore");
    appointmentStoreModule.useAppointmentStore.setState({
      appointments: [
        {
          id: "APPT-PARTIAL-1",
          patientId: patient.id,
          patientName: patient.name,
          clinic: "Dabholi",
          date: todayIsoDate(),
          time: "10:00",
          type: "scheduled",
          status: "booked",
        },
      ] as any,
      loadAppointments: vi.fn(async () => undefined),
      addAppointment: vi.fn(async () => true),
      startConsultation: vi.fn(async () => undefined),
      markArrived: vi.fn(async () => undefined),
      markDone: vi.fn(async () => undefined),
      markReminderSent: vi.fn(async () => undefined),
    });

    const queueStoreModule = await import("../../store/queueStore");
    queueStoreModule.useQueueStore.setState({ queue: [] } as any);

    const uiStoreModule = await import("../../store/uiStore");
    uiStoreModule.useUIStore.setState({
      activePage: "today",
      activeClinic: "Dabholi",
      activePatientId: null,
      activeAppointmentId: null,
      draftStatus: "",
    } as any);

    vi.spyOn(window, "alert").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    db.close();
    await resetDatabase();
    vi.restoreAllMocks();
  });

  it("shows the pending-payment dot with the true outstanding balance (200), not the full fee (300) or nothing at all", async () => {
    const { default: TodayPage } = await import("../../pages/TodayPage");
    render(<TodayPage goToConsultation={() => {}} onNavigate={() => {}} />);

    const addButton = await screen.findByRole("button", { name: /add to queue/i });
    fireEvent.click(addButton);

    // AlertDots renders a title of `₹${pendingAmount} pending` on the dot.
    // getConsultationOutstanding(300 fee, 100 received) = 200.
    const dot = await screen.findByTitle("₹200 pending");
    expect(dot).toBeInTheDocument();
  });
});

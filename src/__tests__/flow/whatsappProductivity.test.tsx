import "fake-indexeddb/auto";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { indexedDB as fakeIndexedDB } from "fake-indexeddb";
import App from "../../App";
import { db } from "../../services/db";
import { usePatientStore } from "../../store/usePatientStore";
import { useConsultationStore } from "../../store/useConsultationStore";
import { useAppointmentStore } from "../../store/useAppointmentStore";
import { useQueueStore } from "../../store/queueStore";
import { useUIStore } from "../../store/uiStore";

/**
 * WhatsApp Productivity: Payment Receipt (PatientPage Finance tab -> queued
 * reminder) and Bulk Messaging (RemindersPage compose flow -> one queued
 * reminder per selected recipient). Both must land in the reminder queue's
 * existing pending state for doctor review, not send directly -- this
 * proves the Generate -> Preview -> Approve -> Launch flow the doctor asked
 * for is real, not just a UI mockup.
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

function seedStores(patients: any[] = []) {
  usePatientStore.setState({
    patients,
    loadPatients: vi.fn(async () => undefined),
    addPatient: vi.fn(async () => undefined),
    updatePatient: vi.fn(async () => undefined),
    deletePatient: vi.fn(async () => undefined),
  } as any);
  useConsultationStore.setState({
    consultations: [],
    activeSession: null,
    loadConsultations: vi.fn(async () => undefined),
    loadPatientConsultations: vi.fn(async () => undefined),
    saveConsultation: vi.fn(async () => true),
    clearSession: vi.fn(),
  } as any);
  useAppointmentStore.setState({
    appointments: [],
    loadAppointments: vi.fn(async () => undefined),
    addAppointment: vi.fn(async () => true),
    startConsultation: vi.fn(async () => undefined),
    markArrived: vi.fn(async () => undefined),
    markDone: vi.fn(async () => undefined),
    markReminderSent: vi.fn(async () => undefined),
  } as any);
  useQueueStore.setState({ queue: [] } as any);
  useUIStore.setState({
    activePage: "patients",
    activeClinic: "Dabholi",
    activePatientId: null,
    activeAppointmentId: null,
    draftStatus: "",
  } as any);
}

describe("WhatsApp Productivity: Payment Receipt + Bulk Messaging", () => {
  beforeEach(async () => {
    await resetDatabase();
    await db.open();
    vi.spyOn(window, "alert").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    db.close();
    await resetDatabase();
    vi.restoreAllMocks();
  });

  it("queues a Payment Receipt from the Finance tab instead of sending it directly", async () => {
    seedStores([{ id: "p1", name: "Meera Shah", gender: "Female", phone: "9000000001" }]);

    await db.patients.add({
      id: "p1", name: "Meera Shah", gender: "Female", phone: "9000000001",
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    } as any);
    const consultation = {
      id: "c1", patientId: "p1", date: new Date().toISOString(), clinicId: "Dabholi",
      chiefComplaint: "Test", caseText: "", medicines: [],
      fee: 500, amountReceived: 500, paymentStatus: "paid", paymentMode: "upi",
      paymentReferenceNumber: "UPI-777",
    };
    await db.consultations.add(consultation as any);
    // loadConsultations is mocked to a no-op above -- seed the store
    // directly with what a real load would have produced, since
    // PatientPage reads consultations from the store, not straight from db.
    useConsultationStore.setState({ consultations: [consultation] } as any);

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /patients/i }));
    await screen.findByTestId("patient-list");
    fireEvent.click(screen.getByText("Meera Shah"));
    fireEvent.click(await screen.findByText(/finance/i));

    const sendBtn = await screen.findByTestId("payment-send-receipt-c1");
    fireEvent.click(sendBtn);

    // Navigating to Reminders is the "hand-off to review" signal.
    await screen.findByTestId("reminders-page");
    const queued = await db.reminderQueue.where("patientId").equals("p1").toArray();
    expect(queued).toHaveLength(1);
    expect(queued[0].status).toBe("pending");
    expect(queued[0].sourceRef).toBe("payment-receipt:c1");
    expect(queued[0].message).toContain("UPI-777");
    expect(queued[0].message).toContain("₹500");
  });

  it("composes a Bulk Message to multiple selected patients, queuing one reminder each", async () => {
    seedStores([
      { id: "p1", name: "Meera Shah", gender: "Female", phone: "9000000001" },
      { id: "p2", name: "Kavya Rao", gender: "Female", phone: "9000000002" },
    ]);

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /reminders/i }));
    await screen.findByTestId("reminders-page");

    fireEvent.click(screen.getByTestId("bulk-message-start"));
    await screen.findByText("Bulk Message — Select Recipients");

    const checkboxes = await screen.findAllByRole("checkbox");
    checkboxes.forEach((cb) => fireEvent.click(cb));
    fireEvent.click(screen.getByText(/Continue \(2\)/));

    const textarea = await screen.findByTestId("bulk-message-textarea");
    fireEvent.change(textarea, { target: { value: "Clinic closed for Diwali on Nov 1st." } });
    fireEvent.click(screen.getByTestId("bulk-message-queue"));

    await screen.findByTestId("reminders-page");
    const all = await db.reminderQueue.toArray();
    expect(all).toHaveLength(2);
    expect(all.every((r) => r.status === "pending")).toBe(true);
    expect(all.every((r) => r.message.includes("Clinic closed for Diwali"))).toBe(true);
    expect(new Set(all.map((r) => r.sourceRef)).size).toBe(1); // same campaign sourceRef
  });
});

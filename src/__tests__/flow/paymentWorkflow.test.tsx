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
 * Payment Workflow completion: RevenuePage.tsx previously had no way to
 * see payment history over an arbitrary date range, search it by patient,
 * or export it -- only the five fixed today/this-month/all-time cards.
 * This proves the new Payment History section (date range + search) and
 * the Export CSV button are wired to real data and real service calls.
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

function seedStores() {
  usePatientStore.setState({
    patients: [],
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
    activePage: "today",
    activeClinic: "Dabholi",
    activePatientId: null,
    activeAppointmentId: null,
    draftStatus: "",
  } as any);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

describe("Payment Workflow completion: history, search, export", () => {
  beforeEach(async () => {
    await resetDatabase();
    await db.open();
    seedStores();
    vi.spyOn(window, "alert").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:mock"), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    await db.patients.add({
      id: "p1", name: "Meera", gender: "Female", phone: "9000000001",
      createdAt: todayIso(), updatedAt: todayIso(),
    } as any);
    await db.patients.add({
      id: "p2", name: "Kavya", gender: "Female", phone: "9000000002",
      createdAt: todayIso(), updatedAt: todayIso(),
    } as any);
    await db.consultations.add({
      id: "c1", patientId: "p1", date: new Date().toISOString(), clinicId: "Dabholi",
      chiefComplaint: "Test", caseText: "", medicines: [],
      fee: 500, amountReceived: 500, paymentStatus: "paid",
    } as any);
    await db.consultations.add({
      id: "c2", patientId: "p2", date: new Date().toISOString(), clinicId: "Dabholi",
      chiefComplaint: "Test", caseText: "", medicines: [],
      fee: 300, amountReceived: 100, paymentStatus: "partial",
    } as any);
  });

  afterEach(async () => {
    db.close();
    await resetDatabase();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows both patients' payment history within the default 30-day range", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /revenue/i }));
    await screen.findByTestId("revenue-page");

    expect(await screen.findByTestId("revenue-history-row-c1")).toBeInTheDocument();
    expect(await screen.findByTestId("revenue-history-row-c2")).toBeInTheDocument();
  });

  it("filters payment history by patient name search", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /revenue/i }));
    await screen.findByTestId("revenue-page");
    await screen.findByTestId("revenue-history-row-c1");

    fireEvent.change(screen.getByTestId("revenue-history-search"), { target: { value: "Kavya" } });

    expect(screen.queryByTestId("revenue-history-row-c1")).not.toBeInTheDocument();
    expect(screen.getByTestId("revenue-history-row-c2")).toBeInTheDocument();
  });

  it("triggers a CSV export when 'Export CSV' is clicked", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /revenue/i }));
    await screen.findByTestId("revenue-page");

    fireEvent.click(screen.getByTestId("revenue-export-csv"));

    // exportPaymentsCsv() internally calls URL.createObjectURL -- the
    // stubbed mock firing is proof the real export path ran end to end,
    // not just that the button exists.
    await vi.waitFor(() => {
      expect((URL.createObjectURL as any).mock.calls.length).toBeGreaterThan(0);
    });
  });
});

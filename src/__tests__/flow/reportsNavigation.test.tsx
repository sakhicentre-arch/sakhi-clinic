import "fake-indexeddb/auto";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { indexedDB as fakeIndexedDB } from "fake-indexeddb";
import App from "../../App";

// Chart.js's own resize/responsive-binding internals throw deep inside the
// library when rendered against jsdom's non-functional canvas (a known
// jsdom/Chart.js incompatibility, not something reachable via a try/catch
// in this app's code). This suite is about the page's data and navigation,
// not Chart.js's own rendering -- stub the two chart components out.
vi.mock("react-chartjs-2", () => ({
  Bar: () => null,
  Pie: () => null,
}));
import { db } from "../../services/db";
import { usePatientStore } from "../../store/usePatientStore";
import { useConsultationStore } from "../../store/useConsultationStore";
import { useAppointmentStore } from "../../store/useAppointmentStore";
import { useQueueStore } from "../../store/queueStore";
import { useUIStore } from "../../store/uiStore";

/**
 * Doctor Workflow Completion, item 5: AnalyticsPage.tsx (now "Reports")
 * was previously unreachable from any navigation, and its one revenue
 * figure was `totalVisits * 500` -- a hardcoded assumption, not real
 * payment data. This proves the page is now reachable via the left nav,
 * and that its revenue figure comes from an actual recorded payment
 * rather than that fake per-visit assumption.
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

describe("Reports navigation and real revenue data", () => {
  beforeEach(async () => {
    await resetDatabase();
    await db.open();
    seedStores();
    vi.spyOn(window, "alert").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    db.close();
    await resetDatabase();
  });

  it("is reachable from the left nav and renders without crashing", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /reports/i }));
    expect(await screen.findByTestId("analytics-page")).toBeInTheDocument();
    expect(screen.getByText("Reports")).toBeInTheDocument();
  });

  it("shows real recorded revenue, not a fixed per-visit assumption", async () => {
    const today = new Date().toISOString();
    await db.patients.add({
      id: "p1", name: "Revenue Test Patient", gender: "Female", phone: "9876543210",
      createdAt: today, updatedAt: today,
    } as any);
    // A single consultation with a real recorded payment of ₹777 -- if the
    // page were still computing totalVisits * 500, one visit would show
    // ₹500, not ₹777.
    await db.consultations.add({
      id: "c1", patientId: "p1", date: today, clinicId: "Dabholi",
      chiefComplaint: "Test", caseText: "", medicines: [],
      fee: 777, paymentStatus: "paid", amountReceived: 777, paymentDate: today,
    } as any);

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /reports/i }));
    await screen.findByTestId("analytics-page");

    expect(await screen.findByText("₹777")).toBeInTheDocument();
    expect(screen.queryByText("₹500")).not.toBeInTheDocument();
  });

  it("switches between Daily and Monthly revenue views", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /reports/i }));
    await screen.findByTestId("analytics-page");

    expect(screen.getByText("Today's Collected Revenue")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("analytics-period-monthly"));
    expect(await screen.findByText("This Month's Collected Revenue")).toBeInTheDocument();
  });
});

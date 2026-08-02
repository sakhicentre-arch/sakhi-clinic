import "fake-indexeddb/auto";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import App from "../../App";
import { usePatientStore } from "../../store/usePatientStore";
import { useConsultationStore } from "../../store/useConsultationStore";
import { useAppointmentStore } from "../../store/useAppointmentStore";
import { useQueueStore } from "../../store/queueStore";
import { useUIStore } from "../../store/uiStore";

function seedStores() {
  usePatientStore.setState({
    patients: [],
    loadPatients: vi.fn(async () => undefined),
    addPatient: vi.fn(async () => undefined),
    updatePatient: vi.fn(async () => undefined),
    deletePatient: vi.fn(async () => undefined),
  });

  useConsultationStore.setState({
    consultations: [],
    activeSession: null,
    loadConsultations: vi.fn(async () => undefined),
    loadPatientConsultations: vi.fn(async () => undefined),
    saveConsultation: vi.fn(async () => true),
    clearSession: vi.fn(),
  });

  useAppointmentStore.setState({
    appointments: [],
    loadAppointments: vi.fn(async () => undefined),
    addAppointment: vi.fn(async () => true),
    startConsultation: vi.fn(async () => undefined),
    markArrived: vi.fn(async () => undefined),
    markDone: vi.fn(async () => undefined),
    markReminderSent: vi.fn(async () => undefined),
  });

  useQueueStore.setState({ queue: [] });
  useUIStore.setState({
    activePage: "today",
    activeClinic: "Dabholi",
    activePatientId: null,
    activeAppointmentId: null,
    draftStatus: "",
  });
}

beforeEach(() => {
  seedStores();
  vi.spyOn(window, "alert").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("Follow-ups navigation", () => {
  it("renders the Follow-up Intelligence dashboard when the Follow-ups icon is clicked", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /follow-ups/i }));

    expect(await screen.findByTestId("followups-page")).toBeInTheDocument();
    expect(screen.getByText("Intelligence dashboard")).toBeInTheDocument();
  });

  it("renders analytics, alerts, and the bucketed follow-up queue", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /follow-ups/i }));
    await screen.findByTestId("followups-page");

    expect(screen.getByText("Analytics")).toBeInTheDocument();
    expect(screen.getByText("Intelligent Alerts")).toBeInTheDocument();
    expect(screen.getByText("Follow-up queue")).toBeInTheDocument();
    expect(screen.getByText(/Overdue \(\d+\)/)).toBeInTheDocument();
    // "Next 7 Days" was renamed "Upcoming" -- RC1's Follow-up Management
    // status wording (Upcoming/Due Today/Overdue/Completed/Cancelled).
    expect(screen.getByText(/Upcoming \(\d+\)/)).toBeInTheDocument();
  });

  it("shows an empty state instead of crashing when there is no follow-up data", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /follow-ups/i }));
    await screen.findByTestId("followups-page");

    expect(await screen.findByText("No patients in this bucket.")).toBeInTheDocument();
    expect(screen.getByText("No alerts — everything is on track.")).toBeInTheDocument();
  });

  it("navigates away from Follow-ups and back without losing the render branch", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /follow-ups/i }));
    await screen.findByTestId("followups-page");

    fireEvent.click(screen.getByRole("button", { name: /^today$/i }));
    expect(screen.queryByTestId("followups-page")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /follow-ups/i }));
    expect(await screen.findByTestId("followups-page")).toBeInTheDocument();
  });
});

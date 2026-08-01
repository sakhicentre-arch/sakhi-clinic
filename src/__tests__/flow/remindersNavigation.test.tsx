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

describe("Reminders navigation", () => {
  it("renders the Reminders page when the Reminders icon is clicked", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /^reminders$/i }));

    expect(await screen.findByTestId("reminders-page")).toBeInTheDocument();
    expect(screen.getByText("WhatsApp reminder intelligence")).toBeInTheDocument();
  });

  it("renders analytics, the queue tabs, and delivery history sections", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /^reminders$/i }));
    await screen.findByTestId("reminders-page");

    expect(screen.getByText("Analytics")).toBeInTheDocument();
    expect(screen.getByText("Reminder queue")).toBeInTheDocument();
    expect(screen.getByText("Delivery history")).toBeInTheDocument();
    expect(screen.getByText(/Pending \(\d+\)/)).toBeInTheDocument();
    expect(screen.getByText(/Failed \(\d+\)/)).toBeInTheDocument();
  });

  it("shows an honest disclosure that 'sent' is not a delivery receipt", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /^reminders$/i }));
    await screen.findByTestId("reminders-page");

    expect(screen.getByText(/no delivery or read receipt/i)).toBeInTheDocument();
  });

  it("shows empty states instead of crashing when there is no reminder data", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /^reminders$/i }));
    await screen.findByTestId("reminders-page");

    expect(await screen.findByText("No reminders in this queue.")).toBeInTheDocument();
    expect(screen.getByText("No reminder activity recorded yet.")).toBeInTheDocument();
  });

  it("navigates away from Reminders and back without losing the render branch", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /^reminders$/i }));
    await screen.findByTestId("reminders-page");

    fireEvent.click(screen.getByRole("button", { name: /^today$/i }));
    expect(screen.queryByTestId("reminders-page")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^reminders$/i }));
    expect(await screen.findByTestId("reminders-page")).toBeInTheDocument();
  });
});

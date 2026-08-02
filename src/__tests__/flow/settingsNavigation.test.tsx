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

/**
 * Regression test for the "Settings opens a blank screen" production bug:
 * App.tsx had no render branch for page === "settings", so clicking the
 * Settings icon changed state correctly but rendered nothing. This test
 * drives the real click path (LeftNav -> AppShell -> App.tsx) rather than
 * rendering SettingsPage directly, so it would have caught the original
 * defect.
 */

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

describe("Settings navigation", () => {
  it("renders the Settings page when the Settings icon is clicked", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /^settings$/i }));

    expect(await screen.findByTestId("settings-page")).toBeInTheDocument();
    expect(screen.getByText("Operational control center")).toBeInTheDocument();
  });

  it("renders every Release 1.0 settings section, not just the page shell", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /^settings$/i }));
    await screen.findByTestId("settings-page");

    expect(screen.getByText("Backup & Restore")).toBeInTheDocument();
    expect(screen.getByText("Patient Data")).toBeInTheDocument();
    expect(screen.getByText("Clinic")).toBeInTheDocument();
    expect(screen.getByText("Application")).toBeInTheDocument();
    expect(screen.getByText("Diagnostics")).toBeInTheDocument();
    expect(screen.getAllByText("Coming Soon").length).toBeGreaterThan(0);
  });

  it("shows unimplemented future features as disabled, not hidden", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /^settings$/i }));
    await screen.findByTestId("settings-page");

    expect(screen.getByText("Backup Version History")).toBeInTheDocument();
    expect(screen.getByText("Multi-Device Sync")).toBeInTheDocument();
    expect(screen.getAllByText("Coming Soon").length).toBeGreaterThanOrEqual(1);
  });

  it("shows the Backup & Restore section honestly as not configured when no OAuth client ID exists", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /^settings$/i }));
    await screen.findByTestId("settings-page");

    expect(screen.getByText("Backup & Restore")).toBeInTheDocument();
    expect(screen.getByText("Not configured for this deployment")).toBeInTheDocument();
    expect(screen.getAllByText("This Device").length).toBeGreaterThan(0);
  });

  it("lets the doctor switch the active clinic from Settings", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /^settings$/i }));
    await screen.findByTestId("settings-page");

    const cityLightChip = screen.getByRole("button", { name: "City Light" });
    fireEvent.click(cityLightChip);

    expect(useUIStore.getState().activeClinic).toBe("City Light");
  });

  it("navigates away from Settings and back without losing the render branch", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /^settings$/i }));
    await screen.findByTestId("settings-page");

    fireEvent.click(screen.getByRole("button", { name: /today/i }));
    expect(screen.queryByTestId("settings-page")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^settings$/i }));
    expect(await screen.findByTestId("settings-page")).toBeInTheDocument();
  });
});

import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import App from "../../App";
import { usePatientStore } from "../../store/usePatientStore";
import { useConsultationStore } from "../../store/useConsultationStore";
import { useAppointmentStore } from "../../store/useAppointmentStore";
import { useQueueStore } from "../../store/queueStore";
import { useUIStore } from "../../store/uiStore";

/**
 * Module A — acceptance criterion A7, at the layer the criterion actually
 * asks about: "Origin-mismatch warning correctly fires in a manually forced
 * mismatch scenario." originIdentity.test.ts already proves the SERVICE
 * returns the right status; this proves the App's real render tree actually
 * shows the banner when that status comes back as "mismatch", and does not
 * show it otherwise.
 */

vi.mock("../../components/shared/PatientHistoryTimeline", () => ({
  default: () => null,
}));

const checkOriginIdentityMock = vi.fn();
const acknowledgeOriginChangeMock = vi.fn();

vi.mock("../../services/originIdentityService", () => ({
  checkOriginIdentity: (...args: any[]) => checkOriginIdentityMock(...args),
  acknowledgeOriginChange: (...args: any[]) => acknowledgeOriginChangeMock(...args),
}));

function seedStores() {
  usePatientStore.setState({
    patients: [],
    loadPatients: vi.fn(async () => undefined),
    addPatient: vi.fn(async () => undefined),
    updatePatient: vi.fn(async () => undefined),
    deletePatient: vi.fn(async () => undefined),
  });
  useConsultationStore.setState({
    consultations: [] as any,
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
  checkOriginIdentityMock.mockReset();
  acknowledgeOriginChangeMock.mockReset().mockResolvedValue(undefined);
  vi.spyOn(window, "alert").mockImplementation(() => undefined);
});

describe("App — origin-mismatch banner (A7)", () => {
  it("renders the mismatch banner when the origin check reports a forced mismatch", async () => {
    checkOriginIdentityMock.mockResolvedValue({
      status: "mismatch",
      currentOrigin: "https://sakhi-clinic-staging.example",
      recordedOrigin: "https://sakhi-clinic.example",
    });

    await act(async () => {
      render(<App />);
    });

    const banner = await screen.findByRole("alert");
    expect(banner).toHaveTextContent("https://sakhi-clinic.example");
    expect(banner).toHaveTextContent("https://sakhi-clinic-staging.example");
  });

  it("does NOT render a banner when the origin matches", async () => {
    checkOriginIdentityMock.mockResolvedValue({
      status: "match",
      currentOrigin: "https://sakhi-clinic.example",
      recordedOrigin: "https://sakhi-clinic.example",
    });

    await act(async () => {
      render(<App />);
    });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does NOT render a banner on first-run (nothing to compare against yet)", async () => {
    checkOriginIdentityMock.mockResolvedValue({
      status: "first-run",
      currentOrigin: "https://sakhi-clinic.example",
      recordedOrigin: "https://sakhi-clinic.example",
    });

    await act(async () => {
      render(<App />);
    });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("clicking Acknowledge calls acknowledgeOriginChange and dismisses the banner", async () => {
    checkOriginIdentityMock.mockResolvedValue({
      status: "mismatch",
      currentOrigin: "https://sakhi-clinic-staging.example",
      recordedOrigin: "https://sakhi-clinic.example",
    });

    await act(async () => {
      render(<App />);
    });

    await screen.findByRole("alert");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /acknowledge & update/i }));
    });

    expect(acknowledgeOriginChangeMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("the rest of the app still renders normally underneath the banner", async () => {
    checkOriginIdentityMock.mockResolvedValue({
      status: "mismatch",
      currentOrigin: "https://sakhi-clinic-staging.example",
      recordedOrigin: "https://sakhi-clinic.example",
    });

    await act(async () => {
      render(<App />);
    });

    await screen.findByRole("alert");
    // The banner must not have replaced the app -- ordinary navigation is
    // still present underneath it (this is a warning, never a hard block).
    // Exact name (not a /patients/i substring match) -- the Doctor Action
    // Dashboard's "Missed Patients"/"New Patients"/"Repeat Patients" cards
    // also match that substring and would make this query ambiguous.
    expect(screen.getByRole("button", { name: "Patients" })).toBeInTheDocument();
  });
});

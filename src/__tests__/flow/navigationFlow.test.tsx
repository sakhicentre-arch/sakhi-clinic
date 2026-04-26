import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "../../App";
import ConsultationPage from "../../pages/ConsultationPage";
import { usePatientStore } from "../../store/usePatientStore";
import { useConsultationStore } from "../../store/useConsultationStore";
import { useAppointmentStore } from "../../store/useAppointmentStore";
import { useQueueStore } from "../../store/queueStore";
import { useUIStore } from "../../store/uiStore";

vi.mock("../../components/shared/PatientHistoryTimeline", () => ({
  default: () => null,
}));

const patient = {
  id: "PAT-001",
  name: "Nisha Shah",
  gender: "Female",
  phone: "9876543210",
  age: 34,
  address: "Surat",
  miasm: "Psora",
};

const previousConsultation = {
  id: "CONS-001",
  patientId: patient.id,
  date: "2026-04-20T10:00:00.000Z",
  chiefComplaint: "Migraine follow-up",
  caseText: "Recurring headache with stress aggravation.",
  mind: "Anxious",
  generals: "Sleep disturbed",
  medicines: [
    {
      id: "MED-001",
      name: "Nux Vomica",
      potency: "30C",
      dosage: "1-0-1",
      duration: "5 Days",
      notes: "",
      prescription: {
        followUpDays: "15",
        instructions: "Before Meals",
        dietAdvice: [],
        precautions: [],
      },
    },
  ],
  outcome: "Improved",
};

function seedStores(consultations: any[] = []) {
  usePatientStore.setState({
    patients: [patient as any],
    loadPatients: vi.fn(async () => undefined),
    addPatient: vi.fn(async () => undefined),
    updatePatient: vi.fn(async () => undefined),
    deletePatient: vi.fn(async () => undefined),
  });

  useConsultationStore.setState({
    consultations: consultations as any,
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
  vi.spyOn(window, "open").mockImplementation(() => null);
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
});

describe("Navigation flow into Consultation", () => {
  it("should open Consultation Page when the user selects a patient and starts consultation", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /patients/i }));
    await screen.findByText("Patient Registry");

    fireEvent.click(screen.getByText(patient.name));
    fireEvent.click(await screen.findByRole("button", { name: /start first consultation/i }));

    expect(await screen.findByText("Consultation")).toBeInTheDocument();
    expect(screen.getAllByText(patient.name).length).toBeGreaterThan(0);
  });

  it("should NOT render Consultation if selectedPatientId is missing", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /consultation/i }));

    expect(
      await screen.findByText(/select a patient before opening consultation/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Consultation$/)).not.toBeInTheDocument();
  });

  it("should render Full Mode when this is the patient's first visit", async () => {
    seedStores([]);

    render(<ConsultationPage patientId={patient.id} />);

    expect(await screen.findByText("Consultation")).toBeInTheDocument();
    const debugPanel = screen.getByTestId("consultation-debug-panel");
    expect(debugPanel).toHaveTextContent("Mode: Full");
    expect(screen.getByText("Case Story")).toBeInTheDocument();
  });

  it("should render Quick Mode when the patient has follow-up history", async () => {
    seedStores([previousConsultation]);

    render(<ConsultationPage patientId={patient.id} appointmentId="APT-001" />);

    expect(await screen.findByText("Consultation")).toBeInTheDocument();
    const debugPanel = screen.getByTestId("consultation-debug-panel");
    expect(debugPanel).toHaveTextContent("Mode: Quick");
    expect(screen.getByText(/how is the patient today/i)).toBeInTheDocument();
  });

  it("should switch tabs Today to Patient to Consultation through visible controls", async () => {
    render(<App />);

    expect(await screen.findByText(/Today's Queue/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /patients/i }));
    expect(await screen.findByText("Patient Registry")).toBeInTheDocument();

    fireEvent.click(screen.getByText(patient.name));
    fireEvent.click(await screen.findByRole("button", { name: /start first consultation/i }));

    expect(await screen.findByText("Consultation")).toBeInTheDocument();
    expect(screen.getByTestId("consultation-debug-panel")).toHaveTextContent(patient.id);
  });

  it("should simulate direct user click navigation and show the blocking condition", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /consultation/i }));

    await waitFor(() => {
      expect(screen.getByText(/select a patient before opening consultation/i)).toBeInTheDocument();
    });
    expect(screen.queryByTestId("consultation-debug-panel")).not.toBeInTheDocument();
  });
});

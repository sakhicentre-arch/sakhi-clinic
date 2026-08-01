import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import ConsultationPage from "../../pages/ConsultationPage";
import { VoiceSessionProvider } from "../../hooks/VoiceSessionContext";
import { usePatientStore } from "../../store/usePatientStore";
import { useConsultationStore } from "../../store/useConsultationStore";
import { useAppointmentStore } from "../../store/useAppointmentStore";
import { useQueueStore } from "../../store/queueStore";
import { useUIStore } from "../../store/uiStore";
import * as draftService from "../../services/draftService";

vi.mock("../../components/shared/PatientHistoryTimeline", () => ({
  default: () => null,
}));

/**
 * Module A — consultation draft autosave.
 *
 * Verifies two things the previous implementation could not guarantee:
 * 1. The autosave is a genuine debounce from the LAST edit, not an interval
 *    that happens to only fire after 30s of inactivity as a side effect of
 *    React re-running a useEffect on every formData change.
 * 2. A failed background draft save is now visible via draftStatus (the same
 *    mechanism TopBar.tsx already renders for the primary save flow), not
 *    silently swallowed with no trace the doctor could see.
 */

const patient = {
  id: "PAT-DRAFT-1",
  name: "Autosave Test Patient",
  gender: "Female",
  phone: "9998887770",
  age: 40,
  address: "Surat",
  miasm: "Psora",
};

function seedStores() {
  usePatientStore.setState({
    patients: [patient as any],
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

describe("Consultation draft autosave (Module A)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    seedStores();
    vi.spyOn(window, "alert").mockImplementation(() => undefined);
    vi.spyOn(draftService, "loadDraft").mockResolvedValue(null);
    vi.spyOn(draftService, "hasDraft").mockResolvedValue(false);
    vi.spyOn(draftService, "deleteDraft").mockResolvedValue(undefined);
  });

  it("debounces from the last edit: rapid edits reset the timer, only one save fires 30s after the final edit", async () => {
    const saveDraftSpy = vi.spyOn(draftService, "saveDraft").mockResolvedValue(true);

    render(
      <VoiceSessionProvider>
        <ConsultationPage patientId={patient.id} />
      </VoiceSessionProvider>
    );

    const field = screen.getByPlaceholderText("Type or speak complaint...");

    // Three edits, each well inside the 30s window of the previous one.
    await act(async () => {
      fireEvent.change(field, { target: { value: "Fever" } });
    });
    await act(async () => {
      vi.advanceTimersByTime(15000);
    });
    await act(async () => {
      fireEvent.change(field, { target: { value: "Fever and cough" } });
    });
    await act(async () => {
      vi.advanceTimersByTime(15000);
    });
    await act(async () => {
      fireEvent.change(field, { target: { value: "Fever, cough and headache" } });
    });

    // Still short of 30s since the THIRD edit -- must not have fired yet.
    await act(async () => {
      vi.advanceTimersByTime(25000);
    });
    expect(saveDraftSpy).not.toHaveBeenCalled();

    // Now cross the 30s threshold measured from the last edit.
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(saveDraftSpy).toHaveBeenCalledTimes(1);
    const [, savedFormData] = saveDraftSpy.mock.calls[0];
    expect((savedFormData as any).chiefComplaint).toBe("Fever, cough and headache");
  });

  it("surfaces a failed autosave via draftStatus instead of failing silently", async () => {
    vi.spyOn(draftService, "saveDraft").mockResolvedValue(false);

    render(
      <VoiceSessionProvider>
        <ConsultationPage patientId={patient.id} />
      </VoiceSessionProvider>
    );

    const field = screen.getByPlaceholderText("Type or speak complaint...");
    await act(async () => {
      fireEvent.change(field, { target: { value: "Fever" } });
    });

    expect(useUIStore.getState().draftStatus).not.toBe("Draft save failed");

    await act(async () => {
      vi.advanceTimersByTime(30000);
    });

    expect(useUIStore.getState().draftStatus).toBe("Draft save failed");
  });
});

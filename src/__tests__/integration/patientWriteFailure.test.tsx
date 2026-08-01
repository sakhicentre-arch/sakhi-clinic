import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import PatientPage from "../../pages/PatientPage";
import { usePatientStore } from "../../store/usePatientStore";
import { useConsultationStore } from "../../store/useConsultationStore";
import * as patientService from "../../services/patientService";

/**
 * Module A — acceptance criterion A4, PatientPage half: "A simulated
 * patientService.ts write failure is visibly surfaced in the UI."
 *
 * PatientPage already had a working alert() on save failure before Module A;
 * what Module A added is usePatientStore.lastError, giving that failure an
 * assertable, non-alert() shape (a dismissible browser alert isn't itself
 * something a test — or a future banner component — can observe). This
 * proves both: the pre-existing alert still fires, and the new store state
 * is set to the actual service error message.
 */

describe("PatientPage write-failure surfacing (A4)", () => {
  beforeEach(() => {
    usePatientStore.setState({
      patients: [],
      selectedPatientId: null,
      hydrated: true,
      lastError: null,
      loadPatients: vi.fn(async () => undefined),
      addPatient: vi.fn(async () => undefined),
      updatePatient: vi.fn(async () => undefined),
      deletePatient: vi.fn(async () => undefined),
    } as any);
    useConsultationStore.setState({
      consultations: [] as any,
      activeSession: null,
      loadConsultations: vi.fn(async () => undefined),
      loadPatientConsultations: vi.fn(async () => undefined),
      saveConsultation: vi.fn(async () => true),
      clearSession: vi.fn(),
    } as any);
    vi.spyOn(window, "alert").mockImplementation(() => undefined);
  });

  it("surfaces a failed patient save both as an alert and as usePatientStore.lastError", async () => {
    vi.spyOn(patientService, "addPatient").mockRejectedValue(
      new Error("Simulated write failure: disk quota exceeded")
    );

    render(<PatientPage />);
    await screen.findByTestId("patient-name-input");

    fireEvent.change(screen.getByTestId("patient-name-input"), {
      target: { value: "Test Patient" },
    });
    fireEvent.change(screen.getByTestId("patient-phone-input"), {
      target: { value: "9876543210" },
    });

    expect(usePatientStore.getState().lastError).toBeNull();

    await act(async () => {
      fireEvent.submit(screen.getByTestId("patient-registration-form"));
    });

    expect(window.alert).toHaveBeenCalledWith("Error saving patient. Please try again.");
    expect(usePatientStore.getState().lastError).toBe("Simulated write failure: disk quota exceeded");
  });

  it("clears any prior error on a successful save", async () => {
    vi.spyOn(patientService, "addPatient").mockResolvedValue(undefined);
    usePatientStore.setState({ lastError: "stale error from a previous failed attempt" } as any);

    render(<PatientPage />);
    await screen.findByTestId("patient-name-input");

    fireEvent.change(screen.getByTestId("patient-name-input"), {
      target: { value: "Test Patient Two" },
    });
    fireEvent.change(screen.getByTestId("patient-phone-input"), {
      target: { value: "9876543211" },
    });

    await act(async () => {
      fireEvent.submit(screen.getByTestId("patient-registration-form"));
    });

    expect(usePatientStore.getState().lastError).toBeNull();
  });
});

import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import PatientPage from "../../pages/PatientPage";
import { usePatientStore } from "../../store/usePatientStore";
import { useConsultationStore } from "../../store/useConsultationStore";
import * as patientService from "../../services/patientService";

/**
 * Doctor-reported UX fix (DOCTOR_UI_UX_REVIEW_V2.md Issue 1): "the same
 * patient can be created multiple times." The old guard was a raw
 * phone-string-equality check with no name-based fallback and a hard-block
 * alert(). The fix reuses patientImportService.ts's existing
 * normalizePhone/normalizeName/detectDuplicate (phone normalized, falling
 * back to name+age) and shows a dismissible, non-blocking warning instead --
 * per the explicit requirement: detect likely duplicates without preventing
 * legitimately distinct patients (e.g. family members) from being created.
 */

const EXISTING_PATIENT_ID = "existing-patient-1";

function seedStores() {
  usePatientStore.setState({
    patients: [
      {
        id: EXISTING_PATIENT_ID,
        name: "Rakesh Patel",
        age: 40,
        gender: "Male",
        phone: "9876543210",
      },
    ],
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
}

describe("PatientPage — possible-duplicate warning (Issue 1 fix)", () => {
  beforeEach(() => {
    seedStores();
    vi.spyOn(window, "alert").mockImplementation(() => undefined);
  });

  it("warns instead of saving when the phone number matches an existing patient, even with different formatting", async () => {
    const addSpy = vi.spyOn(patientService, "addPatient").mockResolvedValue(undefined);

    render(<PatientPage />);
    await screen.findByTestId("patient-name-input");

    fireEvent.change(screen.getByTestId("patient-name-input"), { target: { value: "Rakesh K Patel" } });
    // Same number as the existing patient, but with formatting noise --
    // the old raw-string check would have missed this as a duplicate.
    fireEvent.change(screen.getByTestId("patient-phone-input"), { target: { value: "+91 98765-43210" } });
    fireEvent.change(screen.getByTestId("patient-gender-select"), { target: { value: "Male" } });

    await act(async () => {
      fireEvent.submit(screen.getByTestId("patient-registration-form"));
    });

    expect(await screen.findByTestId("duplicate-patient-warning")).toBeInTheDocument();
    expect(screen.getByTestId("duplicate-patient-warning")).toHaveTextContent("Rakesh Patel");
    // Must not silently save -- the doctor has to make an explicit choice.
    expect(addSpy).not.toHaveBeenCalled();
  });

  it('lets the doctor proceed via "Continue creating new patient" (e.g. a family member sharing a phone)', async () => {
    const addSpy = vi.spyOn(patientService, "addPatient").mockResolvedValue(undefined);

    render(<PatientPage />);
    await screen.findByTestId("patient-name-input");

    fireEvent.change(screen.getByTestId("patient-name-input"), { target: { value: "Sunita Patel" } });
    fireEvent.change(screen.getByTestId("patient-phone-input"), { target: { value: "9876543210" } });
    fireEvent.change(screen.getByTestId("patient-gender-select"), { target: { value: "Female" } });

    await act(async () => {
      fireEvent.submit(screen.getByTestId("patient-registration-form"));
    });
    expect(await screen.findByTestId("duplicate-patient-warning")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId("duplicate-continue-new-btn"));
    });

    expect(addSpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Sunita Patel", phone: "9876543210" })
    );
    expect(screen.queryByTestId("duplicate-patient-warning")).not.toBeInTheDocument();
  });

  it('"Open existing patient" selects the matched record instead of creating a new one', async () => {
    const addSpy = vi.spyOn(patientService, "addPatient").mockResolvedValue(undefined);

    render(<PatientPage />);
    await screen.findByTestId("patient-name-input");

    fireEvent.change(screen.getByTestId("patient-name-input"), { target: { value: "Rakesh Patel" } });
    fireEvent.change(screen.getByTestId("patient-phone-input"), { target: { value: "9876543210" } });
    fireEvent.change(screen.getByTestId("patient-gender-select"), { target: { value: "Male" } });

    await act(async () => {
      fireEvent.submit(screen.getByTestId("patient-registration-form"));
    });
    expect(await screen.findByTestId("duplicate-patient-warning")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("duplicate-open-existing-btn"));

    expect(addSpy).not.toHaveBeenCalled();
    expect(screen.queryByTestId("duplicate-patient-warning")).not.toBeInTheDocument();
  });

  it("does not warn for a genuinely different patient (different name, phone, and age)", async () => {
    const addSpy = vi.spyOn(patientService, "addPatient").mockResolvedValue(undefined);

    render(<PatientPage />);
    await screen.findByTestId("patient-name-input");

    fireEvent.change(screen.getByTestId("patient-name-input"), { target: { value: "Meera Shah" } });
    fireEvent.change(screen.getByTestId("patient-age-input"), { target: { value: "27" } });
    fireEvent.change(screen.getByTestId("patient-phone-input"), { target: { value: "9123456780" } });
    fireEvent.change(screen.getByTestId("patient-gender-select"), { target: { value: "Female" } });

    await act(async () => {
      fireEvent.submit(screen.getByTestId("patient-registration-form"));
    });

    expect(screen.queryByTestId("duplicate-patient-warning")).not.toBeInTheDocument();
    expect(addSpy).toHaveBeenCalledWith(expect.objectContaining({ name: "Meera Shah" }));
  });
});

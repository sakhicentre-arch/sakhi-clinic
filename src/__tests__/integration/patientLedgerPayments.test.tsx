import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import PatientPage from "../../pages/PatientPage";
import { usePatientStore } from "../../store/usePatientStore";
import { useConsultationStore } from "../../store/useConsultationStore";

/**
 * Doctor Workflow Completion, item 1: paymentReferenceNumber, paymentNotes,
 * and paymentScreenshotDataUrl already existed on Consultation (recorded via
 * paymentService.ts's recordPayment/compressPaymentScreenshot, wired into
 * ConsultationPage.tsx's payment flow) but were never rendered anywhere --
 * a doctor could record proof of payment and then never see it again. This
 * proves the Patient Ledger's Finance tab now surfaces all three.
 */

const PATIENT_ID = "patient-ledger-1";

describe("Patient Ledger — payment reference/notes/screenshot", () => {
  beforeEach(() => {
    usePatientStore.setState({
      patients: [
        {
          id: PATIENT_ID,
          name: "Ledger Test Patient",
          gender: "Female",
          phone: "9876500000",
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
      consultations: [
        {
          id: "consult-1",
          patientId: PATIENT_ID,
          date: "2026-08-01",
          chiefComplaint: "Test complaint",
          medicines: [],
          fee: 500,
          paymentStatus: "paid",
          amountReceived: 500,
          paymentMode: "upi",
          paymentReferenceNumber: "UPI-REF-99887",
          paymentNotes: "Paid via GPay, confirmed by patient's husband",
          paymentScreenshotDataUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAAAAAAAD/2wCEAA==",
        },
      ] as any,
      activeSession: null,
      loadConsultations: vi.fn(async () => undefined),
      loadPatientConsultations: vi.fn(async () => undefined),
      saveConsultation: vi.fn(async () => true),
      clearSession: vi.fn(),
    } as any);
  });

  it("renders payment reference number and notes in the Finance tab", async () => {
    render(<PatientPage initialPatientId={PATIENT_ID} />);

    fireEvent.click(await screen.findByText(/finance/i));

    expect(await screen.findByText("UPI-REF-99887")).toBeInTheDocument();
    expect(await screen.findByText("Paid via GPay, confirmed by patient's husband")).toBeInTheDocument();
  });

  it("opens the payment screenshot viewer when 'View' is clicked", async () => {
    render(<PatientPage initialPatientId={PATIENT_ID} />);

    fireEvent.click(await screen.findByText(/finance/i));

    const viewButton = await screen.findByTestId("payment-proof-view-consult-1");
    fireEvent.click(viewButton);

    expect(await screen.findByText(/Payment Proof — Ledger Test Patient/i)).toBeInTheDocument();
    const image = screen.getByAltText(/payment proof screenshot/i) as HTMLImageElement;
    expect(image.src).toContain("data:image/jpeg;base64");
  });

  it("shows an em dash instead of a View button when no screenshot was captured", async () => {
    useConsultationStore.setState({
      consultations: [
        {
          id: "consult-2",
          patientId: PATIENT_ID,
          date: "2026-08-02",
          chiefComplaint: "No screenshot case",
          medicines: [],
          fee: 300,
          paymentStatus: "paid",
          amountReceived: 300,
          paymentMode: "cash",
        },
      ] as any,
    } as any);

    render(<PatientPage initialPatientId={PATIENT_ID} />);
    fireEvent.click(await screen.findByText(/finance/i));

    await screen.findByText(/Payment History/i);
    expect(screen.queryByTestId("payment-proof-view-consult-2")).not.toBeInTheDocument();
  });
});

import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import PatientPage from "../../pages/PatientPage";
import { usePatientStore } from "../../store/usePatientStore";
import { useConsultationStore } from "../../store/useConsultationStore";

/**
 * Doctor journey audit finding: the Payment History section (Finance tab)
 * was a fixed 8-column desktop `<table>` with no `isMobile` branch, and its
 * "View"/"Send Receipt" buttons were ~22-26px tall -- well under the 44px
 * touch-target minimum this file already uses elsewhere (see
 * mockMobileViewport pattern reused from PatientHeaderMobile.test.tsx,
 * which proved the same class of gap on the hero card). This proves the
 * mobile card layout renders the same payment data instead of the table,
 * and that its action buttons meet the 44px minimum.
 */

const PATIENT_ID = "payment-history-mobile-1";

function mockMobileViewport() {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: query === "(max-width: 768px)",
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

describe("PatientPage — Payment History mobile card layout", () => {
  beforeEach(() => {
    mockMobileViewport();
    usePatientStore.setState({
      patients: [
        { id: PATIENT_ID, name: "Mobile Payment Patient", gender: "Female", phone: "9876500002" },
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
          id: "consult-mobile-1",
          patientId: PATIENT_ID,
          date: "2026-08-01",
          chiefComplaint: "Test complaint",
          medicines: [],
          fee: 300,
          paymentStatus: "partial",
          amountReceived: 100,
          paymentMode: "upi",
          paymentReferenceNumber: "UPI-MOBILE-1",
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

  it("renders payment history as cards (not a table) on mobile, showing the same data", async () => {
    render(<PatientPage initialPatientId={PATIENT_ID} />);
    fireEvent.click(await screen.findByText(/finance/i));

    await screen.findByText(/Payment History/i);

    // No desktop table should render on mobile.
    expect(document.querySelector("table")).not.toBeInTheDocument();

    // Same data still visible: partial amount, reference number.
    expect(screen.getByText("₹100.00 / ₹300.00")).toBeInTheDocument();
    expect(screen.getByText(/Ref: UPI-MOBILE-1/)).toBeInTheDocument();
  });

  it("gives the View Proof and Send Receipt actions a 44px minimum touch target", async () => {
    render(<PatientPage initialPatientId={PATIENT_ID} />);
    fireEvent.click(await screen.findByText(/finance/i));

    const viewBtn = await screen.findByTestId("payment-proof-view-consult-mobile-1");
    expect(viewBtn).toHaveStyle({ minHeight: "44px" });
  });
});

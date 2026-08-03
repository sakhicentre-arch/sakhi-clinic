import "fake-indexeddb/auto";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { indexedDB as fakeIndexedDB } from "fake-indexeddb";

/**
 * RC2 Phase 1 -- Rubric Intelligence Engine, Phase 7: the consultation-
 * embedded "Rubric Suggestions" panel. Anchored on previousConsultation
 * (the patient's most recent past visit) rather than editingId/isEditing
 * -- this reducer's EDIT_START action is never dispatched anywhere in
 * ConsultationPage.tsx today, so gating on it would make the panel
 * permanently unreachable dead code. previousConsultation is real,
 * populated, already-used state (pre-fill), which is why this is the
 * correct anchor.
 */

vi.mock("../../components/shared/PatientHistoryTimeline", () => ({
  default: () => null,
}));

const DB_NAME = "SakhiClinicDB";

async function resetDatabase() {
  await new Promise<void>((resolve, reject) => {
    const req = fakeIndexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

const patient = {
  id: "PAT-RUBRIC-PANEL-1",
  name: "Rubric Panel Patient",
  gender: "Female",
  phone: "9876543211",
  age: 30,
  address: "Surat",
  miasm: "Psora",
};

describe("ConsultationPage — Rubric Suggestions panel (previousConsultation-anchored)", () => {
  let db: typeof import("../../services/db").db;

  beforeEach(async () => {
    vi.resetModules();
    await resetDatabase();
    const dbModule = await import("../../services/db");
    db = dbModule.db;
    await db.open();

    const patientStoreModule = await import("../../store/usePatientStore");
    patientStoreModule.usePatientStore.setState({
      patients: [patient as any],
      loadPatients: vi.fn(async () => undefined),
      addPatient: vi.fn(async () => undefined),
      updatePatient: vi.fn(async () => undefined),
      deletePatient: vi.fn(async () => undefined),
    });

    const consultationStoreModule = await import("../../store/useConsultationStore");
    consultationStoreModule.useConsultationStore.setState({
      consultations: [],
      activeSession: null,
      loadConsultations: vi.fn(async () => undefined),
      loadPatientConsultations: vi.fn(async () => undefined),
      saveConsultation: vi.fn(async () => true),
      clearSession: vi.fn(),
    });

    const appointmentStoreModule = await import("../../store/useAppointmentStore");
    appointmentStoreModule.useAppointmentStore.setState({
      appointments: [],
      loadAppointments: vi.fn(async () => undefined),
      addAppointment: vi.fn(async () => true),
      startConsultation: vi.fn(async () => undefined),
      markArrived: vi.fn(async () => undefined),
      markDone: vi.fn(async () => undefined),
      markReminderSent: vi.fn(async () => undefined),
    });

    vi.spyOn(window, "alert").mockImplementation(() => undefined);
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);

    await db.patients.add(patient as any);
  });

  afterEach(async () => {
    db.close();
    await resetDatabase();
    vi.restoreAllMocks();
  });

  it("shows pending rubrics from the patient's last visit, with working inline approve/reject", async () => {
    await db.consultations.add({
      id: "C-PREV-1", patientId: patient.id, date: "2026-01-01T10:00:00.000Z", clinicId: "Dabholi",
      chiefComplaint: "Headache", caseText: "", medicines: [], outcome: "NoChange", rubricsGeneratedAt: new Date().toISOString(),
    } as any);
    const now = new Date().toISOString();
    await db.rubrics.add({
      id: "RB1", consultationId: "C-PREV-1", patientId: patient.id, category: "mind",
      text: "Anxious about health", source: "ai", status: "pending", confidence: 0.8,
      reason: "Directly entered under Mind", createdAt: now, updatedAt: now,
    } as any);

    const { default: ConsultationPage } = await import("../../pages/ConsultationPage");
    const { VoiceSessionProvider } = await import("../../hooks/VoiceSessionContext");

    render(
      <VoiceSessionProvider>
        <ConsultationPage patientId={patient.id} />
      </VoiceSessionProvider>
    );

    // Don't hold a captured element reference across awaits here -- the
    // page can settle from an initial mode guess into its final Classic/
    // Quick layout shortly after mount (once consultations finish
    // loading), which unmounts/remounts this panel once. Re-querying
    // fresh each time avoids asserting against a now-detached node.
    await screen.findByTestId("consultation-rubric-panel", {}, { timeout: 3000 });
    // Re-query the panel fresh on every poll (never hold a captured
    // element reference across awaits here) -- this component's own AI
    // fetch effect and multi-stage load sequence can cause an internal
    // reconciliation that leaves a previously-captured node stale even
    // though the live document has the correct, current content.
    await waitFor(
      () => {
        const currentPanel = screen.getByTestId("consultation-rubric-panel");
        expect(currentPanel.textContent).toContain("Anxious about health");
      },
      { timeout: 8000, interval: 100 }
    );

    fireEvent.click(await screen.findByTestId("consultation-rubric-approve-RB1"));

    await waitFor(async () => {
      expect((await db.rubrics.get("RB1"))?.status).toBe("approved");
    });
    // Approved rubrics drop out of the inline pending list.
    await waitFor(() => {
      expect(screen.queryByTestId("consultation-rubric-approve-RB1")).not.toBeInTheDocument();
    });
  }, 15000);

  it("adds a manual rubric against the patient's last visit", async () => {
    await db.consultations.add({
      id: "C-PREV-1", patientId: patient.id, date: "2026-01-01T10:00:00.000Z", clinicId: "Dabholi",
      chiefComplaint: "Headache", caseText: "", medicines: [], outcome: "NoChange", rubricsGeneratedAt: new Date().toISOString(),
    } as any);

    const { default: ConsultationPage } = await import("../../pages/ConsultationPage");
    const { VoiceSessionProvider } = await import("../../hooks/VoiceSessionContext");

    render(
      <VoiceSessionProvider>
        <ConsultationPage patientId={patient.id} />
      </VoiceSessionProvider>
    );

    await screen.findByTestId("consultation-rubric-panel", {}, { timeout: 3000 });
    fireEvent.click(screen.getByTestId("consultation-add-manual-rubric"));

    fireEvent.change(screen.getByTestId("consultation-manual-rubric-text"), { target: { value: "Sound sleep, unrefreshing" } });
    fireEvent.click(screen.getByTestId("consultation-manual-rubric-save"));

    await waitFor(async () => {
      const rows = await db.rubrics.where("consultationId").equals("C-PREV-1").toArray();
      expect(rows.some((r) => r.text === "Sound sleep, unrefreshing" && r.source === "manual" && r.status === "approved")).toBe(true);
    });
  }, 15000);

  it("does not render the panel for a brand-new patient with no past visits", async () => {
    const { default: ConsultationPage } = await import("../../pages/ConsultationPage");
    const { VoiceSessionProvider } = await import("../../hooks/VoiceSessionContext");

    render(
      <VoiceSessionProvider>
        <ConsultationPage patientId={patient.id} />
      </VoiceSessionProvider>
    );

    await screen.findByText("Consultation");
    expect(screen.queryByTestId("consultation-rubric-panel")).not.toBeInTheDocument();
  }, 15000);
});

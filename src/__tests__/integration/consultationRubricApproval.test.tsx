import "fake-indexeddb/auto";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { indexedDB as fakeIndexedDB } from "fake-indexeddb";

/**
 * Rubric Suggestion Automation (Module 7) -- ConsultationPage's "Case
 * Pattern Signals" panel already showed learningEngine.ts's evidence-
 * scored remedy suggestions read-only; this covers the "Doctor Approval"
 * gate added on top of it: the AI never writes to the prescription on
 * its own, a suggestion only reaches formData.medicines when the doctor
 * clicks "Approve -> Add to Rx".
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
  id: "PAT-RUBRIC-1",
  name: "Rubric Test Patient",
  gender: "Female",
  phone: "9876543210",
  age: 30,
  address: "Surat",
  miasm: "Psora",
};

// extractSymptomKey() (learningEngine.ts) lowercases, strips punctuation,
// drops words < 3 chars and stopwords, sorts alphabetically, joins with "|".
// "burning pain worse at night" -> this key.
const SYMPTOM_KEY = "burning|night|pain|worse";
const SYMPTOM_TEXT = "burning pain worse at night";

describe("ConsultationPage — Rubric Suggestion doctor-approval gate", () => {
  let db: typeof import("../../services/db").db;

  beforeEach(async () => {
    vi.resetModules();
    await resetDatabase();
    const dbModule = await import("../../services/db");
    db = dbModule.db;
    await db.open();

    // A pattern the frequentist learning engine treats as evidence-backed
    // (count >= 3, see learningEngine.ts's own threshold comment).
    await db.learning.add({
      remedy: "Arsenicum Album",
      symptomKey: SYMPTOM_KEY,
      score: 30, // 3 prior IMPROVED outcomes
      count: 3,
    } as any);

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
  });

  afterEach(async () => {
    db.close();
    await resetDatabase();
    vi.restoreAllMocks();
  });

  it("surfaces a Case Pattern Signal with confidence/evidence, and only adds it to the Rx when approved", async () => {
    // Real render + a 3s debounced-fetch wait already leaves little margin
    // under vitest's 5000ms default when the full suite is running many
    // files concurrently -- this one's own workload is legitimately close
    // to that ceiling even in isolation (~4.8s observed).
    const { default: ConsultationPage } = await import("../../pages/ConsultationPage");
    const { VoiceSessionProvider } = await import("../../hooks/VoiceSessionContext");

    render(
      <VoiceSessionProvider>
        <ConsultationPage patientId={patient.id} />
      </VoiceSessionProvider>
    );

    // First visit, no consultation history -> Full/Classic mode -> sidebar renders.
    expect(await screen.findByText("Consultation")).toBeInTheDocument();

    const chiefComplaintField = screen.getByPlaceholderText("Type or speak complaint...");
    fireEvent.change(chiefComplaintField, { target: { value: SYMPTOM_TEXT } });

    // ConsultationPage debounces the AI fetch by 1000ms before calling
    // getLearnedSuggestions -- wait for the resulting UI, not the timer.
    const approveButton = await waitFor(
      () => screen.getByRole("button", { name: /approve.*add to rx/i }),
      { timeout: 3000 }
    );

    // Evidence + confidence are visible before the doctor decides anything.
    expect(screen.getByText(/confidence index: 100%/i)).toBeInTheDocument();
    // All 4 tokens in SYMPTOM_KEY ("burning|night|pain|worse") match the seeded pattern.
    expect(screen.getByText((_, el) => el?.textContent === "Evidence: matched 4 of this remedy's 3 prior successful clinical uses")).toBeInTheDocument();

    // The AI never auto-selects: nothing is in the Rx yet.
    expect(screen.queryByDisplayValue("Arsenicum Album")).not.toBeInTheDocument();

    fireEvent.click(approveButton);

    // Approval writes straight into the prescription.
    expect(await screen.findByDisplayValue("Arsenicum Album")).toBeInTheDocument();

    // Re-approving the same suggestion is a no-op, not a duplicate add.
    const addedLabel = await screen.findByRole("button", { name: /added to rx/i });
    expect(addedLabel).toBeDisabled();
    expect(screen.getAllByDisplayValue("Arsenicum Album")).toHaveLength(1);
  }, 15000);
});

import "fake-indexeddb/auto";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { indexedDB as fakeIndexedDB } from "fake-indexeddb";

/**
 * Doctor-reported UX fix: "Save & Next" must not dead-end back to Today.
 *
 * Root cause: `handleSave()` unconditionally called `onFinish()` (which
 * navigates to Today in the real app), which always won the race against
 * `saveAndMaybeToast`'s own "load the next queued patient in place" step --
 * so tapping Save & Next looked like it should advance to the next patient,
 * but every save silently bounced back to Today first. The fix threads a
 * `skipFinish` flag through so `saveAndMaybeToast` can suppress `onFinish()`
 * specifically when it's about to auto-advance to another queued patient.
 *
 * This proves both directions: a next-patient advance does NOT call
 * onFinish (previously it always did, regardless of intent), and a plain
 * save with nobody else waiting still calls onFinish exactly as before
 * (no regression to the ordinary single-patient save path).
 */

const DB_NAME = "SakhiClinicDB";

async function resetDatabase() {
  await new Promise<void>((resolve, reject) => {
    const req = fakeIndexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

const patientA = { id: "PAT-SAVE-NEXT-A", name: "Patient A", gender: "Female", phone: "9876500001", age: 30 };
const patientB = { id: "PAT-SAVE-NEXT-B", name: "Patient B", gender: "Male", phone: "9876500002", age: 40 };

describe("ConsultationPage — Save & Next does not dead-end back to Today", () => {
  let db: typeof import("../../services/db").db;

  beforeEach(async () => {
    vi.resetModules();
    await resetDatabase();
    const dbModule = await import("../../services/db");
    db = dbModule.db;
    await db.open();

    const patientStoreModule = await import("../../store/usePatientStore");
    patientStoreModule.usePatientStore.setState({
      patients: [patientA, patientB] as any,
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

    await db.patients.add(patientA as any);
    await db.patients.add(patientB as any);
  });

  afterEach(async () => {
    db.close();
    await resetDatabase();
    vi.restoreAllMocks();
  });

  it("advances to the next queued patient in place instead of navigating to Today, when another patient is waiting", async () => {
    const queueStoreModule = await import("../../store/queueStore");
    queueStoreModule.useQueueStore.setState({
      queue: [
        { queueId: "q-a", patientId: patientA.id, appointmentId: "appt-a", patientName: patientA.name, status: "in-progress", addedAt: new Date().toISOString() },
        { queueId: "q-b", patientId: patientB.id, appointmentId: "appt-b", patientName: patientB.name, status: "waiting", addedAt: new Date().toISOString() },
      ] as any,
    });

    const uiStoreModule = await import("../../store/uiStore");
    const { default: ConsultationPage } = await import("../../pages/ConsultationPage");
    const { VoiceSessionProvider } = await import("../../hooks/VoiceSessionContext");
    const onFinish = vi.fn();

    render(
      <VoiceSessionProvider>
        <ConsultationPage patientId={patientA.id} appointmentId="appt-a" onFinish={onFinish} />
      </VoiceSessionProvider>
    );

    const complaintField = await screen.findByPlaceholderText(/Type or speak complaint/i, {}, { timeout: 3000 });
    fireEvent.change(complaintField, { target: { value: "Fever and body ache" } });

    fireEvent.click(await screen.findByTestId("consultation-classic-save-button"));

    await waitFor(() => {
      expect(uiStoreModule.useUIStore.getState().activePatientId).toBe(patientB.id);
    }, { timeout: 5000 });

    // The whole point of the fix: onFinish (navigate-to-Today in the real
    // app) must NOT fire when we're auto-advancing to another patient --
    // previously it always fired here regardless, stranding the doctor on
    // Today instead of moving them forward.
    expect(onFinish).not.toHaveBeenCalled();

    // The just-finished patient's queue entry is marked done.
    expect(queueStoreModule.useQueueStore.getState().queue.find((e) => e.queueId === "q-a")?.status).toBe("done");
  }, 15000);

  it("still calls onFinish for a plain save when nobody else is waiting (no regression)", async () => {
    const queueStoreModule = await import("../../store/queueStore");
    queueStoreModule.useQueueStore.setState({
      queue: [
        { queueId: "q-a", patientId: patientA.id, appointmentId: "appt-a", patientName: patientA.name, status: "in-progress", addedAt: new Date().toISOString() },
      ] as any,
    });

    const { default: ConsultationPage } = await import("../../pages/ConsultationPage");
    const { VoiceSessionProvider } = await import("../../hooks/VoiceSessionContext");
    const onFinish = vi.fn();

    render(
      <VoiceSessionProvider>
        <ConsultationPage patientId={patientA.id} appointmentId="appt-a" onFinish={onFinish} />
      </VoiceSessionProvider>
    );

    const complaintField = await screen.findByPlaceholderText(/Type or speak complaint/i, {}, { timeout: 3000 });
    fireEvent.change(complaintField, { target: { value: "Fever and body ache" } });

    fireEvent.click(await screen.findByTestId("consultation-classic-save-button"));

    await waitFor(() => {
      expect(onFinish).toHaveBeenCalledTimes(1);
    }, { timeout: 5000 });
  }, 15000);
});

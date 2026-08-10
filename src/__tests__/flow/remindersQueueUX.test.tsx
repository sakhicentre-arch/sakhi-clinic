import "fake-indexeddb/auto";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { indexedDB as fakeIndexedDB } from "fake-indexeddb";
import App from "../../App";
import { db } from "../../services/db";
import { usePatientStore } from "../../store/usePatientStore";
import { useConsultationStore } from "../../store/useConsultationStore";
import { useAppointmentStore } from "../../store/useAppointmentStore";
import { useQueueStore } from "../../store/queueStore";
import { useUIStore } from "../../store/uiStore";
import { dateKey } from "../../utils/dateOnly";

/**
 * Doctor-facing gaps found while auditing the reminder queue workflow
 * (un-audited before this pass -- it shipped after the last UX review):
 *
 * 1. The main Queue list showed only "last updated" (`updatedAt`), so a
 *    doctor scanning pending reminders couldn't tell WHEN an appointment
 *    is actually due without opening/reading the full message body.
 * 2. A patient with no WhatsApp number on file was shown a red "No
 *    WhatsApp" pill with no reason attributed to that specific row --
 *    the "why" only existed in an aggregate counter elsewhere on the page.
 *
 * This proves both are now visible directly on the row, without opening a
 * second screen -- the "WHAT/WHO/WHEN/WHY/STATUS/ACTION at a glance"
 * requirement the doctor journey audit calls out for this page.
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

function seedStores() {
  usePatientStore.setState({
    patients: [],
    loadPatients: vi.fn(async () => undefined),
    addPatient: vi.fn(async () => undefined),
    updatePatient: vi.fn(async () => undefined),
    deletePatient: vi.fn(async () => undefined),
  } as any);
  useConsultationStore.setState({
    consultations: [],
    activeSession: null,
    loadConsultations: vi.fn(async () => undefined),
    loadPatientConsultations: vi.fn(async () => undefined),
    saveConsultation: vi.fn(async () => true),
    clearSession: vi.fn(),
  } as any);
  useAppointmentStore.setState({
    appointments: [],
    loadAppointments: vi.fn(async () => undefined),
    addAppointment: vi.fn(async () => true),
    startConsultation: vi.fn(async () => undefined),
    markArrived: vi.fn(async () => undefined),
    markDone: vi.fn(async () => undefined),
    markReminderSent: vi.fn(async () => undefined),
  } as any);
  useQueueStore.setState({ queue: [] } as any);
  useUIStore.setState({
    activePage: "today",
    activeClinic: "Dabholi",
    activePatientId: null,
    activeAppointmentId: null,
    draftStatus: "",
  } as any);
}

describe("RemindersPage — queue row visibility (due date, no-WhatsApp reason)", () => {
  beforeEach(async () => {
    await resetDatabase();
    await db.open();
    seedStores();
    vi.spyOn(window, "alert").mockImplementation(() => undefined);

    const today = dateKey(new Date());

    await db.patients.add({
      id: "patient-with-phone", name: "Has Phone Patient", gender: "Female",
      phone: "9876500001", createdAt: today, updatedAt: today,
    } as any);
    await db.appointments.add({
      id: "appt-with-phone", patientId: "patient-with-phone", patientName: "Has Phone Patient",
      clinic: "Dabholi", date: today, time: "11:30", type: "scheduled", status: "booked",
    } as any);

    await db.patients.add({
      id: "patient-no-phone", name: "No Phone Patient", gender: "Male",
      phone: "", createdAt: today, updatedAt: today,
    } as any);
    await db.appointments.add({
      id: "appt-no-phone", patientId: "patient-no-phone", patientName: "No Phone Patient",
      clinic: "Dabholi", date: today, time: "14:00", type: "scheduled", status: "booked",
    } as any);
  });

  afterEach(async () => {
    db.close();
    await resetDatabase();
    vi.restoreAllMocks();
  });

  it("shows the real appointment due time on the queued reminder row, not just when it was last updated", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /reminders/i }));
    await screen.findByTestId("reminders-page");

    fireEvent.click(await screen.findByTestId("queue-today-reminders"));

    const row = await waitFor(() => {
      const el = document.querySelector('[data-testid^="reminder-queue-row-"]');
      if (!el) throw new Error("queue row not rendered yet");
      return el as HTMLElement;
    });
    expect(within(row).getByText("Has Phone Patient")).toBeInTheDocument();
    expect(within(row).getByText(/Due Today 11:30/)).toBeInTheDocument();
  });

  it("attributes the 'no WhatsApp number' reason to the specific patient row, not just an aggregate count", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /reminders/i }));
    await screen.findByTestId("reminders-page");

    const noPhoneReason = await screen.findByTestId("today-reminder-no-phone-appt-no-phone");
    expect(noPhoneReason.textContent).toContain("No Phone Patient");
  });
});

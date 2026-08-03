import "fake-indexeddb/auto";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { indexedDB as fakeIndexedDB } from "fake-indexeddb";
import App from "../../App";
import { db } from "../../services/db";
import { usePatientStore } from "../../store/usePatientStore";
import { useConsultationStore } from "../../store/useConsultationStore";
import { useAppointmentStore } from "../../store/useAppointmentStore";
import { useQueueStore } from "../../store/queueStore";
import { useUIStore } from "../../store/uiStore";
import * as reminderQueueService from "../../services/reminderQueueService";

/**
 * Doctor Workflow Completion, item 3: RemindersPage.tsx already had
 * approve/reject/cancel/resend per row (Phase 2) but no way to edit a
 * message before approving it, and no bulk actions -- a doctor chasing
 * a dozen overdue payments had to approve/send them one at a time.
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

async function seedReminder(overrides: { id: string; patientName: string; status: string; message?: string }) {
  const now = new Date().toISOString();
  await db.reminderQueue.add({
    id: overrides.id,
    patientId: `patient-${overrides.id}`,
    patientName: overrides.patientName,
    phone: "9000000000",
    type: "custom",
    channel: "whatsapp",
    message: overrides.message || `Original message for ${overrides.patientName}`,
    dueAt: now,
    status: overrides.status,
    retryCount: 0,
    createdAt: now,
    updatedAt: now,
  } as any);
}

describe("Reminder Productivity: edit and bulk actions", () => {
  beforeEach(async () => {
    await resetDatabase();
    await db.open();
    seedStores();
    vi.spyOn(window, "alert").mockImplementation(() => undefined);
    vi.spyOn(window, "open").mockImplementation(() => null);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    db.close();
    await resetDatabase();
  });

  it("edits a pending reminder's message before approval", async () => {
    await seedReminder({ id: "R1", patientName: "Edit Test Patient", status: "pending" });

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /reminders/i }));
    await screen.findByTestId("reminders-page");

    fireEvent.click(await screen.findByTestId("reminder-edit-R1"));
    const textarea = await screen.findByTestId("reminder-edit-textarea-R1");
    fireEvent.change(textarea, { target: { value: "Edited message text" } });
    fireEvent.click(screen.getByText("Save"));

    await screen.findByText("Edited message text");
    const stored = await db.reminderQueue.get("R1");
    expect(stored?.message).toBe("Edited message text");
    // Editing must not change approval state.
    expect(stored?.status).toBe("pending");
  });

  it("bulk-approves multiple selected pending reminders", async () => {
    await seedReminder({ id: "R2", patientName: "Bulk Patient A", status: "pending" });
    await seedReminder({ id: "R3", patientName: "Bulk Patient B", status: "pending" });

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /reminders/i }));
    await screen.findByTestId("reminders-page");

    fireEvent.click(await screen.findByTestId("reminders-select-all"));
    const bulkBtn = await screen.findByTestId("reminders-bulk-action");
    expect(bulkBtn).toHaveTextContent("Approve 2 selected");
    fireEvent.click(bulkBtn);

    await screen.findByText("No reminders in this queue.", {}, { timeout: 5000 });
    const r2 = await db.reminderQueue.get("R2");
    const r3 = await db.reminderQueue.get("R3");
    expect(r2?.status).toBe("approved");
    expect(r3?.status).toBe("approved");
  }, 10000);

  it("bulk-sends multiple selected approved reminders", async () => {
    await seedReminder({ id: "R4", patientName: "Send Patient A", status: "approved" });
    await seedReminder({ id: "R5", patientName: "Send Patient B", status: "approved" });

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /reminders/i }));
    await screen.findByTestId("reminders-page");

    fireEvent.click(screen.getByText(/Approved \(\d+\)/));
    fireEvent.click(await screen.findByTestId("reminders-select-all"));
    const bulkBtn = await screen.findByTestId("reminders-bulk-action");
    expect(bulkBtn).toHaveTextContent("Send 2 selected");
    fireEvent.click(bulkBtn);

    await screen.findByText("No reminders in this queue.", {}, { timeout: 5000 });
    const r4 = await db.reminderQueue.get("R4");
    const r5 = await db.reminderQueue.get("R5");
    expect(r4?.status).toBe("sent");
    expect(r5?.status).toBe("sent");
  }, 10000);

  it("blocks Save on an edited reminder whose message has been cleared to blank", async () => {
    await seedReminder({ id: "R6", patientName: "Blank Edit Patient", status: "pending" });

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /reminders/i }));
    await screen.findByTestId("reminders-page");

    fireEvent.click(await screen.findByTestId("reminder-edit-R6"));
    const textarea = await screen.findByTestId("reminder-edit-textarea-R6");
    fireEvent.change(textarea, { target: { value: "   " } });

    expect(screen.getByText("Save")).toBeDisabled();
    const stored = await db.reminderQueue.get("R6");
    expect(stored?.message).toBe("Original message for Blank Edit Patient"); // unchanged
  });

  it("surfaces a partial-failure note when a bulk action fails partway through", async () => {
    await seedReminder({ id: "R7", patientName: "Bulk Fail A", status: "pending" });
    await seedReminder({ id: "R8", patientName: "Bulk Fail B", status: "pending" });

    const spy = vi.spyOn(reminderQueueService, "approveReminder").mockImplementation(async (id: string) => {
      if (id === "R8") throw new Error("simulated write failure");
      return db.reminderQueue.get(id) as any;
    });

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /reminders/i }));
    await screen.findByTestId("reminders-page");

    fireEvent.click(await screen.findByTestId("reminders-select-all"));
    fireEvent.click(await screen.findByTestId("reminders-bulk-action"));

    await screen.findByText(/1 of 2 completed; 1 failed/, {}, { timeout: 5000 });
    spy.mockRestore();
  }, 10000);
});

import "fake-indexeddb/auto";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { indexedDB as fakeIndexedDB } from "fake-indexeddb";
import App from "../../App";
import { db } from "../../services/db";
import { usePatientStore } from "../../store/usePatientStore";
import { useConsultationStore } from "../../store/useConsultationStore";
import { useAppointmentStore } from "../../store/useAppointmentStore";
import { useQueueStore } from "../../store/queueStore";
import { useUIStore } from "../../store/uiStore";

/**
 * Doctor Productivity: pinning a patient (Patients page + Command Palette
 * boost) and Quick Notes (per-patient scratchpad, deliberately outside the
 * clinical record -- see utils/quickNotes.ts) are new. This proves both are
 * wired to real persistence (Dexie for pins, localStorage for notes), not
 * just rendered inertly.
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
    activePage: "patients",
    activeClinic: "Dabholi",
    activePatientId: null,
    activeAppointmentId: null,
    draftStatus: "",
    globalSearchOpen: false,
  } as any);
}

describe("Doctor Productivity: pinned patients + quick notes + command palette", () => {
  beforeEach(async () => {
    await resetDatabase();
    await db.open();
    seedStores();
    // The global localStorage mock in src/__tests__/setup.ts is a bare
    // vi.fn() stub with no real get/set round-trip -- Quick Notes need it
    // to actually persist within a test (same pattern as
    // storageHealthService.test.ts / favoriteMedicines.test.ts).
    const localStorageBackingStore = new Map<string, string>();
    (global as any).localStorage = {
      getItem: (key: string) => localStorageBackingStore.get(key) ?? null,
      setItem: (key: string, value: string) => { localStorageBackingStore.set(key, value); },
      removeItem: (key: string) => { localStorageBackingStore.delete(key); },
      clear: () => { localStorageBackingStore.clear(); },
    };
    vi.spyOn(window, "alert").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    // jsdom has no real scrollIntoView -- CommandPalette calls it whenever
    // its selected-index effect runs.
    Element.prototype.scrollIntoView = vi.fn();

    await db.patients.add({
      id: "p1", name: "Meera Shah", gender: "Female", phone: "9000000001",
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    } as any);
    await db.patients.add({
      id: "p2", name: "Kavya Rao", gender: "Female", phone: "9000000002",
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    } as any);
    // loadPatients is mocked to a no-op above (matching this suite's other
    // tests) -- seed the store directly with what a real load would have
    // produced, since PatientPage reads from the store, not straight from db.
    usePatientStore.setState({
      patients: [
        { id: "p1", name: "Meera Shah", gender: "Female", phone: "9000000001" },
        { id: "p2", name: "Kavya Rao", gender: "Female", phone: "9000000002" },
      ],
    } as any);
  });

  afterEach(async () => {
    db.close();
    await resetDatabase();
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("pinning a patient from the list persists to the database and updates the star", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /patients/i }));
    await screen.findByTestId("patient-list");

    const pinBtn = await screen.findByTestId("patient-pin-toggle-p1");
    expect(pinBtn).toHaveAttribute("aria-label", "Pin patient");

    fireEvent.click(pinBtn);

    await vi.waitFor(async () => {
      const patient = await db.patients.get("p1");
      expect(patient?.pinned).toBe(true);
    }, { timeout: 5000 });
    // findByTestId only waits for the element to EXIST, not for its
    // attributes to change -- the button persists across the re-render
    // (same DOM node), so it resolves instantly with whatever aria-label
    // it has at that moment. Poll the attribute itself instead.
    await vi.waitFor(() => {
      expect(screen.getByTestId("patient-pin-toggle-p1")).toHaveAttribute("aria-label", "Unpin patient");
    }, { timeout: 5000 });
  });

  it("saves a Quick Note for the selected patient and reloads it on reselect", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /patients/i }));
    await screen.findByTestId("patient-list");

    fireEvent.click(screen.getByText("Meera Shah"));
    const noteInput = await screen.findByTestId("patient-quick-note");
    fireEvent.change(noteInput, { target: { value: "Prefers evening slots" } });
    fireEvent.click(screen.getByTestId("patient-quick-note-save"));

    await screen.findByText("Saved");

    // Switch to the other patient -- note field should be empty for them.
    fireEvent.click(screen.getByText("Kavya Rao"));
    expect(await screen.findByTestId("patient-quick-note")).toHaveValue("");

    // Switch back -- Meera's note should still be there.
    fireEvent.click(screen.getByText("Meera Shah"));
    expect(await screen.findByTestId("patient-quick-note")).toHaveValue("Prefers evening slots");
  });

  it("Command Palette shows Quick Actions when opened with an empty query", async () => {
    render(<App />);
    useUIStore.setState({ globalSearchOpen: true } as any);

    const palette = await screen.findByTestId("command-palette");
    expect(palette).toBeInTheDocument();
    expect(await screen.findByText("Today's Queue")).toBeInTheDocument();
    expect(screen.getByText("New Patient")).toBeInTheDocument();
  });

  it("Command Palette lists a pinned patient marked as pinned", async () => {
    await db.patients.update("p2", { pinned: true } as any);

    render(<App />);
    useUIStore.setState({ globalSearchOpen: true } as any);
    await screen.findByTestId("command-palette");

    // Store hasn't loaded p2 as pinned (loadPatients is mocked out), so
    // seed the store directly to mirror what a real load would produce.
    usePatientStore.setState({
      patients: [
        { id: "p1", name: "Meera Shah", phone: "9000000001" },
        { id: "p2", name: "Kavya Rao", phone: "9000000002", pinned: true },
      ],
    } as any);

    expect(await screen.findByText(/★ Pinned/)).toBeInTheDocument();
  });
});

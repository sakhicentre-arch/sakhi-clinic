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

/**
 * Rubric Intelligence Engine (RC2 Phase 1), Phase 6: the Doctor Rubric
 * Review screen -- proves it's reachable from navigation (the AnalyticsPage
 * mistake earlier this session was a page built but never wired in) and
 * that every doctor action (approve/reject/edit/pin/delete/undo/merge/
 * split/bulk/search) actually persists through rubricApprovalService.ts,
 * not just renders inertly.
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
    patients: [{ id: "P1", name: "Rubric Review Patient", gender: "Female", phone: "9000000001" }],
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
    activePage: "dashboard",
    activeClinic: "Dabholi",
    activePatientId: null,
    activeAppointmentId: null,
    draftStatus: "",
  } as any);
}

async function seedRubric(overrides: Partial<Record<string, any>> = {}) {
  const now = new Date().toISOString();
  const entry = {
    id: overrides.id || "RB1",
    consultationId: "C1",
    patientId: "P1",
    category: "mind",
    text: "Anxiety about health",
    source: "ai",
    status: "pending",
    confidence: 0.75,
    reason: "Directly entered under Mind",
    matchedSentence: "anxious about health",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
  await db.rubrics.add(entry as any);
  return entry;
}

describe("RubricReviewPage", () => {
  beforeEach(async () => {
    await resetDatabase();
    await db.open();
    seedStores();
    vi.spyOn(window, "alert").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    db.close();
    await resetDatabase();
    vi.restoreAllMocks();
  });

  it("is reachable from the left nav (Rubrics)", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /rubrics/i }));
    expect(await screen.findByTestId("rubric-review-page")).toBeInTheDocument();
  });

  it("approves a pending rubric, moving it out of the Pending tab", async () => {
    await seedRubric();
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /rubrics/i }));
    await screen.findByTestId("rubric-review-page");

    fireEvent.click(await screen.findByTestId("rubric-approve-RB1"));

    await screen.findByText("No rubrics in this queue.");
    expect((await db.rubrics.get("RB1"))?.status).toBe("approved");
  });

  it("rejects a pending rubric", async () => {
    await seedRubric();
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /rubrics/i }));
    await screen.findByTestId("rubric-review-page");

    fireEvent.click(await screen.findByTestId("rubric-reject-RB1"));

    await screen.findByText("No rubrics in this queue.");
    expect((await db.rubrics.get("RB1"))?.status).toBe("rejected");
  });

  it("edits a pending rubric's text and category before approving", async () => {
    await seedRubric();
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /rubrics/i }));
    await screen.findByTestId("rubric-review-page");

    fireEvent.click(await screen.findByTestId("rubric-edit-RB1"));
    const textarea = await screen.findByTestId("rubric-edit-textarea-RB1");
    fireEvent.change(textarea, { target: { value: "Edited rubric text" } });
    fireEvent.click(screen.getByText("Save"));

    await screen.findByText("Edited rubric text");
    expect((await db.rubrics.get("RB1"))?.text).toBe("Edited rubric text");
  });

  it("pins and unpins a rubric", async () => {
    await seedRubric();
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /rubrics/i }));
    await screen.findByTestId("rubric-review-page");

    fireEvent.click(await screen.findByTestId("rubric-pin-RB1"));
    await vi.waitFor(async () => {
      expect((await db.rubrics.get("RB1"))?.pinned).toBe(true);
    });
  });

  it("soft-deletes a rubric, removing it from the queue", async () => {
    await seedRubric();
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /rubrics/i }));
    await screen.findByTestId("rubric-review-page");

    fireEvent.click(await screen.findByTestId("rubric-delete-RB1"));

    await screen.findByText("No rubrics in this queue.");
    expect((await db.rubrics.get("RB1"))?.deletedAt).toBeTruthy();
  });

  it("undoes an approved rubric back to pending", async () => {
    await seedRubric({ status: "approved", decidedAt: new Date().toISOString() });
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /rubrics/i }));
    await screen.findByTestId("rubric-review-page");

    fireEvent.click(await screen.findByText("Approved (1)"));
    fireEvent.click(await screen.findByTestId("rubric-undo-RB1"));

    await screen.findByText("No rubrics in this queue.");
    expect((await db.rubrics.get("RB1"))?.status).toBe("pending");
  });

  it("bulk-approves multiple selected pending rubrics", async () => {
    await seedRubric({ id: "RB1", text: "First" });
    await seedRubric({ id: "RB2", text: "Second" });
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /rubrics/i }));
    await screen.findByTestId("rubric-review-page");

    fireEvent.click(await screen.findByTestId("rubrics-select-all"));
    fireEvent.click(await screen.findByTestId("rubrics-bulk-approve"));

    await screen.findByText("No rubrics in this queue.", {}, { timeout: 5000 });
    expect((await db.rubrics.get("RB1"))?.status).toBe("approved");
    expect((await db.rubrics.get("RB2"))?.status).toBe("approved");
  }, 10000);

  it("merges two selected rubrics into one, soft-deleting the originals", async () => {
    await seedRubric({ id: "RB1", text: "Worse from cold", status: "approved", decidedAt: new Date().toISOString() });
    await seedRubric({ id: "RB2", text: "Worse from damp", status: "approved", decidedAt: new Date().toISOString() });
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /rubrics/i }));
    await screen.findByTestId("rubric-review-page");
    fireEvent.click(await screen.findByText("Approved (2)"));

    fireEvent.click(await screen.findByTestId("rubric-select-RB1"));
    fireEvent.click(await screen.findByTestId("rubric-select-RB2"));
    fireEvent.click(await screen.findByTestId("rubric-merge-start"));

    const mergeText = await screen.findByTestId("rubric-merge-text");
    fireEvent.change(mergeText, { target: { value: "Worse from cold and damp" } });
    fireEvent.click(screen.getByTestId("rubric-merge-confirm"));

    await vi.waitFor(async () => {
      expect(await db.rubrics.get("RB1")).toMatchObject({ deletedAt: expect.any(Number) });
    });
    const all = await db.rubrics.toArray();
    const mergedRow = all.find((r) => r.text === "Worse from cold and damp");
    expect(mergedRow?.mergedFromIds).toEqual(["RB1", "RB2"]);
  });

  it("splits an approved rubric into two new rubrics", async () => {
    await seedRubric({ id: "RB1", text: "Anxious, forsaken feeling", status: "approved", decidedAt: new Date().toISOString() });
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /rubrics/i }));
    await screen.findByTestId("rubric-review-page");
    fireEvent.click(await screen.findByText("Approved (1)"));

    fireEvent.click(await screen.findByTestId("rubric-split-RB1"));
    const secondPartInput = await screen.findByTestId("rubric-split-text-1");
    fireEvent.change(secondPartInput, { target: { value: "Forsaken feeling" } });
    fireEvent.click(screen.getByTestId("rubric-split-confirm"));

    await vi.waitFor(async () => {
      expect(await db.rubrics.get("RB1")).toMatchObject({ deletedAt: expect.any(Number) });
    });
    const all = await db.rubrics.toArray();
    const splitRows = all.filter((r) => r.splitFromId === "RB1");
    expect(splitRows).toHaveLength(2);
  });

  it("searches rubrics by text, bypassing the status tabs", async () => {
    await seedRubric({ id: "RB1", text: "Anxiety about health" });
    await seedRubric({ id: "RB2", text: "Worse from cold", category: "modalities" });
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /rubrics/i }));
    await screen.findByTestId("rubric-review-page");

    fireEvent.change(screen.getByTestId("rubric-search-input"), { target: { value: "cold" } });

    // Both rubrics are already visible pre-search (both pending) --
    // "Worse from cold" being present proves nothing about whether the
    // async search actually ran. Wait for the non-matching row to
    // disappear instead, which only happens once searchResults replaces
    // the unfiltered pending-tab list.
    await vi.waitFor(() => {
      expect(screen.queryByText("Anxiety about health")).not.toBeInTheDocument();
      expect(screen.queryByText("Worse from cold")).toBeInTheDocument();
    });
  });
});

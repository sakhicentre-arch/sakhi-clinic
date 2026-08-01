import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { indexedDB as fakeIndexedDB } from "fake-indexeddb";

/**
 * Phase 2 — Reminder Engine.
 *
 * openWhatsApp is mocked (not exercised for real) so these tests assert on
 * the Reminder Engine's own state machine and history-recording behaviour,
 * not on WhatsApp's window/URL handling -- that's already covered by
 * whatsappService's own scope. reminderDeliveryService.ts is the seam:
 * it's the only file in this suite that imports openWhatsApp.
 */
vi.mock("../../services/whatsappService", () => ({
  openWhatsApp: vi.fn(() => true),
}));

const DB_NAME = "SakhiClinicDB";
const REF = new Date("2026-03-15T12:00:00.000Z");

async function resetDatabase() {
  await new Promise<void>((resolve, reject) => {
    const req = fakeIndexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

let db: typeof import("../../services/db").db;
let queueSvc: typeof import("../../services/reminderQueueService");
let deliverySvc: typeof import("../../services/reminderDeliveryService");
let schedulerSvc: typeof import("../../services/reminderSchedulerService");
let maintenanceSvc: typeof import("../../services/reminderMaintenanceService");
let analyticsSvc: typeof import("../../services/reminderAnalyticsService");
let whatsappMock: typeof import("../../services/whatsappService");

async function seedPatient(overrides: Record<string, any>) {
  await db.patients.add({
    id: overrides.id,
    name: overrides.name,
    gender: "Female",
    phone: overrides.phone ?? "9876543210",
    nextFollowUpDate: overrides.nextFollowUpDate,
    lastVisit: overrides.lastVisit,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  } as any);
}

async function seedConsultation(overrides: Record<string, any>) {
  await db.consultations.add({
    id: overrides.id,
    patientId: overrides.patientId,
    date: overrides.date,
    clinicId: "Dabholi",
    chiefComplaint: "Test complaint",
    caseText: "",
    followUpDate: overrides.followUpDate,
  } as any);
}

describe("Reminder Engine (Phase 2)", () => {
  beforeEach(async () => {
    vi.resetModules();
    await resetDatabase();
    const dbModule = await import("../../services/db");
    db = dbModule.db;
    await db.open();
    queueSvc = await import("../../services/reminderQueueService");
    deliverySvc = await import("../../services/reminderDeliveryService");
    schedulerSvc = await import("../../services/reminderSchedulerService");
    maintenanceSvc = await import("../../services/reminderMaintenanceService");
    analyticsSvc = await import("../../services/reminderAnalyticsService");
    whatsappMock = await import("../../services/whatsappService");
    vi.mocked(whatsappMock.openWhatsApp).mockReset().mockReturnValue(true);
  });

  afterEach(async () => {
    db.close();
    await resetDatabase();
  });

  describe("Queue management", () => {
    it("enqueues a reminder in pending status", async () => {
      const entry = await queueSvc.enqueueReminder({
        patientId: "P1", patientName: "Test Patient", phone: "9000000000",
        type: "follow_up", message: "Hello", dueAt: REF.toISOString(),
      });
      expect(entry.status).toBe("pending");
      expect(entry.retryCount).toBe(0);

      const pending = await queueSvc.listRemindersByStatus("pending");
      expect(pending).toHaveLength(1);
    });

    it("moves through approve -> the queue reflects the new status", async () => {
      const entry = await queueSvc.enqueueReminder({
        patientId: "P1", patientName: "Test Patient", phone: "9000000000",
        type: "follow_up", message: "Hello", dueAt: REF.toISOString(),
      });
      await queueSvc.approveReminder(entry.id);

      expect(await queueSvc.listRemindersByStatus("pending")).toHaveLength(0);
      expect(await queueSvc.listRemindersByStatus("approved")).toHaveLength(1);
    });

    it("rejects and cancels move to their respective terminal statuses", async () => {
      const a = await queueSvc.enqueueReminder({ patientId: "P1", patientName: "A", type: "follow_up", message: "m", dueAt: REF.toISOString() });
      const b = await queueSvc.enqueueReminder({ patientId: "P2", patientName: "B", type: "follow_up", message: "m", dueAt: REF.toISOString() });

      await queueSvc.rejectReminder(a.id);
      await queueSvc.approveReminder(b.id);
      await queueSvc.cancelReminder(b.id);

      expect((await queueSvc.getReminderById(a.id))?.status).toBe("rejected");
      expect((await queueSvc.getReminderById(b.id))?.status).toBe("cancelled");
    });

    it("hasActiveReminder is true only for pending/approved, not for terminal states", async () => {
      const entry = await queueSvc.enqueueReminder({ patientId: "P1", patientName: "A", type: "follow_up", message: "m", dueAt: REF.toISOString() });
      expect(await queueSvc.hasActiveReminder("P1", "follow_up")).toBe(true);

      await queueSvc.rejectReminder(entry.id);
      expect(await queueSvc.hasActiveReminder("P1", "follow_up")).toBe(false);
    });
  });

  describe("Delivery tracking", () => {
    it("refuses to send a reminder that has not been approved", async () => {
      const entry = await queueSvc.enqueueReminder({
        patientId: "P1", patientName: "Test Patient", phone: "9000000000",
        type: "follow_up", message: "Hello", dueAt: REF.toISOString(),
      });

      const result = await deliverySvc.sendReminder(entry.id);
      expect(result.ok).toBe(false);
      expect(whatsappMock.openWhatsApp).not.toHaveBeenCalled();
      expect((await queueSvc.getReminderById(entry.id))?.status).toBe("pending");
    });

    it("sends an approved reminder, records history, and marks it sent", async () => {
      const entry = await queueSvc.enqueueReminder({
        patientId: "P1", patientName: "Test Patient", phone: "9000000000",
        type: "follow_up", message: "Hello", dueAt: REF.toISOString(),
      });
      await queueSvc.approveReminder(entry.id);

      const result = await deliverySvc.sendReminder(entry.id);
      expect(result.ok).toBe(true);
      expect(whatsappMock.openWhatsApp).toHaveBeenCalledWith({ phone: "9000000000", message: "Hello" });

      expect((await queueSvc.getReminderById(entry.id))?.status).toBe("sent");
      const history = await deliverySvc.getPatientReminderHistory("P1");
      expect(history).toHaveLength(1);
      expect(history[0].action).toBe("sent");
    });

    it("marks a reminder failed and records the reason when there is no phone number", async () => {
      const entry = await queueSvc.enqueueReminder({
        patientId: "P1", patientName: "No Phone Patient",
        type: "follow_up", message: "Hello", dueAt: REF.toISOString(),
      });
      await queueSvc.approveReminder(entry.id);

      const result = await deliverySvc.sendReminder(entry.id);
      expect(result.ok).toBe(false);
      expect((await queueSvc.getReminderById(entry.id))?.status).toBe("failed");

      const history = await deliverySvc.getPatientReminderHistory("P1");
      expect(history[0].action).toBe("failed");
      expect(history[0].note).toMatch(/no phone/i);
    });

    it("marks a reminder failed when the WhatsApp open attempt itself fails", async () => {
      vi.mocked(whatsappMock.openWhatsApp).mockReturnValue(false);

      const entry = await queueSvc.enqueueReminder({
        patientId: "P1", patientName: "Test Patient", phone: "9000000000",
        type: "follow_up", message: "Hello", dueAt: REF.toISOString(),
      });
      await queueSvc.approveReminder(entry.id);

      const result = await deliverySvc.sendReminder(entry.id);
      expect(result.ok).toBe(false);
      expect((await queueSvc.getReminderById(entry.id))?.status).toBe("failed");
    });

    it("resend moves a failed reminder back through approved to sent", async () => {
      const entry = await queueSvc.enqueueReminder({
        patientId: "P1", patientName: "Test Patient",
        type: "follow_up", message: "Hello", dueAt: REF.toISOString(),
      });
      await queueSvc.approveReminder(entry.id);
      await deliverySvc.sendReminder(entry.id); // fails: no phone
      expect((await queueSvc.getReminderById(entry.id))?.status).toBe("failed");

      // Fix the phone directly (simulating the doctor updating the record) then resend.
      await db.reminderQueue.update(entry.id, { phone: "9000000000" });
      const result = await deliverySvc.resendReminder(entry.id);
      expect(result.ok).toBe(true);
      expect((await queueSvc.getReminderById(entry.id))?.status).toBe("sent");

      const history = await deliverySvc.getPatientReminderHistory("P1");
      expect(history).toHaveLength(2); // one failed, one sent
    });
  });

  describe("Retries (reminderMaintenanceService)", () => {
    it("returns failed reminders to pending, incrementing retryCount", async () => {
      const entry = await queueSvc.enqueueReminder({
        patientId: "P1", patientName: "Test Patient",
        type: "follow_up", message: "Hello", dueAt: REF.toISOString(),
      });
      await queueSvc.approveReminder(entry.id);
      await deliverySvc.sendReminder(entry.id); // fails: no phone

      const retried = await maintenanceSvc.retryFailedReminders(3);
      expect(retried).toBe(1);

      const updated = await queueSvc.getReminderById(entry.id);
      expect(updated?.status).toBe("pending");
      expect(updated?.retryCount).toBe(1);
    });

    it("stops retrying once a reminder reaches the max retry count", async () => {
      const entry = await queueSvc.enqueueReminder({
        patientId: "P1", patientName: "Test Patient",
        type: "follow_up", message: "Hello", dueAt: REF.toISOString(),
      });
      await db.reminderQueue.update(entry.id, { status: "failed", retryCount: 3 });

      const retried = await maintenanceSvc.retryFailedReminders(3);
      expect(retried).toBe(0);
      expect((await queueSvc.getReminderById(entry.id))?.status).toBe("failed");
    });

    it("retrying never sends anything -- it only re-queues for doctor approval", async () => {
      const entry = await queueSvc.enqueueReminder({
        patientId: "P1", patientName: "Test Patient", phone: "9000000000",
        type: "follow_up", message: "Hello", dueAt: REF.toISOString(),
      });
      await db.reminderQueue.update(entry.id, { status: "failed" });

      await maintenanceSvc.retryFailedReminders(3);
      expect(whatsappMock.openWhatsApp).not.toHaveBeenCalled();
    });
  });

  describe("Scheduling (reminderSchedulerService, reuses followUpIntelligenceService)", () => {
    it("schedules a reminder for an overdue patient with a phone number", async () => {
      await seedPatient({ id: "P-OVERDUE", name: "Overdue Patient", nextFollowUpDate: "2026-03-10" });
      await seedConsultation({ id: "C1", patientId: "P-OVERDUE", date: "2026-02-10" });

      const created = await schedulerSvc.scheduleFollowUpReminders(REF);
      expect(created).toHaveLength(1);
      expect(created[0].patientId).toBe("P-OVERDUE");
      expect(created[0].type).toBe("follow_up");
      expect(created[0].message).toContain("Overdue Patient");
    });

    it("does not schedule for a patient without a phone number", async () => {
      await seedPatient({ id: "P-NOPHONE", name: "No Phone", nextFollowUpDate: "2026-03-10", phone: "" });
      await seedConsultation({ id: "C1", patientId: "P-NOPHONE", date: "2026-02-10" });

      const created = await schedulerSvc.scheduleFollowUpReminders(REF);
      expect(created).toHaveLength(0);
    });

    it("is idempotent -- calling it twice does not double-queue the same patient", async () => {
      await seedPatient({ id: "P-OVERDUE", name: "Overdue Patient", nextFollowUpDate: "2026-03-10" });
      await seedConsultation({ id: "C1", patientId: "P-OVERDUE", date: "2026-02-10" });

      await schedulerSvc.scheduleFollowUpReminders(REF);
      const secondRun = await schedulerSvc.scheduleFollowUpReminders(REF);

      expect(secondRun).toHaveLength(0);
      const all = await queueSvc.listRemindersByStatus("pending");
      expect(all.filter((r) => r.patientId === "P-OVERDUE")).toHaveLength(1);
    });

    it("does not schedule for patients in the 'today' bucket boundary correctly (uses real bucket data, not raw dates)", async () => {
      await seedPatient({ id: "P-FAR", name: "Far Future", nextFollowUpDate: "2026-04-15" });
      await seedConsultation({ id: "C1", patientId: "P-FAR", date: "2026-02-10" });

      const created = await schedulerSvc.scheduleFollowUpReminders(REF);
      expect(created.find((r) => r.patientId === "P-FAR")).toBeUndefined();
    });
  });

  describe("Analytics", () => {
    it("aggregates counts by status and computes send success rate", async () => {
      const a = await queueSvc.enqueueReminder({ patientId: "P1", patientName: "A", phone: "9000000000", type: "follow_up", message: "m", dueAt: REF.toISOString() });
      await queueSvc.approveReminder(a.id);
      await deliverySvc.sendReminder(a.id); // sent

      const b = await queueSvc.enqueueReminder({ patientId: "P2", patientName: "B", type: "follow_up", message: "m", dueAt: REF.toISOString() });
      await queueSvc.approveReminder(b.id);
      await deliverySvc.sendReminder(b.id); // failed: no phone

      await queueSvc.enqueueReminder({ patientId: "P3", patientName: "C", type: "follow_up", message: "m", dueAt: REF.toISOString() }); // pending

      const analytics = await analyticsSvc.getReminderAnalytics(REF);
      expect(analytics.countsByStatus.sent).toBe(1);
      expect(analytics.countsByStatus.failed).toBe(1);
      expect(analytics.countsByStatus.pending).toBe(1);
      expect(analytics.deliverySuccessRate).toBe(50);
      expect(analytics.totalQueued).toBe(3);
    });
  });
});

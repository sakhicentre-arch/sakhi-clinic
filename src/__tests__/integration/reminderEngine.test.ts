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

    it("listRemindersByPatient returns only that patient's reminders, most recently updated first", async () => {
      const a = await queueSvc.enqueueReminder({ patientId: "P1", patientName: "A", type: "follow_up", message: "first", dueAt: REF.toISOString() });
      const b = await queueSvc.enqueueReminder({ patientId: "P1", patientName: "A", type: "custom", message: "second", dueAt: REF.toISOString() });
      await queueSvc.enqueueReminder({ patientId: "P2", patientName: "Other Patient", type: "follow_up", message: "not this patient", dueAt: REF.toISOString() });

      await queueSvc.approveReminder(b.id); // bumps b's updatedAt after a's

      const rows = await queueSvc.listRemindersByPatient("P1");
      expect(rows.map((r) => r.id)).toEqual([b.id, a.id]);
      expect(rows.every((r) => r.patientId === "P1")).toBe(true);
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

  describe("Appointment reminder scheduling (reminderSchedulerService, reuses appointmentService)", () => {
    const TODAY_REF = new Date("2026-08-08T09:00:00");

    // appointmentService.getAll() internally calls markOverdueAppointmentsMissed(),
    // which reads new Date() directly (the REAL clock, not any reference-date
    // parameter) to decide which appointments are "missed". Faking the
    // system clock to TODAY_REF keeps that call in agreement with this
    // suite's own reference date regardless of when the suite actually
    // runs -- without this, an appointment dated "today" here could be
    // marked "missed" (and correctly excluded as reminder-ineligible) by
    // the real wall-clock date on a different day, making these tests
    // non-deterministic.
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(TODAY_REF);
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    async function seedAppointment(overrides: Record<string, any>) {
      await db.appointments.add({
        id: overrides.id,
        patientId: overrides.patientId,
        patientName: overrides.patientName ?? "Test Patient",
        clinic: overrides.clinic ?? "Dabholi",
        date: overrides.date,
        time: overrides.time ?? "10:30",
        type: "scheduled",
        status: overrides.status ?? "booked",
      } as any);
    }

    it("getTodayAppointmentReminderCandidates returns only today's reminderable appointments, earliest first", async () => {
      await seedPatient({ id: "P1", name: "Asha", phone: "9876543210" });
      await seedAppointment({ id: "A1", patientId: "P1", date: "2026-08-08", time: "11:00" });
      await seedPatient({ id: "P2", name: "Bela", phone: "9876500000" });
      await seedAppointment({ id: "A2", patientId: "P2", date: "2026-08-08", time: "09:30" });
      await seedPatient({ id: "P3", name: "Cara", phone: "9876511111" });
      await seedAppointment({ id: "A3", patientId: "P3", date: "2026-08-09", time: "10:00" }); // tomorrow -- excluded
      await seedAppointment({ id: "A4", patientId: "P1", date: "2026-08-08", time: "12:00", status: "cancelled" }); // cancelled -- excluded

      const candidates = await schedulerSvc.getTodayAppointmentReminderCandidates(TODAY_REF);
      expect(candidates.map((c) => c.appointmentId)).toEqual(["A2", "A1"]);
    });

    it("does not surface a cancelled, done, or missed appointment as reminder-eligible", async () => {
      await seedPatient({ id: "P1", name: "Asha", phone: "9876543210" });
      await seedAppointment({ id: "A1", patientId: "P1", date: "2026-08-08", time: "11:00", status: "cancelled" });
      await seedAppointment({ id: "A2", patientId: "P1", date: "2026-08-08", time: "12:00", status: "done" });
      await seedAppointment({ id: "A3", patientId: "P1", date: "2026-08-08", time: "13:00", status: "missed" });

      const candidates = await schedulerSvc.getTodayAppointmentReminderCandidates(TODAY_REF);
      expect(candidates).toHaveLength(0);
    });

    it("queues a message per candidate containing patient name, date/time, and clinic -- the one canonical appointment template", async () => {
      await seedPatient({ id: "P1", name: "Asha", phone: "9876543210" });
      await seedAppointment({ id: "A1", patientId: "P1", patientName: "Asha", date: "2026-08-08", time: "11:00", clinic: "Dabholi" });
      const candidates = await schedulerSvc.getTodayAppointmentReminderCandidates(TODAY_REF);

      const result = await schedulerSvc.queueAppointmentReminders(candidates, TODAY_REF);
      expect(result.queued).toHaveLength(1);
      expect(result.queued[0].type).toBe("appointment");
      expect(result.queued[0].message).toContain("Asha");
      expect(result.queued[0].message).toContain("11:00");
      expect(result.queued[0].message).toContain("Dabholi");
    });

    it("skips (and counts) a patient with no phone on file rather than queueing a dead-end reminder", async () => {
      await seedPatient({ id: "P1", name: "No Phone", phone: "" });
      await seedAppointment({ id: "A1", patientId: "P1", date: "2026-08-08", time: "11:00" });

      const candidates = await schedulerSvc.getTodayAppointmentReminderCandidates(TODAY_REF);
      const result = await schedulerSvc.queueAppointmentReminders(candidates, TODAY_REF);
      expect(result.queued).toHaveLength(0);
      expect(result.skippedNoPhone).toBe(1);
    });

    it("DUPLICATE TEST: generating twice queues exactly one active reminder; after it is sent, generating again is explicitly permitted by the existing policy", async () => {
      await seedPatient({ id: "P1", name: "Asha", phone: "9876543210" });
      await seedAppointment({ id: "A1", patientId: "P1", date: "2026-08-08", time: "11:00" });

      // Generate once.
      const first = await schedulerSvc.queueAppointmentReminders(
        await schedulerSvc.getTodayAppointmentReminderCandidates(TODAY_REF),
        TODAY_REF
      );
      expect(first.queued).toHaveLength(1);

      // Generate again -- must not double-queue (same hasActiveReminder guard scheduleFollowUpReminders uses).
      const second = await schedulerSvc.queueAppointmentReminders(
        await schedulerSvc.getTodayAppointmentReminderCandidates(TODAY_REF),
        TODAY_REF
      );
      expect(second.queued).toHaveLength(0);
      expect(second.skippedDuplicate).toBe(1);

      const active = (await queueSvc.listRemindersByStatus("pending")).filter((r) => r.type === "appointment");
      expect(active).toHaveLength(1); // exactly one active reminder exists

      // Approve and send it.
      await queueSvc.approveReminder(first.queued[0].id);
      const sendResult = await deliverySvc.sendReminder(first.queued[0].id);
      expect(sendResult.ok).toBe(true);
      expect((await queueSvc.getReminderById(first.queued[0].id))?.status).toBe("sent");

      // Generate again after send: hasActiveReminder only checks
      // pending/approved, so nothing is "active" anymore -- the existing
      // reminder policy explicitly permits a new one here (this mirrors
      // scheduleFollowUpReminders' own established behavior, not a new rule).
      const third = await schedulerSvc.queueAppointmentReminders(
        await schedulerSvc.getTodayAppointmentReminderCandidates(TODAY_REF),
        TODAY_REF
      );
      expect(third.queued).toHaveLength(1);
    });

    it("a patient with two live appointments gets an independent reminder for each -- one being queued does not block the other", async () => {
      await seedPatient({ id: "P1", name: "Asha", phone: "9876543210" });
      await seedAppointment({ id: "A1", patientId: "P1", date: "2026-08-08", time: "09:00" });
      await seedAppointment({ id: "A2", patientId: "P1", date: "2026-08-08", time: "15:00" });

      const result = await schedulerSvc.queueAppointmentReminders(
        await schedulerSvc.getTodayAppointmentReminderCandidates(TODAY_REF),
        TODAY_REF
      );

      // Both appointments must be queued -- previously the second was
      // silently swallowed as a false "duplicate" because the guard only
      // checked (patientId, type), not the specific appointment.
      expect(result.queued).toHaveLength(2);
      expect(result.skippedDuplicate).toBe(0);
      expect(result.queued.map((r) => r.sourceRef).sort()).toEqual(["appointment:A1", "appointment:A2"]);

      // Re-queueing must still be idempotent per-appointment, not globally.
      const again = await schedulerSvc.queueAppointmentReminders(
        await schedulerSvc.getTodayAppointmentReminderCandidates(TODAY_REF),
        TODAY_REF
      );
      expect(again.queued).toHaveLength(0);
      expect(again.skippedDuplicate).toBe(2);
    });

    it("a failed send is recorded and does not count as an active reminder, so generating again is allowed", async () => {
      await seedPatient({ id: "P1", name: "No Phone At Send Time", phone: "9876543210" });
      await seedAppointment({ id: "A1", patientId: "P1", date: "2026-08-08", time: "11:00" });

      const first = await schedulerSvc.queueAppointmentReminders(
        await schedulerSvc.getTodayAppointmentReminderCandidates(TODAY_REF),
        TODAY_REF
      );
      await queueSvc.approveReminder(first.queued[0].id);
      // Simulate the phone becoming invalid between queueing and sending.
      await db.reminderQueue.update(first.queued[0].id, { phone: undefined });
      const sendResult = await deliverySvc.sendReminder(first.queued[0].id);
      expect(sendResult.ok).toBe(false);
      expect((await queueSvc.getReminderById(first.queued[0].id))?.status).toBe("failed");

      const second = await schedulerSvc.queueAppointmentReminders(
        await schedulerSvc.getTodayAppointmentReminderCandidates(TODAY_REF),
        TODAY_REF
      );
      expect(second.queued).toHaveLength(1); // failed is not "active" -- a fresh one is queueable
    });

    describe("This Week grouping (rolling 7-day window starting tomorrow)", () => {
      it("groups appointments by calendar day, tomorrow through +7 days, excluding today and day+8", async () => {
        await seedPatient({ id: "P1", name: "Asha", phone: "9876543210" });
        await seedAppointment({ id: "A-TODAY", patientId: "P1", date: "2026-08-08", time: "09:00" });
        await seedPatient({ id: "P2", name: "Bela", phone: "9876500000" });
        await seedAppointment({ id: "A-TOM", patientId: "P2", date: "2026-08-09", time: "09:00" });
        await seedPatient({ id: "P3", name: "Cara", phone: "9876511111" });
        await seedAppointment({ id: "A-LASTDAY", patientId: "P3", date: "2026-08-15", time: "09:00" });
        await seedPatient({ id: "P4", name: "Dia", phone: "9876522222" });
        await seedAppointment({ id: "A-NEXTWEEK", patientId: "P4", date: "2026-08-16", time: "09:00" });

        const groups = await schedulerSvc.getThisWeekAppointmentReminderGroups(TODAY_REF);
        expect(groups).toHaveLength(7);
        expect(groups[0].date).toBe("2026-08-09");
        expect(groups[6].date).toBe("2026-08-15");
        expect(groups.flatMap((g) => g.candidates.map((c) => c.appointmentId))).toEqual(["A-TOM", "A-LASTDAY"]);
      });

      it("queueAppointmentReminders across a whole week's groups queues one reminder per eligible patient", async () => {
        await seedPatient({ id: "P1", name: "Asha", phone: "9876543210" });
        await seedAppointment({ id: "A1", patientId: "P1", patientName: "Asha", date: "2026-08-10", time: "09:00" });
        await seedPatient({ id: "P2", name: "Bela", phone: "9876500000" });
        await seedAppointment({ id: "A2", patientId: "P2", date: "2026-08-12", time: "09:00" });

        const groups = await schedulerSvc.getThisWeekAppointmentReminderGroups(TODAY_REF);
        const result = await schedulerSvc.queueAppointmentReminders(groups.flatMap((g) => g.candidates), TODAY_REF);
        expect(result.queued).toHaveLength(2);
        expect(result.queued.every((r) => r.type === "appointment")).toBe(true);
        // A reminder queued for a future day must not say "today".
        expect(result.queued.find((r) => r.patientName === "Asha")?.message).not.toMatch(/is today/i);
      });
    });

    describe("Date/time correctness (no UTC/IST shift)", () => {
      it.each([
        { label: "today", ref: "2026-08-08T09:00:00", apptDate: "2026-08-08", inToday: true },
        { label: "tomorrow", ref: "2026-08-08T09:00:00", apptDate: "2026-08-09", inToday: false },
        { label: "last day of the 7-day window", ref: "2026-08-08T09:00:00", apptDate: "2026-08-15", inToday: false },
        { label: "next week (day+8, outside the window)", ref: "2026-08-08T09:00:00", apptDate: "2026-08-16", inToday: false },
        { label: "month boundary", ref: "2026-08-28T09:00:00", apptDate: "2026-09-02", inToday: false },
        { label: "year boundary", ref: "2026-12-28T09:00:00", apptDate: "2027-01-02", inToday: false },
      ])("$label: classified correctly relative to reference date, date string never shifted by a day", async ({ ref, apptDate, inToday }) => {
        const refDate = new Date(ref);
        vi.setSystemTime(refDate); // override this describe's default TODAY_REF for this case

        const patientId = `P-${apptDate}`;
        await seedPatient({ id: patientId, name: "Test Patient", phone: "9876543210" });
        await seedAppointment({ id: `A-${apptDate}`, patientId, date: apptDate, time: "10:00" });

        const todayCandidates = await schedulerSvc.getTodayAppointmentReminderCandidates(refDate);
        expect(todayCandidates.some((c) => c.patientId === patientId)).toBe(inToday);

        // If it shows up in the week grouping, its date string must be
        // byte-identical to what was stored -- proof no UTC/IST re-parsing
        // shifted the calendar date.
        const weekGroups = await schedulerSvc.getThisWeekAppointmentReminderGroups(refDate);
        const found = weekGroups.flatMap((g) => g.candidates).find((c) => c.patientId === patientId);
        if (found) expect(found.date).toBe(apptDate);
      });
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

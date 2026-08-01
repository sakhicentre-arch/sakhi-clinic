import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * Module A — atomic appointment slot booking.
 *
 * The default test setup (src/__tests__/setup.ts) stubs `indexedDB` with a
 * no-op object whose open() handlers are never invoked, so Dexie can never
 * actually open a database against it -- no existing test exercises the real
 * db.ts/appointmentService.ts write path. `fake-indexeddb/auto` replaces the
 * global with a real, spec-compliant in-memory implementation for THIS file
 * only (Vitest isolates modules per test file by default), which is what
 * makes a genuine concurrency test possible.
 *
 * db.ts/appointmentService.ts must be imported dynamically, after the
 * fake-indexeddb globals are installed, since Dexie reads `indexedDB` at
 * module-evaluation time.
 */

let db: typeof import("../../services/db").db;
let appointmentService: typeof import("../../services/appointmentService").appointmentService;

const clinic = "Dabholi" as const;

const baseAppointment = (id: string, patientId: string) => ({
  id,
  patientId,
  patientName: `Patient ${patientId}`,
  clinic,
  date: "2026-08-15",
  time: "10:30",
  type: "scheduled" as const,
  status: "booked" as const,
});

describe("Module A — atomic appointment slot booking", () => {
  beforeEach(async () => {
    const dbModule = await import("../../services/db");
    const serviceModule = await import("../../services/appointmentService");
    db = dbModule.db;
    appointmentService = serviceModule.appointmentService;
    await db.appointments.clear();
  });

  afterEach(async () => {
    await db.appointments.clear();
  });

  it("rejects a normal (non-concurrent) duplicate booking for the same slot", async () => {
    const first = await appointmentService.createAppointment(baseAppointment("A1", "P1"));
    expect(first).toBe(true);

    await expect(
      appointmentService.createAppointment(baseAppointment("A2", "P2"))
    ).rejects.toThrow(/slot was just taken/i);

    const rows = await db.appointments
      .where("[date+time+clinic]")
      .equals(["2026-08-15", "10:30", clinic])
      .toArray();
    expect(rows).toHaveLength(1);
  });

  it("under concurrent double-booking, exactly one of two simultaneous requests succeeds", async () => {
    // Two requests for the identical slot fired without awaiting between them,
    // simulating two near-simultaneous bookings. Before the fix, checkDuplicate()
    // ran in its own implicit transaction, separate from the insert, so both
    // could read "no duplicate" before either had written -- both would then
    // insert. The fix moves the check inside the same rw transaction as the
    // insert; IndexedDB serializes concurrent rw transactions on a store, so
    // only one call can observe an empty result for the check.
    const results = await Promise.allSettled([
      appointmentService.createAppointment(baseAppointment("B1", "P1")),
      appointmentService.createAppointment(baseAppointment("B2", "P2")),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled" && r.value === true);
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason.message).toMatch(/slot was just taken/i);

    const rows = await db.appointments
      .where("[date+time+clinic]")
      .equals(["2026-08-15", "10:30", clinic])
      .toArray();
    expect(rows).toHaveLength(1);
  });

  it("allows two walk-in appointments (type !== 'scheduled') at the same nominal time without a slot conflict", async () => {
    // Walk-ins are deliberately exempt from the slot-uniqueness check
    // (appointmentService.ts only checks duplicates when type === "scheduled").
    const a = await appointmentService.createAppointment({
      ...baseAppointment("C1", "P1"),
      type: "walk-in",
      status: "arrived",
    });
    const b = await appointmentService.createAppointment({
      ...baseAppointment("C2", "P2"),
      type: "walk-in",
      status: "arrived",
    });
    expect(a).toBe(true);
    expect(b).toBe(true);
  });

  it("still rejects a genuine id collision inside the same atomic transaction", async () => {
    await appointmentService.createAppointment(baseAppointment("D1", "P1"));
    await expect(
      appointmentService.createAppointment({
        ...baseAppointment("D1", "P2"),
        time: "11:00", // different slot, so only the id collision should fire
      })
    ).rejects.toThrow(/already exists/i);
  });
});

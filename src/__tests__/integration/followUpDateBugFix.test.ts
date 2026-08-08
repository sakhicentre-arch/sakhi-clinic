import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { indexedDB as fakeIndexedDB } from "fake-indexeddb";

/**
 * Regression suite for the doctor-reported follow-up date bug
 * (2026-08-08): a consultation dated 08/08/2026 with a next follow-up of
 * 10/08/2026 was immediately classified "Overdue Follow-up" / "Missed
 * Patient" and displayed as "01/08/2026".
 *
 * Root cause: ConsultationPage.tsx's follow-up date field was
 * `<input type="datetime-local">`. For a doctor in a timezone ahead of
 * UTC (e.g. IST, UTC+5:30), `new Date("2026-08-10T00:00").toISOString()`
 * (the old save-path conversion) produces "2026-08-09T18:30:00.000Z" -- a
 * full ISO datetime string instead of the bare "YYYY-MM-DD" the rest of
 * the domain layer (dateOnly.ts's parseDateOnly, followUpIntelligenceService.ts,
 * patientService.ts) expects for this field. parseDateOnly's naive
 * `.split("-").map(Number)` then read "09T18:30:00.000Z" as the day
 * component, got NaN, and its `d || 1` fallback silently substituted
 * day 1 -- "10/08/2026" became "01/08/2026", which is chronologically
 * BEFORE 08/08/2026 and so was classified overdue/missed.
 *
 * Fix: the follow-up date input is now `type="date"` (bare "YYYY-MM-DD"
 * throughout, matching the domain layer's existing convention), the
 * save path no longer round-trips it through new Date(...).toISOString(),
 * and parseDateOnly() itself now defends against a non-bare-date input
 * as a backstop for any already-corrupted historical data.
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

let db: typeof import("../../services/db").db;
let followUpIntel: typeof import("../../services/followUpIntelligenceService");
let followupEngine: typeof import("../../services/followupEngine");
let consultationService: typeof import("../../services/consultationService");
let dateOnly: typeof import("../../utils/dateOnly");

async function seedPatient(overrides: Record<string, any>) {
  await db.patients.add({
    id: overrides.id,
    name: overrides.name,
    gender: "Female",
    phone: overrides.phone || "9876543210",
    nextFollowUpDate: overrides.nextFollowUpDate,
    followUpCancelledDate: overrides.followUpCancelledDate,
    lastVisit: overrides.lastVisit,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  } as any);
}

async function seedConsultationRaw(overrides: Record<string, any>) {
  await db.consultations.add({
    id: overrides.id,
    patientId: overrides.patientId,
    date: overrides.date,
    clinicId: "Dabholi",
    chiefComplaint: "Test complaint",
    caseText: "",
    caseType: overrides.caseType,
    followUpDate: overrides.followUpDate,
    medicines: [],
    outcome: overrides.outcome,
  } as any);
}

beforeEach(async () => {
  vi.resetModules();
  await resetDatabase();
  const dbModule = await import("../../services/db");
  db = dbModule.db;
  await db.open();
  followUpIntel = await import("../../services/followUpIntelligenceService");
  followupEngine = await import("../../services/followupEngine");
  consultationService = await import("../../services/consultationService");
  dateOnly = await import("../../utils/dateOnly");
});

afterEach(async () => {
  vi.useRealTimers();
  db.close();
  await resetDatabase();
});

describe("STEP 3 -- deterministic reproduction of the doctor's exact scenario", () => {
  // Today = 08/08/2026. Consultation dated 08/08/2026. Next follow-up
  // set to 10/08/2026, entered through the now-fixed ConsultationPage.tsx
  // save path (a bare "YYYY-MM-DD" string, not a datetime-local round-trip).
  const TODAY = new Date("2026-08-08T09:00:00");

  it("persists 10/08/2026 verbatim and does not classify the patient as overdue or missed", async () => {
    await db.patients.add({
      id: "P-DOCTOR-REPRO",
      name: "Doctor Repro Patient",
      gender: "Female",
      phone: "9876500000",
      createdAt: "2026-08-08T00:00:00.000Z",
      updatedAt: "2026-08-08T00:00:00.000Z",
    } as any);

    const ok = await consultationService.saveConsultation({
      id: "C-DOCTOR-REPRO",
      patientId: "P-DOCTOR-REPRO",
      clinicId: "Dabholi",
      chiefComplaint: "Test complaint",
      caseText: "",
      medicines: [],
      date: "2026-08-08",
      followUpDate: "2026-08-10", // exactly what the fixed <input type="date"> now produces
      outcome: "FIRST_VISIT" as any,
    } as any);
    expect(ok).toBe(true);

    // 1. Persisted verbatim on the consultation record.
    const consultation = await db.consultations.get("C-DOCTOR-REPRO");
    expect(consultation?.followUpDate).toBe("2026-08-10");

    // 2. syncPatientFollowUp (run automatically inside saveConsultation)
    // propagated the SAME bare value onto Patient.nextFollowUpDate.
    const patient = await db.patients.get("P-DOCTOR-REPRO");
    expect(patient?.nextFollowUpDate).toBe("2026-08-10");

    // 3. "Overdue Follow-up" source (getFollowUpBuckets): must NOT be overdue.
    const buckets = await followUpIntel.getFollowUpBuckets(TODAY);
    expect(buckets.overdue.map((e) => e.patientId)).not.toContain("P-DOCTOR-REPRO");
    expect(buckets.upcoming7.map((e) => e.patientId)).toContain("P-DOCTOR-REPRO");
    const bucketEntry = buckets.upcoming7.find((e) => e.patientId === "P-DOCTOR-REPRO");
    expect(bucketEntry?.nextFollowUpDate).toBe("2026-08-10"); // exact displayed value

    // 4. "Missed Patient" source (getFollowUpHistory): must NOT be missed.
    const history = await followUpIntel.getFollowUpHistory(TODAY);
    const historyEntry = history.find((h) => h.consultationId === "C-DOCTOR-REPRO");
    expect(historyEntry?.status).toBe("pending");
    expect(historyEntry?.status).not.toBe("missed");

    // 5. followupEngine's independent alert source must agree.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(TODAY);
    const alerts = await followupEngine.getFollowUpAlerts();
    vi.useRealTimers();
    const ownAlert = alerts.find((a) => a.patientId === "P-DOCTOR-REPRO");
    expect(ownAlert?.type).not.toBe("OVERDUE");
  });

  it("proves the OLD bug mechanism is fixed: a malformed full-ISO followUpDate no longer collapses to the 1st of the month", async () => {
    // Simulates what the pre-fix datetime-local save path produced for an
    // IST doctor entering 10/08/2026 with no explicit time.
    const MALFORMED = "2026-08-09T18:30:00.000Z";

    await seedPatient({ id: "P-MALFORMED", name: "Malformed Value Patient", nextFollowUpDate: MALFORMED });
    await seedConsultationRaw({ id: "C-MALFORMED", patientId: "P-MALFORMED", date: "2026-08-08", followUpDate: MALFORMED });

    const due = dateOnly.startOfDay(dateOnly.parseDateOnly(MALFORMED));
    expect(due.getDate()).not.toBe(1); // the old bug's exact symptom

    const buckets = await followUpIntel.getFollowUpBuckets(TODAY);
    expect(buckets.overdue.map((e) => e.patientId)).not.toContain("P-MALFORMED");

    const history = await followUpIntel.getFollowUpHistory(TODAY);
    const entry = history.find((h) => h.consultationId === "C-MALFORMED");
    expect(entry?.status).not.toBe("missed");
  });
});

describe("STEP 4 -- full date-matrix classification (Cases A-I)", () => {
  const TODAY = new Date("2026-08-08T09:00:00");

  async function seedAndClassify(id: string, nextFollowUpDate: string) {
    await seedPatient({ id, name: id, nextFollowUpDate });
    await seedConsultationRaw({ id: `C-${id}`, patientId: id, date: "2026-07-01" });
    const buckets = await followUpIntel.getFollowUpBuckets(TODAY);
    const bucketOf = (Object.keys(buckets) as (keyof typeof buckets)[]).find((k) =>
      buckets[k].some((e) => e.patientId === id)
    );
    return bucketOf;
  }

  it("Case A: due today -> today bucket, not overdue", async () => {
    expect(await seedAndClassify("A", "2026-08-08")).toBe("today");
  });

  it("Case B: due tomorrow -> tomorrow bucket, upcoming", async () => {
    expect(await seedAndClassify("B", "2026-08-09")).toBe("tomorrow");
  });

  it("Case C: due in 2 days -> upcoming7 bucket", async () => {
    expect(await seedAndClassify("C", "2026-08-10")).toBe("upcoming7");
  });

  it("Case D: due yesterday -> overdue", async () => {
    expect(await seedAndClassify("D", "2026-08-07")).toBe("overdue");
  });

  it("Case E: due 30 days ago -> overdue", async () => {
    expect(await seedAndClassify("E", "2026-07-09")).toBe("overdue");
  });

  it("Case F: month boundary (31 Aug -> 1 Sep) -> upcoming, not overdue", async () => {
    // Relative to TODAY (8 Aug), 1 Sep is 24 days out -- beyond the 7-day
    // window, so it belongs in none of the near-term buckets, but it must
    // never land in overdue.
    const bucket = await seedAndClassify("F", "2026-09-01");
    expect(bucket).not.toBe("overdue");
  });

  it("Case G: year boundary (31 Dec 2026 -> 1 Jan 2027) -> upcoming, not overdue", async () => {
    const bucket = await seedAndClassify("G", "2027-01-01");
    expect(bucket).not.toBe("overdue");
  });

  it("Case H: leap year (29 Feb 2028) classified correctly relative to a Feb 2028 reference", async () => {
    const REF = new Date("2028-02-27T09:00:00");
    await seedPatient({ id: "H", name: "H", nextFollowUpDate: "2028-02-29" });
    await seedConsultationRaw({ id: "C-H", patientId: "H", date: "2028-01-01" });
    const buckets = await followUpIntel.getFollowUpBuckets(REF);
    expect(buckets.upcoming7.map((e) => e.patientId)).toContain("H");
    expect(buckets.overdue.map((e) => e.patientId)).not.toContain("H");
  });

  it("Case I: timezone/midnight boundary -- a clinical follow-up date is a DATE, not a moment; reference time-of-day must not shift the classification", async () => {
    await seedPatient({ id: "I", name: "I", nextFollowUpDate: "2026-08-09" });
    await seedConsultationRaw({ id: "C-I", patientId: "I", date: "2026-07-01" });

    const lateNight = await followUpIntel.getFollowUpBuckets(new Date("2026-08-08T23:59:00"));
    const earlyMorning = await followUpIntel.getFollowUpBuckets(new Date("2026-08-08T00:01:00"));

    const bucketOf = (buckets: typeof lateNight) =>
      (Object.keys(buckets) as (keyof typeof buckets)[]).find((k) => buckets[k].some((e) => e.patientId === "I"));

    expect(bucketOf(lateNight)).toBe("tomorrow");
    expect(bucketOf(earlyMorning)).toBe("tomorrow");
  });
});

describe("STEP 10 -- historical patient cross-date regression matrix", () => {
  const TODAY = new Date("2026-08-08T09:00:00");

  it.each([
    { followUp: "2026-08-01", expected: "overdue" },
    { followUp: "2026-08-07", expected: "overdue" },
    { followUp: "2026-08-08", expected: "today" },
    { followUp: "2026-08-09", expected: "tomorrow" },
    { followUp: "2026-08-10", expected: "upcoming7" },
    { followUp: "2026-08-31", expected: "none" }, // beyond the 7-day window, but never overdue
    { followUp: "2026-09-01", expected: "none" },
  ])("nextFollowUpDate=$followUp relative to 08/08/2026 -> $expected", async ({ followUp, expected }) => {
    const id = `HIST-${followUp}`;
    await db.patients.add({
      id, name: id, gender: "Female", phone: "9876500001",
      nextFollowUpDate: followUp,
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    } as any);
    await db.consultations.add({
      id: `C-${id}`, patientId: id, date: "2026-01-01", clinicId: "Dabholi",
      chiefComplaint: "Test", caseText: "", medicines: [],
    } as any);

    const buckets = await followUpIntel.getFollowUpBuckets(TODAY);
    const bucketOf = (Object.keys(buckets) as (keyof typeof buckets)[]).find((k) =>
      buckets[k].some((e) => e.patientId === id)
    );

    if (expected === "none") {
      expect(bucketOf).not.toBe("overdue");
      expect(["today", "tomorrow", "upcoming7"]).not.toContain(bucketOf);
    } else {
      expect(bucketOf).toBe(expected);
    }
  });
});

describe("Cross-engine agreement: followupEngine and followUpIntelligenceService must not disagree", () => {
  const TODAY = new Date("2026-08-08T09:00:00");

  afterEach(() => vi.useRealTimers());

  it("both classify a future follow-up as NOT overdue for the same patient", async () => {
    await seedPatient({ id: "P-AGREE-FUTURE", name: "Agree Future", nextFollowUpDate: "2026-08-10" });
    await seedConsultationRaw({ id: "C-AGREE-FUTURE", patientId: "P-AGREE-FUTURE", date: "2026-07-01" });

    const buckets = await followUpIntel.getFollowUpBuckets(TODAY);
    const bucketOverdue = buckets.overdue.some((e) => e.patientId === "P-AGREE-FUTURE");

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(TODAY);
    const alerts = await followupEngine.getFollowUpAlerts();
    vi.useRealTimers();
    const engineOverdue = alerts.find((a) => a.patientId === "P-AGREE-FUTURE")?.type === "OVERDUE";

    expect(bucketOverdue).toBe(false);
    expect(engineOverdue).toBe(false);
  });

  it("both classify a past follow-up as overdue for the same patient (positive case -- the fix must not break real overdue detection)", async () => {
    await seedPatient({ id: "P-AGREE-PAST", name: "Agree Past", nextFollowUpDate: "2026-08-01" });
    await seedConsultationRaw({ id: "C-AGREE-PAST", patientId: "P-AGREE-PAST", date: "2026-07-01" });

    const buckets = await followUpIntel.getFollowUpBuckets(TODAY);
    const bucketOverdue = buckets.overdue.some((e) => e.patientId === "P-AGREE-PAST");

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(TODAY);
    const alerts = await followupEngine.getFollowUpAlerts();
    vi.useRealTimers();
    const engineOverdue = alerts.find((a) => a.patientId === "P-AGREE-PAST")?.type === "OVERDUE";

    expect(bucketOverdue).toBe(true);
    expect(engineOverdue).toBe(true);
  });
});

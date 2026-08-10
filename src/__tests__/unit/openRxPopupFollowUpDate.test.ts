import "fake-indexeddb/auto";
import { describe, expect, it, vi, afterEach } from "vitest";

/**
 * Regression test for a print-template-only sibling of the doctor-reported
 * follow-up date bug fixed in followUpDateBugFix.test.ts (see that file's
 * header for the full incident writeup). `bda8be4` applied the
 * parseDateOnly-guarded pattern everywhere a bare "YYYY-MM-DD" followUpDate
 * is rendered EXCEPT inside ConsultationPage.tsx's `openRxPopup` print
 * template, which still did `new Date(followUpDate).toLocaleDateString(...)`
 * directly. A bare date string parses as UTC midnight, which can render as
 * the previous calendar day in any timezone behind UTC -- exactly the class
 * of bug the rest of the fix eliminated, just missed here because it's
 * inside a `window.document.write` HTML template string rather than JSX.
 *
 * This proves the doctor's exact reported date (10/08/2026, stored as the
 * bare "2026-08-10") now prints correctly on the physical prescription
 * handed to the patient.
 */

describe("openRxPopup — printed prescription follow-up date", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("matches parseDateOnly's own output for a bare YYYY-MM-DD followUpDate -- the print popup must not drift from the app's one safe date-parsing helper by re-deriving the date with a separate raw `new Date()` parse", async () => {
    const { openRxPopup } = await import("../../pages/ConsultationPage");
    const { parseDateOnly } = await import("../../utils/dateOnly");

    let written = "";
    const fakeWindow = {
      document: {
        write: (html: string) => { written = html; },
        close: vi.fn(),
      },
    };
    vi.spyOn(window, "open").mockReturnValue(fakeWindow as any);

    openRxPopup(
      { followUpDate: "2026-08-10", date: "2026-08-08T09:00:00.000Z", medicines: [], chiefComplaint: "Test", outcome: "FIRST_VISIT" },
      "Doctor Repro Patient",
      30,
      "Female"
    );

    const expected = parseDateOnly("2026-08-10").toLocaleDateString("en-IN");
    expect(written).toContain(expected);
  });

  it("still prints a full ISO datetime followUpDate correctly (no regression to the non-bare-date path)", async () => {
    const { openRxPopup } = await import("../../pages/ConsultationPage");

    let written = "";
    const fakeWindow = {
      document: {
        write: (html: string) => { written = html; },
        close: vi.fn(),
      },
    };
    vi.spyOn(window, "open").mockReturnValue(fakeWindow as any);

    const followUpDate = "2026-08-10T18:30:00.000Z";
    openRxPopup(
      { followUpDate, date: "2026-08-08T09:00:00.000Z", medicines: [], chiefComplaint: "Test", outcome: "FIRST_VISIT" },
      "Patient",
      30,
      "Female"
    );

    // A full ISO datetime carries its own explicit instant -- new Date(...)
    // handles it correctly on its own, matching PrintableConsultation.tsx's
    // established length>10 branch.
    expect(written).toContain(new Date(followUpDate).toLocaleDateString("en-IN"));
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { getQuickNote, saveQuickNote } from "../../utils/quickNotes";

describe("quickNotes", () => {
  // The global localStorage mock in src/__tests__/setup.ts is a bare
  // vi.fn() stub with no real get/set round-trip -- give it a real
  // in-memory backing store, scoped to this file (same pattern as
  // storageHealthService.test.ts).
  beforeEach(() => {
    const store = new Map<string, string>();
    (global as any).localStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
      clear: () => { store.clear(); },
    };
  });

  it("returns an empty string for a patient with no note", () => {
    expect(getQuickNote("p1")).toBe("");
  });

  it("saves and retrieves a note scoped to a patient id", () => {
    saveQuickNote("p1", "Prefers evening slots");
    saveQuickNote("p2", "Call about lab results");
    expect(getQuickNote("p1")).toBe("Prefers evening slots");
    expect(getQuickNote("p2")).toBe("Call about lab results");
  });

  it("saving an empty/whitespace-only string clears the note", () => {
    saveQuickNote("p1", "Something");
    saveQuickNote("p1", "   ");
    expect(getQuickNote("p1")).toBe("");
  });
});

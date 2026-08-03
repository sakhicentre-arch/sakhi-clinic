import { beforeEach, describe, expect, it } from "vitest";
import {
  isFavoriteMedicine,
  loadFavoriteMedicineNames,
  toggleFavoriteMedicine,
} from "../../utils/favoriteMedicines";

describe("favoriteMedicines", () => {
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

  it("starts empty", () => {
    expect(loadFavoriteMedicineNames()).toEqual([]);
    expect(isFavoriteMedicine("Arnica Montana")).toBe(false);
  });

  it("toggling a name on adds it to the front of the list", () => {
    toggleFavoriteMedicine("Arnica Montana");
    toggleFavoriteMedicine("Nux Vomica");
    expect(loadFavoriteMedicineNames()).toEqual(["Nux Vomica", "Arnica Montana"]);
    expect(isFavoriteMedicine("arnica montana")).toBe(true); // case-insensitive
  });

  it("toggling an already-favorited name removes it", () => {
    toggleFavoriteMedicine("Arnica Montana");
    toggleFavoriteMedicine("Arnica Montana");
    expect(loadFavoriteMedicineNames()).toEqual([]);
    expect(isFavoriteMedicine("Arnica Montana")).toBe(false);
  });

  it("ignores blank names", () => {
    toggleFavoriteMedicine("   ");
    expect(loadFavoriteMedicineNames()).toEqual([]);
  });
});

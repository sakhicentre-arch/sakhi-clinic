import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import PrescriptionEditor from "../../components/PrescriptionEditor";
import { Medicine } from "../../services/db";

/**
 * Doctor Productivity: Favorite Medicines -- single-remedy favorites,
 * distinct from the existing Rx Templates feature (whole saved combos).
 * Proves the star toggle persists via favoriteMedicines.ts and that a
 * favorited remedy shows up as a suggestion on a fresh, empty row.
 */

describe("PrescriptionEditor — Favorite Medicines", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    (global as any).localStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
      clear: () => { store.clear(); },
    };
  });

  function renderEditor(value: Medicine[], onChange = vi.fn()) {
    render(<PrescriptionEditor value={value} onChange={onChange} />);
    return onChange;
  }

  it("shows no favorite star for an empty remedy row", () => {
    renderEditor([{ id: "m1", name: "", potency: "", dosage: "", duration: "" } as Medicine]);
    expect(screen.queryByTestId("favorite-medicine-toggle-0")).not.toBeInTheDocument();
  });

  it("shows an unfilled star once a remedy name is entered, and toggles it on click", () => {
    const onChange = vi.fn();
    renderEditor([{ id: "m1", name: "Arnica Montana", potency: "30C", dosage: "1-1-1", duration: "5 Days" } as Medicine], onChange);

    const toggle = screen.getByTestId("favorite-medicine-toggle-0");
    expect(toggle.querySelector("svg")).toHaveAttribute("fill", "none");

    fireEvent.click(toggle);
    expect(toggle.querySelector("svg")).toHaveAttribute("fill", "#f59e0b");

    fireEvent.click(toggle);
    expect(toggle.querySelector("svg")).toHaveAttribute("fill", "none");
  });

  it("surfaces a previously favorited remedy as a suggestion on a new, empty row", () => {
    // Favorite "Arnica Montana" via a first render, then remount with a
    // fresh empty row -- the favorite should persist via localStorage and
    // show up as a suggestion when that row is focused.
    const { unmount } = render(
      <PrescriptionEditor
        value={[{ id: "m1", name: "Arnica Montana", potency: "30C", dosage: "1-1-1", duration: "5 Days" } as Medicine]}
        onChange={vi.fn()}
      />
    );
    fireEvent.click(screen.getByTestId("favorite-medicine-toggle-0"));
    unmount();

    render(
      <PrescriptionEditor
        value={[{ id: "m2", name: "", potency: "", dosage: "", duration: "" } as Medicine]}
        onChange={vi.fn()}
      />
    );
    fireEvent.focus(screen.getByPlaceholderText("Remedy"));
    expect(screen.getByText(/★ Arnica Montana/)).toBeInTheDocument();
  });
});

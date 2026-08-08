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

/**
 * Doctor-reported UX fix (DOCTOR_UI_UX_REVIEW_V2.md Issue 3): selecting a
 * remedy suggestion must close the dropdown in the same handler that commits
 * the value. Root cause was the suggestion button's onClick never resetting
 * `activeIndex`, leaving the list visibly open over the rest of the form.
 */
describe("PrescriptionEditor — remedy dropdown closes on selection (Issue 3 fix)", () => {
  it("closes the suggestion dropdown immediately after a suggestion is clicked", () => {
    const onChange = vi.fn();
    render(
      <PrescriptionEditor
        value={[{ id: "m1", name: "", potency: "", dosage: "", duration: "" } as Medicine]}
        onChange={onChange}
        suggestions={[{ name: "Arnica Montana", score: 10, reason: "Matches: pain" }]}
      />
    );

    fireEvent.focus(screen.getByPlaceholderText("Remedy"));
    const suggestionBtn = screen.getByText("Arnica Montana");
    expect(suggestionBtn).toBeInTheDocument();

    fireEvent.click(suggestionBtn);

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ name: "Arnica Montana" }),
    ]);
    expect(screen.queryByText("Arnica Montana")).not.toBeInTheDocument();
  });
});

/**
 * Doctor-reported UX fix (DOCTOR_UI_UX_REVIEW_V2.md Issue 2): the frequency
 * picker had no free-text path at all -- only a closed preset list plus a
 * native <select> "More..." picker (now retired per
 * WORLD_CLASS_CLINIC_UI_GUIDELINES.md, which bans native <select> for
 * anything selected during a live consultation). `dosage` is already a free
 * string on the Medicine model, so this is UI-only, no schema change.
 */
describe("PrescriptionEditor — custom frequency entry (Issue 2 fix)", () => {
  it('shows an "Other…" option and stores a typed custom frequency directly as the dosage string', () => {
    const onChange = vi.fn();
    render(
      <PrescriptionEditor
        value={[{ id: "m1", name: "Arnica Montana", potency: "30C", dosage: "1-1-1", duration: "5 Days" } as Medicine]}
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByText("Other…"));
    const customInput = screen.getByPlaceholderText(/1-0-1 after food/);
    fireEvent.change(customInput, { target: { value: "alternate days" } });
    fireEvent.blur(customInput);

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ dosage: "alternate days" }),
    ]);
  });

  it("no longer renders a native <select> for frequency", () => {
    const { container } = render(
      <PrescriptionEditor
        value={[{ id: "m1", name: "Arnica Montana", potency: "30C", dosage: "1-1-1", duration: "5 Days" } as Medicine]}
        onChange={vi.fn()}
      />
    );
    expect(container.querySelector("select")).not.toBeInTheDocument();
  });

  it("re-opening the custom input after a value was already set pre-fills it for editing", () => {
    const onChange = vi.fn();
    render(
      <PrescriptionEditor
        value={[{ id: "m1", name: "Arnica Montana", potency: "30C", dosage: "alternate days", duration: "5 Days" } as Medicine]}
        onChange={onChange}
      />
    );
    // A dosage value outside the preset list should render as its own
    // selected-looking chip showing the actual text, not a generic "Other…".
    const chip = screen.getByText("alternate days");
    fireEvent.click(chip);
    expect(screen.getByPlaceholderText(/1-0-1 after food/)).toHaveValue("alternate days");
  });
});

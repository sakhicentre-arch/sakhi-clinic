import React from "react";
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import OriginMismatchBanner from "../../components/OriginMismatchBanner";

describe("OriginMismatchBanner", () => {
  it("shows both the recorded and current origin", () => {
    render(
      <OriginMismatchBanner
        currentOrigin="https://sakhi-clinic-v2.example"
        recordedOrigin="https://sakhi-clinic.example"
        onAcknowledge={vi.fn()}
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent("https://sakhi-clinic.example");
    expect(screen.getByRole("alert")).toHaveTextContent("https://sakhi-clinic-v2.example");
  });

  it("calls onAcknowledge and hides itself when 'Acknowledge & update' is clicked", async () => {
    const onAcknowledge = vi.fn().mockResolvedValue(undefined);
    render(
      <OriginMismatchBanner
        currentOrigin="https://sakhi-clinic-v2.example"
        recordedOrigin="https://sakhi-clinic.example"
        onAcknowledge={onAcknowledge}
      />
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /acknowledge & update/i }));
    });

    expect(onAcknowledge).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("hides itself on Dismiss WITHOUT calling onAcknowledge", () => {
    const onAcknowledge = vi.fn();
    render(
      <OriginMismatchBanner
        currentOrigin="https://sakhi-clinic-v2.example"
        recordedOrigin="https://sakhi-clinic.example"
        onAcknowledge={onAcknowledge}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(onAcknowledge).not.toHaveBeenCalled();
  });

  it("does not update the recorded baseline on a plain Dismiss (mismatch would reappear next start)", () => {
    // This is a deliberate product choice, not an oversight: Dismiss is for
    // "I've seen this today," Acknowledge is for "this is now correct." Only
    // the latter should stop the warning from returning on the next app open.
    const onAcknowledge = vi.fn();
    render(
      <OriginMismatchBanner
        currentOrigin="https://sakhi-clinic-v2.example"
        recordedOrigin="https://sakhi-clinic.example"
        onAcknowledge={onAcknowledge}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(onAcknowledge).not.toHaveBeenCalled();
  });
});

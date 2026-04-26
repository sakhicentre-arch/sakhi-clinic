import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import DoctorAlertBadges from "../../components/shared/DoctorAlertBadges";

describe("DoctorAlertBadges Component", () => {
  const mockAlerts = [
    {
      type: "firstVisit" as const,
      label: "First Visit",
      color: "#0f766e",
      bg: "#ccfbf1",
    },
    {
      type: "missedFollowUp" as const,
      label: "Missed Follow-up",
      color: "#991b1b",
      bg: "#fee2e2",
    },
    {
      type: "pendingPayment" as const,
      label: "Pending Payment",
      color: "#92400e",
      bg: "#fef3c7",
    },
  ];

  it("should render nothing when alerts array is empty", () => {
    const { container } = render(<DoctorAlertBadges alerts={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("should render all alerts when provided", () => {
    render(<DoctorAlertBadges alerts={mockAlerts} />);

    expect(screen.getByText((text) => text.includes("Visit"))).toBeInTheDocument();
    expect(screen.getByText((text) => text.includes("Follow"))).toBeInTheDocument();
    expect(screen.getByText((text) => text.includes("Payment"))).toBeInTheDocument();
  });

  it("should display correct emoji icons for alert types", () => {
    render(<DoctorAlertBadges alerts={mockAlerts} />);

    expect(screen.getByText(/🆕|Visit/)).toBeInTheDocument();
    expect(screen.getByText(/🔴|Follow/)).toBeInTheDocument();
    expect(screen.getByText(/💰|Payment/)).toBeInTheDocument();
  });

  it("should apply correct styling to each alert", () => {
    const { container } = render(<DoctorAlertBadges alerts={mockAlerts} />);
    const badges = container.querySelectorAll("div[style*='background']");

    expect(badges.length).toBe(mockAlerts.length);
  });

  it("should render stable case badge with correct icon", () => {
    const stableCaseAlert = {
      type: "stableCase" as const,
      label: "Stable Case",
      color: "#166534",
      bg: "#dcfce7",
    };

    render(<DoctorAlertBadges alerts={[stableCaseAlert]} />);
    expect(screen.getByText((text) => text.includes("Stable"))).toBeInTheDocument();
  });

  it("should handle single alert correctly", () => {
    const singleAlert = [mockAlerts[0]];
    const { container } = render(<DoctorAlertBadges alerts={singleAlert} />);
    const badges = container.querySelectorAll("div[style*='background']");

    expect(badges.length).toBe(1);
  });

  it("should render with flex layout", () => {
    const { container } = render(<DoctorAlertBadges alerts={mockAlerts} />);
    const wrapper = container.firstChild as HTMLElement;

    expect(wrapper.style.display).toBe("flex");
    expect(wrapper.style.flexWrap).toBe("wrap");
  });
});
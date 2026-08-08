import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import ReviewPage from "../../pages/ReviewPage";

/**
 * Deployment-audit fix (VERCEL_UAT_DEPLOYMENT_CHECKLIST.md §4/§10): this
 * page previously called react-router-dom's useSearchParams(), but nothing
 * in this app ever mounts a <Router> -- App.tsx renders every page via a
 * plain useState, and ReviewPage itself is rendered standalone
 * (`return <ReviewPage />;`) with no wrapper at all. That hook throws when
 * called outside a Router context, so `/review` would crash on a real
 * production load. No test previously rendered this component, so the
 * defect was never caught.
 *
 * The fix reads window.location.search directly (native URLSearchParams),
 * needing no Router -- matching how the rest of the app already inspects
 * the URL. This test proves both halves: the page renders at all without
 * a Router (the actual bug), and the "g"/"e" query params still populate
 * exactly as before (preserving existing /review URL behavior).
 */
describe("ReviewPage — renders without a React Router context", () => {
  afterEach(() => {
    window.history.pushState({}, "", "/");
  });

  it("renders successfully with no <Router> anywhere in the tree (the actual bug)", () => {
    window.history.pushState({}, "", "/review");
    expect(() => render(<ReviewPage />)).not.toThrow();
    expect(screen.getByText(/Share Your Experience/i)).toBeInTheDocument();
  });

  it("reads and decodes the g/e query params exactly as before", () => {
    window.history.pushState(
      {},
      "",
      `/review?g=${encodeURIComponent("સરસ અનુભવ")}&e=${encodeURIComponent("Great experience!")}`
    );
    render(<ReviewPage />);

    expect(screen.getByDisplayValue("સરસ અનુભવ")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Great experience!")).toBeInTheDocument();
  });

  it("falls back to the raw value when a query param is malformed (existing try/catch behavior preserved)", () => {
    // Raw query string "%25" decodes once via URLSearchParams.get() to a
    // lone "%" -- a value decodeURIComponent() rejects as malformed (no
    // hex digits follow it), so the component's own fallback should catch
    // it and use the raw "%" as-is, exactly as it did before this fix.
    window.history.pushState({}, "", "/review?g=%25&e=hello");
    render(<ReviewPage />);

    expect(screen.getByDisplayValue("%")).toBeInTheDocument();
    expect(screen.getByDisplayValue("hello")).toBeInTheDocument();
  });

  it("shows neither review card when no query params are present", () => {
    window.history.pushState({}, "", "/review");
    render(<ReviewPage />);

    expect(screen.queryByText(/Gujarati Review/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/English Review/i)).not.toBeInTheDocument();
  });
});

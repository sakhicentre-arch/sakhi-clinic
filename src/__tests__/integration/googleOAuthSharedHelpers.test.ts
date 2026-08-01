import { describe, expect, it } from "vitest";
import { safeMessageFor } from "../../../api/oauth/google/_shared";

/**
 * Direct coverage of the error-code -> doctor-facing-message mapping table
 * (Improvement 5), independent of the exchange/refresh endpoints that use
 * it, so the mapping itself is pinned down explicitly.
 */
describe("safeMessageFor (Google error code -> safe message)", () => {
  it("maps invalid_grant", () => {
    expect(safeMessageFor("invalid_grant")).toBe("Authorization expired. Please reconnect Google Drive.");
  });

  it("maps invalid_client", () => {
    expect(safeMessageFor("invalid_client")).toBe("Google Drive configuration error.");
  });

  it("maps unauthorized_client the same as invalid_client", () => {
    expect(safeMessageFor("unauthorized_client")).toBe("Google Drive configuration error.");
  });

  it("maps access_denied", () => {
    expect(safeMessageFor("access_denied")).toBe("Permission denied.");
  });

  it("falls back to a generic message for an unrecognized or undefined error code", () => {
    expect(safeMessageFor("some_future_google_error")).toBe("Google Drive sign-in failed. Please try reconnecting.");
    expect(safeMessageFor(undefined)).toBe("Google Drive sign-in failed. Please try reconnecting.");
  });

  it("never echoes the input error code back as part of the message for unknown codes", () => {
    const weird = "<script>alert(1)</script>";
    expect(safeMessageFor(weird)).not.toContain(weird);
  });
});

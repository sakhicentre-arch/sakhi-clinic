import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler from "../../../api/oauth/google/refresh";

/**
 * api/oauth/google/refresh.ts -- the refresh_token half of the former
 * single token.ts endpoint. Mirrors googleOAuthExchange.test.ts's
 * coverage for this endpoint's own responsibility: never handles an
 * authorization code, only a refresh_token.
 */

function createMockRes() {
  const res: { statusCode?: number; body?: unknown; status: any; json: any } = {} as any;
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn((body: unknown) => {
    res.body = body;
  });
  return res;
}

const VALID_BODY = {
  grant_type: "refresh_token",
  client_id: "test-client-id.apps.googleusercontent.com",
  refresh_token: "refresh-token-abc123",
};

describe("api/oauth/google/refresh", () => {
  beforeEach(() => {
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "test-secret-value-shhh");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("rejects non-POST methods", async () => {
    const res = createMockRes();
    await handler({ method: "GET", body: VALID_BODY }, res);
    expect(res.statusCode).toBe(405);
    expect(res.body).toMatchObject({ error: "method_not_allowed" });
  });

  it("rejects a request missing refresh_token", async () => {
    const res = createMockRes();
    const { refresh_token, ...rest } = VALID_BODY;
    await handler({ method: "POST", body: rest }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: "invalid_request" });
  });

  it("rejects a request missing client_id", async () => {
    const res = createMockRes();
    const { client_id, ...rest } = VALID_BODY;
    await handler({ method: "POST", body: rest }, res);
    expect(res.statusCode).toBe(400);
  });

  it("fails with server_configuration_error and never calls Google when the secret is missing", async () => {
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = createMockRes();
    await handler({ method: "POST", body: VALID_BODY }, res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({ error: "server_configuration_error" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards to Google with client_secret attached and returns the refreshed token as-is", async () => {
    const googleJson = { access_token: "at-2", expires_in: 3600 };
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => JSON.stringify(googleJson),
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = createMockRes();
    await handler({ method: "POST", body: VALID_BODY }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(googleJson);

    const [, init] = fetchMock.mock.calls[0];
    const sent = new URLSearchParams(init.body);
    expect(sent.get("client_secret")).toBe("test-secret-value-shhh");
    expect(sent.get("grant_type")).toBe("refresh_token");
    expect(sent.get("refresh_token")).toBe(VALID_BODY.refresh_token);
    // exchange-specific fields must never be present on this endpoint's request
    expect(sent.get("code")).toBeNull();
    expect(sent.get("code_verifier")).toBeNull();
  });

  it("maps invalid_grant (e.g. a revoked refresh token) to a safe message while logging Google's full error server-side", async () => {
    const googleError = { error: "invalid_grant", error_description: "Token has been expired or revoked." };
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      text: async () => JSON.stringify(googleError),
    });
    vi.stubGlobal("fetch", fetchMock);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = createMockRes();
    await handler({ method: "POST", body: VALID_BODY }, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "invalid_grant", message: "Authorization expired. Please reconnect Google Drive." });

    const loggedCall = errorSpy.mock.calls.find((call) => String(call[0]).includes("Google rejected the request"));
    expect(loggedCall).toBeDefined();
    expect(loggedCall![1]).toMatchObject({ error: "invalid_grant", error_description: "Token has been expired or revoked." });
  });

  it("returns a safe 502 when Google cannot be reached, without throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("network down")));

    const res = createMockRes();
    await expect(handler({ method: "POST", body: VALID_BODY }, res)).resolves.toBeUndefined();

    expect(res.statusCode).toBe(502);
    expect(res.body).toMatchObject({ error: "upstream_unavailable" });
  });

  describe("never logs secrets", () => {
    it("never includes the client secret or refresh token in any console output, on success or failure", async () => {
      const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: "OK",
          text: async () => JSON.stringify({ access_token: "at-2", expires_in: 3600 }),
        })
      );
      await handler({ method: "POST", body: VALID_BODY }, createMockRes());

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValueOnce({
          ok: false,
          status: 400,
          statusText: "Bad Request",
          text: async () => JSON.stringify({ error: "invalid_grant", error_description: "expired" }),
        })
      );
      await handler({ method: "POST", body: VALID_BODY }, createMockRes());

      const allLoggedText = JSON.stringify([...infoSpy.mock.calls, ...errorSpy.mock.calls]);
      expect(allLoggedText).not.toContain("test-secret-value-shhh");
      expect(allLoggedText).not.toContain(VALID_BODY.refresh_token);
    });
  });
});

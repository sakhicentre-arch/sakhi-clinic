import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler from "../../../api/oauth/google/exchange";

/**
 * api/oauth/google/exchange.ts -- the authorization_code half of the
 * former single token.ts endpoint, split out so each endpoint only
 * contains the logic for its own grant type. Covers: request validation,
 * the missing-secret case, a successful exchange, Google's real errors
 * being both logged in full server-side AND translated to a safe message
 * for the browser, network failure, and that no log line ever contains
 * the secret, code, or verifier.
 */

const URL = "http://localhost/api/oauth/google/exchange";

function request(method: string, body?: unknown): Request {
  return new Request(URL, {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } } : {}),
  });
}

const VALID_BODY = {
  grant_type: "authorization_code",
  client_id: "test-client-id.apps.googleusercontent.com",
  code: "auth-code-abc123",
  code_verifier: "verifier-xyz789",
  redirect_uri: "https://sakhi-clinic.vercel.app/oauth/google/callback",
};

describe("api/oauth/google/exchange", () => {
  beforeEach(() => {
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "test-secret-value-shhh");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("rejects non-POST methods", async () => {
    const res = await handler.fetch(request("GET"));
    expect(res.status).toBe(405);
    expect(await res.json()).toMatchObject({ error: "method_not_allowed" });
  });

  it("rejects a request missing code_verifier", async () => {
    const { code_verifier, ...rest } = VALID_BODY;
    const res = await handler.fetch(request("POST", rest));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid_request" });
  });

  it("rejects a request missing client_id", async () => {
    const { client_id, ...rest } = VALID_BODY;
    const res = await handler.fetch(request("POST", rest));
    expect(res.status).toBe(400);
  });

  it("fails with server_configuration_error and never calls Google when the secret is missing", async () => {
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await handler.fetch(request("POST", VALID_BODY));

    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: "server_configuration_error" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards to Google with client_secret attached and returns the tokens as-is on success", async () => {
    const googleJson = { access_token: "at-1", refresh_token: "rt-1", expires_in: 3600, scope: "drive.file" };
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => JSON.stringify(googleJson),
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await handler.fetch(request("POST", VALID_BODY));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(googleJson);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    const sent = new URLSearchParams(init.body);
    expect(sent.get("client_secret")).toBe("test-secret-value-shhh");
    expect(sent.get("grant_type")).toBe("authorization_code");
    expect(sent.get("code")).toBe(VALID_BODY.code);
    expect(sent.get("code_verifier")).toBe(VALID_BODY.code_verifier);
    // refresh-specific field must never be present on this endpoint's request
    expect(sent.get("refresh_token")).toBeNull();
  });

  it("maps invalid_grant to a safe message while logging Google's full error server-side", async () => {
    const googleError = { error: "invalid_grant", error_description: "Token has been expired or revoked." };
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      text: async () => JSON.stringify(googleError),
    });
    vi.stubGlobal("fetch", fetchMock);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await handler.fetch(request("POST", VALID_BODY));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_grant", message: "Authorization expired. Please reconnect Google Drive." });

    // Google's ORIGINAL error is not lost -- it's logged server-side, in full.
    const loggedCall = errorSpy.mock.calls.find((call) => String(call[0]).includes("Google rejected the request"));
    expect(loggedCall).toBeDefined();
    expect(loggedCall![1]).toMatchObject({ error: "invalid_grant", error_description: "Token has been expired or revoked." });
  });

  it("maps invalid_client to a safe message", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: async () => JSON.stringify({ error: "invalid_client", error_description: "The OAuth client was not found." }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await handler.fetch(request("POST", VALID_BODY));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "invalid_client", message: "Google Drive configuration error." });
  });

  it("maps access_denied to a safe message", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      text: async () => JSON.stringify({ error: "access_denied", error_description: "The user denied access." }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await handler.fetch(request("POST", VALID_BODY));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "access_denied", message: "Permission denied." });
  });

  it("falls back to a generic safe message for an unrecognized Google error code", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      text: async () => JSON.stringify({ error: "some_new_google_error", error_description: "Something Google added later." }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await handler.fetch(request("POST", VALID_BODY));

    expect(res.status).toBe(400);
    const json = (await res.json()) as any;
    expect(json.error).toBe("some_new_google_error");
    expect(json.message).toMatch(/failed.*reconnect/i);
  });

  it("returns a safe 502 when Google cannot be reached, without throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("getaddrinfo ENOTFOUND")));

    const res = await handler.fetch(request("POST", VALID_BODY));

    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: "upstream_unavailable" });
  });

  describe("never logs secrets", () => {
    it("never includes the client secret, code, or verifier in any console output, on success or failure", async () => {
      const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: "OK",
          text: async () => JSON.stringify({ access_token: "at-1", expires_in: 3600 }),
        })
      );
      await handler.fetch(request("POST", VALID_BODY));

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValueOnce({
          ok: false,
          status: 400,
          statusText: "Bad Request",
          text: async () => JSON.stringify({ error: "invalid_grant", error_description: "expired" }),
        })
      );
      await handler.fetch(request("POST", VALID_BODY));

      const allLoggedText = JSON.stringify([...infoSpy.mock.calls, ...errorSpy.mock.calls]);
      expect(allLoggedText).not.toContain("test-secret-value-shhh");
      expect(allLoggedText).not.toContain(VALID_BODY.code);
      expect(allLoggedText).not.toContain(VALID_BODY.code_verifier);
    });
  });
});

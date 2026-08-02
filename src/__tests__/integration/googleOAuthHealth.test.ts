import { afterEach, describe, expect, it, vi } from "vitest";
import handler from "../../../api/oauth/google/health";

/**
 * api/oauth/google/health.ts -- a pure configuration check, added after
 * the exchange/refresh split so production deployments can confirm
 * environment variables took effect without spending a real OAuth attempt.
 * Must never call Google and must never expose the actual secret/client id
 * values, only booleans.
 */

const URL = "http://localhost/api/oauth/google/health";

function request(method: string): Request {
  return new Request(URL, { method });
}

describe("api/oauth/google/health", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reports ok/true when both the client id and secret are configured", async () => {
    vi.stubEnv("VITE_GOOGLE_OAUTH_CLIENT_ID", "test-client-id.apps.googleusercontent.com");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "test-secret-value-shhh");

    const res = await handler.fetch(request("GET"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: "ok",
      oauthConfigured: true,
      checks: { clientIdConfigured: true, clientSecretConfigured: true },
    });
  });

  it("reports error/false when the client secret is missing, but still returns HTTP 200", async () => {
    vi.stubEnv("VITE_GOOGLE_OAUTH_CLIENT_ID", "test-client-id.apps.googleusercontent.com");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "");

    const res = await handler.fetch(request("GET"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: "error",
      oauthConfigured: false,
      checks: { clientIdConfigured: true, clientSecretConfigured: false },
    });
  });

  it("reports error/false when the client id is missing", async () => {
    vi.stubEnv("VITE_GOOGLE_OAUTH_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "test-secret-value-shhh");

    const res = await handler.fetch(request("GET"));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "error", oauthConfigured: false });
  });

  it("reports error/false when neither is configured", async () => {
    vi.stubEnv("VITE_GOOGLE_OAUTH_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "");

    const res = await handler.fetch(request("GET"));

    expect(await res.json()).toEqual({
      status: "error",
      oauthConfigured: false,
      checks: { clientIdConfigured: false, clientSecretConfigured: false },
    });
  });

  it("rejects non-GET/HEAD methods", async () => {
    const res = await handler.fetch(request("POST"));
    expect(res.status).toBe(405);
  });

  it("never calls Google", async () => {
    vi.stubEnv("VITE_GOOGLE_OAUTH_CLIENT_ID", "test-client-id.apps.googleusercontent.com");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "test-secret-value-shhh");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await handler.fetch(request("GET"));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never includes the actual secret or client id value in the response, only booleans", async () => {
    const realSecret = "test-secret-value-shhh";
    const realClientId = "test-client-id.apps.googleusercontent.com";
    vi.stubEnv("VITE_GOOGLE_OAUTH_CLIENT_ID", realClientId);
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", realSecret);

    const res = await handler.fetch(request("GET"));

    const serialized = JSON.stringify(await res.json());
    expect(serialized).not.toContain(realSecret);
    expect(serialized).not.toContain(realClientId);
  });
});

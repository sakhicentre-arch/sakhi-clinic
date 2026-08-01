import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler from "../../../api/oauth/google/health";

/**
 * api/oauth/google/health.ts -- a pure configuration check, added after
 * the exchange/refresh split so production deployments can confirm
 * environment variables took effect without spending a real OAuth attempt.
 * Must never call Google and must never expose the actual secret/client id
 * values, only booleans.
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

describe("api/oauth/google/health", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reports ok/true when both the client id and secret are configured", async () => {
    vi.stubEnv("VITE_GOOGLE_OAUTH_CLIENT_ID", "test-client-id.apps.googleusercontent.com");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "test-secret-value-shhh");

    const res = createMockRes();
    await handler({ method: "GET" }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      status: "ok",
      oauthConfigured: true,
      checks: { clientIdConfigured: true, clientSecretConfigured: true },
    });
  });

  it("reports error/false when the client secret is missing, but still returns HTTP 200", async () => {
    vi.stubEnv("VITE_GOOGLE_OAUTH_CLIENT_ID", "test-client-id.apps.googleusercontent.com");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "");

    const res = createMockRes();
    await handler({ method: "GET" }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      status: "error",
      oauthConfigured: false,
      checks: { clientIdConfigured: true, clientSecretConfigured: false },
    });
  });

  it("reports error/false when the client id is missing", async () => {
    vi.stubEnv("VITE_GOOGLE_OAUTH_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "test-secret-value-shhh");

    const res = createMockRes();
    await handler({ method: "GET" }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ status: "error", oauthConfigured: false });
  });

  it("reports error/false when neither is configured", async () => {
    vi.stubEnv("VITE_GOOGLE_OAUTH_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "");

    const res = createMockRes();
    await handler({ method: "GET" }, res);

    expect(res.body).toEqual({
      status: "error",
      oauthConfigured: false,
      checks: { clientIdConfigured: false, clientSecretConfigured: false },
    });
  });

  it("rejects non-GET/HEAD methods", async () => {
    const res = createMockRes();
    await handler({ method: "POST" }, res);
    expect(res.statusCode).toBe(405);
  });

  it("never calls Google", async () => {
    vi.stubEnv("VITE_GOOGLE_OAUTH_CLIENT_ID", "test-client-id.apps.googleusercontent.com");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "test-secret-value-shhh");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await handler({ method: "GET" }, createMockRes());

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never includes the actual secret or client id value in the response, only booleans", async () => {
    const realSecret = "test-secret-value-shhh";
    const realClientId = "test-client-id.apps.googleusercontent.com";
    vi.stubEnv("VITE_GOOGLE_OAUTH_CLIENT_ID", realClientId);
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", realSecret);

    const res = createMockRes();
    await handler({ method: "GET" }, res);

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain(realSecret);
    expect(serialized).not.toContain(realClientId);
  });
});

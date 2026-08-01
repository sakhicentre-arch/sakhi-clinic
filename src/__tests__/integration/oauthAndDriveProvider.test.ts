import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockOAuthService } from "../../services/backup/oauth/mockOAuthService";
import { createGoogleDriveProvider } from "../../services/backup/providers/googleDriveProvider";

/**
 * Phase 3: OAuth abstraction + GoogleDriveProvider.
 *
 * No real network calls anywhere in this file -- mockOAuthService.ts is
 * fully in-memory, and every fetch GoogleDriveProvider would make is
 * stubbed. This proves the provider's request shapes and honesty gates
 * (never claims success without a signed-in session) without needing a
 * real Google project or credentials.
 */

describe("mockOAuthService (OAuthService contract)", () => {
  it("reports not configured and returns a null auth URL when created unconfigured", async () => {
    const oauth = createMockOAuthService({ configured: false });
    expect(oauth.isConfigured()).toBe(false);
    expect(await oauth.getAuthUrl()).toBeNull();
  });

  it("is configured by default and returns a real-looking auth URL", async () => {
    const oauth = createMockOAuthService();
    expect(oauth.isConfigured()).toBe(true);
    expect(await oauth.getAuthUrl()).toMatch(/^https:\/\//);
  });

  it("is not authenticated and has no access token before any sign-in", async () => {
    const oauth = createMockOAuthService();
    expect(await oauth.isAuthenticated()).toBe(false);
    expect(await oauth.getAccessToken()).toBeNull();
    expect(await oauth.getAccountInfo()).toBeNull();
  });

  it("becomes authenticated after simulateSignIn, with a usable access token", async () => {
    const oauth = createMockOAuthService();
    oauth.simulateSignIn();
    expect(await oauth.isAuthenticated()).toBe(true);
    expect(await oauth.getAccessToken()).toBeTruthy();
    expect(await oauth.getAccountInfo()).not.toBeNull();
  });

  it("handleRedirectCallback rejects when the service is not configured", async () => {
    const oauth = createMockOAuthService({ configured: false });
    await expect(oauth.handleRedirectCallback(new URLSearchParams("code=abc"))).rejects.toThrow(/not configured/i);
  });

  it("handleRedirectCallback rejects a callback with no code", async () => {
    const oauth = createMockOAuthService();
    await expect(oauth.handleRedirectCallback(new URLSearchParams())).rejects.toThrow(/missing code/i);
  });

  it("handleRedirectCallback completes the flow and leaves the service authenticated", async () => {
    const oauth = createMockOAuthService();
    const tokens = await oauth.handleRedirectCallback(new URLSearchParams("code=xyz"));
    expect(tokens.accessToken).toContain("xyz");
    expect(await oauth.isAuthenticated()).toBe(true);
  });

  it("signOut clears the session entirely", async () => {
    const oauth = createMockOAuthService();
    oauth.simulateSignIn();
    await oauth.signOut();
    expect(await oauth.isAuthenticated()).toBe(false);
    expect(await oauth.getAccessToken()).toBeNull();
  });

  it("getAccessToken transparently refreshes an expired token when a refresh token exists", async () => {
    const oauth = createMockOAuthService();
    oauth.simulateSignIn();
    oauth.simulateExpiry();
    // isAuthenticated reflects the raw (now-expired) token state...
    expect(await oauth.isAuthenticated()).toBe(false);
    // ...but getAccessToken refreshes rather than simply failing.
    const refreshed = await oauth.getAccessToken();
    expect(refreshed).toMatch(/refreshed/);
  });
});

describe("GoogleDriveProvider (createGoogleDriveProvider)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports capabilities matching the documented Phase 3 scope (no versioning/incremental/encryption/conflict-resolution yet)", () => {
    const provider = createGoogleDriveProvider(createMockOAuthService());
    expect(provider.capabilities).toEqual({
      supportsUpload: true,
      supportsDownload: true,
      supportsDelete: true,
      supportsList: true,
      supportsVersioning: false,
      supportsIncremental: false,
      supportsStreaming: true,
      supportsEncryption: false,
      supportsConflictResolution: false,
    });
  });

  it("available reflects OAuth configuration, not sign-in state", () => {
    const configuredButSignedOut = createGoogleDriveProvider(createMockOAuthService({ configured: true }));
    expect(configuredButSignedOut.available).toBe(true);

    const unconfigured = createGoogleDriveProvider(createMockOAuthService({ configured: false }));
    expect(unconfigured.available).toBe(false);
  });

  it("save() refuses honestly, with zero network calls, when the doctor has not signed in", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const provider = createGoogleDriveProvider(createMockOAuthService());

    const result = await provider.save({ filename: "backup.json", content: "{}", contentType: "application/json" });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not connected/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("list()/load()/delete()/getMetadata() all return an honest empty/null result, not an error throw, when signed out", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const provider = createGoogleDriveProvider(createMockOAuthService());

    expect(await provider.list!()).toEqual([]);
    expect(await provider.load!("backup.json")).toBeNull();
    expect(await provider.getMetadata!("backup.json")).toBeNull();
    const del = await provider.delete!("backup.json");
    expect(del.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("save() uploads a NEW file via POST multipart when no existing file is found, reporting 0/50/100 progress", async () => {
    const oauth = createMockOAuthService();
    oauth.simulateSignIn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ files: [] }) }) // findFileIdByName
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) }); // upload
    vi.stubGlobal("fetch", fetchMock);
    const provider = createGoogleDriveProvider(oauth);

    const progress: number[] = [];
    const result = await provider.save({
      filename: "backup.json",
      content: "{\"a\":1}",
      contentType: "application/json",
      onProgress: (p) => progress.push(p),
    });

    expect(result.ok).toBe(true);
    expect(result.location).toBe("Saved to Google Drive");
    expect(progress).toEqual([0, 50, 100]);

    const [uploadUrl, uploadInit] = fetchMock.mock.calls[1];
    expect(uploadInit.method).toBe("POST");
    expect(String(uploadUrl)).toContain("uploadType=multipart");
    expect(uploadInit.body).toContain("a\":1");
  });

  it("save() updates an EXISTING file via PATCH when a same-named file is already on Drive", async () => {
    const oauth = createMockOAuthService();
    oauth.simulateSignIn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ files: [{ id: "existing-file-1", name: "backup.json" }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    const provider = createGoogleDriveProvider(oauth);

    const result = await provider.save({ filename: "backup.json", content: "{}", contentType: "application/json" });

    expect(result.ok).toBe(true);
    const [uploadUrl, uploadInit] = fetchMock.mock.calls[1];
    expect(uploadInit.method).toBe("PATCH");
    expect(String(uploadUrl)).toContain("existing-file-1");
  });

  it("save() surfaces a non-OK HTTP status as a returned error, never as an uncaught throw", async () => {
    const oauth = createMockOAuthService();
    oauth.simulateSignIn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ files: [] }) })
      .mockResolvedValueOnce({ ok: false, status: 403 });
    vi.stubGlobal("fetch", fetchMock);
    const provider = createGoogleDriveProvider(oauth);

    const result = await provider.save({ filename: "backup.json", content: "{}", contentType: "application/json" });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/403/);
  });

  it("save() catches a network-level fetch rejection and returns it as an error result", async () => {
    const oauth = createMockOAuthService();
    oauth.simulateSignIn();
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("network offline"));
    vi.stubGlobal("fetch", fetchMock);
    const provider = createGoogleDriveProvider(oauth);

    const result = await provider.save({ filename: "backup.json", content: "{}", contentType: "application/json" });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/network offline/i);
  });

  it("list() maps Drive file entries to StorageProviderListEntry shape", async () => {
    const oauth = createMockOAuthService();
    oauth.simulateSignIn();
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ files: [{ id: "1", name: "a.json", size: "100" }, { id: "2", name: "b.json" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const provider = createGoogleDriveProvider(oauth);

    const entries = await provider.list!();
    expect(entries).toEqual([
      { filename: "a.json", sizeBytes: 100 },
      { filename: "b.json", sizeBytes: undefined },
    ]);
  });

  it("load() returns the file's text content when found, and null when no matching file exists", async () => {
    const oauth = createMockOAuthService();
    oauth.simulateSignIn();
    const foundFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ files: [{ id: "file-1" }] }) })
      .mockResolvedValueOnce({ ok: true, text: async () => "hello backup content" });
    vi.stubGlobal("fetch", foundFetch);
    const provider = createGoogleDriveProvider(oauth);
    expect(await provider.load!("backup.json")).toBe("hello backup content");

    vi.unstubAllGlobals();
    const notFoundFetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ files: [] }) });
    vi.stubGlobal("fetch", notFoundFetch);
    expect(await provider.load!("missing.json")).toBeNull();
  });

  it("delete() reports 'File not found' when nothing matches, and succeeds when Drive confirms deletion", async () => {
    const oauth = createMockOAuthService();
    oauth.simulateSignIn();
    const notFoundFetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ files: [] }) });
    vi.stubGlobal("fetch", notFoundFetch);
    const provider = createGoogleDriveProvider(oauth);
    const missing = await provider.delete!("missing.json");
    expect(missing.ok).toBe(false);
    expect(missing.error).toMatch(/not found/i);

    vi.unstubAllGlobals();
    const okFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ files: [{ id: "file-1" }] }) })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("fetch", okFetch);
    const deleted = await provider.delete!("backup.json");
    expect(deleted.ok).toBe(true);
    expect(okFetch.mock.calls[1][1].method).toBe("DELETE");
  });

  it("getMetadata() maps Drive file fields to StorageProviderMetadata", async () => {
    const oauth = createMockOAuthService();
    oauth.simulateSignIn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ files: [{ id: "file-1" }] }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "file-1", name: "backup.json", size: "2048", createdTime: "2026-01-01T00:00:00.000Z" }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const provider = createGoogleDriveProvider(oauth);

    const meta = await provider.getMetadata!("backup.json");
    expect(meta).toEqual({
      filename: "backup.json",
      sizeBytes: 2048,
      createdAt: "2026-01-01T00:00:00.000Z",
      providerFileId: "file-1",
    });
  });
});

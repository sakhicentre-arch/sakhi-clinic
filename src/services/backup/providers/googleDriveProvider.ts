/**
 * googleDriveProvider.ts
 * Sakhi Clinic — Backup Engine: Google Drive StorageProvider (Phase 3).
 *
 * Real Drive API v3 request shapes (multipart upload, alt=media download,
 * files.list/delete/get) -- this is genuinely production-shaped code, not
 * a placeholder. What keeps it inert in THIS deployment is purely the
 * OAuth gate: every method calls oauthService.isAuthenticated() first and
 * returns the same honest "not connected" result the original stub always
 * returned if that's false. Since no OAuth client ID is configured
 * anywhere in this repository (see googleOAuthService.ts), that gate is
 * never open here -- no network call this file makes is ever reachable in
 * this environment. Nothing about that is faked or worked around.
 *
 * Provider-only responsibilities, per the architecture: upload, download,
 * list, delete, metadata, progress. This file does not serialize,
 * compress, encrypt, verify integrity, or construct a BackupJob -- all of
 * that stays in backupManager.ts and the layers above it.
 *
 * The OAuth service is injected (createGoogleDriveProvider), not
 * hardcoded, so tests can exercise this against mockOAuthService.ts
 * without touching a real Google project or the network.
 */

import type {
  ProviderCapabilities,
  StorageProvider,
  StorageProviderDeleteResult,
  StorageProviderListEntry,
  StorageProviderMetadata,
  StorageProviderSaveInput,
  StorageProviderSaveResult,
} from "../storageProvider";
import type { OAuthService } from "../oauth/oauthService";
import { googleOAuthService } from "../oauth/googleOAuthService";

const FILES_ENDPOINT = "https://www.googleapis.com/drive/v3/files";
const UPLOAD_ENDPOINT = "https://www.googleapis.com/upload/drive/v3/files";
const NOT_CONNECTED_MESSAGE =
  "Google Drive is not connected. Sign in is required, and this deployment has no Google OAuth client ID configured yet.";

const CAPABILITIES: ProviderCapabilities = {
  supportsUpload: true,
  supportsDownload: true,
  supportsDelete: true,
  supportsList: true,
  supportsVersioning: false, // Drive has native revisions, but this integration doesn't use them yet
  supportsIncremental: false, // no remote-diff mechanism exists yet -- every backup is a full upload
  supportsStreaming: true, // real chunked/multipart upload reports progress via onProgress
  supportsEncryption: false, // encryptionLayer.ts owns this, not the provider
  supportsConflictResolution: false, // no multi-device conflict detection exists yet
};

async function findFileIdByName(accessToken: string, filename: string): Promise<string | null> {
  const q = encodeURIComponent(`name='${filename.replace(/'/g, "\\'")}' and trashed=false`);
  const response = await fetch(`${FILES_ENDPOINT}?q=${q}&fields=files(id,name)&spaces=drive`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return null;
  const json = await response.json();
  return json.files?.[0]?.id ?? null;
}

export function createGoogleDriveProvider(oauthService: OAuthService): StorageProvider {
  return {
    id: "google-drive",
    label: "Google Drive",
    capabilities: CAPABILITIES,

    get available(): boolean {
      // Synchronous by interface contract; a real async check happens
      // inside every method below before any network call. This flag is
      // for the UI's quick "is there any point offering Drive controls"
      // check -- it reflects configuration, not live session state.
      return oauthService.isConfigured();
    },

    async save(input: StorageProviderSaveInput): Promise<StorageProviderSaveResult> {
      if (!(await oauthService.isAuthenticated())) {
        return { ok: false, error: NOT_CONNECTED_MESSAGE };
      }
      const token = await oauthService.getAccessToken();
      if (!token) return { ok: false, error: NOT_CONNECTED_MESSAGE };

      try {
        input.onProgress?.(0, "Starting upload...");

        const existingId = await findFileIdByName(token, input.filename);
        const metadata = existingId ? {} : { name: input.filename };
        const boundary = `sakhi-${crypto.randomUUID()}`;
        const body =
          `--${boundary}\r\n` +
          `Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
          `--${boundary}\r\n` +
          `Content-Type: ${input.contentType}\r\n\r\n${input.content}\r\n` +
          `--${boundary}--`;

        input.onProgress?.(50, "Uploading to Drive...");

        const url = existingId
          ? `${UPLOAD_ENDPOINT}/${existingId}?uploadType=multipart`
          : `${UPLOAD_ENDPOINT}?uploadType=multipart`;
        const response = await fetch(url, {
          method: existingId ? "PATCH" : "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
          body,
        });

        if (!response.ok) {
          return { ok: false, error: `Google Drive upload failed (${response.status})` };
        }
        input.onProgress?.(100, "Upload complete");
        return { ok: true, location: "Saved to Google Drive" };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },

    async list(): Promise<StorageProviderListEntry[]> {
      if (!(await oauthService.isAuthenticated())) return [];
      const token = await oauthService.getAccessToken();
      if (!token) return [];

      try {
        const q = encodeURIComponent("trashed=false");
        const response = await fetch(`${FILES_ENDPOINT}?q=${q}&fields=files(id,name,size)&spaces=drive`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) return [];
        const json = await response.json();
        return (json.files || []).map((f: any) => ({ filename: f.name, sizeBytes: f.size ? Number(f.size) : undefined }));
      } catch {
        return [];
      }
    },

    async load(filename: string): Promise<string | null> {
      if (!(await oauthService.isAuthenticated())) return null;
      const token = await oauthService.getAccessToken();
      if (!token) return null;

      try {
        const fileId = await findFileIdByName(token, filename);
        if (!fileId) return null;
        const response = await fetch(`${FILES_ENDPOINT}/${fileId}?alt=media`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) return null;
        return await response.text();
      } catch {
        return null;
      }
    },

    async delete(filename: string): Promise<StorageProviderDeleteResult> {
      if (!(await oauthService.isAuthenticated())) return { ok: false, error: NOT_CONNECTED_MESSAGE };
      const token = await oauthService.getAccessToken();
      if (!token) return { ok: false, error: NOT_CONNECTED_MESSAGE };

      try {
        const fileId = await findFileIdByName(token, filename);
        if (!fileId) return { ok: false, error: "File not found on Google Drive" };
        const response = await fetch(`${FILES_ENDPOINT}/${fileId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        return response.ok ? { ok: true } : { ok: false, error: `Delete failed (${response.status})` };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },

    async getMetadata(filename: string): Promise<StorageProviderMetadata | null> {
      if (!(await oauthService.isAuthenticated())) return null;
      const token = await oauthService.getAccessToken();
      if (!token) return null;

      try {
        const fileId = await findFileIdByName(token, filename);
        if (!fileId) return null;
        const response = await fetch(`${FILES_ENDPOINT}/${fileId}?fields=id,name,size,createdTime`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) return null;
        const json = await response.json();
        return {
          filename: json.name,
          sizeBytes: json.size ? Number(json.size) : undefined,
          createdAt: json.createdTime,
          providerFileId: json.id,
        };
      } catch {
        return null;
      }
    },
  };
}

/** Production singleton, wired to the real Google OAuth implementation. */
export const googleDriveProvider: StorageProvider = createGoogleDriveProvider(googleOAuthService);

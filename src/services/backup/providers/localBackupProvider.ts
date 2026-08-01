/**
 * localBackupProvider.ts
 * Sakhi Clinic — Backup Engine: local StorageProvider.
 *
 * Wraps the two local mechanisms this app has always used, moved here
 * verbatim from backupService.ts (not reimplemented -- same download-a-file
 * behavior and the same Cache Storage retention the doctor's existing
 * backups already rely on):
 *   1. A real file download (Blob + <a download>) -- the doctor's copy.
 *   2. A Cache Storage snapshot (not a Dexie table -- no schema change) for
 *      bounded local retention, used by the periodic auto-backup.
 *
 * Always available; this is the default/fallback provider.
 */

import type { StorageProvider, StorageProviderListEntry, StorageProviderSaveInput, StorageProviderSaveResult } from "../storageProvider";

const CACHE_NAME = "sakhi-backups-v1";

function downloadFile(content: string, filename: string, contentType: string) {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}

async function storeSnapshot(content: string, filename: string, contentType: string) {
  try {
    if (typeof caches === "undefined" || !caches.open) return;
    const cache = await caches.open(CACHE_NAME);
    const req = new Request(`${location.origin}/__sakhi_backup__/${filename}`);
    await cache.put(req, new Response(new Blob([content], { type: contentType }), { headers: { "Content-Type": contentType } }));
  } catch {
    // ignore -- local snapshot retention is best-effort, never blocks the real download
  }
}

async function listSnapshots(): Promise<StorageProviderListEntry[]> {
  try {
    if (typeof caches === "undefined" || !caches.open) return [];
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    const out: StorageProviderListEntry[] = [];
    for (const k of keys) {
      const url = new URL(k.url);
      const filename = url.pathname.split("/").pop() || url.pathname;
      const res = await cache.match(k);
      const sizeBytes = res ? Number(res.headers.get("Content-Length") || "") : undefined;
      out.push({ filename, sizeBytes: Number.isFinite(sizeBytes as any) ? (sizeBytes as number) : undefined });
    }
    return out;
  } catch {
    return [];
  }
}

async function pruneSnapshots(keepLatest: number) {
  try {
    if (typeof caches === "undefined" || !caches.open) return;
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    const items = keys
      .map((k) => {
        const url = new URL(k.url);
        return { key: k, filename: url.pathname.split("/").pop() || url.pathname };
      })
      .sort((a, b) => a.filename.localeCompare(b.filename));
    const excess = Math.max(0, items.length - keepLatest);
    for (let i = 0; i < excess; i++) {
      await cache.delete(items[i].key);
    }
  } catch {
    // ignore
  }
}

async function loadSnapshot(filename: string): Promise<string | null> {
  try {
    if (typeof caches === "undefined" || !caches.open) return null;
    const cache = await caches.open(CACHE_NAME);
    const req = new Request(`${location.origin}/__sakhi_backup__/${filename}`);
    const res = await cache.match(req);
    if (!res) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export const localBackupProvider: StorageProvider = {
  id: "local",
  label: "This device",
  available: true,

  async save(input: StorageProviderSaveInput): Promise<StorageProviderSaveResult> {
    try {
      if (input.silent) {
        // Unattended/periodic path: retention snapshot only, never a
        // surprise download prompt while the doctor is mid-consultation.
        await storeSnapshot(input.content, input.filename, input.contentType);
        return { ok: true, location: "Saved locally (background snapshot)" };
      }

      // Doctor-initiated export: the real download is the artifact she
      // relies on. The Cache Storage snapshot is secondary retention and
      // must never block or fail the download.
      downloadFile(input.content, input.filename, input.contentType);
      await storeSnapshot(input.content, input.filename, input.contentType);
      return { ok: true, location: "Downloaded to this device" };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  },

  list: listSnapshots,
  load: loadSnapshot,
  prune: pruneSnapshots,
};

/**
 * storageProvider.ts
 * Sakhi Clinic — Backup Engine: storage provider abstraction.
 *
 * The backup engine (backupManager.ts and everything upstream of it) never
 * imports a concrete provider and never branches on "which provider am I
 * using" -- it only calls this interface. Adding OneDrive, Dropbox, S3, a
 * NAS target, or a clinic server later means writing one new file that
 * implements StorageProvider; nothing in the engine changes.
 */

export interface StorageProviderSaveInput {
  filename: string;
  content: string; // already serialized + (optionally) compressed/encrypted
  contentType: string;
  /** True for unattended/periodic saves: no user-visible download prompt, retention snapshot only where that distinction is meaningful. */
  silent?: boolean;
}

export interface StorageProviderSaveResult {
  ok: boolean;
  /** Human-readable location the doctor can understand, e.g. "Downloaded to device" or "Saved to Google Drive". */
  location?: string;
  error?: string;
}

export interface StorageProviderListEntry {
  filename: string;
  sizeBytes?: number;
}

export interface StorageProvider {
  readonly id: string;
  readonly label: string;
  /** Whether this provider can actually be used right now (e.g. Drive requires a completed OAuth connection). */
  readonly available: boolean;

  save(input: StorageProviderSaveInput): Promise<StorageProviderSaveResult>;

  /** Optional: not every provider can enumerate what it holds (a raw file-download provider can't). */
  list?(): Promise<StorageProviderListEntry[]>;

  /** Optional: not every provider supports reading back a specific file by name. */
  load?(filename: string): Promise<string | null>;

  /** Optional: bounded retention -- keep only the newest N snapshots. */
  prune?(keepLatest: number): Promise<void>;
}

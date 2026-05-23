export type SyncStatus = "local" | "pending" | "synced" | "conflict";

export type SyncMeta = {
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: number;
  version?: number;
  deviceId?: string;
  syncStatus?: SyncStatus;
};

export type RepositoryResult<T> = { ok: true; value: T } | { ok: false; error: Error };

export function ok<T>(value: T): RepositoryResult<T> {
  return { ok: true, value };
}

export function err(message: string | Error): RepositoryResult<never> {
  return { ok: false, error: message instanceof Error ? message : new Error(message) };
}


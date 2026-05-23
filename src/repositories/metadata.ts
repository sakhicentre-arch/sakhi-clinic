import type { SyncMeta, SyncStatus } from "./types";
import { getDeviceId } from "../utils/deviceId";

const nowIso = () => new Date().toISOString();

export function withCreateMeta<T extends SyncMeta>(record: T, opts?: { syncStatus?: SyncStatus }): T {
  const timestamp = nowIso();
  return {
    ...record,
    createdAt: record.createdAt || timestamp,
    updatedAt: timestamp,
    version: typeof record.version === "number" ? record.version + 1 : 1,
    deviceId: record.deviceId || getDeviceId(),
    syncStatus: record.syncStatus || opts?.syncStatus || "local",
  };
}

export function withUpdateMeta<T extends SyncMeta>(record: T, opts?: { syncStatus?: SyncStatus }): T {
  const timestamp = nowIso();
  return {
    ...record,
    updatedAt: timestamp,
    version: typeof record.version === "number" ? record.version + 1 : 1,
    deviceId: record.deviceId || getDeviceId(),
    syncStatus: record.syncStatus || opts?.syncStatus || "local",
  };
}

export function ensureMeta<T extends SyncMeta>(record: T, opts?: { exportedAt?: string }): T {
  const timestamp = opts?.exportedAt || nowIso();
  return {
    ...record,
    createdAt: record.createdAt || timestamp,
    updatedAt: record.updatedAt || timestamp,
    version: typeof record.version === "number" ? record.version : 1,
    deviceId: record.deviceId || getDeviceId(),
    syncStatus: record.syncStatus || "local",
  };
}


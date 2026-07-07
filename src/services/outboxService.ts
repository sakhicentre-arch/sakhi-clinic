import type { SyncOutboxEntry } from "./db";
import { db } from "./db";
import { getDeviceId } from "../utils/deviceId";
import { generateId } from "../utils/generateId";

const nowIso = () => new Date().toISOString();

export type EnqueueOutboxInput = Omit<
  SyncOutboxEntry,
  "id" | "timestamp" | "deviceId" | "syncStatus" | "retryCount" | "lastAttemptAt"
> & {
  id?: string;
  timestamp?: string;
  deviceId?: string;
  syncStatus?: SyncOutboxEntry["syncStatus"];
  retryCount?: number;
  lastAttemptAt?: string;
};

export function buildOutboxEntry(input: EnqueueOutboxInput): SyncOutboxEntry {
  return {
    id: input.id || generateId(),
    entityType: input.entityType,
    entityId: input.entityId,
    operationType: input.operationType,
    payload: input.payload,
    version: input.version,
    deviceId: input.deviceId || getDeviceId(),
    timestamp: input.timestamp || nowIso(),
    syncStatus: input.syncStatus || "pending",
    retryCount: typeof input.retryCount === "number" ? input.retryCount : 0,
    lastAttemptAt: input.lastAttemptAt,
  };
}

export async function enqueueOutbox(input: EnqueueOutboxInput): Promise<void> {
  const entry = buildOutboxEntry(input);
  await db.syncOutbox.put(entry);
}

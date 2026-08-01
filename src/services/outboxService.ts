import type { SyncOutboxEntry } from "./db";
import { db } from "./db";
import { getDeviceId } from "../utils/deviceId";
import { generateId } from "../utils/generateId";

// Monotonic: two entries built in the same millisecond (routine in a fast
// enqueue loop) must still get strictly increasing timestamps, since
// enforceOutboxCap's pruning relies on `timestamp` to find the oldest rows.
// A plain `new Date().toISOString()` can tie under rapid sequential calls,
// and ties are broken by primary-key order, which is a random id
// (generateId()), not creation order -- see enforceOutboxCap's fallback sort.
let lastTimestampMs = 0;
const nowIso = () => {
  const ms = Math.max(Date.now(), lastTimestampMs + 1);
  lastTimestampMs = ms;
  return new Date(ms).toISOString();
};

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

// NOTE: enforceOutboxCap() is deliberately NOT called from here.
//
// It was originally wired in on every enqueue, which means every single
// enqueueOutbox() call -- itself invoked from inside the same rw transaction
// as every patient/appointment/consultation save -- could incur its cost.
// Certification-pass measurement (perfMeasurement.test.ts) found that cost is
// NOT small once the outbox nears its cap: a full run at the real 10,000-row
// cap measured 100+ SECONDS in this test harness, even after chunking the
// delete. Wiring that into the same await chain as a clinical save would have
// stalled the doctor's save for over a minute the moment the outbox crossed
// its cap -- a severe defect, not a proportionate cost.
//
// enforceOutboxCap() is instead called from maintenanceRuntimeService.ts's
// periodic background run (every 5 minutes, and once at app start), which
// already exists in this codebase for exactly this class of work and never
// runs inside a clinical write's await chain.

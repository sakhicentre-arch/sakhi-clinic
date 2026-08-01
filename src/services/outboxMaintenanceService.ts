import { db, SyncOutboxEntry } from "./db";
import { DEFAULT_MAINTENANCE_POLICIES } from "./maintenancePolicies";

const nowIso = () => new Date().toISOString();

/**
 * Module A: maxOutboxEntries was declared in maintenancePolicies.ts but never
 * enforced anywhere — the queue could grow without bound. The outbox has no
 * consumer today (nothing ever marks an entry "synced" from a real sync
 * process, and no other code path reads it as a source of truth), so pruning
 * it can never lose clinical data; patients/consultations/appointments are
 * the source of truth and are never touched here.
 *
 * Policy: prefer discarding the oldest SYNCED entries first (already synced,
 * so nothing un-synced is lost). Only if still over the cap after removing
 * every synced row does this fall back to the oldest entries overall
 * (pending/failed/conflict) — a bounded queue that never grows forever beats
 * one that preserves every row indefinitely.
 *
 * Certification-pass measurement (see perfMeasurement.test.ts): a full
 * enforceOutboxCap() run at the real 10,000-row cap measured 100+ SECONDS in
 * this test harness -- this function must NEVER be called from a clinical
 * write's await chain (it originally was; see outboxService.ts's comment on
 * enqueueOutbox for why that was wrong and how it was corrected). It is only
 * safe to call from the periodic background maintenance runtime
 * (maintenanceRuntimeService.ts), never inline with a save.
 *
 * PRUNE_TARGET_RATIO prunes down to 90% of the cap rather than exactly the
 * cap -- a hysteresis buffer, not a schema or architecture change -- so
 * there is headroom (10% of the cap) before the NEXT background run needs to
 * scan and prune again. This does not fix the underlying per-call cost; it
 * only reduces how often that cost is paid.
 */
const PRUNE_TARGET_RATIO = 0.9;

// Certification-pass measurement (see perfMeasurement.test.ts): a single
// bulkDelete's cost was measured to scale SUPER-linearly with key count in
// this test harness (fake-indexeddb) -- 18x the cost for only 4x the delete
// volume, and deleting ~1,000 keys out of a 10,000-row table did not
// complete within 100+ seconds even with this chunking applied. Whether real
// browser IndexedDB shares this scaling characteristic is UNVERIFIED -- no
// on-device measurement was possible in this environment. Chunking is kept
// as a safe, well-known IndexedDB pattern regardless of engine, but it did
// NOT resolve the underlying cost by itself (see the module comment above)
// -- moving this function off the clinical write path is what did.
const DELETE_CHUNK_SIZE = 200;

async function chunkedBulkDelete(ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += DELETE_CHUNK_SIZE) {
    await db.syncOutbox.bulkDelete(ids.slice(i, i + DELETE_CHUNK_SIZE));
  }
}

export async function enforceOutboxCap(
  maxEntries: number = DEFAULT_MAINTENANCE_POLICIES.maxOutboxEntries
): Promise<number> {
  const total = await db.syncOutbox.count();
  if (total <= maxEntries) return 0;

  const target = Math.floor(maxEntries * PRUNE_TARGET_RATIO);
  const excess = total - target;

  // Secondary key on `id` makes this a total order even if two rows ever
  // share a `timestamp` (nowIso() is monotonic for auto-generated timestamps,
  // but callers may pass an explicit, non-unique one) -- deterministic beats
  // "usually right", since a tie here previously fell back to random
  // primary-key order (generateId()) and picked a different "oldest" row
  // between otherwise-identical runs.
  const byTimestampThenId = (a: SyncOutboxEntry, b: SyncOutboxEntry) =>
    a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id);

  const synced = await db.syncOutbox.where("syncStatus").equals("synced").toArray();
  synced.sort(byTimestampThenId);
  let toDelete = synced.slice(0, excess).map((r) => r.id);

  const stillExcess = excess - toDelete.length;
  if (stillExcess > 0) {
    const alreadyMarked = new Set(toDelete);
    const rest = await db.syncOutbox.toArray();
    const fallback = rest
      .filter((r) => !alreadyMarked.has(r.id))
      .sort(byTimestampThenId)
      .slice(0, stillExcess)
      .map((r) => r.id);
    toDelete = toDelete.concat(fallback);
  }

  if (toDelete.length) await chunkedBulkDelete(toDelete);
  return toDelete.length;
}

export type OutboxHealthReport = {
  total: number;
  pending: number;
  failed: number;
  conflict: number;
  synced: number;
  oldestPendingAt: string | null;
  newestAt: string | null;
  recent: Array<Pick<SyncOutboxEntry, "id" | "entityType" | "entityId" | "operationType" | "timestamp" | "syncStatus" | "retryCount">>;
};

export async function getOutboxHealthReport(limitRecent = 20): Promise<OutboxHealthReport> {
  const rows = await db.syncOutbox.orderBy("timestamp").toArray();
  const total = rows.length;
  const pending = rows.filter((r) => r.syncStatus === "pending").length;
  const failed = rows.filter((r) => r.syncStatus === "failed").length;
  const conflict = rows.filter((r) => r.syncStatus === "conflict").length;
  const synced = rows.filter((r) => r.syncStatus === "synced").length;
  const oldestPendingAt = rows.find((r) => r.syncStatus === "pending")?.timestamp || null;
  const newestAt = rows.length ? rows[rows.length - 1].timestamp : null;
  const recent = rows
    .slice(-Math.max(0, limitRecent))
    .reverse()
    .map((r) => ({
      id: r.id,
      entityType: r.entityType,
      entityId: r.entityId,
      operationType: r.operationType,
      timestamp: r.timestamp,
      syncStatus: r.syncStatus,
      retryCount: r.retryCount,
    }));

  return { total, pending, failed, conflict, synced, oldestPendingAt, newestAt, recent };
}

export async function pruneSynced(keepLatestSyncedPerEntity = 0): Promise<number> {
  const synced = await db.syncOutbox.where("syncStatus").equals("synced").toArray();
  if (synced.length === 0) return 0;

  if (keepLatestSyncedPerEntity <= 0) {
    await db.syncOutbox.bulkDelete(synced.map((s) => s.id));
    return synced.length;
  }

  const byEntity = new Map<string, SyncOutboxEntry[]>();
  for (const row of synced) {
    const key = `${row.entityType}:${row.entityId}`;
    const list = byEntity.get(key) || [];
    list.push(row);
    byEntity.set(key, list);
  }

  const toDelete: string[] = [];
  byEntity.forEach((list) => {
    list.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const excess = Math.max(0, list.length - keepLatestSyncedPerEntity);
    for (let i = 0; i < excess; i++) toDelete.push(list[i].id);
  });

  if (toDelete.length) await db.syncOutbox.bulkDelete(toDelete);
  return toDelete.length;
}

export async function retryFailed(maxRetryCount = 5): Promise<number> {
  const failed = await db.syncOutbox.where("syncStatus").equals("failed").toArray();
  const eligible = failed.filter((r) => (r.retryCount || 0) < maxRetryCount);
  if (eligible.length === 0) return 0;

  const ts = nowIso();
  await db.syncOutbox.bulkPut(
    eligible.map((r) => ({
      ...r,
      syncStatus: "pending" as const,
      retryCount: (r.retryCount || 0) + 1,
      lastAttemptAt: ts,
    }))
  );
  return eligible.length;
}

export async function markConflict(outboxId: string, reason?: string): Promise<boolean> {
  const existing = await db.syncOutbox.get(outboxId);
  if (!existing) return false;
  await db.syncOutbox.put({
    ...existing,
    syncStatus: "conflict",
    payload: reason ? { ...existing.payload, _conflictReason: reason } : existing.payload,
    lastAttemptAt: nowIso(),
  });
  return true;
}

// Compaction: keep only the last relevant operations per entity to prevent unbounded growth.
// Rules:
// - If a delete exists, keep only the latest delete (and drop earlier creates/updates).
// - Otherwise keep the latest create (if any) and the latest update (if any), preferring update as the final state.
export async function compactEntity(entityType: SyncOutboxEntry["entityType"], entityId: string): Promise<number> {
  const rows = await db.syncOutbox
    .where("entityId")
    .equals(entityId)
    .filter((r) => r.entityType === entityType)
    .toArray();
  if (rows.length <= 1) return 0;

  // Don't compact conflicts; keep full audit trail for manual resolution.
  const compactable = rows.filter((r) => r.syncStatus !== "conflict");
  if (compactable.length <= 1) return 0;

  compactable.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const deletes = compactable.filter((r) => r.operationType === "delete");
  const keep: Set<string> = new Set();

  if (deletes.length > 0) {
    keep.add(deletes[deletes.length - 1].id);
  } else {
    const creates = compactable.filter((r) => r.operationType === "create");
    const updates = compactable.filter((r) => r.operationType === "update");
    if (creates.length > 0) keep.add(creates[creates.length - 1].id);
    if (updates.length > 0) keep.add(updates[updates.length - 1].id);
    if (keep.size === 0) keep.add(compactable[compactable.length - 1].id);
  }

  const toDelete = compactable.map((r) => r.id).filter((id) => !keep.has(id));
  if (toDelete.length) await db.syncOutbox.bulkDelete(toDelete);
  return toDelete.length;
}


import { db, SyncOutboxEntry } from "./db";

const nowIso = () => new Date().toISOString();

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


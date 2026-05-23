import { db, OperationalEvent, OperationalEventLevel } from "./db";

const nowIso = () => new Date().toISOString();

export type LogOperationalEventInput = {
  level: OperationalEventLevel;
  type: string;
  message: string;
  data?: any;
  timestamp?: string;
  id?: string;
};

export async function logOperationalEvent(input: LogOperationalEventInput): Promise<OperationalEvent> {
  const event: OperationalEvent = {
    id: input.id || crypto.randomUUID(),
    timestamp: input.timestamp || nowIso(),
    level: input.level,
    type: input.type,
    message: input.message,
    data: input.data,
  };

  await db.operationalEvents.put(event);
  return event;
}

export async function getRecentOperationalEvents(limit = 50): Promise<OperationalEvent[]> {
  const rows = await db.operationalEvents.orderBy("timestamp").toArray();
  return rows.slice(-Math.max(0, limit)).reverse();
}

export async function pruneOperationalEvents(maxRows: number): Promise<number> {
  if (maxRows <= 0) return 0;
  const rows = await db.operationalEvents.orderBy("timestamp").toArray();
  const excess = Math.max(0, rows.length - maxRows);
  if (excess === 0) return 0;
  const toDelete = rows.slice(0, excess).map((r) => r.id);
  await db.operationalEvents.bulkDelete(toDelete);
  return toDelete.length;
}

import { generateId } from "../utils/generateId";

export type SyncEventType =
  | "patient:created"
  | "patient:updated"
  | "patient:deleted"
  | "patient:restored"
  | "appointment:created"
  | "appointment:updated"
  | "appointment:deleted"
  | "consultation:saved"
  | "queue:snapshot"
  | "queue:snapshot-request"
  | "queue:snapshot-response";

export interface SyncMessage<T = Record<string, unknown>> {
  type: SyncEventType;
  payload: T;
  origin?: string;
  messageId?: string;
  timestamp?: number;
}

const STORAGE_KEY = "__sakhi_sync_message";
const CHANNEL_NAME = "sakhi-sync";
const clientId = generateId();

const listeners = new Set<(message: SyncMessage) => void>();
let channel: BroadcastChannel | null = null;
let initialized = false;
let hydrationComplete = false;
const pendingMessages: SyncMessage[] = [];
const processedMessageIds = new Set<string>();

const canUseBroadcast = typeof window !== "undefined" && "BroadcastChannel" in window;
const canUseLocalStorage = typeof window !== "undefined" && typeof window.localStorage !== "undefined";

function isSyncMessage(value: unknown): value is SyncMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as any).type === "string" &&
    typeof (value as any).payload === "object"
  );
}

function createMessage<T extends Record<string, unknown>>(
  message: Omit<SyncMessage<T>, "origin" | "messageId" | "timestamp">
): SyncMessage<T> {
  return {
    ...message,
    origin: clientId,
    messageId: `${clientId}-${Date.now()}-${Math.random()}`,
    timestamp: Date.now(),
  };
}

function dispatchMessage(message: SyncMessage) {
  if (message.messageId && processedMessageIds.has(message.messageId)) return;
  if (message.messageId) {
    processedMessageIds.add(message.messageId);
    if (processedMessageIds.size > 2000) {
      const oldest = processedMessageIds.values().next().value;
      processedMessageIds.delete(oldest);
    }
  }

  listeners.forEach((listener) => {
    try {
      listener(message);
    } catch (error) {
      console.error("[syncService] listener error:", error);
    }
  });
}

function handleIncoming(raw: unknown) {
  if (!isSyncMessage(raw)) return;
  if (raw.origin === clientId) return;
  if (!raw.messageId || !raw.type) return;
  if (processedMessageIds.has(raw.messageId)) return;

  if (!hydrationComplete) {
    pendingMessages.push(raw);
    return;
  }

  dispatchMessage(raw);
}

function postMessage(message: SyncMessage) {
  if (!initialized) return;
  if (canUseBroadcast && channel) {
    channel.postMessage(message);
  }

  if (canUseLocalStorage) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(message));
    } catch (error) {
      console.warn("[syncService] localStorage fallback failed:", error);
    }
  }
}

export function initSyncService() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  if (canUseBroadcast) {
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (event) => {
        handleIncoming(event.data);
      };
    } catch (error) {
      console.warn("[syncService] BroadcastChannel unavailable:", error);
      channel = null;
    }
  }

  if (canUseLocalStorage) {
    window.addEventListener("storage", (event) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(event.newValue);
      } catch {
        return;
      }
      handleIncoming(parsed);
    });
  }

  window.addEventListener("beforeunload", () => {
    channel?.close();
  });
}

export function notifyHydrationComplete() {
  hydrationComplete = true;
  while (pendingMessages.length > 0) {
    const message = pendingMessages.shift();
    if (message) dispatchMessage(message);
  }
}

export function subscribeToSync(listener: (message: SyncMessage) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function broadcastSyncEvent<T extends Record<string, unknown>>(
  event: Omit<SyncMessage<T>, "origin" | "messageId" | "timestamp">
) {
  const message = createMessage(event);
  postMessage(message);
}

export function requestQueueSnapshot() {
  broadcastSyncEvent({ type: "queue:snapshot-request", payload: {} });
}

export function broadcastQueueSnapshot(queue: unknown[]) {
  broadcastSyncEvent({ type: "queue:snapshot", payload: { queue } });
}

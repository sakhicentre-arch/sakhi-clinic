import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  subscribeToSync,
  broadcastQueueSnapshot,
} from "../services/syncService";

let skipQueueBroadcast = false;

const triggerQueueSnapshot = (getQueue: () => QueueEntry[]) => {
  if (skipQueueBroadcast) return;
  broadcastQueueSnapshot(getQueue());
};

export type QueueAlerts = {
  hasPendingPayment: boolean;
  pendingAmount: number;
  isFirstVisit: boolean;
  missedFollowUp: boolean;
};

export type QueueStatus = "waiting" | "in-progress" | "done" | "skipped";

export type QueueEntry = {
  queueId: string;
  patientId: string;
  appointmentId: string;
  patientName: string;
  clinic: "Dabholi" | "City Light";
  addedAt: string;
  status: QueueStatus;
  alerts: QueueAlerts;
};

type QueueStore = {
  queue: QueueEntry[];

  addToQueue: (entry: Omit<QueueEntry, "queueId" | "addedAt" | "status">) => void;
  removeFromQueue: (queueId: string) => void;
  setStatus: (queueId: string, status: QueueStatus) => void;
  moveUp: (queueId: string) => void;
  moveDown: (queueId: string) => void;
  clearQueue: () => void;

  isInQueue: (patientId: string) => boolean;
  getActiveEntry: () => QueueEntry | null;
};

export const useQueueStore = create<QueueStore>()(
  persist(
    (set, get) => ({
      queue: [],

      addToQueue: (entry) => {
        const state = get();
        // Prevent duplicates
        if (state.queue.some((e) => e.patientId === entry.patientId)) {
          return;
        }
        const queueEntry: QueueEntry = {
          // FIXED: status defaults to "waiting" so callers don't need to pass it
          status: "waiting",
          ...entry,
          queueId: `queue-${Date.now()}`,
          addedAt: new Date().toISOString(),
        };
        set((state) => ({
          queue: [...state.queue, queueEntry],
        }));
        triggerQueueSnapshot(() => get().queue);
      },

      removeFromQueue: (queueId) => {
        set((state) => ({
          queue: state.queue.filter((e) => e.queueId !== queueId),
        }));
        triggerQueueSnapshot(() => get().queue);
      },

      setStatus: (queueId, status) => {
        set((state) => ({
          queue: state.queue.map((e) =>
            e.queueId === queueId ? { ...e, status } : e
          ),
        }));
        triggerQueueSnapshot(() => get().queue);
      },

      moveUp: (queueId) => {
        set((state) => {
          const index = state.queue.findIndex((e) => e.queueId === queueId);
          if (index <= 0) return state;
          const newQueue = [...state.queue];
          [newQueue[index], newQueue[index - 1]] = [newQueue[index - 1], newQueue[index]];
          return { queue: newQueue };
        });
        triggerQueueSnapshot(() => get().queue);
      },

      moveDown: (queueId) => {
        set((state) => {
          const index = state.queue.findIndex((e) => e.queueId === queueId);
          if (index < 0 || index >= state.queue.length - 1) return state;
          const newQueue = [...state.queue];
          [newQueue[index], newQueue[index + 1]] = [newQueue[index + 1], newQueue[index]];
          return { queue: newQueue };
        });
        triggerQueueSnapshot(() => get().queue);
      },

      clearQueue: () => {
        set({ queue: [] });
        triggerQueueSnapshot(() => get().queue);
      },

      isInQueue: (patientId) => {
        return get().queue.some((e) => e.patientId === patientId);
      },

      getActiveEntry: () => {
        const waitingEntry = get().queue.find((e) => e.status === "waiting");
        return waitingEntry || null;
      },
    }),
    {
      name: "sakhi-queue",
      // FIXED: createJSONStorage() returns correct PersistStorage type
      storage: createJSONStorage(() =>
        typeof window !== "undefined" ? window.sessionStorage : sessionStorage
      ),
    }
  )
);

if (typeof window !== "undefined") {
  subscribeToSync((message) => {
    switch (message.type) {
      case "queue:snapshot-request": {
        broadcastQueueSnapshot(useQueueStore.getState().queue);
        break;
      }
      case "queue:snapshot":
      case "queue:snapshot-response": {
        const payload = message.payload as { queue?: QueueEntry[] };
        if (!payload || !Array.isArray(payload.queue)) return;

        skipQueueBroadcast = true;
        useQueueStore.setState({ queue: payload.queue });
        skipQueueBroadcast = false;
        break;
      }
      default:
        break;
    }
  });
}

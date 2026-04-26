import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

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
      },

      removeFromQueue: (queueId) => {
        set((state) => ({
          queue: state.queue.filter((e) => e.queueId !== queueId),
        }));
      },

      setStatus: (queueId, status) => {
        set((state) => ({
          queue: state.queue.map((e) =>
            e.queueId === queueId ? { ...e, status } : e
          ),
        }));
      },

      moveUp: (queueId) => {
        set((state) => {
          const index = state.queue.findIndex((e) => e.queueId === queueId);
          if (index <= 0) return state;
          const newQueue = [...state.queue];
          [newQueue[index], newQueue[index - 1]] = [newQueue[index - 1], newQueue[index]];
          return { queue: newQueue };
        });
      },

      moveDown: (queueId) => {
        set((state) => {
          const index = state.queue.findIndex((e) => e.queueId === queueId);
          if (index < 0 || index >= state.queue.length - 1) return state;
          const newQueue = [...state.queue];
          [newQueue[index], newQueue[index + 1]] = [newQueue[index + 1], newQueue[index]];
          return { queue: newQueue };
        });
      },

      clearQueue: () => {
        set({ queue: [] });
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
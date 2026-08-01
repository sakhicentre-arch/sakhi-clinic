/**
 * reminderAnalyticsService.ts
 * Sakhi Clinic — Reminder Engine: analytics (Phase 2).
 *
 * Single responsibility: aggregate reminderQueue/reminderHistory into
 * operational-visibility numbers. Read-only -- never mutates queue state
 * (that's reminderQueueService.ts/reminderDeliveryService.ts's job).
 */

import { db } from "./db";
import { getReminderHistory } from "./reminderDeliveryService";
import { countStalePendingReminders } from "./reminderMaintenanceService";
import type { ReminderHistoryEntry, ReminderStatus } from "./db";

export interface ReminderAnalytics {
  generatedAt: string;
  countsByStatus: Record<ReminderStatus, number>;
  totalQueued: number;
  sentCount: number;
  failedCount: number;
  deliverySuccessRate: number; // sent / (sent + failed), 0-100
  stalePendingCount: number;
  recentHistory: ReminderHistoryEntry[];
}

const ALL_STATUSES: ReminderStatus[] = ["pending", "approved", "sent", "failed", "cancelled", "rejected"];

export async function getReminderAnalytics(referenceDate: Date = new Date()): Promise<ReminderAnalytics> {
  const [allReminders, recentHistory, stalePendingCount] = await Promise.all([
    db.reminderQueue.toArray(),
    getReminderHistory(50),
    countStalePendingReminders(3, referenceDate),
  ]);

  const countsByStatus = ALL_STATUSES.reduce((acc, status) => {
    acc[status] = 0;
    return acc;
  }, {} as Record<ReminderStatus, number>);

  for (const r of allReminders) {
    countsByStatus[r.status] = (countsByStatus[r.status] || 0) + 1;
  }

  const sentCount = countsByStatus.sent;
  const failedCount = countsByStatus.failed;
  const resolved = sentCount + failedCount;
  const deliverySuccessRate = resolved > 0 ? Math.round((sentCount / resolved) * 100) : 0;

  return {
    generatedAt: new Date().toISOString(),
    countsByStatus,
    totalQueued: allReminders.length,
    sentCount,
    failedCount,
    deliverySuccessRate,
    stalePendingCount,
    recentHistory,
  };
}

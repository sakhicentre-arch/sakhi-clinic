export type MaintenanceRuntimePolicies = {
  // Outbox safety bounds
  maxOutboxEntries: number;
  prune: {
    // When pruning synced entries, keep the latest N synced entries per entity for audit.
    keepLatestSyncedPerEntity: number;
    // Only prune when synced entries exceed this threshold.
    minSyncedEntriesToPrune: number;
  };
  retry: {
    // Max retries before giving up and leaving an entry in "failed".
    maxRetryCount: number;
  };
  integrity: {
    // Minimum minutes between integrity checks while the app is open.
    minMinutesBetweenChecks: number;
  };
  backup: {
    // Used by reporting only; no UI reminders are triggered here.
    staleAfterDays: number;
  };
  events: {
    // Cap local event log growth.
    maxRows: number;
  };
};

export const DEFAULT_MAINTENANCE_POLICIES: MaintenanceRuntimePolicies = {
  maxOutboxEntries: 10_000,
  prune: {
    keepLatestSyncedPerEntity: 1,
    minSyncedEntriesToPrune: 250,
  },
  retry: {
    maxRetryCount: 5,
  },
  integrity: {
    minMinutesBetweenChecks: 60,
  },
  backup: {
    staleAfterDays: 7,
  },
  events: {
    maxRows: 500,
  },
};

export function mergeMaintenancePolicies(
  base: MaintenanceRuntimePolicies,
  overrides?: Partial<MaintenanceRuntimePolicies>
): MaintenanceRuntimePolicies {
  if (!overrides) return base;
  return {
    ...base,
    ...overrides,
    prune: { ...base.prune, ...(overrides.prune || {}) },
    retry: { ...base.retry, ...(overrides.retry || {}) },
    integrity: { ...base.integrity, ...(overrides.integrity || {}) },
    backup: { ...base.backup, ...(overrides.backup || {}) },
    events: { ...base.events, ...(overrides.events || {}) },
  };
}


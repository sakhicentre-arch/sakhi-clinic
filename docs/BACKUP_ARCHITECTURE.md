# Backup Management System — Architecture

Sakhi Clinic's backup subsystem separates four concerns that were previously
entangled: **authentication**, **destination**, **mode**, and **operations**.
Each has exactly one owner. Nothing outside that owner is allowed to mutate
its state.

## The four concerns

| Concern | Owner | Persisted? | Notes |
|---|---|---|---|
| Authentication | `googleOAuthService.ts` | Yes (`localStorage`, OAuth tokens) | Means only "Google Drive is available." Never touches destination. |
| Destination | `backupSettingsService.ts` | Yes (`localStorage`, `sakhi.backup.settings.v1`) | The doctor's explicit choice of *where* backups go. |
| Mode | `backupSettingsService.ts` (same file/key) | Yes | Manual vs. automatic, and (for automatic) a frequency preference. |
| Operations | `backupManager.ts` | N/A (stateless orchestration) | Export/import/restore pipeline; resolves destination fresh on every call. |

**The rule that makes this hold**: connecting Google Drive (authentication)
never calls anything that changes destination. The only function that can
change destination is `setBackupDestination()`, and the only caller of it
in production code is the doctor clicking a destination chip in Settings.

## Data flow

```
                    ┌─────────────────────────┐
                    │   googleOAuthService     │  authentication only
                    │   (unchanged — OAuth)    │  "is Drive available?"
                    └────────────┬─────────────┘
                                 │ read-only
                                 ▼
┌──────────────────┐   ┌─────────────────────┐   ┌────────────────────┐
│  SettingsPage.tsx │──▶│ backupSettingsService│──▶│  providerRegistry   │
│  (destination /   │   │ (destination, mode,  │   │  id -> StorageProv. │
│   mode UI)        │   │  frequency;          │   │  (local, google-    │
└─────────┬────────┘   │  localStorage)        │   │   drive, ...future) │
          │             └──────────┬───────────┘   └──────────┬──────────┘
          │  polls              │ read                      │ lookup
          │  job progress       ▼                           ▼
          │           ┌─────────────────────────────────────────────┐
          └──────────▶│              backupManager.ts                │
                       │  getActiveProvider() = registry[settings.dest]│
                       │  runExport / runImport / runImportFromProvider│
                       │  previewLocalFile / previewRemoteBackup /     │
                       │    confirmPendingRestore / cancelPendingRestore│
                       │  listRestorableBackups / deleteRemoteBackup   │
                       │  runAutoIfDue (+ reactive local fallback)     │
                       └───────────────────┬───────────────────────────┘
                                            │ StorageProvider interface
                              ┌─────────────┴──────────────┐
                              ▼                             ▼
                   ┌────────────────────┐        ┌───────────────────────┐
                   │ localBackupProvider │        │  googleDriveProvider   │
                   │ (file download +    │        │  (Drive API v3 —       │
                   │  Cache Storage)      │        │  upload/list/load/del) │
                   └────────────────────┘        └───────────────────────┘

┌───────────────────────────┐
│  backupSchedulerService    │  its own setInterval, start/stopped by
│  (real periodic trigger)   │  appLifecycleRuntimeService on visibility --
└─────────────┬──────────────┘  calls runAutoBackupIfDue() -> runAutoIfDue()
              └──────────────────────────────────────────────────────────┘
```

`backupManager.ts` never imports `googleDriveProvider` or
`googleOAuthService` directly — only `providerRegistry.ts` does. Adding
OneDrive/Dropbox/S3/iCloud later means: implement `StorageProvider`,
register it in `providerRegistry.ts`. Nothing else changes.

## Files

| File | Role |
|---|---|
| `src/services/backup/storageProvider.ts` | The `StorageProvider` interface every provider implements (pre-existing, reused as-is; `StorageProviderListEntry` now also carries optional `createdAt`). |
| `src/services/backup/providers/localBackupProvider.ts` | Local file download + Cache Storage retention (pre-existing, unchanged). |
| `src/services/backup/providers/googleDriveProvider.ts` | Drive API v3 provider (pre-existing; `list()` now also returns `createdAt` for the restore picker). |
| `src/services/backup/providers/providerRegistry.ts` | id → `StorageProvider` lookup. The only file allowed to import concrete providers. |
| `src/services/backup/backupSettingsService.ts` | `BackupSettings` model (`destination`, `autoBackupEnabled`, `frequency`), persisted to `localStorage`. Single source of truth for destination/mode. |
| `src/services/backup/backupJobService.ts` | Job lifecycle tracking (pre-existing). `listRecentJobs` now sorts by completion time (`completedAt ?? updatedAt ?? createdAt`), not creation time — needed so a job created *during* another (the pre-restore safety snapshot) never displaces the operation it's nested in as "most recent." |
| `src/services/backup/backupManager.ts` | Orchestrator. Resolves the active provider from settings on every call — no in-memory provider variable. Owns restore dispatch, the preview/confirm API, the pre-restore safety snapshot, and the auto-backup fallback. |
| `src/services/backup/backupSchedulerService.ts` | Real periodic trigger for Automatic Backup — an interval (15 min default, 60s floor), start/stopped on tab visibility exactly like `maintenanceRuntimeService.ts`. |
| `src/services/backup/oauth/completeGoogleDriveConnection.ts` | OAuth redirect landing (simplified). Authentication only — never touches destination. |
| `src/services/backupService.ts` | Public compatibility API. `RestorePreviewResult` is a flat optional-fields type, not a discriminated union — see "A tsconfig gotcha" below. |
| `src/pages/SettingsPage.tsx` | UI: the "Backup & Restore" section — Backup Health Dashboard, Google Drive auth status, destination selector, mode/frequency, dynamic action buttons, the validation preview panel, the Drive backup browser (list/refresh/delete), live progress, and Backup History. |

## Settings model

```ts
interface BackupSettings {
  destination: string;        // a StorageProvider id: "local" | "google-drive" | ...future
  autoBackupEnabled: boolean;
  frequency: "daily" | "weekly" | "before-update" | "before-restore";
}
```

Deliberately **not** included: `lastBackup`/`lastRestore`. Those already had
a single source of truth before this redesign (`storageHealthService.ts`,
written by `backupManager.ts` on every successful operation) — duplicating
them into `BackupSettings` would violate the "single source of truth"
principle this whole redesign exists to enforce. `SettingsPage.tsx` reads
both sources and presents them together; they were never two different
facts, just two files that already agreed.

`destination` is a plain `string` (a provider id), not a closed union —
adding a new provider never requires touching this file.

## Restore: validation preview before every restore

The doctor never restores blind. Choosing a file (local) or a backup (Drive)
opens a **preview**, not an immediate restore:

```
Local:  previewLocalFile(file)          -> parses, validates, holds the result
Remote: previewRemoteBackup(filename)   -> downloads, parses, validates, holds the result
                    │
                    ▼
        BackupPreview { filename, exportedAt, deviceId, patients,
                         consultations, checksumStatus, compressed, encrypted }
                    │
         doctor reviews in Settings' preview panel
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
confirmPendingRestore(token)   cancelPendingRestore()
        │                       │
   executeRestore()        discards, restores nothing
```

`parseAndValidateBackup()` (parsing, decompression, decryption, checksum
verification) and `executeRestore()` (the safety snapshot +
`deserializeAndRestore` + job bookkeeping) are each written exactly once and
shared by both the preview flow and the legacy `runImport`/
`runImportFromProvider` functions kept for backward compatibility (native
`window.confirm()`-based; no longer called by the UI, but still exercised by
existing tests). Only one preview is held at a time — a single-user,
single-tab, seconds-long interaction never needs more; a token defends
`confirmPendingRestore` against acting on a stale preview.

No UI branching beyond *which input widget* to show (a local file input has
no remote equivalent — that part is unavoidably UI-layer). Everything about
*how* a restore actually happens lives in `backupManager.ts`.

## Restore safety snapshot

Immediately before every restore's destructive overwrite — local or
remote, preview-based or legacy — `executeRestore()` takes a local-only
backup first (`takeRestoreSafetySnapshot()`), through the same tracked
pipeline as any other backup, so it's visible in Backup History like
anything else. Deliberately:

- **Always local**, never the configured destination — the point is a fast,
  dependency-free safety net right before something destructive; a
  network-dependent remote upload would undermine that.
- **Unconditional**, not gated on Automatic Backup being enabled — a restore
  is destructive enough that this one isn't opt-in.
- **Best-effort** — a failure here is logged but never blocks the actual
  restore.

This is why `listRecentJobs` had to stop sorting by creation time (see the
Files table above): the snapshot job is *created* mid-restore, after the
restore job, but the restore job still *finishes* later — sorting by
completion time reports the restore, correctly, as the doctor's most recent
operation.

## Automatic backup: mode, scheduling, and fallback

**Mode**: `autoBackupEnabled` + `frequency` (`backupSettingsService.ts`),
purely a doctor preference, independent of destination and auth.

**Scheduling**: `backupSchedulerService.ts` runs a real periodic interval
(while the tab is open and visible — see its own file comment for the
honest ceiling on that) calling `runAutoBackupIfDue()`, the same function
app-start and visibility-resume already called. All "is it due" logic
(the `autoBackupEnabled` gate, the daily/weekly staleness window) lives in
`backupManager.ts`'s `runAutoIfDue` — the scheduler only decides *when to
ask*.

**Fallback**: if a save against the configured destination fails for *any*
reason (not connected, expired token, network, quota), `runAutoIfDue`
retries once against local, logs a `backup.auto.destination_unavailable`
operational event, and keeps *both* job records — the failed remote attempt
and the successful local fallback — rather than hiding the failure. This is
reactive (an actual save attempt failed), not a pre-check against
`StorageProvider.available`, because `available` reflects configuration
(`isConfigured()`), not live sign-in state — a pre-check would miss the most
common real case: destination chosen, not yet connected.

Manual operations (`runExport`) have no such fallback — an unattended
failure needs a safety net; an attended one (the doctor is looking at the
screen) should fail visibly so they can act, not silently redirect
somewhere they didn't choose.

## Backup Health Dashboard

One plain-language status line in Settings (Healthy / Attention / Critical),
composed entirely from signals that already existed — no new backend:
`isBackupStale()`/`getBackupAgeDays()` (`storageHealthService.ts`),
`failedJobCount` (from `listRecentJobs`), and whether the chosen destination
is actually connected. Priority order: a failed job outranks a merely-stale
backup, which outranks a misconfigured-but-untried destination.

## Progress feedback

`BackupJob` records already update live in Dexie as a pipeline runs
(`recordEvent` after every stage, `uploadProgressPercent` during a chunked
upload). Rather than thread a callback through every `backupManager.ts`
function signature, `SettingsPage.tsx` polls `listRecentJobs(1)` every
400ms while an operation is in flight and shows the latest event's message
next to the button. Same data either way; polling was the lower-risk choice
given how much of `backupManager.ts`'s call graph had already changed this
iteration.

## A tsconfig gotcha worth knowing about

This project's root `tsconfig.json` has `strictNullChecks: false`. Under
that setting, TypeScript's control-flow narrowing of discriminated unions
(`if (result.ok) result.token` / `if (!result.ok) result.error`) does not
reliably eliminate the other branch's shape — `tsc` reports "property does
not exist" on the branch that *should* have been narrowed away, regardless
of which direction the check goes. `backupManager.ts`'s internal API
(`buildPreview`, `confirmPendingRestore`, etc.) still uses a clean
discriminated union — it works there because nothing in that file relies on
narrowing it, and the test suite that exercises it isn't `tsc`-checked
(`src/__tests__` is excluded from the root tsconfig). But
`backupService.ts`'s UI-facing `RestorePreviewResult` is deliberately a flat
type with every field optional instead: always a valid property access
regardless of `ok`, no narrowing required. If you add a new discriminated
result type that a `.tsx` file needs to branch on, use this same flat-shape
pattern rather than rediscovering this the hard way.

## Known extension points (not yet implemented)

- **`frequency: "before-update"`** — no code path calls `runAutoIfDue` from
  an app-update-detected event; this app has no such lifecycle hook yet.
  Wiring it later is additive: call `runAutoIfDue({ reason: "before-update",
  minHoursBetweenBackups: 0 })` from wherever that hook eventually lives.
- **`frequency: "before-restore"`** as a *destination-aware* trigger — the
  unconditional local safety snapshot (above) already covers the safety
  need; wiring the doctor's actual chosen destination in as well (e.g. also
  push a copy to Drive before a restore) is a straightforward extension of
  `takeRestoreSafetySnapshot()` if wanted later.
- **True background scheduling** — `backupSchedulerService.ts` only runs
  while the tab is open and visible, like every other periodic mechanism in
  this app. A closed tab does not back up. Service Worker periodic
  background sync would close that gap, but has partial browser support and
  requires the PWA to be installed — a real future enhancement, not
  attempted here.
- **OneDrive / Dropbox / S3 / iCloud** — implement `StorageProvider`,
  register in `providerRegistry.ts`. The UI's destination chips are already
  driven by `listRegisteredProviders()`, so a newly-registered provider
  appears automatically; no `SettingsPage.tsx` change needed for the
  selector itself. The Drive backup browser (list/refresh/delete) is built
  against the same generic `StorageProvider` methods, so it works for any
  future provider that implements `list`/`load`/`delete`, not just Drive.

## Test coverage

- `backupSettingsService.test.ts` — persistence survives a simulated
  restart (`vi.resetModules()` between write and read).
- `backupProviderDispatch.test.ts` — restore dispatch (list/download/
  restore through a fake remote provider), auto-backup fallback (reactive
  to a real failure, not a pre-check), manual operations' deliberate lack
  of fallback.
- `backupRestoreFlow.test.ts` — the safety snapshot's presence *and* that it
  doesn't displace the restore job as most recent; the full preview/
  confirm/cancel round-trip (local and remote); a stale/unknown token
  rejected cleanly; a corrupted checksum caught at preview time, before
  anything is restored.
- `backupSchedulerService.test.ts` — real periodic firing (fake timers),
  stop actually stops it, double-start doesn't double the interval, the 60s
  floor is enforced.
- `oauthCallbackWiring.test.ts` — proves authentication never changes
  destination, in either direction, and that only an explicit
  `setBackupDestination()` call does.
- `backupJob.test.ts` / `backupRetryAndVerification.test.ts` — pipeline
  behavior (retry, verification, error handling), using
  `setActiveProvider()`/`resetActiveProviderToLocal()` as an explicit,
  documented **test-only** override seam — production UI code never calls
  either function; `getActiveProvider()` resolves from persisted settings
  unless a test has injected an override.
- `tests/settings-cloud-backup.spec.ts` (Playwright, real Chromium) — the
  honest "Drive not configured" state; the Backup Health Dashboard renders;
  the Automatic Backup toggle reveals frequency chips; and, for local
  backup specifically, a genuine end-to-end round trip: a real file
  download, re-selecting it through the actual file input, the preview
  panel rendering real parsed details (including integrity-check status),
  and Confirm Restore actually completing.

**Boundary, stated honestly**: true browser-level E2E for Google Drive
(real Drive API calls) isn't feasible without real OAuth credentials, which
this deployment doesn't have and this test suite shouldn't try to obtain.
Drive's *logic* — list, download, restore, delete, the auto-backup
fallback — is instead covered thoroughly at the integration level through
a fake `StorageProvider` that exercises the exact same `backupManager.ts`
code paths a real Drive provider goes through; only the actual HTTP calls
inside `googleDriveProvider.ts` itself are untested by anything but manual
verification against a real, connected account.

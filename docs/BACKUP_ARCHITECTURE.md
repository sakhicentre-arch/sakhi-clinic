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
| Operations | `backupManager.ts` | N/A (stateless orchestration) | Export/import pipeline; resolves destination fresh on every call. |

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
└──────────────────┘   │  localStorage)        │   │   drive, ...future) │
                        └──────────┬───────────┘   └──────────┬──────────┘
                                   │ read                      │ lookup
                                   ▼                           ▼
                        ┌─────────────────────────────────────────────┐
                        │              backupManager.ts                │
                        │  getActiveProvider() = registry[settings.dest]│
                        │  runExport / runImport / runImportFromProvider│
                        │  listRestorableBackups / runAutoIfDue         │
                        └───────────────────┬───────────────────────────┘
                                            │ StorageProvider interface
                              ┌─────────────┴──────────────┐
                              ▼                             ▼
                   ┌────────────────────┐        ┌───────────────────────┐
                   │ localBackupProvider │        │  googleDriveProvider   │
                   │ (file download +    │        │  (Drive API v3 —       │
                   │  Cache Storage)      │        │  upload/list/load/del) │
                   └────────────────────┘        └───────────────────────┘
```

`backupManager.ts` never imports `googleDriveProvider` or
`googleOAuthService` directly — only `providerRegistry.ts` does. Adding
OneDrive/Dropbox/S3/iCloud later means: implement `StorageProvider`,
register it in `providerRegistry.ts`. Nothing else changes.

## Files

| File | Role |
|---|---|
| `src/services/backup/storageProvider.ts` | The `StorageProvider` interface every provider implements (pre-existing, reused as-is). |
| `src/services/backup/providers/localBackupProvider.ts` | Local file download + Cache Storage retention (pre-existing, unchanged). |
| `src/services/backup/providers/googleDriveProvider.ts` | Drive API v3 provider (pre-existing; `list()` now also returns `createdAt` for the restore picker). |
| `src/services/backup/providers/providerRegistry.ts` | **New.** id → `StorageProvider` lookup. The only file allowed to import concrete providers. |
| `src/services/backup/backupSettingsService.ts` | **New.** `BackupSettings` model (`destination`, `autoBackupEnabled`, `frequency`), persisted to `localStorage`. Single source of truth for destination/mode. |
| `src/services/backup/backupManager.ts` | Orchestrator (pre-existing, refactored). Resolves the active provider from settings on every call — no in-memory provider variable. Restore dispatch (`runImportFromProvider`/`listRestorableBackups`) lives here, not in the UI. |
| `src/services/backup/oauth/completeGoogleDriveConnection.ts` | OAuth redirect landing (pre-existing, simplified). Authentication only — no longer touches destination. |
| `src/services/backupService.ts` | Public compatibility API (pre-existing, extended with `listRemoteBackups`/`restoreFromRemote`). |
| `src/pages/SettingsPage.tsx` | UI: the "Backup & Restore" section (destination selector, mode/frequency, dynamic Export/Backup Now + Restore/Restore-from-Drive buttons, remote restore picker, history). |

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

## Restore dispatch

No UI branching beyond *which input widget* to show (a local file input has
no remote equivalent — that part is unavoidably UI-layer). Everything about
*how* a restore actually happens lives in `backupManager.ts`:

```
Local:  runImport(file)              → file.text() → runImportFromText()
Remote: listRestorableBackups()      → provider.list()
        runImportFromProvider(name)  → provider.load(name) → runImportFromText()
```

`runImportFromText()` is the single shared core (parsing, checksum
verification, the confirmation prompt, `deserializeAndRestore`) — neither
entry point duplicates it.

## Automatic backup fallback

Automatic runs (`runAutoIfDue`) get a safety net manual runs deliberately
don't: if a save against the configured destination fails for *any* reason
(not connected, expired token, network, quota), it retries once against
local, logs a `backup.auto.destination_unavailable` operational event, and
keeps *both* job records — the failed remote attempt and the successful
local fallback — rather than hiding the failure. This is reactive (an
actual save attempt failed), not a pre-check against
`StorageProvider.available`, because `available` reflects configuration
(`isConfigured()`), not live sign-in state — a pre-check would miss the most
common real case: destination chosen, not yet connected.

Manual operations (`runExport`) have no such fallback — an unattended
failure needs a safety net; an attended one (the doctor is looking at the
screen) should fail visibly so they can act, not silently redirect
somewhere they didn't choose.

## Known extension points (not yet implemented)

- **`frequency: "before-update"`** — no code path calls `runAutoIfDue` from
  an app-update-detected event yet; this app has no such lifecycle hook.
  Wiring it later is additive: call `runAutoIfDue({ reason: "before-update",
  minHoursBetweenBackups: 0 })` from wherever that hook eventually lives.
- **`frequency: "before-restore"`** — same shape of extension point, at the
  top of `runImportFromText()` in `backupManager.ts`, right before
  `deserializeAndRestore`'s destructive overwrite. Deliberately not wired:
  an earlier attempt at this created a *second* `BackupJob` mid-restore,
  which broke the reasonable assumption that "the most recent job" is the
  operation the doctor just performed. Wiring it for real needs a job-kind
  or a job-metadata marker that lets history/most-recent-job queries filter
  it out, not just a bare extra `createJob` call.
- **Real daily/weekly scheduling** — today, `frequency` only widens the
  staleness window `runAutoIfDue` already used (`planAutoBackup`'s
  `minHoursBetweenBackups`), consulted whenever `runAutoIfDue` happens to be
  invoked (currently: app-lifecycle events, not a timer). A real background
  scheduler (service worker periodic sync, or an in-app timer) would call
  the exact same `runAutoIfDue()` — no changes needed downstream of it.
- **OneDrive / Dropbox / S3 / iCloud** — implement `StorageProvider`,
  register in `providerRegistry.ts`. The UI's destination chips are already
  driven by `listRegisteredProviders()`, so a newly-registered provider
  appears automatically; no `SettingsPage.tsx` change needed for the
  selector itself.

## Test coverage

- `backupSettingsService.test.ts` — persistence survives a simulated
  restart (`vi.resetModules()` between write and read).
- `backupProviderDispatch.test.ts` — restore dispatch (list/download/
  restore through a fake remote provider), auto-backup fallback (reactive
  to a real failure, not a pre-check), manual operations' deliberate lack
  of fallback.
- `oauthCallbackWiring.test.ts` — proves authentication never changes
  destination, in either direction, and that only an explicit
  `setBackupDestination()` call does.
- `backupJob.test.ts` / `backupRetryAndVerification.test.ts` — pipeline
  behavior (retry, verification, error handling), using
  `setActiveProvider()`/`resetActiveProviderToLocal()` as an explicit,
  documented **test-only** override seam — production UI code never calls
  either function; `getActiveProvider()` resolves from persisted settings
  unless a test has injected an override.

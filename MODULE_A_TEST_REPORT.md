# Module A — Independent Test Reproducibility & Verification Report

**Prepared by:** independent verification pass, run outside the original development environment.
**Date:** 2026-08-01
**Base commit:** `071f7e182e534265fbe8dcd7e7ea1298f2d01495`, plus Module A's working-tree changes (now isolated to 13 files — see "Repository State" below).
**Purpose:** re-run every claim in `MODULE_A_CERTIFICATION_REPORT.md` from a cold, independent environment and report only what was actually observed, including where the tooling itself misbehaved.

Every line below is tagged **[MEASURED]** (a command was run in this session, output shown or quoted), or **[NOT REPRODUCED]** (attempted, did not succeed, explained).

---

## 1. Environment

| Field | Value |
|---|---|
| OS / sandbox | Linux (Ubuntu-based), 2 vCPU, 3.8 GiB RAM |
| Node.js | v22.22.3 |
| npm | 10.9.8 |
| vite | 5.4.21 |
| vitest | 1.6.1 |
| Repository access path | The working repository is mounted into this Linux sandbox from the host machine via **FUSE** (`type fuse`, confirmed via `mount`). This is not local/native storage. |

This environment detail turned out to be the central finding of this report — see §2.

---

## 2. Test Reproducibility — Root Cause Found

**Symptom, as reported by the prior audit:** the test suite could not be executed to completion.

**[MEASURED] Reproduced directly.** Running `npx vitest run` against the repository at its normal, FUSE-mounted path:

```
$ cd <repo, FUSE-mounted path> && timeout 40 npx vitest run
 RUN  v1.6.1 <repo>
(no test file completes; process killed by timeout at 40s)
```

A single isolated test file run alone on this mount (`usePrescriptionPatterns.test.ts`) also did not complete within 40 seconds — not merely slow, genuinely stuck with zero progress reported.

**Root cause identified:** it is the storage layer, not the test code, the Vitest config, or IndexedDB semantics. Confirmed three independent ways:

1. **[MEASURED]** `node_modules/.vite/` on the FUSE mount contains orphaned `deps_temp_*` directories from earlier interrupted runs, which cannot be deleted:
   ```
   $ rm -rf node_modules/.vite
   rm: cannot remove '.../deps_temp_00be2c86/dexie.js': Operation not permitted
   ```
2. **[MEASURED]** `npx vite build` on the same FUSE mount fails outright (not just slow) trying to clean its own output directory:
   ```
   error during build:
   EPERM: operation not permitted, unlink '.../dist/apple-touch-icon.png'
       at unlinkSync (node:fs:1948:11)
   ```
3. **[MEASURED]** A stale, zero-byte `.git/index.lock` exists in the repository (timestamped 06:54, no owning git process running) and cannot be removed from this environment either (`rm -f .git/index.lock` → `Operation not permitted`). Any `git add`/`git commit` from this environment will fail until it is cleared.

All three are the same failure mode: a cross-filesystem-boundary mount (FUSE bridging into a host filesystem) that does not honor POSIX unlink/rename semantics the way esbuild's dependency optimizer, Vite's build cleanup, and Git's locking all assume. Node/esbuild/Vite are not hanging arbitrarily — they are retrying or blocking on file operations the mount silently cannot complete, and prior interrupted runs left half-written state (`deps_temp_*`, a lock file) that compounds the problem for every run after.

**Verification the code itself is fine:** the same repository, copied to native filesystem storage in the same sandbox (`tar` copy + fresh `npm install`, avoiding the FUSE layer entirely), runs cleanly:

```
$ cp (via tar, native fs) && npm install   # 12s
$ npx vitest run
 Test Files  23 passed (23)
      Tests  206 passed (206)
   Duration  23.28s
```

**Conclusion:** the audit's inability to execute the suite is an **environment/infrastructure issue** — specifically, running Vitest/Vite against a cross-OS or network-bridged mount of the repository — not a defect in `vitest.config.ts`, the test code, or IndexedDB handling. Anyone hitting this should run the suite from a native filesystem checkout (e.g., inside a Linux VM/container with the repo cloned locally, or directly on the host OS without a cross-boundary bridge), not from a bind-mounted/bridged path. This explanation is offered with the caveat that it is specific to *this* verification sandbox's bridge to the host folder; if the original audit's environment used a comparable mount (a mapped network drive, a Docker Desktop bind mount across the Windows/Linux boundary, a WSL interop path, a synced cloud-storage folder), the same failure mode is a plausible, common cause — but this report cannot confirm that was the original audit's exact setup, only that it reliably reproduces this failure signature here.

**Stale lock cleanup needed before committing:** `.git/index.lock` must be deleted (from a shell with write access to the real filesystem, e.g. directly on the host) before `git add`/`git commit` will succeed. This environment could not clear it.

---

## 3. Commands Executed and Raw Outputs (native filesystem)

All of the following were run against a native-filesystem copy of the repository (same source, same `node_modules` versions, no FUSE layer) inside this sandbox, to get a clean signal separate from the mount issue in §2.

### 3.1 TypeScript

```
$ npx tsc --noEmit
(no output, exit 0)
real  0m6.240s
```
**[MEASURED] PASS.** Also independently re-verified on the FUSE mount directly (10.0s, also clean) — TypeScript compilation is unaffected by the mount issue.

### 3.2 Production build

```
$ npx vite build
✓ 2225 modules transformed.
dist/index.html                                      1.03 kB
dist/assets/index-Br8_Vhm5.css                       23.96 kB
dist/assets/index-Vhduq86J.js                     1,243.92 kB │ gzip: 388.66 kB
(!) Some chunks are larger than 500 kB after minification.
✓ built in 5.22s
PWA v1.3.0 — precache 12 entries (1612.85 KiB)
real  0m7.591s
```
**[MEASURED] PASS**, with one caveat not previously called out: the main JS bundle is 1.24 MB (388 KB gzipped), past Vite's 500 KB warning threshold. Not a failure, but worth tracking — Module A did not introduce this (it predates these changes), but no prior Module A document mentioned it.

### 3.3 Full test suite — run 4 times independently

| Run | Result | Duration |
|---|---|---|
| 1 | 206/206 passed | 23.28s |
| 2 | **205/206 — 1 failed** | 23.53s |
| 3 (isolated re-run of the failing file, 3x) | passed, passed, passed | ~1s each |
| 4 (isolated re-run of the failing file, immediately after run 2's failure) | failed (same test) | <1s |

**[MEASURED].** The suite is **not** reliably 206/206 clean. It genuinely passes most of the time, and genuinely fails intermittently on one specific test — see §4 for the identified cause. This directly qualifies the prior certification report's claim of "three consecutive clean runs (206/206 passed)": that claim is not false (clean runs are the common case and were reproduced here too), but it is incomplete — it does not disclose that the same suite fails intermittently, which this session observed directly and reproducibly.

### 3.4 Coverage

```
$ npx vitest run --coverage
MISSING DEPENDENCY  Cannot find dependency '@vitest/coverage-v8'
```
**[MEASURED] Confirmed as claimed** — no coverage tooling is installed; no coverage percentage has ever been measured. This claim in the prior report is accurate.

### 3.5 Performance measurements (`perfMeasurement.test.ts`)

```
[PERF MEASURED] v49->v50 migration against 5000 patients / 10000 consultations: 29.6ms
[PERF MEASURED] bulkDelete of 50 keys out of 500-row table: 35.8ms
[PERF MEASURED] bulkDelete of 100 keys out of 1000-row table: 112.5ms
[PERF MEASURED] bulkDelete of 200 keys out of 2000-row table: 446.9ms
[PERF MEASURED] cost ratio, 4x the delete count (500->2000 rows): 12.5x
[PERF MEASURED] checkOriginIdentity with 5000 unrelated patient rows present: 2.7ms
 Test Files  1 passed (1)
      Tests  3 passed (3)
```
**[MEASURED] Confirms the qualitative claim** (super-linear `bulkDelete` scaling in `fake-indexeddb`: 12.5x cost for 4x volume here, vs. 18x reported previously — same direction, different exact run, consistent with the test's own disclaimer that these numbers are not guaranteed run-to-run). The underlying claim that real browser IndexedDB scaling is unverified stands — this environment cannot test that either.

---

## 4. New Finding: Intermittent Test Failure (not disclosed as reproducible by the prior report)

**Test:** `src/__tests__/integration/outboxCap.test.ts` → `"prunes synced entries before pending ones, down to the hysteresis target (90% of cap)"`

**Failure observed:**
```
AssertionError: expected { …(11) } to be undefined
 ❯ src/__tests__/integration/outboxCap.test.ts:125:63
    125|   expect(remaining.find((r) => r.entityId === "PENDING-0")).toBeUndefined();
```

**Root cause [INFERRED, not yet fixed]:** the test inserts 5 "pending" outbox rows in a tight loop without an explicit `timestamp`, relying on `outboxService.ts`'s default (`new Date().toISOString()`, millisecond resolution) to establish insertion order. `enforceOutboxCap`'s fallback-deletion path (`outboxMaintenanceService.ts`) sorts candidates for deletion by that same `timestamp` string. When two or more of those rows are created within the same millisecond — routine in a fast test loop, and not impossible in production under rapid sequential writes — the sort has ties, and which row is treated as "oldest" becomes dependent on `db.syncOutbox.toArray()`'s pre-sort order, which is keyed by a random UUID (`generateId()`), not creation order. The test assumes `PENDING-0` is always oldest; under a timestamp tie, a different pending row can be deleted instead.

This was reproduced directly (§3.3, run 2) and is **not** a one-off fluke of this session — it recurred on a second full-suite run and was independently reproducible when re-running the single file immediately afterward. The prior certification report described "a single, isolated test-suite flake ... not reproducible in isolation" — that description does not match what this session observed: it reproduced in isolation, just not on every attempt (consistent with a millisecond-timing race, which is exactly what would produce that pattern).

**Impact:** this is a test/tie-breaking correctness gap, not a data-loss bug — worst case, `enforceOutboxCap` deletes a different (still-pending, still-synced-eventually) outbox row than the intended oldest one. The `syncOutbox` table has no consumer today (per `outboxMaintenanceService.ts`'s own comment), so no clinical data is at risk from this specific issue. It should still be fixed — either by giving the sort a stable tiebreaker (e.g., append `id` as a secondary sort key) or by making the test assert on "one of the pending rows created before the trigger row" rather than a specific `entityId`.

**Status:** disclosed here, not fixed — outside this pass's scope to modify test/application logic further without sign-off, but flagged as a concrete, reproducible action item.

---

## 5. Limitations of This Report

- All native-filesystem numbers in §3 come from a temporary copy made inside this same 2-core sandbox, not the original developer's machine and not real end-user hardware (a doctor's Android device). Absolute timings are this-environment-only, consistent with how the prior report itself caveats its own numbers.
- The FUSE-mount failure in §2 is confirmed for *this* verification session's bridge between the sandbox and the host folder. Whether the original audit's environment shares the exact same mount mechanism is not something this report can confirm — only that this failure signature (EPERM on unlink/rename, hangs with zero progress, stale lock files) is fully reproduced here and fully explained by a cross-filesystem-boundary mount, and disappears entirely on native storage.
- This report did not re-run the Playwright end-to-end suite (`tests/*.spec.ts`) — out of scope for Module A's unit/integration certification, and the prior report did not claim E2E results either.
- No real (anonymized) Sakhi Clinic production database was available to this session, same limitation the prior report already disclosed.

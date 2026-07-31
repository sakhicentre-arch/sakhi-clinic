# Android Runtime Validation Protocol — RVC-2

**Subject:** Voice dictation duplicate-transcript defect (Gujarati/Hindi/English, Android Chrome)
**Implementation status:** Frozen at commit below. No further code, algorithm, or instrumentation changes before this validation runs.
**Frozen commit:** `ccdc93f65a3c0221de20970ed7785422f44510d3`
**Build produced:** 2026-07-31 19:51:51 IST

This document is the test record. Fill in every bracketed field during testing. A protocol with blanks is not a completed validation.

---

## SECTION 1 — Test Environment

Record before starting. Screenshot `chrome://version` and the phone's Settings → About page as evidence attachments.

| Field | Value |
|---|---|
| Device model | `[ ]` |
| Android version | `[ ]` |
| Chrome version (chrome://version) | `[ ]` |
| Installed PWA version / how installed (browser tab vs. Add to Home Screen) | `[ ]` |
| Commit hash under test | `ccdc93f65a3c0221de20970ed7785422f44510d3` |
| Build timestamp | `2026-07-31 19:51:51 IST` |
| Tester name | `[ ]` |
| Test date/time | `[ ]` |

If the device or Chrome version differs from a prior RVC round, note it explicitly — a result cannot be compared across differing environments.

---

## SECTION 2 — Baseline (record before the first phrase)

| Field | Value |
|---|---|
| `localStorage.DEBUG_VOICE_VERBOSE` | `[unset / "true" / "false"]` |
| Browser/system language | `[ ]` |
| Microphone permission state | `[granted / prompt / denied]` |
| Network state | `[wifi / cellular / airplane]` |
| Battery saver | `[on / off]` |
| Battery level | `[ ]%` |

Recommended for this round: leave `DEBUG_VOICE_VERBOSE` **unset** for the functional pass (Section 3) to keep log volume representative of production, then set it to `"true"` only if a failure needs the full committed-text dump (Section 5).

```js
localStorage.setItem('DEBUG_VOICE_VERBOSE', 'true')   // only if investigating a failure
localStorage.removeItem('DEBUG_VOICE_VERBOSE')          // restore default
```

---

## SECTION 3 — Functional Tests

For each phrase: open DevTools console (`chrome://inspect` → Inspect), tap the dictation button, speak the phrase once, stop, and record what the field actually contains. Do not correct or re-record — the first result is the data.

### Gujarati

| # | Phrase | Expected | Actual | Pass/Fail |
|---|---|---|---|---|
| G1 | શરદી છે | શરદી છે | `[ ]` | `[ ]` |
| G2 | મને તાવ આવે છે | મને તાવ આવે છે | `[ ]` | `[ ]` |
| G3 | એકદ લેતા આવશે | એકદ લેતા આવશે | `[ ]` | `[ ]` |

### Hindi

| # | Phrase | Expected | Actual | Pass/Fail |
|---|---|---|---|---|
| H1 | मुझे बुखार है | मुझे बुखार है (danda optional, must not duplicate) | `[ ]` | `[ ]` |
| H2 | मुझे सिर दर्द है | मुझे सिर दर्द है | `[ ]` | `[ ]` |

### English

| # | Phrase | Expected | Actual | Pass/Fail |
|---|---|---|---|---|
| E1 | I have fever | I have fever | `[ ]` | `[ ]` |
| E2 | I have fever since yesterday | I have fever since yesterday | `[ ]` | `[ ]` |

### Mixed language

| # | Phrase | Expected | Actual | Pass/Fail |
|---|---|---|---|---|
| M1 | Fever છે | Fever છે | `[ ]` | `[ ]` |
| M2 | BP high છે | BP high છે | `[ ]` | `[ ]` |

**Repeat each phrase 5 times** before marking the row Pass. A single clean pass is not sufficient evidence — Android's overlap behaviour was intermittent enough in prior rounds that one success does not rule out the defect. Record the worst outcome across the 5 repeats in the Actual column; note if results were inconsistent.

---

## SECTION 4 — Stress Tests

| # | Test | Procedure | Expected | Actual | Pass/Fail |
|---|---|---|---|---|---|
| S1 | 30-second dictation | Speak continuously for 30s, natural pauses | No duplicated words/phrases | `[ ]` | `[ ]` |
| S2 | 2-minute dictation | Speak continuously for 2 min | No duplication; no slowdown; correct history at the 120-word boundary | `[ ]` | `[ ]` |
| S3 | Repeated start/stop | Start, speak one phrase, stop, start again, speak a different phrase, 5 cycles | Each phrase correct; no bleed between cycles | `[ ]` | `[ ]` |
| S4 | Automatic restart | Speak past Android's forced session end (continuous speech >~15-20s often triggers it) | Text continues correctly across the restart seam | `[ ]` | `[ ]` |
| S5 | Rapid pauses | Speak a word, pause 1s, speak another, pause 1s, repeat 6 times | All words present once each; genuine short gaps not treated as restarts incorrectly | `[ ]` | `[ ]` |
| S6 | Background/foreground switch | Start recording, switch to another app for 5s, return | Recording state recovers or fails cleanly; no corrupted text | `[ ]` | `[ ]` |
| S7 | Phone call interruption | Start recording, receive/simulate a call, end call, return | No crash; field state sane; no duplicated fragment from before the call | `[ ]` | `[ ]` |
| S8 | Screen lock/unlock | Start recording, lock screen 5s, unlock | No duplicated fragment at the lock boundary | `[ ]` | `[ ]` |

---

## SECTION 5 — Log Collection

### What to copy

Copy the **entire console output** for the session, not a filtered subset — interleaving between tags is itself evidence. Save as a `.log` or `.txt` file per test row that fails; name it `<test-id>_<timestamp>.log` (e.g. `G2_2026-07-31T14-05.log`).

### Filtering by eventId

Every `onresult`-scoped log line carries `eventId=N`. In DevTools console filter box:

```
eventId=7
```

returns exactly `[VoiceSession CURRENT]`, `[VoiceSession PROCESS]` (one per final result in that event), `[VoiceSession EMIT]`, and `[AppendField]` for event 7 — the complete lifecycle of one Android result callback.

Lifecycle logs (`START`, `NEW`, `ONEND`, `ONEND-STOP`, `ONEND-SKIP`, `RESTART-SCHEDULED`, `RESTART-FIRE`) carry `lastEventId` instead — filter `lastEventId=7` to see what session activity surrounded that event without implying it belongs to it.

To see one field's full timeline regardless of event:

```
fieldId="chiefComplaint"
```

### Diagnostic patterns

| Signature | Diagnosis |
|---|---|
| `[VoiceSession CURRENT].results[]` shows entry *n* containing entry *n-1*'s text, and the corresponding `PROCESS.fresh` is shorter than `PROCESS.transcript` | **(A) Android replayed overlapping finals** — this is the expected, handled case. Not a failure by itself; confirms the model. |
| `PROCESS.transcript` visibly overlaps the previous `committedTail`, but `PROCESS.fresh === PROCESS.transcript` (nothing stripped) | **(B) Overlap algorithm failed to match.** Check for an unlisted punctuation mark, unexpected script, or non-contiguous overlap (a word dropped or reordered inside the repeat). |
| `PROCESS.committedHash`/`committedTail` does not match the `AppendField.afterTail` /hash of the immediately preceding `AppendField` for the same field | **(C) History diverged from the textarea.** Check first for a `RESTART-FIRE` immediately before it with `committedLength=0` (history was cleared across a restart it should have survived), or a punctuation-carry seam. |
| `AppendField.recordingFieldId` ≠ `AppendField.fieldId`, OR the same `eventId` produces two `[AppendField]` lines with identical `delta` | **(D) appendField / routing issue** — delta delivered to the wrong field, or the callback fired twice for one event (check for duplicate `VoiceSessionProvider` mounts). |
| Two `[VoiceSession EMIT]` lines with the same `sessionId` and the same `maxIdx` | Neither A/B/C/D — one `onresult` was processed twice at the recognition-instance level. Check for two live `SpeechRecognition` objects (provider mounted twice, or `abort()` not actually detaching the old instance's handlers). |
| `[VoiceSession STALE]` appears at all | The RVC-1 sessionId guard fired — an old session tried to deliver a result after a new one started. Expected occasionally around restarts; a **problem** only if duplicated text appears despite it (meaning the guard didn't catch a case it should have). |

For every FAIL row in Sections 3–4, attach: the full log file, and specifically the `eventId` filter output covering the failure, and the `lastEventId` filter output covering the surrounding 2 restarts/session boundaries (whichever is closer).

---

## SECTION 6 — Acceptance Criteria

All of the following must hold across **every** row in Sections 3 and 4, not just on average:

- [ ] No duplicated words (`શરદી શરદી છે` class of defect) in any phrase, any repeat
- [ ] No duplicated phrases (`એકદ એકદ લેતા લેતા આવશે` class of defect)
- [ ] No missing words — every spoken word appears at least once
- [ ] Sentence-final and mid-sentence punctuation preserved where Chrome supplies it (danda, full stop), never duplicated, never floating with a stray leading space
- [ ] No perceptible slowdown or dropped input after 2 minutes of continuous dictation (S2)
- [ ] Automatic restart resumes without losing or duplicating text at the seam (S4)
- [ ] Repeated start/stop cycles show no cross-contamination between cycles (S3)
- [ ] No crash, frozen UI, or unrecoverable state after interruption tests (S6–S8)
- [ ] Known limitation (a genuine word repeated exactly at a segment boundary may be dropped) is the *only* acceptable discrepancy, and only if it matches that specific shape — not a general excuse for any dropped word

A single unchecked box anywhere in Sections 3–4 blocks READY FOR PRODUCTION regardless of how many other rows passed.

---

## SECTION 7 — Failure Report Template

Copy this block per failure into GitHub Issues.

```markdown
## Voice duplicate-transcript: RVC-2 failure

**Environment**
- Device: [model]
- Android: [version]
- Chrome: [chrome://version string]
- PWA install method: [browser tab / home screen]
- Commit: ccdc93f65a3c0221de20970ed7785422f44510d3
- DEBUG_VOICE_VERBOSE: [set/unset]

**Test case**: [e.g. G2 — મને તાવ આવે છે]

**Expected**
[exact expected string]

**Actual**
[exact actual string, copy-pasted from the field, not retyped]

**Relevant eventIds**
[e.g. eventId=4 through eventId=7]

**Relevant logs**
```
[paste the eventId-filtered console output here, unedited]
```

**Root cause hypothesis**
[Which of A/B/C/D from Section 5, and the one line of evidence that points to it]

**Attachments**
- [ ] Full console log file
- [ ] Screen recording (if available)
```

---

## SECTION 8 — Release Decision

Complete only after every row in Sections 3 and 4 has a recorded Pass/Fail and Section 6's checklist is fully marked.

**Decision rule:**
- If every Section 6 box is checked → **READY FOR PRODUCTION**
- If any box is unchecked → **REQUIRES RVC-3**, with one Section 7 report filed per distinct failure

> Recommendation: `[ READY FOR PRODUCTION / REQUIRES RVC-3 ]`
>
> Decided by: `[ ]`
> Date: `[ ]`
> Basis: `[reference the specific Section 3/4 rows and Section 6 checklist state that support this decision]`

No code change accompanies this document. The recommendation is a reading of the filled-in checklist above, not a new judgment.

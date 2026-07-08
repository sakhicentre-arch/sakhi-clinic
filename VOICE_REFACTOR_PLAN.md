# VOICE REFACTOR PLAN

**Phase 2 Deliverable — Architecture Transformation**

---

## OVERVIEW

Replace the N-instance uncoordinated DictationButton architecture with a centralized `VoiceSessionManager`. This is not a refactor of DictationButton — it is a replacement of the underlying architecture.

---

## NEW FILES

| File | Purpose |
|------|---------|
| `src/hooks/useVoiceSession.ts` | Central hook: single SpeechRecognition, single session, transcript delta, field routing |
| `src/components/VoiceControlBar.tsx` | Single unified recording UI (one mic button, one timer, one indicator) |

---

## MODIFIED FILES

| File | Changes |
|------|---------|
| `src/components/DictationButton.tsx` | Simplified: becomes thin consumer of `useVoiceSession`. No own SpeechRecognition. No own timer. Shows active recording state from session. |
| `src/pages/ConsultationPage.tsx` | Replace inline DictationButton callbacks with session-based `startRecording(fieldId)` + commit delta. Replace all DictationButton instances with new simplified version. |
| `src/pages/QuickConsultationPage.tsx` | Same changes as ConsultationPage. |

---

## ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────────┐
│ VoiceSessionManager (useVoiceSession hook)                          │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ STATE (useRef — no re-renders on speech internals)           │  │
│  │  recognitionRef: SpeechRecognition | null        (SINGLE)    │  │
│  │  activeFieldRef: string | null                               │  │
│  │  lastCommittedRef: Record<string, string>  (per-field)       │  │
│  │  sessionIdRef: number                         (stale guard)  │  │
│  │  manualStopRef: boolean                                      │  │
│  │  isMountedRef: boolean                                       │  │
│  │  onResultCallbacks: Record<string, (delta: string) => void>  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ STATE (useState — drives UI re-renders)                     │  │
│  │  recording: boolean                                          │  │
│  │  activeField: string | null                                  │  │
│  │  duration: number                                            │  │
│  │  statusText: string                                          │  │
│  │  errorMsg: string                                            │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  API:                                                               │
│    startRecording(fieldId, lang, onDelta)                           │
│    stopRecording()                                                  │
│    switchRecording(fieldId, lang, onDelta)                          │
│    cancelRecording()                                                │
│    isFieldActive(fieldId): boolean                                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## TRANSCRIPT CONTRACT

### Rules

1. **Emit only the delta.** Compare current cumulative transcript against `lastCommittedRef[fieldId]`. Emit only the portion that is new.
2. **Never append the same transcript twice.** `lastCommittedRef[fieldId]` tracks the last committed full transcript per field.
3. **Never commit interim results as final.** Only process `result.isFinal === true`.
4. **Insert only the delta.** The `onDelta` callback receives only the newly-recognized text.
5. **Prevent duplicate commits across field switches.** When switching fields, commit the current field's delta first, then start the new field.

### Delta Computation

```typescript
// In onresult handler:
const currentFull = getFullFinalTranscript(event.results);
const previousFull = lastCommittedRef.current[activeFieldRef.current] || "";
if (currentFull !== previousFull) {
  const delta = currentFull.slice(previousFull.length).trim();
  if (delta) {
    onResultCallbacks.current[activeFieldRef.current]?.(delta);
    lastCommittedRef.current[activeFieldRef.current] = currentFull;
  }
}
```

**Key insight:** By tracking `lastCommittedRef[fieldId]` and comparing against the cumulative transcript, we emit only the new portion. The parent callback then APPENDS this delta (which is truly new text) instead of the full transcript.

---

## VOICE CONTRACT

### `startRecording(fieldId, lang, onDelta)`

1. If another field is already recording:
   a. Commit its pending transcript (call its onDelta with any uncommitted text)
   b. Stop the SpeechRecognition instance
   c. Clear all timers
2. Create a NEW SpeechRecognition instance (single, replaces previous)
3. Set `activeFieldRef.current = fieldId`
4. Set `onResultCallbacks.current[fieldId] = onDelta`
5. If `lastCommittedRef.current[fieldId]` doesn't exist, initialize to `""`
6. Start recognition
7. Update React state: `recording = true`, `activeField = fieldId`, `duration = 0`

### `stopRecording()`

1. Set `manualStopRef.current = true`
2. Stop recognition
3. Clear all timers
4. Set `recordingRef.current = null`
5. Update React state: `recording = false`, `activeField = null`

### `switchRecording(fieldId, lang, onDelta)`

Equivalent to `startRecording(fieldId, lang, onDelta)` — the startRecording implementation already handles stopping any existing session.

### `cancelRecording()`

1. Abort recognition immediately (no onend firing)
2. Clear all timers
3. Reset state

---

## UI CONTRACT

### Rule: Only ONE field may display recording UI

The `VoiceSessionManager` exposes:
- `recording: boolean`
- `activeField: string | null`
- `duration: number`
- `statusText: string`
- `errorMsg: string`

A field shows recording UI iff:
```typescript
recording && activeField === thisFieldId
```

### DictationButton (simplified)

- Reads `activeField`, `recording`, `duration` from session
- When `idle`: Shows mic button → calls `startRecording(fieldId, lang, onDelta)`
- When `recording` AND `activeField === fieldId`: Shows stop button → calls `stopRecording()`
- When `recording` AND `activeField !== fieldId`: Shows disabled mic (another field recording)

### VoiceControlBar (new)

- Shows one unified recording indicator at the top of the page
- Shows: pulsing dot, active field label, timer, stop button
- Replaces per-field timer/status clutter

---

## MIGRATION STEPS

### Step 1: Create `useVoiceSession` hook

Contains all recognition logic extracted from DictationButton.

### Step 2: Create `VoiceControlBar` component

Single unified recording UI.

### Step 3: Simplify `DictationButton`

Remove all recognition/timer/state logic. Become consumer of `useVoiceSession`.

### Step 4: Update `ConsultationPage`

Replace 7 inline DictationButton callbacks with session-based:
```typescript
const voiceSession = useVoiceSession();

// Instead of:
<DictationButton onText={(spoken) => patch({ field: val + " " + spoken })} />

// Use:
<DictationButton fieldId="chiefComplaint" onDelta={(delta) => patch({ chiefComplaint: formData.chiefComplaint + " " + delta })} />
```

### Step 5: Update `QuickConsultationPage`

Same pattern as ConsultationPage.

### Step 6: Update `HybridField`

Accept `fieldId` and use session-based DictationButton.

### Step 7: Add regression tests

Test single session, field switching, delta-only, deduplication, cleanup.

---

## EDGE CASES

| Edge Case | Handling |
|-----------|----------|
| Permission denied | `onerror("not-allowed")` → set error state, no auto-restart |
| No speech | `onerror("no-speech")` → show message, stay in error state |
| Network interruption | `onerror("network")` → single retry (existing logic preserved) |
| Component unmount while recording | Cleanup effect aborts recognition, clears timers, prevents state updates |
| Rapid field switching | Each `switchRecording` stops previous, commits delta, starts new |
| React StrictMode | Double-mount handled by `isMountedRef` and cleanup on unmount |
| Android Chrome | Uses `webkitSpeechRecognition`, continuous mode supported |
| Multiple mic buttons on page | Only one can be active due to global `activeField` check |

---

## ROLLBACK PLAN

If the refactor introduces unexpected issues:
1. Revert all changes to `DictationButton.tsx`, `ConsultationPage.tsx`, `QuickConsultationPage.tsx`
2. Revert deletion of timer/status/duration logic from DictationButton
3. Keep `useVoiceSession.ts` as unused utility

---

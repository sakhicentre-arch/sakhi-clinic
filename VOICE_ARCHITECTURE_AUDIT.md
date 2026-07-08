# VOICE ARCHITECTURE AUDIT

**Project:** Sakhi Clinic  
**Date:** 2026-07-08  
**Auditor:** Engineering  
**Severity:** P0 — Release Blocking

---

## 1. COMPONENT OWNERSHIP

### Current Architecture

```
ConsultationPage.tsx                    QuickConsultationPage.tsx
  ├── HybridField (mind/desire/etc)        ├── DictationButton (chiefComplaint)
  │     └── DictationButton                 ├── DictationButton (caseText)
  ├── DictationButton (chiefComplaint)      └── DictationButton (mind)
  ├── DictationButton (caseText)
  ├── DictationButton (familyHistory)
  ├── DictationButton (pastHistory)
  ├── DictationButton (surgicalHistory)
  └── DictationButton (allergy)
```

**Total DictationButton instances: 11** (across both consultation modes).

Each `DictationButton` is an independent React component with its own:
- `recognitionRef` — own SpeechRecognition instance
- `recordingState` — own rendering state
- `durationTimerRef` — own timer
- `lastEmittedTranscriptRef` — own deduplication ref
- `statusText` / `errorMsg` — own UI state
- `manualStopRef` / `isMountedRef` — own lifecycle guards

**There is zero shared state between any two DictationButton instances.**

---

## 2. STATE OWNERSHIP

### Per-Instance State (DictationButton, lines 38–54)

| State | Type | Owner | Problem |
|-------|------|-------|---------|
| `recordingState` | `"idle" | "recording" | "error" | "unsupported"` | DictationButton | No other component knows if this field is recording |
| `errorMsg` | `string` | DictationButton | Siloed per field |
| `statusText` | `string` | DictationButton | Siloed per field |
| `durationSeconds` | `number` | DictationButton | Each field has its own timer |

### Per-Instance Refs (DictationButton, lines 45–54)

| Ref | Purpose |
|-----|---------|
| `recognitionRef` | Holds the current SpeechRecognition instance |
| `manualStopRef` | Distinguishes manual stop from auto-restart |
| `durationTimerRef` | setInterval for the recording timer |
| `restartTimerRef` | setTimeout for auto-restart delay |
| `statusResetTimerRef` | setTimeout to reset "Added to consultation" status |
| `activeSessionRef` | Session counter to prevent stale restart |
| `networkRetryCountRef` | Limits network error retry to 1 |
| `restartScheduledRef` | Prevents double-scheduled restarts |
| `lastEmittedTranscriptRef` | Deduplicates transcript callback |
| `isMountedRef` | Guards against post-unmount state updates |

### Page-Level State

| State | Owner | Contains |
|-------|-------|----------|
| `formData` (useReducer) | Page | All field values as strings |
| `lang` | Page | Derived from formData.language |

**The page has no knowledge of recording state at all.** It receives transcription text via the `onText` callback without knowing whether recording is active, which field is recording, or whether the transcript is final.

---

## 3. RECOGNITION OWNERSHIP

### How SpeechRecognition is Created

File: `DictationButton.tsx:129`

```typescript
const recognition = new SpeechRecognitionAPI();
```

Each `DictationButton.startRecording()` creates a **new** `SpeechRecognition` instance.

### How to Count Active Recognition Instances

Formula: Number of `DictationButton` components × user clicks on "Start Recording".

1 click on Chief Complaint's DictationButton → 1 instance  
1 click on Case Story's DictationButton → 2 instances  
1 click on Family History's DictationButton → 3 instances  

**Up to 11 simultaneous SpeechRecognition instances** can exist.

### Browser Impact of Multiple Recognition Instances

The Web Speech API does not specify behavior for multiple simultaneous `SpeechRecognition` instances. Real device testing confirms:

- Chrome on Android permits multiple instances, all receiving audio simultaneously
- Each instance fires independent `onresult` events
- Each instance fires independent `onend` / `onerror` events
- Microphone audio is split across instances, degrading accuracy
- Battery drain increases linearly with instance count

---

## 4. TRANSCRIPT OWNERSHIP

### Current Flow

```
SpeechRecognition.onresult
  → DictationButton processes ALL final results
  → finalTranscript = Array.from(event.results).filter(isFinal).join(" ")
  → lastEmittedTranscriptRef comparison
  → onText(finalTranscript)  ← EMITS FULL CUMULATIVE TEXT
  → Page callback:
    patch({ field: existingFieldValue + " " + finalTranscript })
```

### Critical Defect: Full-Text Append

`DictationButton.tsx:146–151`:
```typescript
const finalTranscript = Array.from(event.results || [])
  .filter((result) => result.isFinal)
  .map((result) => result[0]?.transcript?.trim() ?? "")
  .filter(Boolean)
  .join(" ")
  .trim();
```

This collects **ALL** final results at every `onresult` event. The `finalTranscript` is the **entire** recognized text so far, not just the newly-finalized portion.

All 9 page-level `onText` callbacks do:
```typescript
onText={(spoken) => patch({ field: existingValue + " " + spoken })}
```

### Duplication Sequence

| Event | Speech API Results | finalTranscript | lastEmittedRef | Field Value After Append |
|-------|-------------------|-----------------|----------------|-------------------------|
| 1 | results[0]=final:"મને છેલ્લા 15 દિવસથી" | "મને છેલ્લા 15 દિવસથી" | "" → "મને છેલ્લા 15 દિવસથી" | "મને છેલ્લા 15 દિવસથી" |
| 2 | results[0]=final:"મને છેલ્લા 15 દિવસથી", results[1]=final:"માથાનો દુખાવો છે." | "મને છેલ્લા 15 દિવસથી માથાનો દુખાવો છે." | "મને છેલ્લા 15 દિવસથી" → "મને છેલ્લા 15 દિવસથી માથાનો દુખાવો છે." | "મને છેલ્લા 15 દિવસથી મને છેલ્લા 15 દિવસથી માથાનો દુખાવો છે." |

**Result: `lastEmittedTranscriptRef` only prevents repeat of the identical string. Since the accumulated string changes (grows), it passes the deduplication check every time.**

---

## 5. TIMER OWNERSHIP

| Timer | Owner | Interval | Cleanup |
|-------|-------|----------|---------|
| `durationTimerRef` (setInterval) | DictationButton | 1000ms | `clearTimers()` on stop/unmount |
| `restartTimerRef` (setTimeout) | DictationButton | 120ms (onend) / 400ms (network error) | `cancelPendingRestart()` |
| `statusResetTimerRef` (setTimeout) | DictationButton | 1200ms | `clearTimers()` |

Each DictationButton has its own timer set. With 11 possible instances, up to **33 active timers** could exist.

---

## 6. EVENT OWNERSHIP

### Speech Recognition Events

| Event | Set In | Handler Captures | Issue |
|-------|--------|------------------|-------|
| `onstart` | `startRecording()` line 138 | Closure over current render | None (uses setState) |
| `onresult` | `startRecording()` line 145 | Closure over `onText` prop | Captures `onText` from render when `startRecording` was called |
| `onerror` | `startRecording()` line 168 | Closure | Correct |
| `onend` | `startRecording()` line 214 | Multiple refs | Correct |

### React Event Listeners

| Listener | Location | Purpose |
|----------|----------|---------|
| `matchMedia('change')` | ConsultationPage:758–759 | Responsive breakpoints |
| `window('scroll')` | ConsultationPage:770 | Header collapse |
| `mousedown` (document) | SmartInput.tsx:224 | Close suggestion dropdown |

**No global keyboard shortcuts or app-level speech events.**

---

## 7. CLEANUP OWNERSHIP

### DictationButton Cleanup (useEffect return, line 94–109)

```typescript
return () => {
  isMountedRef.current = false;
  clearTimers();
  cancelPendingRestart();
  if (recognitionRef.current) {
    recognitionRef.current.onresult = null;
    recognitionRef.current.onerror = null;
    recognitionRef.current.onend = null;
    recognitionRef.current.abort();
    recognitionRef.current = null;
  }
};
```

**Issue:** Only cleans up `recognitionRef.current` (the latest instance). If `startRecording` was called multiple times without proper cleanup, orphaned SpeechRecognition instances continue running with stale event handlers.

### ConsultationPage Cleanup

- `useEffect` for media queries removes event listeners (line 760–763)
- `useEffect` for scroll removes listener (line 771)
- `useEffect` for auto-save clears interval (line 956)

**No cleanup of DictationButton recording state.** If the page unmounts while recording, each DictationButton's own cleanup runs independently, but there is no coordinated shutdown.

---

## 8. REACT LIFECYCLE ISSUES

### Effect Dependency Arrays

| Effect | Dependencies | Issue |
|--------|-------------|-------|
| DictationButton cleanup (line 94) | `[cancelPendingRestart, clearTimers]` | Correct |
| DictationButton `startRecording` useCallback (line 111) | `[cancelPendingRestart, clearTimers, lang, onText, startDurationTimer, stopDurationTimer]` | `onText` changes on every page render (inline arrow function), causing `startRecording` to be recreated every render |
| ConsultationPage `loadData` (line 910) | `[loadData]` | Correct |
| Auto-save (line 946) | `[patientId, formData]` | Correct |
| AI fetch (line 960) | `[formData.chiefComplaint, formData.caseText, formData.mind]` | Correct |

### StrictMode

React 18 StrictMode double-invokes effects in development. The DictationButton's cleanup effect (line 94) would:

1. Mount → create refs
2. Unmount → set `isMountedRef.current = false`, clear timers, abort recognition
3. Mount again → reset refs

If the user clicks "Start" during step 2, the recognition instance from step 1 may not be fully aborted before step 3 creates a new one.

---

## 9. FAILURE POINTS

### Confirmed Failure Points (observed on device)

| # | Failure | Root Cause | Severity |
|---|---------|------------|----------|
| F1 | Transcript appears 2–3 times | Full-text emission + parent append | P0 |
| F2 | Multiple fields recording simultaneously | No coordination between instances | P0 |
| F3 | Doctor confused about which field is recording | No global recording state | P0 |
| F4 | Mobile UI cluttered | Each DictationButton renders full controls | P0 |

### Latent Failure Points (not yet observed)

| # | Failure | Root Cause | Severity |
|---|---------|------------|----------|
| F5 | Stale closure appends transcript to wrong field | `onText` captured at `startRecording` time | P1 |
| F6 | Orphaned recognition after rapid start/stop | `recognitionRef` only tracks latest instance | P1 |
| F7 | Auto-restart after component unmount | `isMountedRef` check may race with timer | P1 |
| F8 | Timer leak in StrictMode development | Double-mount creates duplicate intervals | P2 |
| F9 | State update after unmount | Race between `onresult` and useEffect cleanup | P2 |
| F10 | Network retry + onend auto-restart race | Two independent restart paths | P2 |

---

## 10. ARCHITECTURAL SUMMARY

### Current Model: N-Instance Uncoordinated

```
┌──────────────────────────────────────────────────────┐
│ ConsultationPage                                      │
│  ┌─────────────────────┐   ┌─────────────────────┐  │
│  │ DictationButton #1  │   │ DictationButton #2  │  │
│  │  SpeechRecognition  │   │  SpeechRecognition  │  │
│  │  Timer              │   │  Timer              │  │
│  │  State: idle/rec    │   │  State: idle/rec    │  │
│  └────────┬────────────┘   └────────┬────────────┘  │
│           │                         │               │
│           ▼                         ▼               │
│      Field A                   Field B              │
└──────────────────────────────────────────────────────┘
```

### Required Model: Single Manager

```
┌──────────────────────────────────────────────────────┐
│ ConsultationPage                                      │
│  ┌──────────────────────────────────────────────────┐│
│  │ VoiceSessionManager                              ││
│  │  ┌────────────────────────────────────────────┐  ││
│  │  │ SpeechRecognition (SINGLE INSTANCE)        │  ││
│  │  │ ActiveField: "chiefComplaint"              │  ││
│  │  │ RecordingState: "recording"                │  ││
│  │  │ Timer: 00:32                               │  ││
│  │  │ lastEmitted (per-field): {}                │  ││
│  │  └────────────────────────────────────────────┘  ││
│  └──────────────────────────────────────────────────┘│
│           │                   │                      │
│           ▼                   ▼                      │
│      DictationButton    HybridField                  │
│      (thin consumer)    (thin consumer)              │
│      reads activeField  reads activeField            │
│      calls start/stop   calls start/stop             │
└──────────────────────────────────────────────────────┘
```

---

## 11. COUNT VERIFICATION

| Metric | Count | Acceptable? |
|--------|-------|-------------|
| SpeechRecognition constructors | 1 per DictationButton (max 11) | **NO** |
| Simultaneous recording sessions possible | 11 | **NO** |
| Simultaneous timers possible | 33 | **NO** |
| onText callbacks that append full transcript | 9 | **NO** |
| Components that own recording state | 11 | **NO** |
| Shared recording state sources | 0 | **NO** |
| Sources of truth for active field | 0 | **NO** |
| Cleanup paths for recognition | 11 (independent) | **NO** |

---

## 12. VERDICT

**The current voice architecture is not fixable through incremental patches.**

The N-instance design is fundamentally incompatible with the requirements of a clinical voice system. Every additional DictationButton multiplies the failure surface. Transcript duplication, multiple sessions, state confusion, and mobile clutter are not bugs — they are emergent behaviors of a decentralized architecture.

**Required action:** Centralize all voice state and recognition lifecycle into a single `VoiceSessionManager`.

The refactor must:
1. Eliminate all per-instance `new SpeechRecognition()` calls
2. Provide a single `startRecording(fieldId)` / `stopRecording()` API
3. Enforce that switching fields stops the previous recording
4. Emit only transcript deltas (never full accumulated text)
5. Provide a single UI state source for recording indicators

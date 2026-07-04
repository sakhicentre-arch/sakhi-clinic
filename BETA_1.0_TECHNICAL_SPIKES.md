# Sakhi Clinic Beta 1.0 - Technical Spikes

## Status
- Version: 1.0
- Purpose: Validate the highest-risk technical assumptions before implementation begins
- Scope: Sprint 1 and the early Beta 1.0 slice

## 1. Voice Engine Spike
### Objective
Validate that continuous recording, pause/resume, transcript routing, and error recovery can work reliably in the current browser and device environment.

### Prototype required
- Minimal recording surface wired to the current consultation flow
- State handling for listening, recording, paused, processing, and error
- Basic transcript routing into the expected consultation field

### Success criteria
- Recording and pause/resume behaviour are dependable
- Transcript reaches the intended field without duplication
- Permission and interruption errors are recoverable

### Failure criteria
- Recording state becomes ambiguous
- Transcript is lost or duplicated
- Recovery from permission denial is not possible

### Estimated effort
- 2 to 3 days

### Decision after completion
- Proceed with full implementation if the spike proves stable and recoverable; otherwise, constrain the voice feature scope.

## 2. Offline Storage Spike
### Objective
Validate that local drafts, consultation state, and sync-pending data can be stored and recovered safely when connectivity is unavailable.

### Prototype required
- A minimal save-and-recover flow for consultation data and pending sync state
- Local persistence test for draft and consultation state
- Reconnect recovery path

### Success criteria
- Drafts survive reload and disconnect safely
- Sync-pending state is preserved and reconciled after reconnect
- The product clearly communicates offline state

### Failure criteria
- Data is lost after refresh or disconnect
- Sync state becomes inconsistent
- Reconnect recovery is unreliable

### Estimated effort
- 2 days

### Decision after completion
- Proceed if the local persistence model is reliable; otherwise, limit offline scope for Beta 1.0.

## 3. AI Pipeline Spike
### Objective
Validate that AI-generated consultation assistance can be introduced without undermining clinician trust or safety.

### Prototype required
- A minimal AI assistance path for note structuring or summary generation
- Review and approve/reject controls
- Confidence and provenance indicators

### Success criteria
- AI output is clearly labeled and reviewable
- The system does not present AI output as authoritative without review
- The doctor can override or reject it without losing context

### Failure criteria
- AI content is ambiguous or appears final without review
- The workflow creates extra work or confusion

### Estimated effort
- 3 to 4 days

### Decision after completion
- Proceed if the AI lifecycle is reviewable, reversible, and understandable; otherwise, keep AI support limited to non-critical assistance.

## 4. Timeline Performance Spike
### Objective
Validate that timeline rendering remains responsive as patient and consultation history grow.

### Prototype required
- Load a representative history set into the current timeline structure
- Measure render and interaction latency under a larger data set

### Success criteria
- Timeline interactions remain smooth and responsive
- History loads within accepted performance thresholds
- Larger histories do not degrade core consultation actions

### Failure criteria
- Timeline interactions become slow or unstable
- Large data sets cause noticeable delay in the app

### Estimated effort
- 2 days

### Decision after completion
- Proceed if the timeline remains responsive; otherwise defer timeline enhancements to Beta 1.1.

## 5. Receipt Upload Spike
### Objective
Validate that receipt upload, attachment handling, and fallback behaviour are reliable and low-friction.

### Prototype required
- A minimal upload flow for receipt or screenshot capture
- Retry/failure handling
- Clear fallback if upload is unavailable

### Success criteria
- Uploads succeed under normal conditions
- Failures are recoverable without blocking the consultation flow
- The doctor can proceed with a clear next step

### Failure criteria
- Upload flow blocks the main task
- Errors are unclear or unrecoverable

### Estimated effort
- 2 days

### Decision after completion
- Proceed if receipt handling is reliable and non-blocking; otherwise, defer to a later release slice.

## 6. PWA Behaviour Spike
### Objective
Validate that the installed PWA behaves correctly across reload, resume, and offline conditions.

### Prototype required
- Test the existing PWA install and reload model with consultation and voice-related paths
- Verify offline state messaging and resume after reconnect

### Success criteria
- Reload and resume flows are stable
- PWA remains usable when offline
- Voice and save behaviour degrade gracefully

### Failure criteria
- The app loses state on reload
- Offline messaging is ambiguous or misleading

### Estimated effort
- 2 days

### Decision after completion
- Proceed if PWA behaviour is stable; otherwise, limit Beta 1.0 rollout to browsers with better runtime support.

## 7. Sync Queue Spike
### Objective
Validate that pending changes are queued, retried, and reconciled safely.

### Prototype required
- Simulate pending consultation, follow-up, and payment changes
- Verify queue handling, retry, and resolution behaviour

### Success criteria
- Pending changes are preserved and retried safely
- Queue health is visible to the user and system
- Reconnect recovery is predictable

### Failure criteria
- Changes are dropped or duplicated
- Queue state is not visible or recoverable

### Estimated effort
- 2 days

### Decision after completion
- Proceed if sync queue reliability is confirmed; otherwise, limit scope to local-only saves for the initial release slice.

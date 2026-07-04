# Sakhi Clinic Beta 1.0 - Implementation-Ready UX Specifications

## Status
- Version: 1.0
- Purpose: Provide implementation-ready experience specifications for Sprint 1 and the early Beta 1.0 delivery slice
- Scope: Consultation screen, voice recording experience, and patient timeline only

## 1. Consultation Screen

### Purpose
Support the doctor in moving from patient context to consultation completion with minimal friction while preserving attention on the patient.

### Primary user
- Primary: Doctor during live consultation
- Secondary: Patient receiving care

### Entry points
- From the queue or today view
- From an appointment entry
- From a patient profile
- From a saved draft or interrupted consultation

### Exit points
- Save consultation
- Save draft and leave
- Resume later
- Cancel current consultation
- Move to next patient
- Open payment or follow-up after consultation

### Information hierarchy
1. Patient identity and context
2. Current consultation status
3. Primary clinical notes area
4. Voice and AI assistance area
5. Prescription and follow-up controls
6. Save and completion controls

### Component hierarchy
- Top context bar
  - Patient name and basic context
  - Consultation status chip
  - Draft/saved state indicator
- Primary clinical input area
  - Chief complaint field
  - Case notes field
  - Quick action chips for common note patterns
- Voice and AI panel
  - Voice control bar
  - AI summary preview area
  - Review and approve controls
- Prescription area
  - Remedy input and review panel
  - Follow-up controls
- Bottom action bar
  - Save draft
  - Save consultation
  - Cancel
  - Continue to next step

### Interaction flow
1. Load patient context.
2. Show current consultation state and any saved draft.
3. Present the primary clinical note area first.
4. Allow voice capture as the default assistive path.
5. Show AI-generated structure only after capture or when requested.
6. Keep review and confirm actions immediately adjacent to AI output.
7. Preserve a clear save path before leaving the screen.

### Empty states
- No patient selected: show a patient-context placeholder and a clear entry path.
- No draft: no draft message shown unless the user previously saved one.
- No prescription yet: show a neutral placeholder with next-step guidance.

### Loading states
- Patient context loading: show a lightweight loading state.
- Save in progress: show persistent in-progress feedback.
- AI processing: show a non-blocking busy state with clear text.

### Offline states
- Show that the consultation is in offline mode when the device is disconnected.
- Preserve local draft and local notes.
- Clearly indicate that sync is pending.

### Error states
- Save failure: show retry and continue options.
- Voice capture failure: show recovery instructions and a retry path.
- AI processing failure: show fallback text and allow manual continuation.

### Permission states
- Microphone permission denied: show a clear prompt and a fallback path.
- Camera or file access denied: show a non-blocking warning if relevant to the current workflow.

### AI states
- Idle: no AI output visible
- Processing: temporary busy state
- Suggested: AI content shown with review affordance
- Approved: accepted content marked as reviewed
- Rejected: content removed or replaced

### Voice states
- Idle
- Listening
- Recording
- Paused
- Processing
- Review
- Error

### Accessibility requirements
- Touch targets must be at least 44x44 px where feasible.
- Status must not rely on color alone.
- Screen reader labels must exist for all action controls.
- Voice and AI states must be announced clearly.
- The screen must remain usable with large text and reduced motion.

### One-handed interaction rules
- The most common action must be reachable within the lower thumb zone.
- Save and voice controls must remain visible without requiring reach to the top of the screen.
- Secondary actions must not interrupt the primary note-taking path.

### Trust indicators
- Save success indicator
- Draft saved indicator
- Sync pending indicator
- AI-generated content label
- Review required marker for AI output

### Acceptance criteria
- The doctor can begin a consultation and reach the primary note area without unnecessary navigation.
- Voice capture can start from the consultation screen without hidden setup.
- AI output can be reviewed and accepted or dismissed without losing context.
- Save and draft states are clearly communicated.

### Regression risks
- Save flow regressions
- Draft overwrite issues
- Voice state confusion
- AI content being treated as final without review

### Files likely to be impacted
- src/pages/ConsultationPage.tsx
- src/components/DictationButton.tsx
- src/components/SmartInput.tsx
- src/components/PrescriptionEditor.tsx
- src/services/consultationService.ts
- src/services/draftService.ts
- src/store/useConsultationStore.ts

### Dependencies
- Existing consultation data model
- Voice permission handling
- Draft persistence
- Sync queue status

## 2. Voice Recording Experience

### Purpose
Provide a dependable, recoverable, and clinically safe dictation experience that supports live consultation capture without forcing the doctor to manage the recording tool.

### Primary user
- Doctor during consultation and documentation

### Entry points
- From the consultation screen
- From a paused consultation
- From an imported phone recording workflow

### Exit points
- Stop recording
- Pause recording
- Resume recording
- Review transcript
- Discard recording
- Save transcript to consultation context

### Information hierarchy
1. Recording status
2. Current recording duration
3. Language selection
4. Transcript preview or review area
5. Recovery and error state

### Component hierarchy
- Voice control surface
  - Start/Pause/Stop buttons
  - Recording timer
  - Language selector
  - Status indicator
- Transcript review surface
  - Transcript text preview
  - Accept/Retry/Edit actions
- Error and recovery panel
  - Permission prompt
  - Retry or fallback action

### Interaction flow
1. Doctor taps voice control.
2. System shows listening or recording state immediately.
3. Recording continues until explicitly stopped or paused.
4. Transcription is routed to the correct consultation field.
5. System exposes review actions after capture.
6. Errors show a clear recovery path.

### Empty states
- No recording yet: show a clear start state.
- No transcript yet: show a neutral prompt.

### Loading states
- Processing transcript: show an in-progress indicator.
- Preparing audio import: show progress feedback.

### Offline states
- Voice capture unavailable offline: show that the feature is unavailable and offer manual fallback.
- Imported recording available from local storage: show that it can be reviewed and saved.

### Error states
- Microphone permission denied
- Browser unsupported
- Recording interrupted
- Transcript unavailable

### Permission states
- Permission required before capture starts
- Permission denied: show recovery guidance
- Permission granted: proceed to recording state

### AI states
- Transcript processing
- AI-generated structure prepared
- AI review pending
- AI result accepted or rejected

### Voice states
- Listening
- Recording
- Paused
- Processing
- Review
- Error

### Accessibility requirements
- Voice controls must be announced clearly to assistive tech.
- Status must be readable without audio-only feedback.
- The screen must remain usable when motion is reduced and text is enlarged.

### One-handed interaction rules
- The main recording controls must be reachable from the lower half of the screen.
- Pause and stop must be close to the primary action surface.
- The doctor should not need to navigate away to recover a failed recording.

### Trust indicators
- Recording in progress indicator
- Timer and live state feedback
- Transcript confidence indicator where available
- Clear distinction between raw transcript and AI-enhanced output

### Acceptance criteria
- Recording continues until the doctor explicitly stops or pauses it.
- The system shows a visible state at all times.
- Transcript is routed to the intended consultation field.
- Permission and recovery failures are understandable and recoverable.

### Regression risks
- State machine regressions
- Transcript duplication
- Lost recording on interruption
- Permission handling breakage across browsers

### Files likely to be impacted
- src/components/DictationButton.tsx
- src/pages/ConsultationPage.tsx
- src/services/whatsappService.ts
- src/services/consultationService.ts
- src/store/useConsultationStore.ts

### Dependencies
- Browser speech API availability
- Permission handling
- Consultation state store
- Draft persistence

## 3. Patient Timeline

### Purpose
Give the doctor a reliable, chronological view of the patient’s clinical history so the next consultation can start with context instead of reconstruction.

### Primary user
- Doctor reviewing prior consultations, follow-ups, payments, reports, and notes

### Entry points
- From patient profile
- From consultation screen
- From follow-up or reminder context
- From search result

### Exit points
- Return to consultation
- Open an older record
- Open a report or payment entry
- Return to patient profile

### Information hierarchy
1. Most recent consultation context
2. Chronological history items
3. Follow-up and payment context
4. Related reports and attachments

### Component hierarchy
- Header summary
  - Patient identity
  - Last visit context
  - Current care status
- Timeline list
  - Date and time markers
  - Event cards for consultation, voice, AI summary, medicine, report, payment, receipt, and follow-up
- Detail panel
  - Expanded event detail
  - Secondary actions

### Interaction flow
1. Open the timeline from the patient context.
2. Show the latest event first.
3. Allow quick expansion of an item for detail.
4. Preserve continuity when leaving and returning.
5. Support quick transition back into consultation.

### Empty states
- No timeline events: show a neutral empty state with next-step guidance.
- No reports or receipts: show an informational placeholder.

### Loading states
- Timeline data loading: lightweight loading state
- Expanded detail loading: local skeleton or placeholder

### Offline states
- Show if some history items are unavailable offline.
- Preserve the most recent locally available data and mark stale items clearly.

### Error states
- Failed load of a timeline item
- Missing attachment data
- Broken or inconsistent history record

### Permission states
- File or attachment access permission if relevant

### AI states
- AI-generated summary shown as distinct from raw notes
- AI summary can be reviewed but not treated as the only source of truth

### Voice states
- Voice notes appear as timeline events with clear playback or review affordance

### Accessibility requirements
- Timeline events must be navigable without gesture confusion.
- Labels should be clear for past events and attachments.
- Errors and loading states must be announced properly.

### One-handed interaction rules
- Timeline browsing should support quick scrolling and fast tap targets.
- Primary history actions should not depend on complex gestures.

### Trust indicators
- Clear event timestamps
- Clear source labels for notes, voice, AI summary, and payments
- Visible status for pending or unsaved events

### Acceptance criteria
- The doctor can understand the patient’s recent history quickly.
- The timeline presents events in a logical, scrollable sequence.
- The doctor can return to consultation or patient context without losing place.

### Regression risks
- Timeline load regressions
- Historical event ordering errors
- Attachment or receipt rendering issues
- Timeline state confusion after consultation save

### Files likely to be impacted
- src/components/shared/PatientHistoryTimeline.tsx
- src/pages/PatientPage.tsx
- src/services/consultationService.ts
- src/services/db.ts
- src/store/useConsultationStore.ts

### Dependencies
- Consultation and patient persistence
- Receipt and report data availability
- Offline history availability

## Implementation Notes for Engineers
- Keep all changes local to the current workflow surfaces where possible.
- Preserve existing data contracts unless a clearly scoped migration is approved.
- Prefer progressive disclosure over introducing new screens.
- Every new state should have visible feedback and a recovery path.

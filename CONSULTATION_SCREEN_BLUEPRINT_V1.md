# CONSULTATION_SCREEN_BLUEPRINT_V1

## Document purpose

This document is the implementation specification for the Sakhi Clinic consultation experience. It is not a product strategy document and it does not redefine the clinical model. It defines the required UI structure, interaction flow, state handling, accessibility requirements, and implementation scope for the consultation screen.

This blueprint is constrained by the frozen product blueprint, the clinical strategy, the behaviour specifications, and the current technical architecture. It is intended to remove implementation ambiguity for frontend engineers.

---

## 1. Screen purpose

### Why this screen exists
The consultation screen exists to support a doctor during a live consultation from first contact to final save. It must reduce friction, reduce typing, reduce scrolling, and preserve trust in the clinical record.

### Doctor goals
- Capture the consultation quickly and accurately.
- Keep attention on the patient rather than the phone.
- Move through the workflow with minimal taps and minimal scrolling.
- Use voice naturally when speaking.
- Review and confirm the record before saving.
- Save with confidence.

### Patient goals
- Receive attention and a calm consultation experience.
- Feel that the doctor is present and engaged.
- See that the consultation is documented accurately.

### Primary workflow
1. Open consultation for a selected patient.
2. Review patient context.
3. Capture complaint using voice or typing.
4. Add minimal clinical context.
5. Create or update prescription.
6. Set follow-up and payment details.
7. Save consultation.
8. Move to the next patient.

### Success criteria
- A doctor can complete a standard consultation with less cognitive effort than the current experience.
- Voice capture is reliable and visible.
- The doctor can save the consultation without uncertainty.
- The interface remains usable on a phone in one hand.
- The screen feels calmer and faster than the current version.

---

## 2. Screen layout

The consultation screen is a mobile-first, single-column experience with a sticky top context region and a sticky bottom action dock.

### Top to bottom structure

1. Sticky Header
   - Purpose: anchor patient context and primary actions.
   - Visibility: always visible while scrolling.
   - Priority: high.
   - Expand/Collapse: no full collapse; compact mode is allowed for reduced header height.
   - Scrolling behaviour: remains pinned at top.
   - Mobile: compact and focused.
   - Tablet: compact with more horizontal space.
   - Desktop: standard layout with wider header controls.

2. Patient Summary
   - Purpose: orient the doctor to the patient before entering data.
   - Visibility: visible by default.
   - Priority: high.
   - Expand/Collapse: collapsed by default only if space is constrained; must remain accessible.
   - Scrolling behaviour: part of the sticky header region or immediately below it.
   - Mobile: compact summary chips.
   - Tablet: slightly richer summary.
   - Desktop: full summary panel.

3. Consultation Progress
   - Purpose: communicate the current stage and completion state.
   - Visibility: visible by default on mobile; visible but compact on tablet/desktop.
   - Priority: medium.
   - Expand/Collapse: no expand; stage changes are explicit.
   - Scrolling behaviour: sticky or anchored below the header.
   - Mobile: horizontal stage strip.
   - Tablet: compact progress rail.
   - Desktop: compact step indicator.

4. Voice Bar
   - Purpose: make voice capture the most obvious input method.
   - Visibility: always visible near the top of the active content area.
   - Priority: high.
   - Expand/Collapse: not collapsible; can enter a compact state when idle.
   - Scrolling behaviour: remain visible while the doctor is actively recording; otherwise may scroll away.
   - Mobile: fixed or sticky near the top.
   - Tablet/Desktop: persistent control bar.

5. Chief Complaint
   - Purpose: capture the core reason for the consultation.
   - Visibility: always visible and first in the reading order.
   - Priority: highest.
   - Expand/Collapse: single-card; no hidden collapse.
   - Scrolling behaviour: visible in the primary flow; should not be buried below many controls.
   - Mobile: large input with voice integrated.
   - Tablet/Desktop: same content in a wider layout.

6. Clinical Context
   - Purpose: capture the minimal supporting context required for decision making.
   - Visibility: visible when needed, but not dominant.
   - Priority: medium.
   - Expand/Collapse: collapsible sections or progressive disclosure.
   - Scrolling behaviour: can be below the complaint.
   - Mobile: compact chips and short inputs.
   - Tablet/Desktop: grouped cards.

7. Prescription
   - Purpose: support remedy selection and prescription creation.
   - Visibility: visible in the main flow.
   - Priority: high.
   - Expand/Collapse: open by default when the doctor is at the prescribing stage.
   - Scrolling behaviour: card-based and compact.
   - Mobile: one remedy card at a time or focused card stack.
   - Tablet/Desktop: multiple cards inline where appropriate.

8. AI Assistant
   - Purpose: provide assistive suggestions and review help without taking over the workflow.
   - Visibility: visible only when useful or when explicitly requested.
   - Priority: medium-low.
   - Expand/Collapse: collapsed by default; can expand on demand.
   - Scrolling behaviour: secondary content.
   - Mobile: bottom sheet or compact card.
   - Tablet/Desktop: side panel or inline assist panel.

9. Timeline
   - Purpose: provide recent patient context during the consultation.
   - Visibility: visible when needed, not dominant.
   - Priority: medium-low.
   - Expand/Collapse: collapsed by default; expandable from a compact summary.
   - Scrolling behaviour: secondary content.
   - Mobile: compact summary card.
   - Tablet/Desktop: inline summary panel.

10. Follow-up
    - Purpose: define next steps and schedule follow-up.
    - Visibility: visible before save.
    - Priority: medium.
    - Expand/Collapse: compact card or section.
    - Scrolling behaviour: appears near the bottom of the main flow.
    - Mobile: compact chip-based completion card.
    - Tablet/Desktop: standard form inputs.

11. Payment Summary
    - Purpose: collect fee and payment status without making payment the centre of the workflow.
    - Visibility: visible but secondary.
    - Priority: medium-low.
    - Expand/Collapse: compact summary row or collapsed panel.
    - Scrolling behaviour: appears near the end of the form.
    - Mobile: compact row.
    - Tablet/Desktop: standard fields.

12. Bottom Action Dock
    - Purpose: provide dominant and safe actions for save and next step.
    - Visibility: always visible on mobile; sticky on desktop.
    - Priority: highest.
    - Expand/Collapse: no collapse.
    - Scrolling behaviour: sticky at bottom.
    - Mobile: primary button cluster.
    - Tablet/Desktop: bottom dock or action bar.

---

## 3. Component tree

### ConsultationShell
- Purpose: provide the top-level consultation screen container.
- Responsibilities: host layout, state orchestration, screen-level error handling, responsive behaviour.
- Inputs: patientId, appointmentId, mode, patient data, consultation state.
- Outputs: rendered shell with child components.
- Internal state: screen mode, keyboard state, responsive mode, save status, view state.
- Dependencies: consultation store, patient store, draft service, save service.
- Ownership: page-level controller.

### PatientHeader
- Purpose: show patient context and summary.
- Responsibilities: render name, age, gender, visit count, recent outcome, quick status chips.
- Inputs: patient object, recent consultation summary.
- Outputs: summary display and actions.
- Internal state: compact/expanded header state.
- Dependencies: patient data, consultation history.
- Ownership: shell-level presentational component.

### ConsultationProgressStrip
- Purpose: show current stage and completion.
- Responsibilities: render stage names and status state.
- Inputs: active stage, completion state.
- Outputs: stage selection actions.
- Internal state: current stage.
- Dependencies: parent state.
- Ownership: shell-level component.

### VoiceToolbar
- Purpose: host the voice experience.
- Responsibilities: start/stop recording, show live status, manage language selection, route transcript.
- Inputs: language, active target field, callbacks.
- Outputs: recording state, transcript chunks, errors.
- Internal state: recording state, error state, duration, permission state.
- Dependencies: browser speech recognition API, current language, active field context.
- Ownership: voice-specific component.

### ChiefComplaintCard
- Purpose: capture the main complaint.
- Responsibilities: render complaint input, voice trigger, language selector, templates.
- Inputs: complaint value, template actions, language state.
- Outputs: updated complaint text.
- Internal state: input focus state, template open state.
- Dependencies: SmartInput, VoiceToolbar, suggestion data.
- Ownership: consultation form component.

### SmartInput
- Purpose: provide assisted text entry with suggestions.
- Responsibilities: free text entry, suggestion filtering, keyboard navigation, append/replace behaviour.
- Inputs: value, suggestions, multiline flag, placeholder.
- Outputs: text change events.
- Internal state: open dropdown state, active suggestion index.
- Dependencies: none beyond parent callback.
- Ownership: shared input component.

### ClinicalContextCard
- Purpose: capture minimal examination context.
- Responsibilities: render compact clinical fields and chips.
- Inputs: context values, field definitions.
- Outputs: field updates.
- Internal state: active field, collapsed/expanded state.
- Dependencies: shared input components.
- Ownership: consultation form component.

### PrescriptionCard
- Purpose: manage remedy entry and prescription creation.
- Responsibilities: render remedy list, quick templates, dosage/duration selection, add/remove actions.
- Inputs: medicines array, recent prescriptions, defaults.
- Outputs: medicines updates, add/remove actions.
- Internal state: focused remedy row, composer state, template open state.
- Dependencies: PrescriptionEditor or RemedyInput, remedy defaults, recent consultation history.
- Ownership: consultation form component.

### AIAssistantCard
- Purpose: offer assistive AI suggestions.
- Responsibilities: show suggestions, review prompts, confidence state, optional accept/override actions.
- Inputs: current complaint/context, available suggestions.
- Outputs: accepted suggestion or ignored suggestion.
- Internal state: loading, confidence, expanded/collapsed, reviewed state.
- Dependencies: AI service, current consultation context.
- Ownership: assistant component.

### TimelineCard
- Purpose: show recent patient history in a compact and useful form.
- Responsibilities: render last consultation outcomes and medication pattern.
- Inputs: recent consultations.
- Outputs: none; informational only.
- Internal state: expanded/collapsed summary.
- Dependencies: consultation history data.
- Ownership: patient context component.

### FollowUpCard
- Purpose: handle follow-up scheduling and outcome setting.
- Responsibilities: render outcome chips, follow-up date, fee, payment status.
- Inputs: outcome, follow-up date, fee, payment status.
- Outputs: completed follow-up state.
- Internal state: selected outcome, payment state.
- Dependencies: parent state.
- Ownership: consultation form component.

### SaveIndicator
- Purpose: communicate save and trust state.
- Responsibilities: show draft/saving/saved/sync status and last saved time.
- Inputs: current save state, last save metadata.
- Outputs: none; status display only.
- Internal state: visible state.
- Dependencies: draft service, consultation service, sync state.
- Ownership: shell-level trust component.

### BottomDock
- Purpose: place the primary action cluster at the bottom of the screen.
- Responsibilities: render save, next, notes, templates, review, and other core actions.
- Inputs: action definitions and disabled state.
- Outputs: action callbacks.
- Internal state: action availability.
- Dependencies: shell-level action handlers.
- Ownership: shell-level component.

---

## 4. Information hierarchy

### Must always be visible
- Patient name and basic context.
- Current consultation stage.
- Active complaint input.
- Voice control.
- Save action.
- Primary prescription action.

### Visible when needed
- Clinical context fields.
- AI suggestions.
- Timeline summary.
- Follow-up and payment details.

### Collapsed by default
- Detailed timeline history.
- Full AI panel.
- Optional clinical sections not needed for the current stage.
- Detailed payment and billing controls.

### Hidden until requested
- Full notes editor.
- Advanced templates management.
- Review / print / share actions that are not part of the core consultation loop.

### Why
The most important information is the current clinical issue, the patient context, and the next action. All other information should support that flow rather than compete with it.

---

## 5. Complete interaction flow

### Doctor opens consultation
- The doctor enters the consultation flow from the queue or patient page.
- The screen loads the patient summary and recent consultation context.
- The doctor sees the patient name, visit history, and the current stage.

### Doctor reads patient summary
- The doctor scans recent outcome, medication history, and follow-up status.
- The summary should help with continuity and reduce re-asking.

### Doctor starts voice
- The doctor taps the voice control.
- The UI updates to a listening or recording state.
- The doctor speaks naturally.

### Voice captures speech
- The system captures and transcribes speech.
- The transcript is inserted into the active field.
- The doctor can review and edit immediately.

### Doctor reviews content
- The doctor checks the transcript and corrects obvious errors.
- The complaint becomes the basis for the rest of the consultation.

### Doctor enters clinical context
- The doctor adds only the minimum context required.
- The interface uses compact chips or short-field patterns to reduce typing.

### Doctor creates prescription
- The doctor selects or enters the remedy and dosage.
- The prescription builder remains compact and focused.
- The doctor can use templates or recent prescriptions.

### Doctor reviews AI assistance
- If AI suggestions are available, they appear as assistive content.
- The doctor can accept, modify, or ignore them.
- AI never replaces the doctor’s judgment.

### Doctor sets follow-up and payment
- The doctor selects the next follow-up and optionally enters fee/payment state.
- This is a secondary completion step, not the primary experience.

### Doctor saves
- The doctor taps Save.
- The UI immediately shows saving state.
- The doctor sees confirmation that the consultation is saved locally and then synced if possible.

### Doctor moves to next patient
- The doctor proceeds to the next consultation with the same confident workflow.

---

## 6. Voice experience

### State machine

#### Idle
- UI: voice button in ready state; no active recording.
- Doctor action: tap to start.
- System action: none.
- Error handling: none.
- Recovery: none.
- Acceptance criteria: visually clear and reachable.

#### Permission Request
- UI: permission prompt or inline message.
- Doctor action: grant permission.
- System action: request microphone access.
- Error handling: explain why permission is needed.
- Recovery: allow retry.
- Acceptance criteria: no dead-end state.

#### Ready
- UI: voice control shows ready state and language selection.
- Doctor action: start listening.
- System action: prepare recognition session.
- Error handling: show if browser or device is unsupported.
- Recovery: provide fallback to text input.
- Acceptance criteria: the doctor can begin immediately.

#### Listening
- UI: active visual feedback with clear recording state.
- Doctor action: speak.
- System action: start capturing speech.
- Error handling: handle silence and interruption.
- Recovery: stay in the same state or transition to error if not recoverable.
- Acceptance criteria: recording stays active until stopped by the doctor.

#### Recording
- UI: strong recording indicator and live status text.
- Doctor action: continue speaking or stop.
- System action: continuously capture and buffer transcript.
- Error handling: show interruption or temporary failure.
- Recovery: return to ready or listening if the session restarts.
- Acceptance criteria: no automatic stop without explicit doctor action.

#### Paused
- UI: pause status with clear resume affordance.
- Doctor action: resume or stop.
- System action: hold buffer without losing content.
- Error handling: preserve transcript and avoid data loss.
- Recovery: restore to recording or ready.
- Acceptance criteria: no silent loss of previous transcript.

#### Processing
- UI: lightweight progress state.
- Doctor action: wait or cancel.
- System action: prepare transcript for insertion.
- Error handling: handle transcription errors.
- Recovery: fall back to partial transcript or raw text.
- Acceptance criteria: the doctor sees progress without confusion.

#### Transcript Ready
- UI: transcript preview or direct insertion into the active field.
- Doctor action: review, accept, or edit.
- System action: place transcript into the active field.
- Error handling: show if insertion fails.
- Recovery: allow manual re-entry.
- Acceptance criteria: transcript lands in the active field.

#### AI Processing
- UI: optional AI assist state.
- Doctor action: wait or dismiss.
- System action: run post-processing or suggestion generation.
- Error handling: degrade gracefully.
- Recovery: show the original transcript.
- Acceptance criteria: AI never blocks the doctor from continuing.

#### Completed
- UI: normal idle state with the inserted content visible.
- Doctor action: continue with the consultation.
- System action: finalize transcript and update field state.
- Error handling: none.
- Recovery: none.
- Acceptance criteria: the workflow returns to a calm ready state.

#### Error
- UI: explicit error state with recovery action.
- Doctor action: retry, dismiss, or fall back to typing.
- System action: stop recognition and surface error details.
- Error handling: show concise message.
- Recovery: return to ready or allow manual input.
- Acceptance criteria: the doctor can continue without being trapped.

#### Recovery
- UI: recovery path with clear next action.
- Doctor action: retry or continue manually.
- System action: restore an earlier safe state.
- Error handling: preserve the last good transcript.
- Recovery: return to ready.
- Acceptance criteria: the system never silently loses the doctor’s text.

---

## 7. AI experience

### AI timing
- AI suggestions should appear after the doctor has entered enough context to be useful.
- AI should not interrupt the doctor while speaking.
- AI should be passive by default.

### AI placement
- AI content should appear in a compact assist panel or inline suggestion area.
- It must not displace the core complaint field.
- It should be visually secondary to the main consultation content.

### AI confidence
- AI suggestions must display a confidence state or trust indicator.
- Confidence must be clear but not overemphasised.
- The doctor must not see AI output as a factual claim by default.

### Review workflow
- The doctor can review AI output before accepting it.
- The doctor can accept, edit, or reject suggestions.
- Suggested text must be easy to distinguish from doctor-authored text.

### Doctor approval
- AI is assistive only.
- The doctor approves any action that changes the consultation record.

### Override
- The doctor can override any AI suggestion by typing or speaking.
- Override must be immediate and frictionless.

### Failure behaviour
- If AI fails, the screen falls back to the doctor’s entered content.
- The doctor should not lose the original record because of AI failure.

### Trust indicators
- Show “suggested”, “review required”, or “accepted” states.
- Keep the doctor in control of final content.

---

## 8. Save & trust model

The doctor must always know whether the consultation is safe, pending, saved, or in conflict.

### State definitions

#### Not Started
- Meaning: no meaningful content has been entered.
- Doctor sees: a neutral idle state.

#### Draft
- Meaning: content exists but has not been explicitly saved.
- Doctor sees: draft badge or autosave indicator.

#### Saving
- Meaning: save is in progress.
- Doctor sees: loading state with clear status text.

#### Saved Locally
- Meaning: the consultation has been written to local storage successfully.
- Doctor sees: visible success state and last saved time.

#### Sync Pending
- Meaning: local save completed but sync is still pending.
- Doctor sees: soft status indicator, not a failure state.

#### Synced
- Meaning: the consultation is safely persisted and uploaded or queued successfully.
- Doctor sees: clear success confirmation.

#### Offline
- Meaning: the device is offline and the save is local-first.
- Doctor sees: an offline badge and a trust note that the consultation is safely stored locally.

#### Conflict
- Meaning: the consultation state has diverged from a previous version or source.
- Doctor sees: a warning and a recovery path.

#### Recovery
- Meaning: the system is recovering from interruption.
- Doctor sees: a non-blocking recovery message.

#### Failed
- Meaning: save or sync failed.
- Doctor sees: a clear error state and retry action.

#### Retry
- Meaning: the doctor can attempt another save.
- Doctor sees: clear retry affordance.

### Save behaviour requirements
- Saving must not feel uncertain.
- The doctor should see confirmation quickly.
- The doctor should never be forced to guess whether the consultation is safely stored.

---

## 9. One-handed usability map

### Thumb-safe zones
- Primary actions: bottom-right and bottom-center for thumbs.
- Secondary actions: lower-left and upper-left for less frequent use.
- Avoid placing critical actions above the mid-screen unless necessary.

### Primary actions
- Voice start/stop.
- Save.
- Add remedy.
- Next patient.

### Secondary actions
- Notes.
- Templates.
- Review.
- Print/share.

### Gesture support
- Tap for core actions.
- Swipes are optional and not required for the main flow.
- No gesture should be required for essential saving.

### Reachability
- The common consultation loop must be reachable without shifting the hand to the top of the screen.

### Touch targets
- Minimum target size: 44x44 CSS px.
- Preferred target size: 48x48 CSS px or more.

### Spacing
- Touch groups should have generous spacing.
- Buttons should not be packed tightly in the bottom dock.

---

## 10. Visual hierarchy

This section defines hierarchy without prescribing colour values.

### Primary focus
- Current complaint.
- Voice control.
- Save.
- Prescription entry.

### Secondary focus
- Patient summary.
- Clinical context.
- Follow-up.
- Payment.

### Typography hierarchy
- Screen title: highest emphasis.
- Section titles: strong but restrained.
- Field labels: clear and compact.
- Support text: small and secondary.
- Input text: primary reading weight.

### Spacing hierarchy
- Section spacing should clearly separate major content blocks.
- Interior spacing should be consistent across cards.
- Dense content should be grouped, not squeezed.

### Card hierarchy
- Primary cards should be larger and visually stronger.
- Secondary cards should support, not compete.
- Card rhythm should be calm and predictable.

### Action hierarchy
- Save and voice should be visually dominant.
- Template and notes actions should be visible but secondary.
- Review and print should be tertiary.

### Visual rhythm
- The screen should move from top to bottom in a calm and predictable order.
- The flow should reduce abrupt visual jumps.

---

## 11. Cognitive load analysis

### Why each section exists
- Complaint section exists to capture the core clinical issue immediately.
- Context section exists to support decision-making without overwhelming the doctor.
- Prescription section exists to create the treatment plan quickly.
- Follow-up and payment exist to close the loop cleanly.

### How it reduces thinking
- The active stage is explicit.
- The doctor sees the next likely action.
- The interface avoids asking the doctor to reason about where to go next.

### How it reduces taps
- Voice reduces the need for typing.
- Templates reduce repeated remedy entry.
- Compact chips reduce field-level navigation.

### How it reduces scrolling
- Sections should be arranged in a clinically logical order.
- Only the necessary content should be visible at each stage.
- Secondary details should stay collapsed until needed.

### How it reduces typing
- Short fields and chip-based choices reduce manual entry.
- Voice entry is integrated at the point of need.
- Suggestions and recent history reduce repeated input.

### How it improves consultation speed
- The screen makes the next action obvious.
- The workflow is linear and readable.
- The doctor can stay focused on the patient.

---

## 12. Responsive behaviour

### Phone
- Single-column layout.
- Sticky header and bottom dock.
- Voice control visible near the top of the flow.
- Large touch targets and compact cards.

### Tablet
- Single-column with more horizontal room for grouped content.
- Side-by-side clinical context elements may appear where appropriate.
- Bottom dock remains available but with more generous spacing.

### Desktop
- Wider layout with more visible supporting panels.
- Full patient summary and timeline may be shown alongside the main flow.
- Bottom dock remains available but may be less dominant.

### Landscape
- Content should not become overly stretched.
- Voice bar and action dock should maintain clarity.
- Long forms should reflow without causing awkward spacing.

### Portrait
- Primary flow remains vertical and focused.
- The action dock should remain reachable.

### Foldables
- The layout should adapt to both single- and dual-pane states if possible.
- The main consultation flow should remain the primary experience.

---

## 13. Accessibility

### Large text
- Text should scale without clipping or overlap.
- Layout should support increased font size.

### Screen reader
- All major sections must have clear labels.
- Buttons must expose meaningful names.
- State changes must be announced appropriately.

### VoiceOver / TalkBack
- Focus order must be logical.
- Interactive elements must be reachable and understandable.

### Colour blindness
- Status and hierarchy must not rely on colour alone.
- Icons and text labels should reinforce meaning.

### Motor impairment
- Controls must be large and spaced well.
- Interaction must not depend on fine motor precision.

### Low vision
- Contrast must be sufficient.
- Important content must not rely on visual decoration alone.

### Motion sensitivity
- Animations should be subtle and optional.
- Motion should not be required to understand state changes.

---

## 14. Error states

### Voice errors
- Microphone permission denied.
- Browser not supported.
- Recognition failure.
- Session interrupted.
- Recovery: fallback to typing and explicit retry.

### AI errors
- No suggestions available.
- Suggestion generation failed.
- AI output rejected.
- Recovery: hide the panel gracefully and keep the entered content intact.

### Network errors
- Backend unreachable.
- Sync delayed.
- Recovery: use local-first save and a clear pending state.

### Offline errors
- Device offline.
- Recovery: keep local save active and show offline status.

### Save errors
- Save failed.
- Retry needed.
- Recovery: show retry and preserve draft state.

### Permission errors
- Camera or microphone permissions denied.
- Recovery: explain the problem and offer manual alternatives.

### Browser errors
- Speech API unavailable.
- Unsupported browser.
- Recovery: fall back to typing.

### Storage errors
- IndexedDB unavailable or full.
- Recovery: show a clear error and preserve draft state if possible.

### Recovery
- Every error must leave the doctor with a next action.
- No error state should trap the doctor in a dead-end.

---

## 15. Component responsibility matrix

| Component | Owner | Dependencies | Future extensibility | Regression risks |
|---|---|---|---|---|
| ConsultationShell | Page-level controller | store, services, router | high | high |
| PatientHeader | UI component | patient data, consultation summary | medium | low |
| ConsultationProgressStrip | UI component | parent stage state | medium | low |
| VoiceToolbar | voice component | speech API, language state | high | high |
| ChiefComplaintCard | form component | SmartInput, VoiceToolbar | medium | medium |
| SmartInput | shared input component | none | high | medium |
| ClinicalContextCard | form component | shared field components | medium | medium |
| PrescriptionCard | form component | remedy services, defaults | high | high |
| AIAssistantCard | assist component | AI service | high | medium |
| TimelineCard | context component | consultation history | medium | low |
| FollowUpCard | form component | parent state | medium | medium |
| SaveIndicator | trust component | save/sync services | medium | medium |
| BottomDock | shell component | parent actions | medium | low |

---

## 16. Testing matrix

| Interaction | Unit Test | Integration Test | UI Test | Manual Test | Regression Test |
|---|---|---|---|---|---|
| Voice start/stop | Yes | Yes | Yes | Yes | Yes |
| Transcript insertion | Yes | Yes | Yes | Yes | Yes |
| Language change | Yes | Yes | Yes | Yes | Yes |
| Complaint input | Yes | Yes | Yes | Yes | Yes |
| Prescription add/remove | Yes | Yes | Yes | Yes | Yes |
| Save flow | Yes | Yes | Yes | Yes | Yes |
| Draft recovery | Yes | Yes | Yes | Yes | Yes |
| AI assist flow | Yes | Yes | Yes | Yes | Yes |
| Follow-up selection | Yes | Yes | Yes | Yes | Yes |
| Offline/save fallback | Yes | Yes | Yes | Yes | Yes |

---

## 17. Implementation work packages

### WP1: Voice Engine Stabilisation
- Objective: make voice reliable, visible, and predictable.
- Files affected: [src/components/DictationButton.tsx](src/components/DictationButton.tsx), [src/pages/ConsultationPage.tsx](src/pages/ConsultationPage.tsx)
- Dependencies: browser speech API support, current language state, active field context.
- Estimated effort: medium.
- Regression risks: high.
- Rollback plan: keep the old voice entry path available behind a fallback path.
- Definition of Done: recording remains active until stopped by the doctor; transcript lands in the active field; errors are recoverable.
- Acceptance Criteria: manual testing confirms stable voice workflow on supported browsers.

### WP2: Consultation Layout Refactor
- Objective: reduce clutter and improve information hierarchy.
- Files affected: [src/pages/ConsultationPage.tsx](src/pages/ConsultationPage.tsx)
- Dependencies: agreed card ordering and stage model.
- Estimated effort: medium-high.
- Regression risks: medium-high.
- Rollback plan: preserve the current layout behind a toggle if necessary.
- Definition of Done: the complaint, summary, voice, and save actions are clearly prioritised.
- Acceptance Criteria: the doctor can reach the core flow without excessive scrolling.

### WP3: Trust Indicators
- Objective: make save and local-first persistence visibly trustworthy.
- Files affected: [src/pages/ConsultationPage.tsx](src/pages/ConsultationPage.tsx), [src/services/draftService.ts](src/services/draftService.ts), [src/services/consultationService.ts](src/services/consultationService.ts)
- Dependencies: save state model and sync state.
- Estimated effort: medium.
- Regression risks: medium.
- Rollback plan: revert to the existing simple save feedback if needed.
- Definition of Done: the doctor sees clear state transitions for draft, saving, saved, offline, and failed.
- Acceptance Criteria: save confidence is obvious during the first consultation.

### WP4: AI Assistance Layer
- Objective: provide AI help without overwhelming the doctor.
- Files affected: [src/pages/ConsultationPage.tsx](src/pages/ConsultationPage.tsx), related AI services.
- Dependencies: current AI service layer and suggestion model.
- Estimated effort: medium.
- Regression risks: medium.
- Rollback plan: disable AI suggestions without breaking the core consultation form.
- Definition of Done: AI suggestions appear as assistive content and can be reviewed or ignored.
- Acceptance Criteria: the doctor can complete the consultation without AI assistance if needed.

### WP5: Receipt Upload
- Objective: support receipt upload within the payment workflow.
- Files affected: payment workflow components and related services.
- Dependencies: payment flow and file handling support.
- Estimated effort: medium.
- Regression risks: medium.
- Rollback plan: disable receipt upload while leaving the rest of the payment flow intact.
- Definition of Done: uploaded receipts are attached to the consultation or payment workflow.
- Acceptance Criteria: a user can add a receipt and see it in the workflow.

### WP6: Draft Improvements
- Objective: improve reliability and trust for in-progress consultations.
- Files affected: [src/services/draftService.ts](src/services/draftService.ts), [src/pages/ConsultationPage.tsx](src/pages/ConsultationPage.tsx)
- Dependencies: draft schema and save lifecycle.
- Estimated effort: medium.
- Regression risks: medium.
- Rollback plan: restore the previous draft behaviour if necessary.
- Definition of Done: draft recovery is clear, safe, and visible.
- Acceptance Criteria: doctors can recover or discard drafts with confidence.

---

## 18. Final implementation readiness review

### Remaining ambiguities
- The exact visual language for the final polished UI is still partially implicit and should be implemented using the existing design system conventions rather than introducing a new style system.
- The exact level of AI suggestion detail should be confirmed once the assistant layer is built.
- The final receipt upload interaction should be confirmed once the payment workflow is reviewed in more detail.

### Remaining risks
- Speech recognition behaviour differs by browser and device.
- Save and sync trust must remain clear under offline conditions.
- The consultation screen is a high-frequency workflow and must be kept stable under iterative change.

### Anything still requiring clarification
- The final scope of AI suggestions should be confirmed before building the full assistant surface.
- The exact payment receipt handling workflow should be confirmed once the broader payment flow is reviewed.

### Anything intentionally deferred
- Full call recording import.
- Full patient timeline redesign.
- Full search redesign.
- Non-essential premium polish beyond the core consultation workflow.

### Implementation Readiness Score
- Score: 8.5/10

### Recommendation
READY FOR CODING

### Self-review outcome
The blueprint is implementation-ready. It provides enough structure for multiple senior engineers to build the same primary experience while preserving the current product boundaries and clinical intent.

### Remaining planning requirement
No additional planning document is required before implementation.

The planning phase is complete. The next phase is implementation.

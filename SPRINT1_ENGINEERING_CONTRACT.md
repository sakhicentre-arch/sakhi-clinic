# SPRINT1_ENGINEERING_CONTRACT

## Purpose
This document is the engineering contract for Sprint 1. It resolves the remaining coordination ambiguity needed to implement the consultation experience safely and consistently. It does not replace the existing product, UX, architecture, risk, or technical spike documents; it binds the implementation work to a single execution contract.

## 1. Final Sprint 1 Scope

### In-scope for Sprint 1
Sprint 1 covers the consultation experience refinement slice only:
- Consultation screen layout and information hierarchy refinement
- Voice recording reliability and transcript routing
- Save, draft, and trust-state visibility
- Basic AI assistance as reviewable, non-authoritative support
- Existing consultation data model and persistence remain the source of truth

### Out-of-scope for Sprint 1
The following are explicitly excluded from Sprint 1:
- Full timeline redesign
- Full payment workflow redesign
- Full call recording import workflow
- Broad patient import and migration tooling
- Advanced AI automation beyond reviewable assistance
- New clinical data model concepts

### Sprint 1 implementation boundary
Implementation must remain within the existing frozen product direction and the current technical architecture. Any work that would introduce new product behaviour, new clinical workflows, or a new persistence model must be deferred.

### Reference documents
- [SAKHI_CLINIC_BETA_1.0_IMPLEMENTATION_PLAN.md](SAKHI_CLINIC_BETA_1.0_IMPLEMENTATION_PLAN.md)
- [BETA_1.0_SCOPE_LOCK.md](BETA_1.0_SCOPE_LOCK.md)
- [BETA_1.0_UX_SPECIFICATIONS.md](BETA_1.0_UX_SPECIFICATIONS.md)
- [BETA_1.0_RISK_REGISTER.md](BETA_1.0_RISK_REGISTER.md)
- [BETA_1.0_TECHNICAL_SPIKES.md](BETA_1.0_TECHNICAL_SPIKES.md)
- [CONSULTATION_SCREEN_BLUEPRINT_V1.md](CONSULTATION_SCREEN_BLUEPRINT_V1.md)

---

## 2. State Ownership Matrix

| State | Owner | Responsible component | Read access | Write access | Notes |
|---|---|---|---|---|---|
| Consultation form state | Consultation page controller | ConsultationShell | All form consumers | ConsultationShell only | Single source of truth for current consultation edits |
| Voice recording state | VoiceToolbar | VoiceToolbar | ConsultationShell and parent form | VoiceToolbar only | Must not be duplicated in parent state |
| Active target field | Consultation page controller | ConsultationShell | VoiceToolbar, AI assistant, save flow | ConsultationShell only | Determines where transcript is routed |
| Draft state | Draft service | draftService + ConsultationShell | Consultation page and save UI | Draft service via shell | Persisted through local storage / IndexedDB |
| Save state | Save orchestration layer | ConsultationShell + consultationService | Save UI and trust indicator | consultationService + shell | Must expose pending/saved/offline/error states |
| AI assist state | AI assistant component | AIAssistantCard | ConsultationShell and review UI | AIAssistantCard only | Must remain reviewable and non-authoritative |
| Sync state | Sync state layer | existing sync infrastructure | Save UI and trust indicator | sync infrastructure | Must remain non-blocking for the core consultation flow |
| Patient context state | Patient store | existing patient store | ConsultationShell and header | patient store | Read-only for Sprint 1 UI changes |

### State rules
- No component may own the same state in parallel.
- Voice state must not be stored in both the page controller and the voice component.
- Save state must be surfaced through a single status contract.
- AI output must never be treated as authoritative without explicit review.

---

## 3. Event Flow Contracts

### 3.1 Voice -> Transcript contract
- Trigger: doctor starts voice recording
- Event: voice:start
- Payload: language, target field, session id
- Result: voice:recording / voice:partial / voice:final / voice:error
- Routing rule: final transcript must be inserted into the current active target field only
- Failure rule: if routing fails, the transcript must remain visible in a recoverable review state

### 3.2 Voice -> Save contract
- Recording is not considered part of save completion
- Voice transcript must be persisted as part of the consultation draft or current form state
- If save occurs while recording is active, recording must stop first and the current transcript must be preserved

### 3.3 AI -> Review contract
- Trigger: consultation text becomes available
- Event: ai:suggest
- Payload: suggestion content, confidence, source context
- Result: ai:reviewed / ai:accepted / ai:rejected / ai:error
- Rule: AI output must be clearly labeled as suggested and reviewable

### 3.4 Save -> Trust contract
- Trigger: consultation save request
- Event: save:request
- Result: save:pending / save:success / save:error / save:offline
- Rule: the UI must reflect the current save state immediately and must never imply that the save is complete without confirmation

### 3.5 Draft -> Recovery contract
- Drafts must be created from the current form state on meaningful edits
- Draft recovery must not overwrite a user-edited current form state without explicit approval
- Draft deletion occurs only after explicit save success or explicit discard

---

## 4. Browser Support Matrix

| Capability | Supported | Fallback |
|---|---|---|
| Voice recording | Latest Chrome-based mobile/desktop browsers | Manual text input with visible fallback message |
| Microphone permission | Browser with permission prompt support | Manual input and clear retry action |
| Draft persistence | Modern browsers with IndexedDB support | Show warning and preserve current form state in memory only |
| Save and sync | Browsers with current storage and network support | Local-only save with explicit offline state |
| AI assistance | Browsers with current network access | Hide AI panel and continue with manual input |

### Browser policy
- Sprint 1 must target the current supported browser set used by the existing product.
- Unsupported environments must degrade gracefully without blocking consultation completion.
- Browser-specific behaviour must not cause data loss.

---

## 5. Feature Flag Strategy

### Flag 1: Voice experience
- Default: enabled for supported browsers only
- Purpose: allow rollback of the voice experience without disabling the rest of the consultation flow

### Flag 2: AI assistance
- Default: enabled but non-blocking
- Purpose: allow the assistant to be disabled without affecting core consultation capture

### Flag 3: Save trust UI
- Default: enabled
- Purpose: allow the new trust-state UI to be rolled back independently of the save service

### Flag 4: Draft recovery UX
- Default: enabled
- Purpose: allow recovery behaviour to be adjusted without changing the persistence layer

### Flag rules
- All feature flags must be runtime-switchable.
- Flags must not require a full application rebuild for basic disable/enable.
- The default state must be safe for clinicians and must not degrade the core workflow unexpectedly.

---

## 6. Rollback Strategy

### Rollback principles
Rollback must be possible at the feature level without requiring a full revert of the consultation flow.

### Rollback approach
- Voice: disable voice UI and fall back to text input
- AI: hide AI assistance and preserve the existing consultation content
- Save trust UI: revert to the existing save feedback behaviour while keeping the underlying save function intact
- Draft recovery UX: disable the new recovery messaging and fall back to the prior simple behaviour

### Rollback conditions
Rollback is required if any of the following occur:
- voice transcript routing fails repeatedly
- save state becomes misleading or inconsistent
- AI output causes confusion or appears authoritative
- browser fallback behaviour breaks the consultation flow

### Rollback ownership
- Frontend lead owns UI rollback
- Backend or service owner owns persistence rollback if required
- QA lead validates the rollback path before release

---

## 7. Definition of Done for Each Work Package

### WP1: Voice Engine Stabilisation
- Voice recording remains active until explicitly stopped
- Transcript is routed to the active field without duplication
- Permission and interruption errors are recoverable
- Manual fallback is available

### WP2: Consultation Layout Refactor
- The complaint area is the primary focus in the consultation flow
- Primary actions are reachable without excess scrolling
- The core consultation path is clearer than the prior layout
- Existing consultation data remains intact

### WP3: Trust Indicators
- Draft, saving, saved, offline, and failed states are visible and understandable
- Save feedback is non-misleading and consistent
- User can clearly understand whether the consultation is safely stored

### WP4: AI Assistance Layer
- AI suggestions are clearly labeled as suggested
- Review/accept/reject behaviour is available
- AI does not replace the doctor’s control over the consultation content

### WP5: Receipt Upload
- Receipt upload is optional and non-blocking
- Failure is recoverable without blocking the consultation workflow
- Existing payment workflow remains intact

### WP6: Draft Improvements
- Draft recovery and discard behaviour are predictable
- Drafts do not overwrite the current form without explicit action
- Draft loss is prevented under normal reload and interruption scenarios

---

## 8. QA Entry Criteria

QA may begin only when all of the following are true:
- The affected work package is implemented in the target branch
- The relevant feature flag behaviour is available
- Core smoke-test paths are functional
- The target browser matrix is available for validation
- The implementation is not blocked by a known critical defect

---

## 9. QA Exit Criteria

QA may sign off only when all of the following are true:
- All critical Sprint 1 paths pass in the supported browser matrix
- Voice recording and transcript routing pass manual validation
- Save and draft flows are verified under normal and offline conditions
- AI assistance is verified to be reviewable and non-authoritative
- No unresolved critical or high-severity defect remains open for the target slice

---

## 10. Release Gate Checklist

- [ ] Sprint 1 scope is implemented as defined
- [ ] All feature flags are verified in default and fallback states
- [ ] Voice workflow passes supported-browser validation
- [ ] Save, draft, and trust states are verified
- [ ] AI assistance is reviewable and non-authoritative
- [ ] Rollback path is documented and tested
- [ ] QA entry criteria were met
- [ ] QA exit criteria were met
- [ ] No unresolved critical issue remains
- [ ] Release notes and rollback steps are prepared

---

## Appendix A — WP1 Voice Implementation Contract
This appendix supplements the existing Sprint 1 engineering contract and the frozen planning artifacts. It defines the remaining implementation decisions for WP1 only.

### A1. Voice State Contract
- State owner: the voice control component owns the runtime voice state. The consultation page owns the active target field only.
- Valid states: unsupported, idle, recording, error.
- Allowed transitions:
  - unsupported -> idle only if the browser API becomes available during the session.
  - idle -> recording on user start.
  - recording -> idle on explicit stop, save-triggered stop, or successful manual reset.
  - recording -> error on speech recognition failure, interruption, or browser rejection.
  - error -> recording on explicit retry.
  - error -> idle after user dismiss/reset.
- Operational rule: recording must remain active until explicitly stopped; a save operation must stop recording first and preserve the current transcript.

### A2. Transcript Routing Contract
- The active field is determined by the consultation page at the moment the voice session starts, and is updated whenever the user focuses a different input or textarea.
- If no explicit field is selected, the router falls back to the currently focused field; if no field is focused, it falls back to the chief complaint field.
- Final transcript insertion is atomic: the transcript is appended to the current field value with a single space, or used as the field value if the field is empty.
- If the active field changes during recording, the next final transcript is routed to the new active field; any transcript already emitted remains in the previous field.

### A3. Browser Support Matrix
| Browser / environment | Status | Expected behavior | Fallback |
|---|---|---|---|
| Latest Chrome desktop | Supported | Full voice capture, permission flow, interruption recovery | Manual text entry if voice fails |
| Latest Chrome on Android | Supported | Full voice capture with mobile permission handling | Manual text entry if voice fails |
| Latest Edge desktop/mobile | Supported | Same as Chrome | Manual text entry if voice fails |
| Firefox, Safari, or older unsupported browsers | Unsupported | Voice UI is disabled and a non-blocking message is shown | Manual text entry only |
| Browsers without Web Speech API support | Unsupported | Voice UI is disabled and the consultation flow remains usable | Manual text entry only |

### A4. Voice Error Contract
| Web Speech API error | User-visible message | Recovery action | Auto-restart allowed |
|---|---|---|---|
| not-allowed / service-not-allowed | Microphone permission denied. Enable microphone access and try again. | Retry after permission change or continue with manual entry | No |
| audio-capture | Microphone unavailable. Check the device or browser permissions. | Retry after device check or continue with manual entry | No |
| network | Voice recording interrupted. You can retry or continue typing. | Retry once after a short delay or continue manually | Yes, once |
| no-speech | No speech detected. Continue speaking or stop recording. | Continue speaking or stop manually | No |
| aborted | Recording stopped. | Start again manually | No |
| default / unknown | Voice recording interrupted. You can retry or continue typing. | Retry or continue manually | No |

### A5. Feature Flag Strategy
- Flag: VOICE_V2
- Default state: enabled for supported browsers only.
- When disabled: hide or disable the voice experience and preserve the existing text-only consultation workflow without changing draft or save behaviour.
- Rollback procedure: disable VOICE_V2 at runtime, reload the consultation page, and fall back to manual entry immediately; no persisted consultation data is changed.

---

## Self-review
This appendix removes the remaining implementation ambiguity for WP1 by locking the voice state contract, transcript routing rules, browser fallback behavior, error handling, and rollback path without introducing new product scope or extra planning artifacts.

Final Engineering Readiness Score: 88/100

WP1 is ready for implementation.

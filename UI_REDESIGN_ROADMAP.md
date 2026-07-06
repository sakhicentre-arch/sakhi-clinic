# UI REDESIGN ROADMAP

## Executive Summary

This roadmap converts the completed consultation audit, mobile backlog, blueprint, and engineering contract into a single execution plan for the UI/UX redesign. The objective is to move the consultation experience from a desktop-first, partially adapted mobile experience to a mobile-first, clinically focused workflow that is stable, trustworthy, and safe for Beta release.

The redesign is scoped to the existing product direction and current technical architecture. No source behavior is being redefined in this document; the roadmap focuses on implementation sequencing, component migration, risk control, and release readiness.

## 1. Project Overview

### Current implementation status
- The consultation experience exists and is functionally usable, but the current implementation remains desktop-first and has been adapted to mobile rather than redesigned around mobile constraints.
- The current screen is built around a large, monolithic consultation page with mobile wrappers rather than a true mobile-first shell.
- Voice, save, AI, and navigation behaviors are present but not yet coherent enough for a calm and trustworthy doctor workflow.

### Planning status
- Planning is complete.
- The consultation blueprint, implementation audit, backlog, and engineering contract are all in place and aligned.
- The remaining gap is execution sequencing.

### Audit status
- The implementation audit identifies the core architectural issue: the experience is fundamentally desktop-first adapted to mobile.
- The audit also identifies specific weak areas in layout, voice workflow, trust indicators, accessibility, and component structure.

### Backlog status
- The backlog contains 27 issues.
- Severity profile: 0 Critical, 18 High, 9 Medium.
- The backlog covers layout, responsive behavior, voice workflow, AI workflow, keyboard behavior, save behavior, navigation, accessibility, typography, thumb reach, scroll behavior, component consistency, visual hierarchy, information hierarchy, empty states, error states, loading states, trust indicators, animations, and bottom action model.

### Current readiness
- Planning readiness: High
- Implementation readiness: Medium
- Recommendation: ready for implementation planning, not yet ready for uncontrolled implementation without the phased roadmap below.

---

## 2. Release Priority

The following priorities are assigned using the required release model.

### Priority rationale
The required P0 items are classified as release blockers because they directly affect the core consultation path on mobile: layout stability, field completeness, and voice transcript integrity. These issues directly threaten usability, trust, and clinical confidence during live use.

### Priority map

| Issue | Priority | Rationale |
|---|---|---|
| ISSUE-01 Consultation layout broken on mobile | P0 | Blocks core readability and creates layout failure on small screens. |
| ISSUE-02 Desktop-first two-column compression | P0 | Prevents a clear and usable mobile reading order. |
| ISSUE-03 Appetite/Sleep section compression | P0 | Hides clinically important information in the main workflow. |
| ISSUE-04 Missing Allergies dropdown | P0 | Removes required clinical input from the mobile flow. |
| ISSUE-05 Missing Miasm dropdown | P0 | Removes required clinical input from the mobile flow. |
| ISSUE-06 Voice transcript duplication | P0 | Creates confusion, breaks trust, and undermines voice capture reliability. |
| ISSUE-07 Multiple voice controls | P1 | Creates ambiguity in the voice workflow and increases cognitive load. |
| ISSUE-08 Voice status noise | P1 | Degrades calmness and clarity but is not a hard blocker. |
| ISSUE-09 Thumb reach issues | P1 | Reduces one-handed usability and comfort. |
| ISSUE-10 High information density | P1 | Makes the mobile form hard to scan and slows completion. |
| ISSUE-11 Keyboard interaction issues | P1 | Affects text capture quality and focus stability. |
| ISSUE-12 Scroll fatigue | P1 | Reduces flow efficiency but does not block the core task. |
| ISSUE-13 Visual hierarchy issues | P1 | Limits scanning speed and can reduce perceived quality. |
| ISSUE-14 Section hierarchy issues | P1 | Reduces structural clarity of the consultation. |
| ISSUE-15 Typography issues | P1 | Affects legibility and comfort on mobile. |
| ISSUE-16 Responsive breakpoint inconsistency | P1 | Causes unstable adaptation across device widths. |
| ISSUE-17 Touch target issues | P1 | Creates accuracy and usability issues on small screens. |
| ISSUE-18 Missing sticky action bar | P1 | Reduces confidence and forces unnecessary scrolling. |
| ISSUE-19 Voice workflow clarity | P1 | Weakens the primary capture experience for doctors. |
| ISSUE-20 Save and trust visibility | P1 | Directly impacts clinician confidence in the system. |
| ISSUE-21 AI workflow clarity | P1 | AI support must be clear, reviewable, and non-authoritative. |
| ISSUE-22 Empty states | P2 | Important for first-use and sparse content experience. |
| ISSUE-23 Error states and recovery | P1 | Critical for trust and resilience during live use. |
| ISSUE-24 Loading states | P2 | Important for calmness and state understanding. |
| ISSUE-25 Motion and animation | P2 | Polishing and comfort layer rather than a blocker. |
| ISSUE-26 Component consistency | P2 | Impacts maintainability and predictability. |
| ISSUE-27 Accessibility hardening | P1 | Must be addressed before Beta because it affects usability and compliance. |

### Priority summary
- P0 Issues: 6
- P1 Issues: 13
- P2 Issues: 8
- P3 Issues: 0

---

## 3. Implementation Phases

### Phase 1 - Foundation
Objective: establish the mobile-first structural baseline and shared UI primitives without changing clinical behavior.

### Phase 2 - Mobile Consultation Layout
Objective: rebuild the consultation shell and section layout for a stable, single-column, touch-friendly mobile experience.

### Phase 3 - Voice Experience
Objective: simplify the voice workflow into a single, clear recording experience with reliable transcript routing and state feedback.

### Phase 4 - Clinical Workflow
Objective: restore full field parity, improve section progression, and make core consultation actions clearer.

### Phase 5 - AI and Review Experience
Objective: make AI assistance a reviewable, non-authoritative helper that does not compete with the doctor’s workflow.

### Phase 6 - Trust, Recovery, and State Feedback
Objective: make save, draft, error, empty, and loading states visible, calm, and trustworthy.

### Phase 7 - Accessibility and Interaction Quality
Objective: harden focus, touch targets, keyboard behavior, labels, and screen-reader feedback.

### Phase 8 - Visual Polish and Beta Release Hardening
Objective: finalize motion, consistency, hierarchy, and release readiness for Beta validation.

---

## 4. Work Packages

### WP1 - Foundation and Shared Mobile Primitives
- Objective: establish the mobile-first architecture and shared primitives for the consultation experience.
- Scope:
  - Create a shared mobile layout system for the consultation shell.
  - Define reusable section and field patterns.
  - Standardize interaction spacing, touch targets, and component structure.
  - Establish a consistent state contract for view, keyboard, and workflow states.
- Components:
  - ConsultationShell
  - MobileSection
  - MobileField
  - Responsive primitives
  - Shared card and section containers
- Files affected:
  - [src/pages/ConsultationPage.tsx](src/pages/ConsultationPage.tsx)
  - [src/components/layout/ResponsivePrimitives.tsx](src/components/layout/ResponsivePrimitives.tsx)
  - [src/components/SmartInput.tsx](src/components/SmartInput.tsx)
- Dependencies:
  - Consultation blueprint
  - Implementation audit
  - Engineering contract state model
- Backlog Issues Covered:
  - ISSUE-10
  - ISSUE-13
  - ISSUE-14
  - ISSUE-15
  - ISSUE-26
- Estimated Complexity: High
- Regression Risk: High
- Rollback Strategy:
  - Keep the current consultation path available behind a feature flag during the transition.
  - Revert to the current mobile wrappers if shared primitives introduce instability.
- Acceptance Criteria:
  - Shared primitives render consistently across key consultation sections.
  - No overlap, clipping, or inconsistent spacing appears on narrow screens.
- Definition of Done:
  - Shared mobile primitives are implemented and verified in the consultation shell.
  - The current desktop path remains functional with no critical regressions.

### WP2 - Mobile Consultation Shell and Responsive Layout
- Objective: rebuild the consultation shell into a stable, readable, thumb-friendly mobile experience.
- Scope:
  - Convert the consultation experience to a single-column mobile flow.
  - Reposition primary content and save actions into the lower thumb zone.
  - Improve section grouping and progressive disclosure.
  - Fix layout collapse and responsive breakpoints.
- Components:
  - ConsultationShell
  - PatientHeader
  - ConsultationProgressStrip
  - Section cards and action dock
- Files affected:
  - [src/pages/ConsultationPage.tsx](src/pages/ConsultationPage.tsx)
  - [src/components/layout/ResponsivePrimitives.tsx](src/components/layout/ResponsivePrimitives.tsx)
- Dependencies:
  - WP1 shared primitives
  - Blueprint layout structure
- Backlog Issues Covered:
  - ISSUE-01
  - ISSUE-02
  - ISSUE-03
  - ISSUE-09
  - ISSUE-16
  - ISSUE-18
- Estimated Complexity: High
- Regression Risk: High
- Rollback Strategy:
  - Preserve the previous layout behind a shell toggle until the new layout is validated.
- Acceptance Criteria:
  - The consultation screen remains fully usable on supported mobile widths without overlap or horizontal scroll.
  - Primary actions are reachable and the main flow is clear.
- Definition of Done:
  - The mobile layout is stable across supported widths and the shell is validated on real devices.

### WP3 - Voice Experience Stabilization
- Objective: simplify and stabilize the voice capture experience so doctors can trust it in live consultation use.
- Scope:
  - Replace duplicate transcript behavior with a single routing model.
  - Consolidate voice controls into one primary action path.
  - Reduce noisy status presentation.
  - Improve recording state clarity and recoverability.
- Components:
  - VoiceToolbar
  - DictationButton
  - SmartInput
- Files affected:
  - [src/components/DictationButton.tsx](src/components/DictationButton.tsx)
  - [src/components/SmartInput.tsx](src/components/SmartInput.tsx)
  - [src/pages/ConsultationPage.tsx](src/pages/ConsultationPage.tsx)
- Dependencies:
  - WP1 shared state model
  - Engineering contract voice contract
- Backlog Issues Covered:
  - ISSUE-06
  - ISSUE-07
  - ISSUE-08
  - ISSUE-19
- Estimated Complexity: High
- Regression Risk: High
- Rollback Strategy:
  - Disable the new voice UI and fall back to manual text entry if transcript routing fails.
- Acceptance Criteria:
  - A single transcript appears once per active action.
  - Recording state is clear and recoverable.
- Definition of Done:
  - Voice capture passes manual and device tests without duplicate transcript behavior.

### WP4 - Clinical Field Parity and Flow Progression
- Objective: restore full mobile field coverage and improve the progression of the consultation path.
- Scope:
  - Restore missing Allergy and Miasm controls.
  - Improve section progression and reduce unnecessary scrolling.
  - Strengthen field grouping and visibility for important clinical context.
- Components:
  - Clinical context section
  - Field groups
  - Follow-up and outcome sections
- Files affected:
  - [src/pages/ConsultationPage.tsx](src/pages/ConsultationPage.tsx)
  - [src/data/clinicalSuggestions.ts](src/data/clinicalSuggestions.ts)
- Dependencies:
  - WP2 layout work
  - Existing consultation store and form data model
- Backlog Issues Covered:
  - ISSUE-04
  - ISSUE-05
  - ISSUE-12
- Estimated Complexity: Medium
- Regression Risk: Medium
- Rollback Strategy:
  - Keep the previous field arrangement available for fallback until the new flow is validated.
- Acceptance Criteria:
  - All essential fields are visible and usable on mobile.
  - The consultation progression feels guided and less repetitive.
- Definition of Done:
  - Field coverage and section flow are validated in the mobile consultation journey.

### WP5 - AI Assistance and Content State Patterns
- Objective: make AI support clear, calm, and reviewable without undermining clinical authority.
- Scope:
  - Introduce a dedicated AI helper pattern for mobile.
  - Define empty state and loading behavior for AI content.
  - Ensure AI suggestions remain non-authoritative and easy to dismiss.
- Components:
  - AIAssistantCard
  - SmartInput
  - ConsultationShell review surfaces
- Files affected:
  - [src/pages/ConsultationPage.tsx](src/pages/ConsultationPage.tsx)
  - [src/components/SmartInput.tsx](src/components/SmartInput.tsx)
- Dependencies:
  - WP1 shared component system
  - Engineering contract AI review contract
- Backlog Issues Covered:
  - ISSUE-21
  - ISSUE-22
  - ISSUE-24
- Estimated Complexity: High
- Regression Risk: Medium
- Rollback Strategy:
  - Disable the AI panel without affecting the core consultation workflow if reviewers find it confusing.
- Acceptance Criteria:
  - AI is discoverable, reviewable, and clearly labeled as suggested.
  - Empty and loading states feel calm and informative.
- Definition of Done:
  - AI assistance is validated as non-blocking, reviewable, and understandable in mobile use.

### WP6 - Save, Trust, and Recovery States
- Objective: make consultation state visible and trustworthy throughout the workflow.
- Scope:
  - Implement save, draft, offline, and failure states in a unified mobile contract.
  - Improve trust indicators and recovery messaging.
  - Ensure errors are visible and actionable.
- Components:
  - Save and trust UI
  - Draft recovery UI
  - Error feedback surfaces
- Files affected:
  - [src/pages/ConsultationPage.tsx](src/pages/ConsultationPage.tsx)
  - [src/services/consultationService.ts](src/services/consultationService.ts)
  - [src/store/useConsultationStore.ts](src/store/useConsultationStore.ts)
- Dependencies:
  - WP2 layout shell
  - Engineering contract save and draft contracts
- Backlog Issues Covered:
  - ISSUE-20
  - ISSUE-23
- Estimated Complexity: Medium
- Regression Risk: Medium
- Rollback Strategy:
  - Revert to the existing save feedback behavior while retaining the underlying save service.
- Acceptance Criteria:
  - The doctor can understand whether the consultation is saved, syncing, offline, or failed.
- Definition of Done:
  - Save and recovery states are validated under normal and error conditions.

### WP7 - Accessibility, Keyboard, and Interaction Quality
- Objective: harden mobile usability for touch, focus, keyboard, and assistive technology.
- Scope:
  - Standardize touch targets.
  - Improve focus movement and keyboard handling.
  - Add accessible labels, announcements, and contrast improvements.
  - Preserve predictable behavior for screen readers and reduced-motion settings.
- Components:
  - SmartInput
  - VoiceToolbar
  - Form controls and action buttons
- Files affected:
  - [src/components/SmartInput.tsx](src/components/SmartInput.tsx)
  - [src/components/DictationButton.tsx](src/components/DictationButton.tsx)
  - [src/pages/ConsultationPage.tsx](src/pages/ConsultationPage.tsx)
- Dependencies:
  - WP1 shared primitives
  - WP3 voice work
- Backlog Issues Covered:
  - ISSUE-11
  - ISSUE-17
  - ISSUE-27
- Estimated Complexity: High
- Regression Risk: Medium
- Rollback Strategy:
  - Keep the existing interaction model available as a fallback while accessibility enhancements are validated.
- Acceptance Criteria:
  - The consultation flow is operable with mobile keyboard and assistive technology paths.
- Definition of Done:
  - Accessibility checks are completed and no critical interaction defects remain open.

### WP8 - Visual Polish, Motion, and Beta Release Hardening
- Objective: finish the redesign with calm motion, component consistency, and release-readiness validation.
- Scope:
  - Define motion and feedback behavior for state changes.
  - Refine visual consistency and mobile hierarchy.
  - Add final regression and device validation before Beta.
- Components:
  - Shell transitions
  - Card and section feedback
  - Shared motion and state cues
- Files affected:
  - [src/pages/ConsultationPage.tsx](src/pages/ConsultationPage.tsx)
  - [src/components/layout/ResponsivePrimitives.tsx](src/components/layout/ResponsivePrimitives.tsx)
- Dependencies:
  - All prior work packages
- Backlog Issues Covered:
  - ISSUE-25
- Estimated Complexity: Medium
- Regression Risk: Low to Medium
- Rollback Strategy:
  - Keep motion and polish changes isolated so they can be disabled without affecting the core workflow.
- Acceptance Criteria:
  - Motion feels calm and optional and does not distract from the clinical workflow.
- Definition of Done:
  - Beta validation is green and the experience is ready for clinician review.

---

## 5. Implementation Order

### Dependency graph

Foundation
↓
Shared mobile components
↓
Responsive consultation shell
↓
Clinical field parity and flow progression
↓
Voice experience stabilization
↓
AI assistance and state patterns
↓
Save, trust, and recovery states
↓
Accessibility and interaction hardening
↓
Visual polish and Beta validation

### Why this order minimizes regression risk
- It starts with architecture and primitives before high-risk layout changes.
- It stabilizes the shell before changing section content and field behavior.
- It handles voice and AI flows after the shared state model is in place.
- It leaves trust, recovery, accessibility, and polish for the end so that the core consultation path is stable first.
- This sequence reduces the chance that multiple simultaneous changes mask the real source of regressions.

---

## 6. Component Migration Matrix

| Component | Recommendation | Justification |
|---|---|---|
| ConsultationShell | Major Refactor | It is the orchestration layer for the entire consultation experience and must become the primary mobile-first controller. |
| PatientHeader | Minor Refactor | It already serves a clear presentational role and only needs better mobile compression and priority. |
| ConsultationProgressStrip | Major Refactor | It must become a lighter, more obvious progress cue for mobile rather than a dense desktop-like rail. |
| VoiceToolbar | Replace Completely | The current voice experience is fragmented, noisy, and stateful in a way that undermines trust. |
| ChiefComplaintCard | Major Refactor | It is central to the core workflow and needs stronger mobile hierarchy and voice integration. |
| SmartInput | Major Refactor | It is functionally useful but requires tighter mobile keyboard, suggestion, and capture behavior. |
| DictationButton | Replace Completely | The current pattern is too fragmented and creates competing voice affordances. |
| MobileSection | Major Refactor | The existing wrapper is too shallow to support a full mobile-first structure. |
| MobileField | Major Refactor | It needs stronger layout semantics, spacing control, and better field grouping behavior. |
| AIAssistantCard | Major Refactor | It needs to become a clearly bounded, reviewable helper rather than an auxiliary panel. |
| Save and trust controls | Major Refactor | These controls are currently too implicit and need a dedicated mobile trust model. |
| Follow-up and payment cards | Minor Refactor | These are secondary to the core workflow and can be improved without full replacement. |

---

## 7. Test Strategy

### Unit Tests
- Shared mobile primitives and section containers
- Voice state transitions and transcript routing logic
- Save and draft state contracts
- AI helper review state handling

### Integration Tests
- Consultation shell rendering with form state
- Voice to field routing through the parent state contract
- Save/draft recovery paths
- AI acceptance and dismissal flows

### Manual Tests
- Core consultation flow on phone-sized screens
- One-handed save and navigation paths
- Voice capture with live interruption and permission scenarios
- Empty, error, and loading states

### Mobile Tests
- Small-screen portrait and landscape behavior
- Keyboard appearance and field focus behavior
- Thumb reach and action-bar visibility
- Scroll and section anchoring behavior

### Real Device Tests
- At least one supported Android device
- One supported iOS device if available
- Device-specific voice permission and browser behavior validation

### Regression Tests
- Existing consultation form persistence
- Save and draft continuity
- Voice fallback behavior
- Clinical field visibility and dropdown function

### Browser Tests
- Latest supported Chrome-based mobile browser
- Supported desktop browser for regression smoke tests
- Fallback behavior for unsupported browser conditions

### Accessibility Tests
- Focus order and keyboard movement
- Screen-reader labels and state announcements
- Contrast and touch-target checks

---

## 8. Beta Exit Criteria

The Beta release should not proceed until all of the following are true:

- No voice transcript duplication remains.
- The consultation flow is fully usable with one hand on supported mobile screen sizes.
- All essential dropdowns and clinical inputs are functional.
- The mobile layout is stable and readable without horizontal scrolling or overlap.
- Save, draft, and sync states are clearly visible and non-misleading.
- The doctor can complete a standard consultation without confusion.
- No critical UI defects remain open for the redesign scope.
- Accessibility and keyboard behavior are validated for the core flow.
- Voice fallback and recovery paths are understandable and functional.

---

## 9. Release Checklist

### Pre-Implementation
- Confirm work package ownership.
- Finalize feature flags for voice, AI, save trust UI, and draft recovery.
- Prepare rollback plan for each work package.
- Freeze the implementation scope to the agreed backlog and blueprint.

### During Development
- Implement one work package at a time.
- Keep state ownership aligned to the engineering contract.
- Validate each package against its acceptance criteria.
- Capture regressions immediately and isolate them to the relevant package.

### Pre-QA
- Complete smoke test coverage for each affected flow.
- Verify feature-flag behavior and fallback paths.
- Ensure all P0 items are resolved and validated.

### Internal QA
- Validate the full consultation path end to end.
- Test mobile layout, voice behavior, save, and recovery states.
- Confirm accessibility and keyboard paths.

### Doctor Alpha
- Run the redesigned flow with clinician reviewers.
- Capture clarity, trust, and speed feedback.
- Resolve workflow blockers before Beta.

### Doctor Beta
- Validate the full experience on supported devices.
- Confirm the redesign meets the Beta exit criteria.
- Gate release on the absence of critical or high-severity defects affecting the core workflow.

### Production Candidate
- Confirm release rollback is available.
- Ensure the final build is stable and documented.
- Approve the production candidate only after Beta validation is complete.

---

## Summary for Decision-Making

### Executive Summary
The redesign should proceed in a phased, dependency-driven sequence that prioritizes the consultation shell, voice experience, and trust states before lower-risk refinement. The roadmap keeps the work aligned to the existing blueprint, engineering contract, and audit findings while minimizing regression risk.

### Total Work Packages
8

### Total Estimated Duration
Approximately 6 to 8 weeks of focused implementation and validation, depending on team capacity and device access.

### P0 Issues
- ISSUE-01
- ISSUE-02
- ISSUE-03
- ISSUE-04
- ISSUE-05
- ISSUE-06

### P1 Issues
- ISSUE-07
- ISSUE-08
- ISSUE-09
- ISSUE-10
- ISSUE-11
- ISSUE-12
- ISSUE-13
- ISSUE-14
- ISSUE-15
- ISSUE-16
- ISSUE-17
- ISSUE-18
- ISSUE-19
- ISSUE-20
- ISSUE-21
- ISSUE-23
- ISSUE-27

### Major Risks
- Reintroducing desktop behavior while refactoring into a mobile-first shell
- Voice state duplication and transcript routing failures
- Save and trust states becoming misleading during transitions
- AI assistance being perceived as authoritative
- Accessibility regressions during layout refactoring

### Readiness Score
8.5/10 for planning readiness, 7/10 for implementation readiness once this roadmap is approved.

### Recommendation
A. Ready to begin implementation

This roadmap is now the master execution plan for the redesign and should be used as the governing implementation document for the next phase.

# MOBILE DESIGN BACKLOG

## Executive Summary

The consultation experience shows a consistent set of mobile-specific issues that are preventing a calm, trustworthy, and efficient doctor workflow on smaller screens. These issues are primarily caused by a desktop-first information architecture that has been adapted to mobile rather than redesigned around mobile constraints. The backlog below captures the implementation issues that should be addressed in the next redesign phase.

## Total Issues Found

27

## Critical Issues

0

## High Priority Issues

18

## Issue Backlog

### ISSUE-01
- Severity: High
- Category: Layout
- Screen: Consultation
- Affected Component(s): ConsultationPage mobile layout shell, MobileSection, MobileField
- Current Behaviour: The consultation layout breaks on mobile and compresses content into an unstable, hard-to-scan structure.
- Expected Behaviour: The consultation screen should present a stable, readable mobile layout with clear section boundaries and no clipped or overlapping content.
- Root Cause: The existing mobile experience is built by wrapping a desktop-oriented form structure rather than using a mobile-first layout system.
- Evidence: Mobile Test Round 1, Screenshot 1; Mobile Test Round 1, Screenshot 2
- Regression Risk: High
- Estimated Fix Complexity: High
- Priority: P1
- Recommended Work Package: Mobile consultation layout redesign
- Acceptance Criteria: On a small-screen device, the consultation screen remains fully readable without overlap, clipping, or horizontal scrolling and preserves a clear section flow.
- Status: Open

### ISSUE-02
- Severity: High
- Category: Layout
- Screen: Consultation
- Affected Component(s): ConsultationPage, field arrangement, section columns
- Current Behaviour: The desktop two-column layout is compressed on smaller screens, reducing legibility and making grouped fields harder to interpret.
- Expected Behaviour: Multi-field content should collapse into a single-column mobile flow with appropriate spacing and grouping.
- Root Cause: Desktop-first grid patterns are being reused in narrow viewports without a dedicated mobile stacking strategy.
- Evidence: Mobile Test Round 1, Screenshot 1; Mobile Test Round 1, Screenshot 2
- Regression Risk: High
- Estimated Fix Complexity: High
- Priority: P1
- Recommended Work Package: Responsive field layout system
- Acceptance Criteria: Fields that previously appeared in two columns collapse into a clear single-column reading order on mobile with no content truncation.
- Status: Open

### ISSUE-03
- Severity: High
- Category: Layout
- Screen: Consultation
- Affected Component(s): Mental / Generals section, Appetite/Sleep/Dreams field group
- Current Behaviour: Appetite, Sleep, and Dreams information is not visible or insufficiently visible in the mobile flow.
- Expected Behaviour: These fields should be clearly visible, legible, and grouped in a way that supports quick review.
- Root Cause: The current mobile layout does not preserve the importance of these fields and they are collapsed or visually de-emphasized.
- Evidence: Mobile Test Round 1, Screenshot 1; Mobile Test Round 1, Screenshot 2
- Regression Risk: Medium
- Estimated Fix Complexity: Medium
- Priority: P1
- Recommended Work Package: Clinical field prioritization and mobile grouping
- Acceptance Criteria: Appetite, Sleep, and Dreams are visible without requiring zooming or extra interaction and can be understood at a glance.
- Status: Open

### ISSUE-04
- Severity: High
- Category: Interaction
- Screen: Consultation
- Affected Component(s): Allergy field, dropdown controls
- Current Behaviour: The Allergies dropdown is missing from the mobile flow.
- Expected Behaviour: The Allergies field should be present, discoverable, and usable on mobile.
- Root Cause: The mobile implementation does not preserve the full field set from the desktop pattern or the input is not surfaced in the current component arrangement.
- Evidence: Mobile Test Round 1, Screenshot 1
- Regression Risk: Medium
- Estimated Fix Complexity: Medium
- Priority: P1
- Recommended Work Package: Mobile field parity and input coverage
- Acceptance Criteria: The Allergies input is displayed and operable in the mobile consultation flow.
- Status: Open

### ISSUE-05
- Severity: High
- Category: Interaction
- Screen: Consultation
- Affected Component(s): Miasm field, dropdown controls
- Current Behaviour: The Miasm dropdown is missing from the mobile flow.
- Expected Behaviour: The Miasm field should be available and visible in the mobile consultation experience.
- Root Cause: The mobile field inventory is incomplete relative to the desktop experience.
- Evidence: Mobile Test Round 1, Screenshot 1
- Regression Risk: Medium
- Estimated Fix Complexity: Medium
- Priority: P1
- Recommended Work Package: Mobile field parity and input coverage
- Acceptance Criteria: The Miasm input is available and usable in the mobile consultation flow.
- Status: Open

### ISSUE-06
- Severity: High
- Category: Voice
- Screen: Consultation
- Affected Component(s): DictationButton, SmartInput, transcript display
- Current Behaviour: The voice transcript is duplicated, creating confusion about what has already been captured.
- Expected Behaviour: Only one clear transcript stream should be shown for the active field or action.
- Root Cause: Voice state is handled by multiple controls and insert points, leading to repeated transcript rendering.
- Evidence: Mobile Test Round 1, Screenshot 2
- Regression Risk: High
- Estimated Fix Complexity: High
- Priority: P1
- Recommended Work Package: Unified voice workflow redesign
- Acceptance Criteria: Voice transcript appears once per active capture action and no duplicate transcript states are shown to the doctor.
- Status: Open

### ISSUE-07
- Severity: High
- Category: Interaction
- Screen: Consultation
- Affected Component(s): DictationButton, voice controls
- Current Behaviour: Multiple recording buttons create cognitive overload and make the voice workflow feel ambiguous.
- Expected Behaviour: The mobile experience should present one primary, obvious voice action path.
- Root Cause: Voice affordances are split across several buttons and states rather than consolidated into a single workflow.
- Evidence: Mobile Test Round 1, Screenshot 2
- Regression Risk: High
- Estimated Fix Complexity: High
- Priority: P1
- Recommended Work Package: Voice control simplification
- Acceptance Criteria: A doctor can identify a single primary voice action without needing to interpret multiple competing controls.
- Status: Open

### ISSUE-08
- Severity: Medium
- Category: Visual
- Screen: Consultation
- Affected Component(s): Voice status indicator, transcript status banner
- Current Behaviour: The repeated “Ready 00:00 Ready” visual noise creates distraction and makes the interface feel unstable.
- Expected Behaviour: The interface should provide calm, minimal, and meaningful status feedback only when the doctor needs it.
- Root Cause: The current status presentation repeats the same state with low information value.
- Evidence: Mobile Test Round 1, Screenshot 2
- Regression Risk: Medium
- Estimated Fix Complexity: Medium
- Priority: P2
- Recommended Work Package: Voice status UX simplification
- Acceptance Criteria: Status noise is reduced so that only relevant state changes are communicated to the doctor.
- Status: Open

### ISSUE-09
- Severity: High
- Category: Layout
- Screen: Consultation
- Affected Component(s): Mobile action areas, button placement
- Current Behaviour: Poor thumb reach makes important actions difficult to access comfortably on mobile.
- Expected Behaviour: Primary actions should be reachable within an easy thumb zone, especially for one-handed use.
- Root Cause: Core actions are placed without a consistent mobile reach strategy and do not align to the lower thumb zone.
- Evidence: Mobile Test Round 1, Screenshot 1; Mobile Test Round 1, Screenshot 2
- Regression Risk: Medium
- Estimated Fix Complexity: Medium
- Priority: P1
- Recommended Work Package: Thumb-reach optimization
- Acceptance Criteria: Primary actions are reachable without stretching and remain comfortably accessible on common phone screen sizes.
- Status: Open

### ISSUE-10
- Severity: High
- Category: Layout
- Screen: Consultation
- Affected Component(s): MobileSection, field groups, dense content blocks
- Current Behaviour: Information density is too high for mobile, increasing scanning effort and reducing clarity.
- Expected Behaviour: The interface should reveal only the most relevant information at each step and progressively disclose details.
- Root Cause: The mobile view still carries the density of a desktop form rather than prioritizing essential inputs and progressive disclosure.
- Evidence: Mobile Test Round 1, Screenshot 1
- Regression Risk: High
- Estimated Fix Complexity: High
- Priority: P1
- Recommended Work Package: Progressive disclosure and content density reduction
- Acceptance Criteria: The mobile experience shows a clear primary path with less visual clutter and supports expansion of additional detail only when needed.
- Status: Open

### ISSUE-11
- Severity: High
- Category: Accessibility
- Screen: Consultation
- Affected Component(s): SmartInput, form controls, keyboard handling
- Current Behaviour: Keyboard interaction issues reduce usability and make entering or editing text awkward on mobile.
- Expected Behaviour: The mobile form should support predictable keyboard behavior, focus movement, and text entry flows.
- Root Cause: Mobile input handling has not been tuned for touch and keyboard interaction patterns.
- Evidence: Mobile Test Round 1, Screenshot 1
- Regression Risk: High
- Estimated Fix Complexity: High
- Priority: P1
- Recommended Work Package: Mobile input and keyboard behavior refinement
- Acceptance Criteria: Text entry and editing are stable with the on-screen keyboard and focus moves predictably across the form.
- Status: Open

### ISSUE-12
- Severity: Medium
- Category: Interaction
- Screen: Consultation
- Affected Component(s): Section navigation, long-form consultation flow
- Current Behaviour: Scroll fatigue is high because the doctor must move through a long, dense consultation experience.
- Expected Behaviour: The mobile experience should reduce vertical effort through better grouping, anchoring, and section-based progression.
- Root Cause: The current flow relies on long scrolling rather than a compact, guided progression.
- Evidence: Mobile Test Round 1, Screenshot 1; Mobile Test Round 1, Screenshot 2
- Regression Risk: Medium
- Estimated Fix Complexity: Medium
- Priority: P2
- Recommended Work Package: Section-based mobile progression
- Acceptance Criteria: The flow can be completed with less scrolling effort and section transitions feel clearer and more guided.
- Status: Open

### ISSUE-13
- Severity: Medium
- Category: Visual
- Screen: Consultation
- Affected Component(s): Section headers, labels, form hierarchy
- Current Behaviour: Visual hierarchy issues make it hard to distinguish primary actions, section labels, and supporting details.
- Expected Behaviour: The screen should clearly communicate what is most important and how content is grouped.
- Root Cause: The current styling does not enforce a strong hierarchy for mobile scanning patterns.
- Evidence: Mobile Test Round 1, Screenshot 1
- Regression Risk: Medium
- Estimated Fix Complexity: Medium
- Priority: P2
- Recommended Work Package: Visual hierarchy and typography system
- Acceptance Criteria: The doctor can quickly identify primary sections, labels, and actions without scanning the full interface.
- Status: Open

### ISSUE-14
- Severity: Medium
- Category: Visual
- Screen: Consultation
- Affected Component(s): Section hierarchy, labels, grouping
- Current Behaviour: Section hierarchy issues reduce comprehension and make the consultation flow feel less structured.
- Expected Behaviour: Section boundaries should be made explicit and easier to understand at a glance.
- Root Cause: Section grouping is present but not sufficiently reinforced for narrow-screen scanning.
- Evidence: Mobile Test Round 1, Screenshot 1
- Regression Risk: Medium
- Estimated Fix Complexity: Medium
- Priority: P2
- Recommended Work Package: Section grouping and navigation refinement
- Acceptance Criteria: Section boundaries are visually clear and consistent throughout the mobile consultation flow.
- Status: Open

### ISSUE-15
- Severity: Medium
- Category: Visual
- Screen: Consultation
- Affected Component(s): Labels, helper text, field text
- Current Behaviour: Typography issues make some content feel cramped or difficult to read on mobile.
- Expected Behaviour: Typography should be legible, consistent, and comfortable on smaller screens.
- Root Cause: Current text sizing and spacing are not tuned for a mobile reading experience.
- Evidence: Mobile Test Round 1, Screenshot 1
- Regression Risk: Medium
- Estimated Fix Complexity: Medium
- Priority: P2
- Recommended Work Package: Mobile typography scaling
- Acceptance Criteria: Text remains legible and comfortably spaced at common mobile viewport sizes.
- Status: Open

### ISSUE-16
- Severity: High
- Category: Layout
- Screen: Consultation
- Affected Component(s): Responsive breakpoints, mobile-specific layout rules
- Current Behaviour: Responsive breakpoint problems create inconsistent behavior across different screen widths.
- Expected Behaviour: The interface should adapt predictably across small and medium mobile sizes without layout instability.
- Root Cause: Breakpoints are inconsistent and do not fully reflect mobile usage patterns.
- Evidence: Mobile Test Round 1, Screenshot 1; Mobile Test Round 1, Screenshot 2
- Regression Risk: High
- Estimated Fix Complexity: High
- Priority: P1
- Recommended Work Package: Responsive breakpoint system
- Acceptance Criteria: The consultation layout remains stable across supported mobile viewport widths without reflow glitches or content overlap.
- Status: Open

### ISSUE-17
- Severity: High
- Category: Accessibility
- Screen: Consultation
- Affected Component(s): Touch targets, interactive controls
- Current Behaviour: Touch target problems make several controls too small or cramped for reliable use.
- Expected Behaviour: Interactive controls should meet mobile-friendly size and tap targets.
- Root Cause: Some controls have not been standardized for touch interaction.
- Evidence: Mobile Test Round 1, Screenshot 1
- Regression Risk: Medium
- Estimated Fix Complexity: Medium
- Priority: P1
- Recommended Work Package: Touch target standardization
- Acceptance Criteria: Interactive elements meet minimum mobile tap target expectations and are easy to activate accurately.
- Status: Open

### ISSUE-18
- Severity: High
- Category: Layout
- Screen: Consultation
- Affected Component(s): Sticky action bar, save and trust controls
- Current Behaviour: The sticky action bar is missing, reducing confidence and making sure actions remain visible during flow.
- Expected Behaviour: A persistent action bar should support save, trust, and completion actions without forcing the doctor to scroll back.
- Root Cause: The current mobile flow lacks a consistent sticky action model for key workflow actions.
- Evidence: Mobile Test Round 1, Screenshot 1; Mobile Test Round 1, Screenshot 2
- Regression Risk: Medium
- Estimated Fix Complexity: Medium
- Priority: P1
- Recommended Work Package: Sticky workflow action bar
- Acceptance Criteria: The doctor can access key actions without losing context while moving through the consultation.
- Status: Open

### ISSUE-19
- Severity: High
- Category: Voice
- Screen: Consultation
- Affected Component(s): Voice workflow, transcript and recording state
- Current Behaviour: The voice workflow is confusing and does not clearly communicate how recording, capture, and insertion work together.
- Expected Behaviour: The voice flow should be simple, explicit, and cognitively lightweight for the doctor.
- Root Cause: Voice workflow behavior is distributed across multiple controls with inconsistent state semantics.
- Evidence: Mobile Test Round 1, Screenshot 2
- Regression Risk: High
- Estimated Fix Complexity: High
- Priority: P1
- Recommended Work Package: Voice workflow clarity redesign
- Acceptance Criteria: The doctor can understand the current voice state and complete a recording action without confusion.
- Status: Open

### ISSUE-20
- Severity: High
- Category: UX
- Screen: Consultation
- Affected Component(s): Save confidence, trust signals, completion controls
- Current Behaviour: Save and trust visibility issues make it unclear whether the consultation is safely captured and progressing.
- Expected Behaviour: The interface should provide obvious, trustworthy feedback about save status and progress.
- Root Cause: The current UI does not emphasize status and reassurance in a way that suits mobile trust needs.
- Evidence: Mobile Test Round 1, Screenshot 1; Mobile Test Round 1, Screenshot 2
- Regression Risk: Medium
- Estimated Fix Complexity: Medium
- Priority: P1
- Recommended Work Package: Trust and save visibility refinement
- Acceptance Criteria: The doctor can clearly tell that the consultation draft is being preserved and can act with confidence.
- Status: Open

## Additional Issues Identified During Audit

### ISSUE-21
- Severity: High
- Category: AI Workflow
- Screen: Consultation
- Affected Component(s): AI Assistant card, suggestion tray, SmartInput
- Current Behaviour: The AI workflow is not represented as a first-class mobile experience and does not clearly support review, acceptance, or override states.
- Expected Behaviour: The AI assistant should offer a calm, contextual, and clearly bounded helper experience that supports review without competing with the core consultation flow.
- Root Cause: The current mobile design treats AI as an auxiliary feature rather than a workflow-aware mobile interaction pattern.
- Evidence: CONSULTATION_IMPLEMENTATION_AUDIT.md; CONSULTATION_SCREEN_BLUEPRINT_V1.md
- Regression Risk: High
- Estimated Fix Complexity: High
- Priority: P1
- Recommended Work Package: Mobile AI workflow and trust model
- Acceptance Criteria: The AI assistant can be discovered, reviewed, and dismissed without disrupting the consultation flow and clearly communicates that the doctor remains in control.
- Status: Open

### ISSUE-22
- Severity: Medium
- Category: Empty States
- Screen: Consultation
- Affected Component(s): AI assistant, timeline, prescription, follow-up sections
- Current Behaviour: Empty or first-use states are not clearly defined, leaving some sections feeling unfinished or ambiguous.
- Expected Behaviour: Empty and first-use states should guide the doctor with helpful, non-blocking prompts and clear next actions.
- Root Cause: Mobile states were optimized for populated data but not for sparse or introductory states.
- Evidence: CONSULTATION_IMPLEMENTATION_AUDIT.md; CONSULTATION_SCREEN_BLUEPRINT_V1.md
- Regression Risk: Medium
- Estimated Fix Complexity: Medium
- Priority: P2
- Recommended Work Package: Mobile empty-state pattern system
- Acceptance Criteria: Empty or first-use states are understandable, non-confusing, and provide explicit guidance for the next step.
- Status: Open

### ISSUE-23
- Severity: High
- Category: Error States
- Screen: Consultation
- Affected Component(s): Voice workflow, save actions, AI assistant, network status
- Current Behaviour: Error and recovery states are not consistently surfaced, leaving important failures unclear or hard to recover from.
- Expected Behaviour: Critical errors should be visible, actionable, and recoverable without breaking the consultation flow.
- Root Cause: Mobile error handling has not been turned into a coherent state model for voice, save, and AI interactions.
- Evidence: CONSULTATION_IMPLEMENTATION_AUDIT.md; Mobile Test Round 1
- Regression Risk: High
- Estimated Fix Complexity: High
- Priority: P1
- Recommended Work Package: Mobile error and recovery state design
- Acceptance Criteria: Failures in voice capture, AI assistance, or save actions are communicated clearly and offer a clear recovery path.
- Status: Open

### ISSUE-24
- Severity: Medium
- Category: Loading States
- Screen: Consultation
- Affected Component(s): AI assistant, voice toolbar, save feedback, section transitions
- Current Behaviour: Loading states are either missing or visually noisy, making the system feel uncertain or unstable.
- Expected Behaviour: Loading feedback should be calm, contextual, and informative without interrupting the doctor’s attention.
- Root Cause: The current mobile experience lacks a consistent pattern for transient loading and processing states.
- Evidence: CONSULTATION_IMPLEMENTATION_AUDIT.md; CONSULTATION_SCREEN_BLUEPRINT_V1.md
- Regression Risk: Medium
- Estimated Fix Complexity: Medium
- Priority: P2
- Recommended Work Package: Mobile loading-state system
- Acceptance Criteria: Loading states communicate progress clearly and preserve confidence without adding cognitive load.
- Status: Open

### ISSUE-25
- Severity: Medium
- Category: Motion
- Screen: Consultation
- Affected Component(s): Section transitions, status feedback, action bar, AI assistant interactions
- Current Behaviour: Motion and animation patterns are not defined, which can make the interface feel abrupt or inconsistent on mobile.
- Expected Behaviour: Motion should be subtle, purposeful, and supportive of focus, while respecting reduced motion preferences.
- Root Cause: The current interface does not define a mobile motion system for transitions and feedback.
- Evidence: CONSULTATION_IMPLEMENTATION_AUDIT.md; Product behaviour guidance
- Regression Risk: Medium
- Estimated Fix Complexity: Medium
- Priority: P2
- Recommended Work Package: Mobile motion and feedback system
- Acceptance Criteria: Transitions and feedback feel calm and consistent and can be reduced or disabled for accessibility.
- Status: Open

### ISSUE-26
- Severity: Medium
- Category: Component Consistency
- Screen: Consultation
- Affected Component(s): MobileSection, MobileField, SmartInput, action controls, cards
- Current Behaviour: Component styling and interaction patterns are inconsistent across the consultation experience, reducing predictability on mobile.
- Expected Behaviour: Repeated UI patterns should feel consistent in spacing, behavior, and affordance across the screen.
- Root Cause: The experience mixes multiple wrapper patterns and styling approaches rather than relying on a single mobile component system.
- Evidence: CONSULTATION_IMPLEMENTATION_AUDIT.md; Mobile Test Round 1
- Regression Risk: Medium
- Estimated Fix Complexity: Medium
- Priority: P2
- Recommended Work Package: Mobile component system standardization
- Acceptance Criteria: Repeated patterns feel visually and behaviorally consistent across the consultation experience.
- Status: Open

### ISSUE-27
- Severity: High
- Category: Accessibility
- Screen: Consultation
- Affected Component(s): Focus states, labels, contrast, screen-reader announcements, touch targets
- Current Behaviour: Accessibility support is incomplete for mobile interactions, especially around focus management, text alternatives, and screen-reader feedback.
- Expected Behaviour: The consultation experience should support accessible focus order, clear labels, and predictable announcements for critical workflow states.
- Root Cause: Mobile accessibility requirements have not been fully operationalized in the current interaction model.
- Evidence: CONSULTATION_IMPLEMENTATION_AUDIT.md; CONSULTATION_SCREEN_BLUEPRINT_V1.md
- Regression Risk: High
- Estimated Fix Complexity: High
- Priority: P1
- Recommended Work Package: Mobile accessibility hardening
- Acceptance Criteria: The consultation screen supports clear focus movement, meaningful labels, and accessible feedback for key actions and states.
- Status: Open

## Recommendation

The consultation mobile experience is not yet ready for a full visual redesign without a structured implementation backlog. The issues above provide a sufficient implementation foundation for the redesign phase and should be prioritized into work packages that address layout, voice workflow, interaction clarity, and trust signals first.

## Recommendation

Ready for Redesign Phase

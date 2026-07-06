# WP1_EXECUTION_CHECKLIST

This document is the execution contract for Work Package 1 (WP1) — Foundation and Shared Mobile Primitives.
Do NOT modify planning documents. Do NOT implement code from this checklist until it is approved.

---

## SECTION 1 — WP1 OBJECTIVE

Purpose
- Establish a robust, mobile-first foundation for the consultation screen so subsequent layout, voice, AI, and trust work can proceed with low regression risk.

Scope
- Implement shared mobile primitives and a stable interaction contract used by the consultation shell and fields. No business logic, persistence, or backend behavior will change.

Expected outcome
- A single, reusable set of mobile primitives and an updated consultation page structure that render consistently at target mobile widths, expose a predictable viewport/keyboard/focus contract, and enable WP2+ work without structural rework.

---

## SECTION 2 — COMPONENT MIGRATION MATRIX

| Component | Action | Reason |
|---|---:|---|
| ConsultationShell / `ConsultationPage` | MAJOR REFACTOR | Central orchestration; currently mixes desktop-first layout and ad-hoc mobile wrappers. Needs restructured shell to host mobile primitives.
| `SmartInput` | MINOR REFACTOR | Keep behavior; align focus/keyboard/suggestion interaction to mobile primitives and accessibility policy.
| `ResponsivePrimitives` (`src/components/layout/ResponsivePrimitives.tsx`) | MINOR REFACTOR | Reuse and extend existing primitives; fill gaps for safe-area, keyboard avoidance, and consistent spacing.
| `MobileSection` wrapper usages | MAJOR REFACTOR | Consolidate multiple ad-hoc section patterns to the single primitive implementation.
| `MobileField` wrapper usages | MAJOR REFACTOR | Standardize field label/optional layout, spacing, and touch target rules.
| `DictationButton` | KEEP | Voice UI changes are WP3; ensure interface contracts remain unchanged in WP1.
| `VoiceToolbar` | KEEP | Out of scope — WP3.
| `AIAssistantCard` | KEEP | Out of scope — WP5.
| Save / Trust UI | KEEP (NO CHANGE) | Save logic and contracts are out of scope (WP6 will refine UI presentation later). Must not modify behavior.
| `consultationStore` / Draft Service | KEEP (NO CHANGE) | Business logic and persistence out of scope.
| CSS variable tokens / App.css usage | MINOR REFACTOR | Ensure consistent consumption across primitives; avoid wholesale restyling.

---

## SECTION 3 — DO NOT TOUCH LIST

The following must NOT be changed during WP1 (explicit):
- Consultation store state shape and business logic
- Save logic and orchestration (save:request, save:pending, save:success)
- Draft creation, persistence, and recovery logic
- Voice engine and transcript routing implementation
- AI logic and suggestion processing
- Backend APIs, database schemas, and wire contracts
- Validation rules enforced server-side or in shared services
- Any production data migration or storage behavior
- Feature flag semantics defined in Sprint 1 contract

WP1 may change only UI presentation primitives and composition; it must not alter runtime behavior of the above systems.

---

## SECTION 4 — MOBILE LAYOUT SPECIFICATION (MEASURABLE)

Supported widths (portrait primary):
- 360 px (small phones)
- 390 px (iPhone 12/13/14 mini-sized)
- 412 px (large phones)
- Tablet portrait: 768 px (validate tablet portrait behavior)

Maximum content width:
- Mobile viewports: 100% width with a maximum content container width of 540 px on larger viewports. For phone widths, content stretches to `width: 100%` and uses internal horizontal padding.

Minimum touch target:
- 44 px (44x44) for primary tap targets (buttons, chips). Interactive areas must provide a minimum 44x44 tap surface.

Safe area handling:
- Respect `env(safe-area-inset-*)` on iOS devices. Bottom sticky action area must account for `safe-area-inset-bottom`.

Bottom navigation spacing:
- If bottom navigation exists, ensure the consultation action dock sits above it with at least 12 px gap.

Sticky bottom action area:
- Height: 56 px (min). Use a floating safe area offset; effective visible height = 56 px + safe-area-inset-bottom.

Header height:
- Default header height: 56 px on mobile. Compact header may reduce to 44 px, but patient context must remain accessible.

Section spacing:
- Vertical spacing between sections: 16 px (mobile) / 24 px (tablet/desktop).

Field spacing:
- Vertical spacing inside a field block: 8 px. Label to control spacing: 6–8 px.

Card padding:
- Card internal padding: 16 px on mobile, 24 px on tablet/desktop.

Keyboard avoidance:
- When keyboard opens, active field must be scrolled into view so its bottom is at least 16 px above keyboard top or the top of the sticky action area, whichever is higher.

Maximum scrolling behavior:
- Vertical scrolling allowed; ensure no horizontal scrolling at supported widths. Long content must be vertically scrollable; preserve sticky header and bottom dock.

Horizontal scrolling policy:
- Forbidden. Any element that triggers horizontal overflow must be refactored.

Thumb reach requirements:
- Primary actions and most-used controls should be within lower 40% of the viewport height in portrait by default (or accessible via a sticky action dock).

Accessibility sizing:
- Base font size: 14px body on mobile; headings scaled appropriately. Ensure legibility at increased font sizes (large font support).

---

## SECTION 5 — FOUNDATION COMPONENT CONTRACT (NO IMPLEMENTATION CODE)

Shared primitives and their contracts (behavioral):

1) `MobileShell` (new conceptual container)
- Responsibilities: top-level container for consultation content, provides viewport awareness, keyboard safe-area offsets, header/dock anchors, and a single scrollable content area.
- Inputs: `patientContext`, `activeStage`, `onNavigate`, `isMobile` flag (derived), `keyboardInset` (derived)
- Outputs: `onFocusRequest(fieldId)`, `onStageChange(stage)`, `scrollToField(fieldId)`
- Composition rules: `MobileShell` must contain `MobileHeader`, `MobileContentArea`, and `BottomActionDock`. Only one scroll container must be present.
- Naming: `MobileShell` or `ConsultationShell` (component name to match project naming conventions)
- Reuse policy: owned by consultation page; can be reused by other mobile consultation-like screens.

2) `MobileSection` (primitives file)
- Responsibilities: render a titled section with consistent spacing, optional collapse behavior, and section-level aria landmarks.
- Inputs: `title`, `subtitle`, `testId`, `collapsible?: boolean`, `defaultOpen?: boolean`
- Outputs: `onToggle(open)` event
- Composition: may contain `MobileField` and should not create independent scroll containers.

3) `MobileField` (primitives file)
- Responsibilities: render field label, optional indicator, helper text, and provide an accessible anchor for focus and keyboard behavior.
- Inputs: `label`, `optional`, `fieldId`, `ariaLabel`
- Outputs: `focus()` contract available via `ref` for parent to call; emits `onFocus`/`onBlur` events
- Composition rules: keep label, control, helper text in a vertical flow; allow `span` option for full-width fields.

4) `ResponsiveGrid` / `ResponsiveContainer`
- Responsibilities: provide breakpoint-aware grid behavior and collapse columns to single-column on mobile.
- Inputs: `columns`, `style`
- Outputs: none (presentational)
- Composition: must be used only for internal layout; avoid nested independent scrollbars.

Naming conventions
- Prefix: `Mobile` for mobile-specific primitives (e.g., `MobileSection`, `MobileField`)
- Files: `src/components/layout/ResponsivePrimitives.tsx` for all shared primitives or split across `MobileShell.tsx`, `MobilePrimitives.tsx` as needed
- CSS classes: use existing `sakhi-*` tokens where possible; new classes must follow `sakhi-*` naming scheme

Reuse policy
- Primitives must be generic and reusable across consultation views. Do not bake consultation-specific logic into primitives. Business logic remains in the consultation page controller.

Accessibility contract
- All primitives must accept `role`, `aria-*` props and forward them to DOM elements.
- Any control with a label must associate using `aria-labelledby` or `<label for>` semantics.

---

## SECTION 6 — WP1 INTERNAL EXECUTION PHASES

WP1A — Foundation
- Deliverables:
  - Formalized primitive contracts (documented) and small API surface in `ResponsivePrimitives.tsx`.
  - Keyboard/viewport utilities (hooks) for `keyboardInset` and `isMobile`.
  - Unit tests for primitives.
- Dependencies: consultation blueprint, engineering contract
- Acceptance: primitives tested at 360/390/412 widths with zero layout overflow; hooks return expected in simulated environments.

----------------------
WP1B — Consultation Shell
- Deliverables:
  - Replace ad-hoc wrappers in `ConsultationPage.tsx` with `MobileShell` composition.
  - Ensure single scroll container and anchor points for `MobileSection` and `MobileField`.
  - Feature flag gating for shell toggle to allow rollback.
- Dependencies: WP1A
- Acceptance: consultation renders, navigation and basic form interactions function; no clipping/overflow at target widths.

----------------------
WP1C — Clinical Field Layout (must include mandated fixes)
- Deliverables:
  - Reflow field groups to enforce single-column stacking at mobile widths.
  - Mandatory fixes applied:
    - `Appetite` uses full-width field (not hidden or compressed)
    - `Sleep` uses full-width field
    - `Dreams` uses full-width field
    - `Allergies` dropdown is visible in mobile flow
    - `Miasm` dropdown is visible in mobile flow
    - All sections maintain readable labels and helper text
- Dependencies: WP1B
- Acceptance: All mandatory fields visible and operable at 360 px; dropdowns function and present suggestions.

---

## SECTION 7 — REAL DEVICE VALIDATION (MANDATORY CHECKLIST)

On each supported device (minimum one Android, one iOS if available):
- [ ] No horizontal scrolling at 360/390/412 widths
- [ ] No clipped controls or text truncation that hides content
- [ ] No overlapping cards or fields
- [ ] Sticky action area is visible and not occluded by safe-area insets
- [ ] Keyboard never hides the active field; active field scrolled into visible area
- [ ] Thumb reach comfortable for primary actions (action dock / primary button within lower 40% of viewport)
- [ ] Portrait and landscape usability validated
- [ ] Smooth scrolling without jank (no forced reflows on scroll)
- [ ] Large font mode (accessibility) validated — content remains usable

---

## SECTION 8 — SCREENSHOT CHECKLIST (BEFORE & AFTER)

Capture 'before' images (baseline) and 'after' images (post-implementation) for each of the following devices/viewports:

Devices/Widths:
- 360 px (top, middle, bottom)
- 390 px (top, middle, bottom)
- 412 px (top, middle, bottom)
- Tablet portrait (top, middle, bottom)

States to capture:
- Top of screen (header + patient context)
- Middle of content (sections visible)
- Bottom (sticky action dock visible)
- Keyboard open with active field
- Dropdown open (Allergies / Miasm)
- Voice recording active (if visible) — snapshot of UI state

Naming: include viewport and state in filename, e.g. `after_360_top_keyboard.png`.

---

## SECTION 9 — MEASURABLE ACCEPTANCE CRITERIA

All criteria must be objectively validated before WP1 is accepted.

- No horizontal scrolling in any supported viewport (automated check + visual verification)
- Minimum touch target for interactive controls >= 44 px
- All mandatory fields visible and operable at 360 px (Appetite, Sleep, Dreams, Allergies, Miasm)
- No overlapping fields or card clipping at supported widths
- Keyboard-aware scrolling: active field bottom >= 16 px above keyboard top
- Zero console errors and zero React warnings during interaction flows
- Build completes and unit tests for primitives pass
- Integration smoke test for consultation page passes

---

## SECTION 10 — IMPLEMENTATION GATES

Gate 1 — Checklist Approved (this document)
Gate 2 — WP1A Complete: primitives merged behind feature flag; unit tests pass
Gate 3 — WP1B Complete: shell toggle implemented; basic rendering validated on desktop/mobile
Gate 4 — WP1C Complete: mandatory field fixes implemented and tested at 360/390/412
Gate 5 — Real Device Testing: Android real-device validation passed
Gate 6 — Regression Testing: core smoke/regression tests passed
Gate 7 — Commit & Sign-off: Git commit with PR created and feature-flag toggles configured

No Gate may be skipped. Each gate requires sign-off by frontend lead and QA lead.

---

## SECTION 11 — DEFINITION OF DONE (WP1)

WP1 is complete only when all of the following are true:
- [ ] Build passes
- [ ] Unit tests for primitives pass
- [ ] Integration smoke tests pass
- [ ] Real Android device testing passes required checks
- [ ] Acceptance criteria (Section 9) met
- [ ] No new P0 issues introduced
- [ ] Regression tests (core) pass
- [ ] PR created with descriptive changelog and rollback instructions
- [ ] Ready for WP2 (explicit sign-off)

---

## QUALITY REQUIREMENTS

WP1 must be:
- Implementation-focused and measurable
- Component-level and traceable to backlog items
- Regression-safe and feature-flagged for rollback
- Mobile-first and clinical-workflow aware

---

## FINAL SUMMARY (TO DELIVER WITH PR)

1. Executive Summary
- WP1 establishes mobile-first primitives and refactors the consultation shell to host them. This reduces layout fragility and enables subsequent work packages to implement layout, voice, AI, and trust improvements with less risk.

2. Total components affected
- 8 primary components (ConsultationShell/ConsultationPage, SmartInput, ResponsivePrimitives, MobileSection, MobileField, DictationButton (interface), Save/Trust UI (presentation), CSS/app tokens).

3. Components unchanged
- Consultation store, Draft service, Save orchestration, Voice engine implementation, AI logic, Backend APIs, Database, Business validation logic.

4. Highest implementation risks
- Breaking visual rendering on critical mobile widths while refactoring the shell
- Introducing subtle focus/keyboard bugs that hide input fields
- Creating regressions in the consultation render path causing data loss risk (mitigated by not changing persistence)

5. Recommended implementation order
- WP1A Foundation (primitives + hooks)
- WP1B Consultation Shell (use primitives behind flag)
- WP1C Clinical Field Layout (apply mandatory fixes)
- Real device validation and gate checks

6. Readiness Score
- 8.5 / 10 — WP1 plan is detailed and executable; prerequisite documents are approved and consistent.

7. Recommendation
- A. READY TO IMPLEMENT WP1A

---

This file is the FINAL execution checklist for WP1. Implementers must NOT change planning documents. Proceed only when checklist-approved and Gate 1 sign-off is recorded.

# Sakhi Clinic Beta 1.0 - Scope Lock

## Status
- Version: 1.0
- Purpose: Lock the minimum Beta 1.0 scope for implementation readiness
- Principle: Deliver the highest doctor-productivity value with the lowest regression risk

## Scope Lock Decision
Beta 1.0 will focus on the consultation core and the operational moments that directly affect doctor speed, clarity, and trust during live care.

### In scope for Beta 1.0
1. Consultation experience refinement
2. Voice recording experience refinement
3. Doctor home experience refinement
4. Patient search refinement
5. Consultation save, draft, and recovery stability
6. Basic trust and status indicators for save, sync, and AI assistance

### Out of scope for Beta 1.0
1. Full timeline redesign
2. Full payment workflow redesign
3. Phone consultation workflow expansion
4. Patient import migration tooling
5. Advanced AI automation beyond reviewable assistance
6. Large-scale analytics and reporting redesign

## Feature Classification

| Planned feature | Classification | Rationale |
|---|---|---|
| Consultation experience refinement | Beta 1.0 | Directly affects the doctor’s main task and offers the highest productivity gain with the most immediate clinical benefit. |
| Voice recording experience refinement | Beta 1.0 | Voice is core to reducing typing and preserving attention during consultation. |
| Doctor home experience refinement | Beta 1.0 | Improves daily orientation and reduces time lost before the next action. |
| Patient search refinement | Beta 1.0 | Improves speed to patient context and reduces manual lookup overhead. |
| Consultation save, draft, and recovery stability | Beta 1.0 | Critical to trust, continuity, and safety; must be stable before wider rollout. |
| Trust indicators for save, sync, AI provenance | Beta 1.0 | Essential for clinician confidence and safe use of AI assistance. |
| Patient timeline refinement | Beta 1.1 | Valuable, but it is secondary to the live consultation core and adds data and UX complexity. |
| Payment experience refinement | Beta 1.1 | Important operationally, but it can be delivered after the consultation and trust core is stable. |
| Phone consultation refinement | Beta 1.1 | Useful and valuable, but it expands complexity beyond the initial release focus. |
| Patient import refinement | Future Release | Important for onboarding and migrations, but not required for the first production-ready release. |

## Beta 1.0 Success Criteria
Beta 1.0 is successful if:
- The consultation flow is faster and less manual than the current baseline
- Voice capture is understandable, recoverable, and usable during live care
- The doctor can understand the day’s state quickly from the home experience
- The doctor can reach the right patient context with less searching
- Save, draft, sync, and AI states are visible and trustworthy

## Beta 1.0 Non-Goals
- Replacing the clinic workflow with a new product paradigm
- Adding large new feature areas not tied to consultation productivity
- Introducing AI as an authority rather than an assistant
- Shipping major migration or import tooling in the first release

## Implementation Boundary
The Beta 1.0 scope is intentionally narrow so the engineering team can ship a stable, clinically safe, and measurable release without overextending the implementation window.

## Recommendation
Proceed with Beta 1.0 using the narrow consultation-first scope above.

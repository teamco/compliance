# Notes Gateway Hardening — Phase 2 (Design)

## Problem

Phase 1 (PR #58, merged 2026-09-15) added `checkOrgAccess` to 49 routes covering Risk, RiskAssessment+AssessmentItem, Issue, and Exception. The original full-file audit found 147 total routes in `apps/api/src/app/notes/notes.controller.ts`, only 30 with `checkOrgAccess`. Phase 2 covers the remaining resource types: Framework, InternalControl, Standards, Gap analysis, and Policy.

Every route in this file sits behind a global `AuthGuard` (`apps/api/src/app/auth/auth.module.ts`, registered via `APP_GUARD`) — every request needs a valid bearer token. So a route without `checkOrgAccess` is not literally unauthenticated; it's reachable by *any authenticated user from any org*. For resources holding real compliance content (policy text, standards documents, control evidence), that's a cross-org read/write hole, not a "no auth" hole. This phase closes that hole for the remaining 5 resource types.

## Current-state audit (re-verified live against `dev` post-PR#58/#62, not the original pre-Phase-1 audit)

| Resource | Total routes in scope | Already `checkOrgAccess` | Needs hardening |
|---|---|---|---|
| Framework instance-data (evidence/assessments/activities GETs only) | 3 | 0 | 3 |
| Framework catalog (frameworks, requirements, controls) | — | — | **0 — genuinely exempt, see below** |
| InternalControl | 12 | 0 | 12 |
| Standards | 8 | 0 | 8 |
| Gap analysis | 3 | 0 | 3 |
| Policy | 11 | 0 (2 new workflow routes from PR #62 already have it, out of this count) | 11 (10 mechanical + 1 signature change) |
| **Total** | **37** | **0** | **37** |

**Framework catalog exemption — corrected during final review.** The original claim ("`Framework` has no `orgId` field anywhere in its schema") was incomplete: `Framework.status` (`libs/shared/src/strategies/notes.ts:61`) IS a per-org dimension, and `GET frameworks`/`GET frameworks/:id` already accept and thread an optional `?orgId=` to the strategy layer, which `FakeNotesStrategy` honors (returning per-org status from a `frameworkOrgStatus` map). `frameworks/:id/controls` (via `listControlsByFramework`, `supabase-notes.strategy.ts:966`) remains genuinely org-agnostic — that one route's exemption stands as originally reasoned.

The other two (`frameworks`, `frameworks/:id`) are safe to leave unguarded **only because `SupabaseNotesStrategy.listFrameworks()`/`getFramework(id)` (`supabase-notes.strategy.ts:122,158`) currently silently drop the `orgId` parameter** — production has no per-org overlay implemented yet (and `listRequirements`'s hardcoded stubs at the same file's lines 254-270 suggest one was anticipated but never built). This is an accidentally-safe-today state, not a verified-by-design exemption: the moment someone implements per-org Framework status in the Supabase strategy, these 2 routes need `checkOrgAccess` added. Tracked as a follow-up in the project backlog rather than fixed in this phase, since implementing that overlay is a feature addition, not a hardening fix, and out of this plan's scope.

**Framework instance-data GETs are a real, cheap gap.** `listFrameworkEvidence`, `listFrameworkAssessments`, `listFrameworkActivities` (all `GET`, all take an explicit `orgId` query param already) have zero auth check beyond the global guard — not even `this.uid(req)`. Their sibling POST routes (`createFrameworkEvidence`, `createAssessmentFinding`) already call `checkOrgAccess` correctly. This is the same write-guarded/read-unguarded asymmetry pattern Phase 1 saw elsewhere.

**`transitionWorkflow` (Standards, `notes.controller.ts:622`) is the single worst route in this phase's scope**: any authenticated user, from any org, can transition any other org's Standards document through its workflow (including the newly-added `supersede`).

**`listPoliciesForControl` (Policy) is a real cross-org data leak requiring an interface change, not a bolt-on.** Its current signature — `listPoliciesForControl(controlCode: string, frameworkId: string)` — has no `orgId` anywhere. The implementation (`supabase-notes.strategy.ts:3820`) joins `policy_controls` → `policies` and returns full `Policy` rows (title, content — real document text) for every org that happens to share a control/framework mapping. Every other route in this phase gets `checkOrgAccess` bolted onto an existing handler; this one needs the interface itself widened.

No hand-rolled-exemption candidates (Phase 1's "DB-stored owner/approver/validator field" pattern) exist anywhere in this phase's scope — none of these 5 resource types have a per-resource identity field outside org membership. Every route in scope either gets the guard or is genuinely catalog-exempt.

## Scope (in order of task dispatch)

1. **Framework instance-data** — add `checkOrgAccess` to the 3 GET routes, copying the pattern already used by their own POST siblings in the same file.
2. **InternalControl** — mechanical `checkOrgAccess` bolt-on across 12 routes.
3. **Standards** — mechanical bolt-on across 8 routes, including `transitionWorkflow`.
4. **Gap analysis** — mechanical bolt-on across 3 routes; `saveGap` additionally validates `body.orgId` against the caller's own org membership rather than trusting the client-supplied value outright.
5. **Policy** — mechanical bolt-on for 10 routes, plus the `listPoliciesForControl` signature change: add a required `orgId: string` parameter, threaded through all 5 layers (interface → Fake strategy → Supabase strategy → MS `@MessagePattern` handler → notes-client → gateway route), filtering results to that org (or validating the resolved policies all belong to it) before returning.

## Out of scope

- Framework catalog routes (`frameworks`, `:id/requirements`, `:id/controls`) — confirmed genuinely org-agnostic, not touched.
- Any self-approval guard work — none of these 5 resource types have single-actor approval workflows like Exceptions/RiskAcceptance/Policy did.
- A declarative/decorator-based authorization mechanism (`@OrgScoped(...)`) — considered and rejected; this session has consistently chosen "one more concrete instance of the manual pattern" over "build the general mechanism" until a pattern has proven itself enough times to justify generalizing (see Policy's `transitionPolicyWorkflow`, the `framework_activities` widening). A generic guard would also force touching the ~40 already-correct Phase 1/pre-existing routes for consistency, raising regression risk in a security-critical file for no scoped benefit.
- The org-invite/membership system — tracked separately in the project backlog; this phase closes read/write exposure, it does not make these workflows usable by real multi-person orgs (that gap pre-dates and is independent of this phase, same caveat noted for Phase 1).

## Testing

One gateway unit test file per task (or an addition to an existing one where a resource already has partial coverage), mirroring the established convention (`policies.controller.unit.test.ts` from Policy Lifecycle, and Phase 1's own test files): outsider-from-another-org rejected, org creator/member allowed, not-found case surfaced correctly, and — for `listPoliciesForControl` specifically — an explicit two-org fixture proving no cross-org policy rows leak into the response after the fix.

## Testing note on Standards `transitionWorkflow`

This route already gained a `supersede`-rejection guard in the Policy Lifecycle fix wave (PR #62) — that guard is orthogonal to org-scoping and stays untouched. This phase adds `checkOrgAccess` on top; the existing regression test for the `supersede` rejection must keep passing unmodified.

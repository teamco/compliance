# Unified Evidence — Design

## Problem

The requirements-gap audit ranked "Unified Evidence object" as priority #5, on the premise that evidence was split across 3 separate tables/UIs with no shared object. Investigation for this spec found that premise **wrong**: `RequirementEvidence` (`libs/shared/src/strategies/notes.ts:231`) has always been one type backed by one table (`requirement_evidence`, `supabase/migrations/20260912000001_internal_controls.sql:93`), with a polymorphic owner shape — `controlId`/`frameworkId` from the original migration, `riskId` added in `20260912000002_risk_register.sql:259`, `assessmentItemId` added in `20260913000002_assessment_item_evidence.sql`. Each migration correctly extended the table's CHECK constraint and RLS write-policy with a new owner branch — this was clearly built with the unification already in mind.

What's actually fragmented, and what this spec fixes:

1. **No asset owner column** — the Asset Profile page's Evidence tab (`apps/client/src/routes/_dashboard/-assets.page.tsx:2704`) is a hardcoded placeholder (`{t('assets.profile.noEvidence')}`) because `requirement_evidence` has no `asset_id` column at all.
2. **Four independent, inconsistent client UIs** for the same type: Controls-detail (`-controls-detail.page.tsx:167`) is read-only (list only, no create form); `AssessmentItemEvidence.tsx` has a stripped-down create form (title + url only, ignoring `evidenceType`/`source`/dates that the model already has); Framework and Risk surfaces each reimplement their own version again. No surface supports edit, delete, or acting on `verificationStatus` — every create route (`notes.controller.ts:260`, `:460`, `:1235`, `:1445`) never even captures the caller's id, so there is no real actor tracking on evidence today.
3. **No real file upload** — `url?: string` is the only attachment mechanism, validated client-side (`safeHref`), even though a working `StorageStrategy` (upload/signed-URL, `libs/shared/src/strategies/storage.ts`) already exists and is used elsewhere in the app. Explicitly out of scope for this phase (see below).

## Scope

1. Add `assetId` as a 6th polymorphic owner column on `requirement_evidence`, following the exact migration pattern of the `riskId`/`assessmentItemId` additions (CHECK constraint branch + RLS write-policy branch).
2. Add real actor tracking: `createdBy: string` (captured server-side from the caller at creation — every create route currently ignores who's calling), `verifiedBy: string | null`, `verifiedAt: string | null`.
3. Add a verify/reject action (`reviewEvidence`) that sets `verificationStatus` to `'verified'`/`'rejected'`, modeled directly on `ExceptionRenewal`/`IssueValidation`'s review pattern: rejection requires `reviewNotes` (new field on this action, not stored on the row itself — see Architecture), and the strategy layer forbids a caller whose id matches the evidence's own `createdBy` (self-verification guard).
4. Add `PATCH`/`DELETE` for evidence (neither exists today, on any surface) — metadata edit and deletion. `PATCH` never touches `verificationStatus`; only the review action does.
5. Build one shared `EvidencePanel` client component (list, create, edit, delete, verify/reject), parameterized by owner type + id, replacing all 4 existing independent implementations and backing the new Asset Profile Evidence tab. Controls-detail gains full CRUD it never had (parity fix, not scope creep — cheaper to give every consumer of a shared component the same capability than to special-case one as read-only).
6. Backend across all 5 layers for every new/changed operation: `DBStrategy` interface → `FakeNotesStrategy` + `SupabaseNotesStrategy` → notes MS `@MessagePattern` handlers → `notes-client` → gateway routes.
7. i18n keys across all 4 locales (en/es/he/ru) for the new shared component (it replaces 4 sets of ad-hoc, partially-untranslated strings with one consistent set).

Out of scope: real file upload (tracked separately — wiring `StorageStrategy` into evidence is a bigger, independent lift and was explicitly deferred by the user during brainstorming); the `linkedControls`/`linkedRequirements` fields on the TS type (already dead — never persisted by any Supabase strategy method, not touched or fixed here); any change to the pre-existing systemic notes-gateway org-scoping gap (tracked separately in project memory).

## Global Constraints

- **No self-verification**: `reviewEvidence` must reject a caller whose id matches the evidence's own `createdBy`. Enforced server-side in both `FakeNotesStrategy` and `SupabaseNotesStrategy`, not just a disabled client button. Same documented caveat as every prior review workflow this session (`RiskAcceptance`, `IssueValidation`, `ExceptionRenewal`): given the tracked org-membership gap (no real multi-user orgs today), this makes the action reachable only by a platform admin, not an ordinary org creator, since org-creator === record-creator always today. Gateway routes for `reviewEvidence`/`PATCH`/`DELETE` use `checkOrgAccess(org, 'update'/'delete')` (the shared CASL helper — org creator or `role: admin`) exactly like the final state of Exception governance's equivalent routes, not a hand-rolled `org.userId !== userId` check (which was proven to deadlock self-approval guards when combined, in both Issue closure-validation and Exception governance's final reviews).
- **Rejection requires a reason.** `reviewEvidence(id, reviewerId, 'rejected', reviewNotes)` throws if `reviewNotes` is missing on rejection — same rule as `ExceptionRenewal`/`IssueValidation`. Approval (`'verified'`) does not require notes.
- **`PATCH` never changes `verificationStatus`.** Metadata edits and status review are separate operations with separate routes, so the audit-trail-relevant status change stays distinct from routine field edits (per user decision during brainstorming).
- **Evidence rows are never truly gone without a trace conceptually, but this phase adds a real, hard `DELETE`** (per user decision — a new capability, not matching today's append-only-everywhere default). No soft-delete/undo in this phase; a hard delete is acceptable because this is net-new capability, not a change to existing guarantees.
- **`createdBy` is captured server-side from the authenticated caller, never trusted from the request body** — same discipline as `ownerId`/`userId` on every other entity in this app (`this.uid(req)` at the gateway, passed down).
- **Follow existing snake_case / RLS conventions.** The `asset_id` column addition mirrors `risk_id`'s migration exactly: `alter table ... add column asset_id uuid references public.assets(id) on delete cascade`, drop+recreate `requirement_evidence_check` with the new branch, drop+recreate `"users manage own evidence"` with an `asset_id` branch added to the existing `with check` clause (verifying `assets.org_id = requirement_evidence.org_id`, same shape as the `risks`/`risk_assessment_items` branches already there).
- **Gateway routes resolve `orgId` from the evidence row itself** (`requirement_evidence.org_id` is always set — never from a client-supplied query param), same anti-cross-tenant discipline established repeatedly this session.
- **The shared `EvidencePanel` is genuinely one component, not five copies with a shared name.** It takes an owner descriptor (e.g. `{ ownerType: 'control' | 'framework' | 'risk' | 'assessmentItem' | 'asset', ownerId: string }`) and resolves the right list/create/patch/delete/review query hooks internally — existing per-surface pages stop rendering their own bespoke evidence UI and render `<EvidencePanel .../>` instead.

## Architecture

### Data model (`libs/shared/src/strategies/notes.ts`)

```ts
export interface RequirementEvidence {
  id: string;
  orgId?: string;
  controlId?: string;
  riskId?: string;
  assessmentItemId?: string;
  frameworkId?: string;
  requirementId?: string;
  assetId?: string;               // NEW
  title: string;
  owner: string;
  evidenceType: string;
  source: string;
  collectionDate: string;
  periodCovered: string;
  expirationDate: string;
  verificationStatus: 'verified' | 'pending_review' | 'rejected' | 'expired';
  url?: string;
  createdBy: string;               // NEW — real actor id, captured server-side
  verifiedBy: string | null;       // NEW
  verifiedAt: string | null;       // NEW
  linkedControls?: string[];       // unchanged, still dead/unpersisted
  linkedRequirements?: string[];   // unchanged, still dead/unpersisted
}
```

`createdBy` is required on every existing/new create path — a plan task migrates the 4 existing `create*Evidence` strategy methods to accept and stamp it, alongside the new `createAssetEvidence`.

### Migration (new file, e.g. `supabase/migrations/20260916000001_evidence_asset_and_review.sql`)

- `alter table requirement_evidence add column asset_id uuid references public.assets(id) on delete cascade;`
- `alter table requirement_evidence add column created_by uuid;` (nullable at the DB level for pre-existing rows with no known creator; new rows always set it)
- `alter table requirement_evidence add column verified_by uuid;`
- `alter table requirement_evidence add column verified_at timestamptz;`
- Drop+recreate `requirement_evidence_check` adding `or asset_id is not null`.
- Drop+recreate `"users manage own evidence"` adding an `asset_id` branch to `with check`, mirroring the `risk_id`/`assessment_item_id` branches exactly.
- New index `requirement_evidence_asset_idx on requirement_evidence(asset_id)`.

### Strategy layer

`DBStrategy` interface gains:

```ts
createAssetEvidence(orgId: string, assetId: string, data: Omit<RequirementEvidence, 'id' | 'assetId'>): Promise<RequirementEvidence>;
listAssetEvidence(assetId: string): Promise<RequirementEvidence[]>;
updateEvidence(id: string, patch: EvidencePatch): Promise<RequirementEvidence>;
deleteEvidence(id: string): Promise<void>;
reviewEvidence(id: string, reviewerId: string, decision: 'verified' | 'rejected', reviewNotes?: string): Promise<RequirementEvidence>;
getEvidence(id: string): Promise<RequirementEvidence | null>;
```

`EvidencePatch` covers metadata only: `title?, owner?, evidenceType?, source?, collectionDate?, periodCovered?, expirationDate?, url?` — explicitly excludes `verificationStatus`.

`reviewEvidence` in both `FakeNotesStrategy` and `SupabaseNotesStrategy`:
1. Load the evidence row, 404 if missing.
2. If `reviewerId === evidence.createdBy`, throw `evidence_self_review_forbidden`.
3. If `decision === 'rejected'` and no `reviewNotes`, throw `evidence_review_notes_required`.
4. Update `verificationStatus`, `verifiedBy: reviewerId`, `verifiedAt: now()`.

The 4 existing `create*Evidence` methods gain a `createdBy` parameter (or it's folded into the `data` object, consistent with how `ownerId` is already threaded through `createException`/`createIssue` — a plan task decides the exact signature shape once it reads the existing call sites) and stamp it into the insert payload.

### Gateway routes (`apps/api/src/app/notes/notes.controller.ts`)

New:
- `POST assets/:id/evidence`, `GET assets/:id/evidence` — same shape as the 4 existing owner-scoped evidence route pairs, resolving `assetId` from the path and `orgId` from the asset (`this.notes.getAsset(id)` then `.orgId`).
- `PATCH notes/evidence/:id` — loads the row, resolves org via `evidence.orgId`, `checkOrgAccess(org, 'update')`, applies the metadata-only patch.
- `DELETE notes/evidence/:id` — same resolution, `checkOrgAccess(org, 'delete')`.
- `POST notes/evidence/:id/review` — same resolution, `checkOrgAccess(org, 'update')` (the org-level gate; the strategy-level self-review check is the second, always-enforced layer), body `{decision: 'verified' | 'rejected', reviewNotes?: string}`.

All 4 existing create routes are modified in-place to pass `this.uid(req)` through as `createdBy` — no route path changes, no breaking change to their request/response shape from the client's point of view (the response gains 3 new fields, additive).

### Client

**`EvidencePanel`** (new, `apps/client/src/components/evidence/EvidencePanel.tsx`): props `{ orgId: string; ownerType: 'control' | 'framework' | 'risk' | 'assessmentItem' | 'asset'; ownerId: string }`. Internally selects the right list/create query hook per `ownerType` (thin per-owner hooks already exist in `queries/*.ts` and stay — the panel is a UI consolidation, not a data-layer one beyond the new asset hooks) plus the 3 new shared hooks (`useUpdateEvidence`, `useDeleteEvidence`, `useReviewEvidence`, all keyed by evidence id, owner-agnostic). Renders: a list (title, owner, verification badge, collection date, url link if present, Edit/Delete/Verify/Reject actions gated by `!isCreator` for verify/reject), and a create form covering the full field set (`title, owner, evidenceType, source, collectionDate, periodCovered, expirationDate, url` — a strict superset of every existing per-surface form, since none of them exposed all fields).

Migration of existing surfaces to the shared component:
- `-controls-detail.page.tsx`: replace its read-only list with `<EvidencePanel ownerType="control" .../>`.
- Framework evidence surface: same swap.
- `AssessmentItemEvidence.tsx`: deleted, replaced by `<EvidencePanel ownerType="assessmentItem" .../>` at its call site.
- Risk evidence surface: same swap.
- `-assets.page.tsx`'s Evidence tab (`profileTab === 'evidence'`): replace the hardcoded placeholder with `<EvidencePanel ownerType="asset" .../>`.

### Testing

- Fake-strategy contract tests: `createAssetEvidence`/`listAssetEvidence` org-scoping; `updateEvidence` never leaks a `verificationStatus` change even if a caller includes it in the patch body (strategy ignores the field, doesn't just trust the type); `deleteEvidence` removes the row; `reviewEvidence` happy path (verify, reject-with-notes), self-review rejection, reject-without-notes rejection.
- Gateway controller unit tests: `checkOrgAccess` org-creator/admin/outsider matrix for the 3 new by-id routes, mirroring `exceptions.controller.unit.test.ts`'s existing pattern exactly.
- Client: `EvidencePanel` unit tests covering render (list + create form fields), the verify/reject visibility gate (`!isCreator`), and each of the 5 owner-type wirings at their call sites (a thin "renders EvidencePanel with the right ownerType/ownerId" test per surface, not a full re-test of the panel's internals from every call site).
- Live Playwright verification (mandatory per `AGENTS.md`): create evidence on the new Asset Profile tab, verify it appears; edit it; verify/reject it as a different (admin) caller if reachable, same documented limitation as prior phases if not; delete it.

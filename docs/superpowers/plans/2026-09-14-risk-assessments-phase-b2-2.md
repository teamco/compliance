# Risk Assessments Phase B.2.2 (Risk Register Bridge) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an `AssessmentItem` create a new `Risk`, link to an existing `Risk`, unlink, and submit a residual-score reassessment against its linked `Risk` — and replace the Risk detail page's hardcoded, always-empty "Assessment" tab with a real list of every assessment item linked to that Risk.

**Architecture:** Same layering as every prior phase: shared types → Fake strategy → migration → Supabase strategy → notes MS → notes-client → gateway REST → React Query hooks → client components. Three of the four new operations are genuinely new backend methods; reassessment reuses the already-shipped `updateRisk`/`useUpdateRisk` and its automatic snapshot-on-score-change mechanism verbatim — no new backend code for that flow at all.

**Tech Stack:** NestJS TCP microservices, Supabase/Postgres, React 19 + Vite + shadcn, TanStack Router, React Query, i18next.

**Spec:** `docs/superpowers/specs/2026-09-14-risk-assessments-phase-b2-2-design.md`

## Global Constraints

- `AssessmentItem.linkedRiskId` is the ONLY new field. No new field on `Risk` — provenance is carried by the already-existing, already-unused `Risk.source`/`sourceRef` (`source: 'risk_assessment'`, `sourceRef: <assessmentItemId>`).
- `AssessmentItemPatch` must NOT gain a `linkedRiskId` field — link/unlink go through dedicated methods with their own authorization checks, never through the generic patch endpoint. (Confirmed live: `AssessmentItemPatch` currently has no such field; keep it that way.)
- `linkAssessmentItemToRisk` MUST verify the target risk's `orgId` matches the item's `orgId` before writing — this is a direct, deliberate application of a real finding (I4) from Phase B.2.1's final review, where an equivalent missing same-org check was found and fixed. Do not skip this check "because RLS will catch it" — the notes MS runs under the service-role key, so RLS is not a backstop for any of these endpoints.
- Every new gateway route that needs an `orgId` for its authorization check must derive it from the **resource being acted on** (the assessment item's own `orgId`, fetched server-side), never accept a caller-supplied `orgId` query/body param for this purpose — this is the same class of bug the I4 finding was about.
- "Submit Risk Reassessment" requires ZERO new backend code. It is a client-side call to the existing `useUpdateRisk(riskId).mutate({ residualLikelihood, residualImpact, reason })`. Do not add a new backend method for it.
- "Do Not Register" is not implemented as a feature — it is simply not clicking Create/Link. No new field, no persisted "skipped" state.
- Post-coding routine on every task (per AGENTS.md): `npx prettier --write <files>` → `yarn nx lint <project>` → `yarn nx build <project>` — all green before committing.
- Any UI task must be verified live via Playwright before being marked complete (AGENTS.md, non-negotiable).
- Dialog/Sheet overlay rule (per AGENTS.md, updated during Phase B.2.1): every dialog's action buttons live in `DialogFooter`, never inline in the body, and every dialog has an explicit Cancel. Unlink is non-destructive to the Risk (only clears the item's own pointer) so it does NOT need an `AlertDialog` confirm — a direct button is fine.

---

### Task 1: Shared types — `AssessmentItem.linkedRiskId`, `AssessmentItemWithContext`, 4 new `NotesStrategy` methods

**Files:**
- Modify: `libs/shared/src/strategies/notes.ts`

**Interfaces:**
- Produces: `AssessmentItem.linkedRiskId?: string`, `AssessmentItemWithContext`, `NotesStrategy.createRiskFromAssessmentItem`/`linkAssessmentItemToRisk`/`unlinkAssessmentItemFromRisk`/`listAssessmentItemsForRisk`, consumed by every later task.

- [ ] **Step 1: Add `linkedRiskId` to `AssessmentItem`**

Find `export interface AssessmentItem` and add one line after `residualLabel?: RiskScoreLabel;`:

```typescript
  linkedRiskId?: string; // NEW
```

- [ ] **Step 2: Add `AssessmentItemWithContext`**

Add directly after the `AssessmentItem` interface:

```typescript
export interface AssessmentItemWithContext extends AssessmentItem {
  assessmentCode: string;
  assessmentTitle: string;
  assessmentStatus: AssessmentStatus;
}
```

- [ ] **Step 3: Add the 4 methods to `NotesStrategy`**

Find where the other `AssessmentItem`-related methods are declared on the `NotesStrategy` interface (near `updateAssessmentItem`/`deleteAssessmentItem`) and add:

```typescript
  createRiskFromAssessmentItem(
    orgId: string,
    userId: string,
    itemId: string,
    data: { taxonomyCategoryId: string },
  ): Promise<Risk>;
  linkAssessmentItemToRisk(itemId: string, riskId: string): Promise<AssessmentItem>;
  unlinkAssessmentItemFromRisk(itemId: string): Promise<AssessmentItem>;
  listAssessmentItemsForRisk(riskId: string): Promise<AssessmentItemWithContext[]>;
```

- [ ] **Step 4: Build**

Run: `yarn nx build shared`
Expected: FAILS — both `FakeNotesStrategy` and `SupabaseNotesStrategy` are missing the four new interface methods. Expected; Tasks 2 and 4 fix it.

- [ ] **Step 5: Commit**

```bash
git add libs/shared/src/strategies/notes.ts
git commit -m "feat(shared): add AssessmentItem.linkedRiskId and Risk-bridge methods to NotesStrategy"
```

---

### Task 2: `FakeNotesStrategy` — implement the 4 methods + contract tests

**Files:**
- Modify: `libs/shared/src/strategies/fakes/fake-notes.ts`
- Modify: `libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts` (or wherever the existing Assessment/Risk contract tests live)

**Interfaces:**
- Consumes: Task 1's types/interface.
- Produces: `FakeNotesStrategy`'s implementation, consumed by Task 8 (client hooks) via the Fake fallback path.

- [ ] **Step 1: Read `createRisk` and `updateAssessmentItem` in this file first**

Before writing anything, read the CURRENT, full implementations of `createRisk` (search `async createRisk`) and `updateAssessmentItem` (search `async updateAssessmentItem`) in this file — you need `createRisk`'s exact call signature to invoke it internally, and `updateAssessmentItem`'s exact in-memory array lookup style (e.g. `this.assessmentItems.find(...)`) to mirror for the new methods. Also read `getAssessment` (search `async getAssessment`) for the exact array/lookup used for assessments, and confirm the exact name of the in-memory risks array (likely `this.risks`, used inside `createRisk`).

- [ ] **Step 2: Implement the 4 methods**

Add near the other Assessment-item methods:

```typescript
  async createRiskFromAssessmentItem(
    orgId: string,
    userId: string,
    itemId: string,
    data: { taxonomyCategoryId: string },
  ): Promise<Risk> {
    const item = this.assessmentItems.find((i) => i.id === itemId);
    if (!item) throw new Error('assessment item not found');
    const assessment = await this.getAssessment(item.assessmentId);
    if (!assessment) throw new Error('assessment not found');
    const risk = await this.createRisk(orgId, userId, {
      title: item.subject,
      riskStatement: item.description || item.subject,
      taxonomyCategoryId: data.taxonomyCategoryId,
      ownerId: assessment.ownerId,
      businessUnit: assessment.businessUnit,
      assetIds: assessment.assetIds,
      vendorIds: assessment.vendorIds,
      inherentLikelihood: item.inherentLikelihood,
      inherentImpact: item.inherentImpact,
      source: 'risk_assessment',
      sourceRef: item.id,
    });
    item.linkedRiskId = risk.id;
    return risk;
  }

  async linkAssessmentItemToRisk(itemId: string, riskId: string): Promise<AssessmentItem> {
    const item = this.assessmentItems.find((i) => i.id === itemId);
    if (!item) throw new Error('assessment item not found');
    const risk = this.risks.find((r) => r.id === riskId);
    if (!risk) throw new Error('risk not found');
    if (risk.orgId !== item.orgId) throw new Error('risk belongs to a different org');
    item.linkedRiskId = riskId;
    return item;
  }

  async unlinkAssessmentItemFromRisk(itemId: string): Promise<AssessmentItem> {
    const item = this.assessmentItems.find((i) => i.id === itemId);
    if (!item) throw new Error('assessment item not found');
    item.linkedRiskId = undefined;
    return item;
  }

  async listAssessmentItemsForRisk(riskId: string): Promise<AssessmentItemWithContext[]> {
    const items = this.assessmentItems.filter((i) => i.linkedRiskId === riskId);
    return items.map((i) => {
      const assessment = this.assessments.find((a) => a.id === i.assessmentId);
      return {
        ...i,
        assessmentCode: assessment?.assessmentCode ?? '',
        assessmentTitle: assessment?.title ?? '',
        assessmentStatus: assessment?.status ?? 'draft',
      };
    });
  }
```

Verify the exact in-memory array field names (`this.assessmentItems`, `this.risks`, `this.assessments`) against what Step 1 found — adjust if any differ from this guess. `getAssessment` may be synchronous (a plain `.find(...)`) rather than `async` — check and adjust the `await` accordingly.

- [ ] **Step 3: Write contract tests**

Add tests covering:
- `createRiskFromAssessmentItem` creates a `Risk` with `title`/`riskStatement` from the item, `ownerId`/`businessUnit`/`assetIds`/`vendorIds` from the item's parent assessment, `inherentLikelihood`/`inherentImpact` from the item, `source: 'risk_assessment'`, `sourceRef` equal to the item's id — and that the item's `linkedRiskId` is set to the new risk's id afterward.
- `linkAssessmentItemToRisk` sets `linkedRiskId` when risk and item share an org; **throws** when they don't (seed a second org's risk and assert rejection).
- `unlinkAssessmentItemFromRisk` clears `linkedRiskId` back to `undefined`.
- `listAssessmentItemsForRisk` returns only items linked to the given risk (seed two risks, link different items to each, assert disjoint results), with the correct `assessmentCode`/`assessmentTitle`/`assessmentStatus` attached from each item's real parent assessment.

- [ ] **Step 4: Build & test**

Run: `yarn nx build shared && yarn nx test shared`
Expected: build passes (Fake side of the interface satisfied — Supabase side still fails, expected until Task 4); new tests pass.

- [ ] **Step 5: Commit**

```bash
git add libs/shared/src/strategies/fakes/fake-notes.ts libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts
git commit -m "feat(shared): implement Risk-bridge methods in FakeNotesStrategy"
```

---

### Task 3: Migration — `linked_risk_id` on `risk_assessment_items`

**Files:**
- Create: `supabase/migrations/20260914000001_assessment_item_risk_link.sql`

**Interfaces:**
- Produces: `risk_assessment_items.linked_risk_id` column, consumed by Task 4.

- [ ] **Step 1: Read the CURRENT org-scoped RLS policy on `risk_assessment_items`** (added in Phase B.1's migration `supabase/migrations/20260913000001_assessments_phase_b1.sql`) in full, to reproduce its exact structure and qualification style rather than guessing.

- [ ] **Step 2: Write the migration**

```sql
alter table public.risk_assessment_items
  add column linked_risk_id uuid references public.risks(id) on delete set null;

create index risk_assessment_items_linked_risk_idx
  on public.risk_assessment_items(linked_risk_id);
```

Then widen the existing policy with a `linked_risk_id`-scoped branch, fully qualified (mirror the exact style already used correctly three times in this project — the `assessment_item_id`/`risk_id`/`control_id` branches on `requirement_evidence` from Phase B.2.1's migration):

```sql
-- and (
--   linked_risk_id is null
--   or exists (
--     select 1 from public.risks r
--     where r.id = risk_assessment_items.linked_risk_id
--       and r.org_id = risk_assessment_items.org_id
--   )
-- )
```

Do NOT just append this comment — actually locate the real policy body (drop + recreate it, same technique used for `requirement_evidence` in the prior phase) and add the branch for real. Confirm `risks.org_id` and `risk_assessment_items.org_id` are the real column names before writing the join (they should be, per every prior migration in this project, but verify).

`on delete set null` (not `cascade`) is deliberate — deleting a Risk must not delete the assessment item that referenced it.

- [ ] **Step 3: Verify on real Postgres if available**

If `/usr/lib/postgresql/16/bin` exists, replay the full migration chain through this file on a throwaway cluster (same technique used in every prior phase), seed a cross-org scenario, and confirm: the column/index/constraint apply cleanly, and a non-superuser role sees correct isolation (same-org read/write succeeds, cross-org `linked_risk_id` write is rejected by RLS). If unavailable, do a careful manual re-read and say so.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260914000001_assessment_item_risk_link.sql
git commit -m "feat(db): add linked_risk_id to risk_assessment_items"
```

---

### Task 4: `SupabaseNotesStrategy` — implement the 4 methods

**Files:**
- Modify: `apps/microservices/notes/src/app/supabase-notes.strategy.ts`

**Interfaces:**
- Consumes: `risk_assessment_items.linked_risk_id` (Task 3).
- Produces: `SupabaseNotesStrategy`'s implementation.

- [ ] **Step 1: Read `createRisk`, `updateAssessmentItem`, `getAssessment`, and their row-mapper helpers (`toRisk`/`toAssessmentItem`) in full first**

Confirm the exact column names (`org_id`, `linked_risk_id` once Task 3 lands), the exact insert/select patterns, and the exact `ok(data, error)` helper usage already established throughout this file.

- [ ] **Step 2: Implement the 4 methods**, mirroring Task 2's Fake logic but against Postgres:

```typescript
  async createRiskFromAssessmentItem(
    orgId: string,
    userId: string,
    itemId: string,
    data: { taxonomyCategoryId: string },
  ): Promise<Risk> {
    const { data: itemRow, error: itemError } = await this.db
      .from('risk_assessment_items')
      .select('*')
      .eq('id', itemId)
      .single();
    const item = this.toAssessmentItem(ok(itemRow, itemError));
    const assessment = await this.getAssessment(item.assessmentId);
    if (!assessment) throw new Error('assessment not found');
    const risk = await this.createRisk(orgId, userId, {
      title: item.subject,
      riskStatement: item.description || item.subject,
      taxonomyCategoryId: data.taxonomyCategoryId,
      ownerId: assessment.ownerId,
      businessUnit: assessment.businessUnit,
      assetIds: assessment.assetIds,
      vendorIds: assessment.vendorIds,
      inherentLikelihood: item.inherentLikelihood,
      inherentImpact: item.inherentImpact,
      source: 'risk_assessment',
      sourceRef: item.id,
    });
    const { error: linkError } = await this.db
      .from('risk_assessment_items')
      .update({ linked_risk_id: risk.id })
      .eq('id', itemId);
    if (linkError) throw linkError;
    return risk;
  }

  async linkAssessmentItemToRisk(itemId: string, riskId: string): Promise<AssessmentItem> {
    const { data: itemRow, error: itemError } = await this.db
      .from('risk_assessment_items')
      .select('*')
      .eq('id', itemId)
      .single();
    const item = this.toAssessmentItem(ok(itemRow, itemError));
    const { data: riskRow, error: riskError } = await this.db
      .from('risks')
      .select('org_id')
      .eq('id', riskId)
      .single();
    const risk = ok(riskRow, riskError);
    if (risk['org_id'] !== item.orgId) throw new Error('risk belongs to a different org');
    const { data: updated, error } = await this.db
      .from('risk_assessment_items')
      .update({ linked_risk_id: riskId })
      .eq('id', itemId)
      .select()
      .single();
    return this.toAssessmentItem(ok(updated, error));
  }

  async unlinkAssessmentItemFromRisk(itemId: string): Promise<AssessmentItem> {
    const { data, error } = await this.db
      .from('risk_assessment_items')
      .update({ linked_risk_id: null })
      .eq('id', itemId)
      .select()
      .single();
    return this.toAssessmentItem(ok(data, error));
  }

  async listAssessmentItemsForRisk(riskId: string): Promise<AssessmentItemWithContext[]> {
    const { data, error } = await this.db
      .from('risk_assessment_items')
      .select('*, risk_assessments!inner(assessment_code, title, status)')
      .eq('linked_risk_id', riskId);
    return ok(data, error).map((row: Record<string, unknown>) => ({
      ...this.toAssessmentItem(row),
      assessmentCode: (row['risk_assessments'] as Record<string, unknown>)['assessment_code'] as string,
      assessmentTitle: (row['risk_assessments'] as Record<string, unknown>)['title'] as string,
      assessmentStatus: (row['risk_assessments'] as Record<string, unknown>)['status'] as AssessmentStatus,
    }));
  }
```

The embedded-join syntax (`risk_assessments!inner(...)`) for `listAssessmentItemsForRisk` is a guess at Supabase's join-selection syntax — verify it against any EXISTING embedded-select usage elsewhere in this file (grep for `!inner` or a similar join pattern already used for another table) and correct if this project's Supabase client version/config needs different syntax. If no existing precedent exists in this file, a safe fallback is two separate queries (fetch items by `linked_risk_id`, then fetch their parent assessments by the resulting `assessment_id`s, then merge in application code) — use whichever is less risky given what you find.

- [ ] **Step 3: Build**

Run: `yarn nx run-many -t build -p shared,notes` (not `yarn nx build shared notes` — that flag form is invalid multi-project syntax, a prior phase's task hit this).
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/microservices/notes/src/app/supabase-notes.strategy.ts
git commit -m "feat(notes): implement Risk-bridge methods in SupabaseNotesStrategy"
```

---

### Task 5: Notes MS — `@MessagePattern` handlers

**Files:**
- Modify: `apps/microservices/notes/src/app/notes.controller.ts`

**Interfaces:**
- Consumes: Tasks 2, 4.
- Produces: 4 message patterns, consumed by Task 6.

- [ ] **Step 1: Add the 4 handlers**

Place the assessment-item-facing ones alongside the existing `notes.assessments.items.*` handlers, and the risk-facing one alongside the existing `notes.risks.*` handlers:

```typescript
  @MessagePattern('notes.assessments.items.risk.create')
  createRiskFromAssessmentItem(
    @Payload()
    payload: { orgId: string; userId: string; itemId: string; data: { taxonomyCategoryId: string } },
  ): Promise<Risk> {
    return this.strategy.createRiskFromAssessmentItem(
      payload.orgId,
      payload.userId,
      payload.itemId,
      payload.data,
    );
  }

  @MessagePattern('notes.assessments.items.risk.link')
  linkAssessmentItemToRisk(
    @Payload() payload: { itemId: string; riskId: string },
  ): Promise<AssessmentItem> {
    return this.strategy.linkAssessmentItemToRisk(payload.itemId, payload.riskId);
  }

  @MessagePattern('notes.assessments.items.risk.unlink')
  unlinkAssessmentItemFromRisk(
    @Payload() payload: { itemId: string },
  ): Promise<AssessmentItem> {
    return this.strategy.unlinkAssessmentItemFromRisk(payload.itemId);
  }

  @MessagePattern('notes.risks.assessment-items.list')
  listAssessmentItemsForRisk(
    @Payload() payload: { riskId: string },
  ): Promise<AssessmentItemWithContext[]> {
    return this.strategy.listAssessmentItemsForRisk(payload.riskId);
  }
```

Verify `Risk`, `AssessmentItem`, `AssessmentItemWithContext` are already imported at the top of this file (they should be, from Phase B.1/B.2.1) — add the import if `AssessmentItemWithContext` is missing.

- [ ] **Step 2: Build**

Run: `yarn nx build notes`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/microservices/notes/src/app/notes.controller.ts
git commit -m "feat(notes): add message handlers for the Risk-bridge methods"
```

---

### Task 6: `notes-client` — TCP proxy

**Files:**
- Modify: `libs/notes-client/src/lib/notes-client.service.ts`

**Interfaces:**
- Consumes: message patterns from Task 5.
- Produces: 4 proxy methods, consumed by Task 7.

- [ ] **Step 1: Add the 4 proxy methods**

```typescript
  createRiskFromAssessmentItem(
    orgId: string,
    userId: string,
    itemId: string,
    data: { taxonomyCategoryId: string },
  ): Promise<Risk> {
    return signedSend<Risk>(this.client, 'notes.assessments.items.risk.create', {
      orgId,
      userId,
      itemId,
      data,
    });
  }

  linkAssessmentItemToRisk(itemId: string, riskId: string): Promise<AssessmentItem> {
    return signedSend<AssessmentItem>(this.client, 'notes.assessments.items.risk.link', {
      itemId,
      riskId,
    });
  }

  unlinkAssessmentItemFromRisk(itemId: string): Promise<AssessmentItem> {
    return signedSend<AssessmentItem>(this.client, 'notes.assessments.items.risk.unlink', {
      itemId,
    });
  }

  listAssessmentItemsForRisk(riskId: string): Promise<AssessmentItemWithContext[]> {
    return signedSend<AssessmentItemWithContext[]>(
      this.client,
      'notes.risks.assessment-items.list',
      { riskId },
    );
  }
```

- [ ] **Step 2: Build**

Run: `yarn nx build notes-client`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add libs/notes-client/src/lib/notes-client.service.ts
git commit -m "feat(notes-client): proxy the Risk-bridge methods over TCP"
```

---

### Task 7: Gateway REST endpoints

**Files:**
- Modify: `apps/api/src/app/notes/notes.controller.ts`

**Interfaces:**
- Consumes: `NotesClientService` methods (Task 6).
- Produces: 4 REST endpoints, consumed by Task 8.

**This task carries the authorization discipline called out in Global Constraints — read that section again before writing.**

- [ ] **Step 1: Read `createAssessmentItemEvidence`'s exact authorization pattern first**

This is the fix Phase B.2.1's final review added (`getOrganizationById` → `NotFoundException` guard → `checkOrgAccess(req, org, 'update')` → delegate to strategy). It uses a caller-supplied `orgId` query param there. For THIS task, do not accept a caller-supplied `orgId` for the two item-facing routes — instead, fetch the item first (you'll need `this.notes.getAssessmentItem`-equivalent, or reuse whatever the existing `listAssessmentItems`/`updateAssessmentItem` gateway routes already do to resolve an item's `orgId` — read them first), use the item's own `orgId` for the `getOrganizationById`/`checkOrgAccess` check, and only then call the strategy method.

- [ ] **Step 2: Add the 4 routes**

Place the item-facing ones alongside the existing `assessments/items/:itemId/...` routes, and the risk-facing one alongside the existing `risks/:id/...` routes:

```typescript
  @Post('assessments/items/:itemId/create-risk')
  @ApiOperation({ summary: 'Create a new Risk from an assessment item' })
  async createRiskFromAssessmentItem(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('itemId') itemId: string,
    @Body() body: { taxonomyCategoryId: string },
  ) {
    const uid = this.uid(req);
    const item = await this.notes.getAssessmentItem(itemId); // verify this method name/exists — see Step 1
    if (!item) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(item.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.createRiskFromAssessmentItem(item.orgId, uid, itemId, body);
  }

  @Post('assessments/items/:itemId/link-risk')
  @ApiOperation({ summary: 'Link an assessment item to an existing Risk' })
  async linkAssessmentItemToRisk(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('itemId') itemId: string,
    @Body() body: { riskId: string },
  ) {
    this.uid(req);
    const item = await this.notes.getAssessmentItem(itemId);
    if (!item) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(item.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.linkAssessmentItemToRisk(itemId, body.riskId);
  }

  @Delete('assessments/items/:itemId/link-risk')
  @ApiOperation({ summary: 'Unlink an assessment item from its Risk' })
  async unlinkAssessmentItemFromRisk(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('itemId') itemId: string,
  ) {
    this.uid(req);
    const item = await this.notes.getAssessmentItem(itemId);
    if (!item) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(item.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.unlinkAssessmentItemFromRisk(itemId);
  }

  @Get('risks/:id/assessment-items')
  @ApiOperation({ summary: 'List assessment items linked to a risk' })
  listAssessmentItemsForRisk(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
  ) {
    this.uid(req);
    return this.notes.listAssessmentItemsForRisk(id);
  }
```

**Important — `this.notes.getAssessmentItem` does not exist yet** (confirmed: no dedicated single-item lookup method exists on `NotesClientService` today). You have two choices, pick whichever is less invasive once you look at what's actually available:
(a) Add a thin `getAssessmentItem(itemId)` passthrough across all 5 layers (client→gateway→proxy→MS→strategy) — the strategies already have the inline lookup logic (Task 2/4), so this would just be exposing it; or
(b) Have `createRiskFromAssessmentItem`/`linkAssessmentItemToRisk`/`unlinkAssessmentItemFromRisk` strategy methods themselves return enough info (or throw a typed, catchable error) that the gateway can perform its org check using a different existing lookup — e.g. if `listAssessmentItems(assessmentId)` is already exposed and there's some other way to resolve an item's `orgId` cheaply. Read what's actually exposed on `NotesClientService` today before deciding; if in doubt, (a) is the more consistent, less surprising choice — it mirrors how every other single-resource fetch in this codebase works (`getRisk`, `getAssessment` all exist as thin passthroughs already).

If you add `getAssessmentItem`, do it as a preliminary step in THIS task (not a separate task) — it is small and this task cannot be correctly authorized without it. Add it to the same 5 layers touched by this task; keep it out of scope for anything else.

The `GET risks/:id/assessment-items` route has no equivalent org-check concern — it only reads, and read-endpoint authorization gaps are the same already-accepted, already-deferred cross-cutting backlog item from Phase B.1/B.2.1 (do not add a check here that no other read endpoint in this file has — that would be inconsistent, not extra-safe).

- [ ] **Step 3: Build**

Run: `yarn nx build api`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/app/notes/notes.controller.ts libs/notes-client/src/lib/notes-client.service.ts apps/microservices/notes/src/app/notes.controller.ts libs/shared/src/strategies/notes.ts libs/shared/src/strategies/fakes/fake-notes.ts apps/microservices/notes/src/app/supabase-notes.strategy.ts
git commit -m "feat(api): expose Risk-bridge endpoints with resource-derived org authorization"
```

(This commit may span files touched in earlier tasks IF you added `getAssessmentItem` per Step 2's note — that's expected and fine; a mid-plan cross-cutting addition like this doesn't need to be split across 5 separate single-line commits.)

---

### Task 8: Client — query hooks

**Files:**
- Modify: `apps/client/src/queries/assessments.ts`
- Modify: `apps/client/src/queries/risks.ts`

**Interfaces:**
- Consumes: Task 7's REST endpoints.
- Produces: `useCreateRiskFromAssessmentItem`, `useLinkAssessmentItemToRisk`, `useUnlinkAssessmentItemFromRisk` (in `assessments.ts`), `useAssessmentItemsForRisk` (in `risks.ts`), consumed by Tasks 9-11.

- [ ] **Step 1: Add the 3 assessment-item-facing hooks to `assessments.ts`**

Note: the gateway route (Task 7) derives `orgId` itself from the item and `userId` from the auth token — neither is part of the REST request body/URL, so these hooks take only what the browser actually needs to supply. Do not add an `orgId` parameter to `useCreateRiskFromAssessmentItem`; that would be an unused parameter in the mutation function (the same class of pre-flight defect a prior phase caught before implementation).

```typescript
export function useCreateRiskFromAssessmentItem(itemId: string) {
  const qc = useQueryClient();
  return useMutation<Risk, Error, { taxonomyCategoryId: string }>({
    mutationFn: (data) =>
      api<Risk>(`/notes/assessments/items/${itemId}/create-risk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assessments', 'items'] });
      qc.invalidateQueries({ queryKey: ['risks'] });
    },
  });
}

export function useLinkAssessmentItemToRisk(itemId: string) {
  const qc = useQueryClient();
  return useMutation<AssessmentItem, Error, { riskId: string }>({
    mutationFn: (data) =>
      api<AssessmentItem>(`/notes/assessments/items/${itemId}/link-risk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assessments', 'items'] }),
  });
}

export function useUnlinkAssessmentItemFromRisk(itemId: string) {
  const qc = useQueryClient();
  return useMutation<AssessmentItem, Error, void>({
    mutationFn: () =>
      api<AssessmentItem>(`/notes/assessments/items/${itemId}/link-risk`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assessments', 'items'] }),
  });
}
```

Verify the exact query key(s) that `useAssessmentItems(assessmentId)` uses (read that hook in this same file) — the invalidation above should match it exactly (likely `['assessments', assessmentId, 'items']` rather than the bare `['assessments', 'items']` guessed here; correct it). Import `Risk` type from wherever this file already imports shared types (check the top of the file).

- [ ] **Step 2: Add the risk-facing hook to `risks.ts`**

```typescript
export function useAssessmentItemsForRisk(riskId: string) {
  return useQuery<AssessmentItemWithContext[]>({
    queryKey: ['risks', riskId, 'assessment-items'],
    queryFn: () => api<AssessmentItemWithContext[]>(`/notes/risks/${riskId}/assessment-items`),
    enabled: !!riskId,
  });
}
```

Import `AssessmentItemWithContext` — check whether this file already imports assessment-related shared types, or add a fresh import from wherever `RequirementEvidence` etc. are imported in this file.

- [ ] **Step 3: Build**

Run: `yarn nx build client`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/queries/assessments.ts apps/client/src/queries/risks.ts
git commit -m "feat(client): add React Query hooks for the Risk-bridge"
```

---

### Task 9: Client — `AssessmentItemsPanel`'s Risk Register section (unlinked state: Create/Link)

**Files:**
- Modify: `apps/client/src/components/assessments/AssessmentItemsPanel.tsx`

**Interfaces:**
- Consumes: `useCreateRiskFromAssessmentItem`, `useLinkAssessmentItemToRisk` (Task 8); `useRiskTaxonomy`, `useRisks` (existing, `apps/client/src/queries/risks.ts`); `Combobox` (existing, already search-capable via `CommandInput`).

- [ ] **Step 1: Read the CURRENT full content of `AssessmentItemsPanel.tsx`** — the new section goes in the expanded-item view, after the existing Evidence section, inside the same `expandedItemId === item.id && (...)` block.

- [ ] **Step 2: Add the unlinked-state UI**

Add state (near the file's existing `expandedItemId`/`residualDraft` state):

```typescript
  const [createRiskDialogItemId, setCreateRiskDialogItemId] = useState<string | null>(null);
  const [linkRiskDialogItemId, setLinkRiskDialogItemId] = useState<string | null>(null);
  const [taxonomyCategoryId, setTaxonomyCategoryId] = useState('');
  const [selectedRiskId, setSelectedRiskId] = useState('');
  const { data: taxonomy = [] } = useRiskTaxonomy(orgId);
  const { data: allRisks = [] } = useRisks(orgId);
  const createRiskMut = useCreateRiskFromAssessmentItem(createRiskDialogItemId ?? '');
  const linkRiskMut = useLinkAssessmentItemToRisk(linkRiskDialogItemId ?? '');
```

Inside the expanded-item block, after the Evidence section, add a new "Risk Register" section rendered only when `!item.linkedRiskId` (the linked-state UI is Task 10):

```tsx
                    {!item.linkedRiskId && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2">
                          {t('assessments.riskRegister')}
                        </p>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setCreateRiskDialogItemId(item.id)}
                          >
                            {t('assessments.createNewRisk')}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setLinkRiskDialogItemId(item.id)}
                          >
                            {t('assessments.linkExistingRisk')}
                          </Button>
                        </div>
                      </div>
                    )}
```

Add the two dialogs at the end of the component's return (alongside the existing add-item Dialog / delete-confirm AlertDialog), each with buttons in a `DialogFooter` per this plan's Global Constraints:

```tsx
      <Dialog
        open={!!createRiskDialogItemId}
        onOpenChange={(o) => !o && setCreateRiskDialogItemId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('assessments.createNewRisk')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t('risks.category')}</Label>
              <select
                value={taxonomyCategoryId}
                onChange={(e) => setTaxonomyCategoryId(e.target.value)}
                className="w-full h-9 rounded-md border border-border bg-surface px-3 text-sm"
              >
                <option value="">{t('risks.selectCategory')}</option>
                {taxonomy.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateRiskDialogItemId(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={!taxonomyCategoryId || createRiskMut.isPending}
              onClick={() => {
                if (!createRiskDialogItemId) return;
                createRiskMut.mutate(
                  { taxonomyCategoryId },
                  {
                    onSuccess: () => {
                      setCreateRiskDialogItemId(null);
                      setTaxonomyCategoryId('');
                    },
                  },
                );
              }}
            >
              {t('assessments.createNewRisk')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!linkRiskDialogItemId} onOpenChange={(o) => !o && setLinkRiskDialogItemId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('assessments.linkExistingRisk')}</DialogTitle>
          </DialogHeader>
          <Combobox
            options={allRisks.map((r) => ({ value: r.id, label: `${r.riskId} — ${r.title}` }))}
            value={selectedRiskId}
            onChange={setSelectedRiskId}
            placeholder={t('assessments.selectRisk')}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkRiskDialogItemId(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={!selectedRiskId || linkRiskMut.isPending}
              onClick={() => {
                if (!linkRiskDialogItemId) return;
                linkRiskMut.mutate(
                  { riskId: selectedRiskId },
                  {
                    onSuccess: () => {
                      setLinkRiskDialogItemId(null);
                      setSelectedRiskId('');
                    },
                  },
                );
              }}
            >
              {t('assessments.linkExistingRisk')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
```

Note why `createRiskMut`/`linkRiskMut` (declared above, alongside the other top-level state) are constructed with `createRiskDialogItemId ?? ''`/`linkRiskDialogItemId ?? ''` rather than a per-item id: this component renders ALL items in a list, and the dialogs are keyed by which item is currently targeted (`createRiskDialogItemId`/`linkRiskDialogItemId`), not by the item currently being mapped over in the render loop — a hook cannot be called conditionally or inside a per-item callback, so it must be constructed once at the top of the component with the dynamic target id, the same pattern this file's existing `updateItemMut`/`deleteItemMut` already use.

- [ ] **Step 3: Build**

Run: `npx prettier --write apps/client/src/components/assessments/AssessmentItemsPanel.tsx && yarn nx lint client && yarn nx build client`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/components/assessments/AssessmentItemsPanel.tsx
git commit -m "feat(client): add Create/Link Risk actions to the item's Risk Register section"
```

---

### Task 10: Client — `AssessmentItemsPanel`'s Risk Register section (linked state: Reassess/Unlink)

**Files:**
- Modify: `apps/client/src/components/assessments/AssessmentItemsPanel.tsx`

**Interfaces:**
- Consumes: `useRisk`, `useUpdateRisk` (existing, `apps/client/src/queries/risks.ts`); `useUnlinkAssessmentItemFromRisk` (Task 8).

- [ ] **Step 1: Add the linked-state UI**

Replace the `!item.linkedRiskId` guard from Task 9 with a full if/else covering both states. When `item.linkedRiskId` IS set, render (in place of the Create/Link buttons):

```tsx
                    {item.linkedRiskId && <LinkedRiskSection item={item} />}
```

Add a new small component in this same file (it needs its own `useRisk(item.linkedRiskId)` call — a per-item hook call is fine here since it's a genuinely separate component instance per expanded item, not a top-level hook call inside a loop). This component owns its own unlink mutation internally rather than taking a callback prop, since it already independently instantiates `useRisk`/`useUpdateRisk` scoped to this one item — there is no parent-level mutation to wire, avoiding the exact "hook needed before the target item is known" problem Task 9 had to work around for Create/Link:

```tsx
function LinkedRiskSection({ item }: { item: AssessmentItem }) {
  const { t } = useTranslation();
  const { data: risk } = useRisk(item.linkedRiskId ?? '');
  const updateRiskMut = useUpdateRisk(item.linkedRiskId ?? '');
  const unlinkMut = useUnlinkAssessmentItemFromRisk(item.id);
  const [reassessOpen, setReassessOpen] = useState(false);
  const [reason, setReason] = useState('');

  const canReassess = item.residualLikelihood != null && item.residualImpact != null;

  if (!risk) return null;

  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-2">
        {t('assessments.riskRegister')}
      </p>
      <div className="flex items-center gap-2 text-sm">
        <a
          href={`/risks/${risk.id}`}
          className="font-mono text-xs underline text-muted-foreground hover:text-foreground"
        >
          {risk.riskId}
        </a>
        <span className="text-muted-foreground">{risk.title}</span>
        <button
          type="button"
          onClick={() => unlinkMut.mutate()}
          className="text-muted-foreground hover:text-destructive cursor-pointer text-xs"
        >
          {t('assessments.unlinkRisk')}
        </button>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="mt-2"
        disabled={!canReassess}
        onClick={() => setReassessOpen(true)}
      >
        {t('assessments.submitReassessment')}
      </Button>

      <Dialog open={reassessOpen} onOpenChange={setReassessOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('assessments.submitReassessment')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t('assessments.reassessmentCurrent')}: {risk.residualScore ?? '—'} (
            {risk.residualLabel ?? '—'}) → {t('assessments.reassessmentProposed')}:{' '}
            {item.residualScore} ({item.residualLabel})
          </p>
          <div>
            <Label htmlFor="reassess-reason">{t('assessments.reassessmentReason')}</Label>
            <textarea
              id="reassess-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm resize-none"
              required
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReassessOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={!reason.trim() || updateRiskMut.isPending}
              onClick={() =>
                updateRiskMut.mutate(
                  {
                    residualLikelihood: item.residualLikelihood,
                    residualImpact: item.residualImpact,
                    reason: reason.trim(),
                  },
                  {
                    onSuccess: () => {
                      setReassessOpen(false);
                      setReason('');
                    },
                  },
                )
              }
            >
              {t('assessments.submitReassessment')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

`unlinkMut` is already wired above (`useUnlinkAssessmentItemFromRisk(item.id)`, constructed inside `LinkedRiskSection` itself) — no additional plumbing needed at the parent call site.

- [ ] **Step 2: Build**

Run: `npx prettier --write apps/client/src/components/assessments/AssessmentItemsPanel.tsx && yarn nx lint client && yarn nx build client`
Expected: PASS.

- [ ] **Step 3: Mandatory live Playwright verification**

Start the dev stack, open an assessment with a scored item, link it to an existing risk, submit a reassessment with a reason, then navigate to that Risk's detail page and confirm the History tab shows a new snapshot entry with the reason text and the updated residual score. Also verify Unlink clears the section back to the Create/Link buttons state.

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/components/assessments/AssessmentItemsPanel.tsx
git commit -m "feat(client): add Reassess/Unlink actions to the item's Risk Register section"
```

---

### Task 11: Client — Risk detail page's Assessment tab

**Files:**
- Modify: `apps/client/src/routes/_dashboard/-risks-detail.page.tsx`

**Interfaces:**
- Consumes: `useAssessmentItemsForRisk` (Task 8).

- [ ] **Step 1: Read the CURRENT full content of `-risks-detail.page.tsx`**, specifically the hardcoded Assessment-tab block and the adjacent Controls tab's real rendering pattern to mirror (list of rows, each a `border border-border rounded-lg p-3` div, empty-state fallback).

- [ ] **Step 2: Replace the hardcoded block**

Replace:
```tsx
{tab === 'assessment' && (
  <div className="py-8 text-center text-muted-foreground text-sm">
    {t('risks.noAssessmentsYet')}
  </div>
)}
```
with:
```tsx
{tab === 'assessment' && (
  <div className="space-y-2">
    {assessmentItems.length === 0 ? (
      <div className="py-8 text-center text-muted-foreground text-sm">
        {t('risks.noAssessmentsYet')}
      </div>
    ) : (
      assessmentItems.map((item) => (
        <div
          key={item.id}
          className="border border-border rounded-lg p-3 flex items-center justify-between text-sm"
        >
          <div>
            <a
              href={`/assessments/${item.assessmentId}`}
              className="font-mono text-xs underline text-muted-foreground hover:text-foreground"
            >
              {item.assessmentCode}
            </a>
            <span className="ml-2">{item.subject}</span>
          </div>
          <span className="text-xs text-muted-foreground">
            {t('assessments.inherent')}: {item.inherentScore} ({item.inherentLabel})
            {item.residualScore != null &&
              ` · ${t('assessments.residual')}: ${item.residualScore} (${item.residualLabel})`}
          </span>
        </div>
      ))
    )}
  </div>
)}
```

Add `const { data: assessmentItems = [] } = useAssessmentItemsForRisk(id);` near the file's other data hooks, and add `useAssessmentItemsForRisk` to the existing `@/queries/risks` import block at the top of the file.

- [ ] **Step 3: Build**

Run: `npx prettier --write apps/client/src/routes/_dashboard/-risks-detail.page.tsx && yarn nx lint client && yarn nx build client`
Expected: PASS.

- [ ] **Step 4: Live Playwright check**

Confirm the Assessment tab on a Risk that has a linked item shows the real row (with working link back to the assessment), and a Risk with no linked items still shows the original empty-state text.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/routes/_dashboard/-risks-detail.page.tsx
git commit -m "feat(client): replace hardcoded Assessment tab with real linked-item list"
```

---

### Task 12: i18n — en/es/he/ru keys

**Files:**
- Modify: `libs/template-shared/src/lib/i18n/locales/{en,es,he,ru}.ts`

- [ ] **Step 1: Grep the actual current code** for every new `t('assessments....')`/`t('risks....')` call introduced by Tasks 9-11 — do not trust this plan's guessed key names verbatim (some may have shifted during implementation). Expect at least: `riskRegister`, `createNewRisk`, `linkExistingRisk`, `selectRisk`, `unlinkRisk`, `submitReassessment`, `reassessmentCurrent`, `reassessmentProposed`, `reassessmentReason`, plus `risks.category`/`risks.selectCategory` (verify these don't already exist under the `risks` block from the existing manual create-risk form — they likely do; reuse rather than duplicate if so).

- [ ] **Step 2: Add missing keys to `en.ts`**, reusing any that already exist (e.g. `risks.category`/`risks.selectCategory` from the existing risk-creation form almost certainly already exist — grep first, don't blindly add duplicates).

- [ ] **Step 3: Translate into `es.ts`, `he.ts`, `ru.ts`** — real, idiomatic translations reusing existing terminology (`risk`/`assessment`/`reason` wording already established elsewhere in each locale file).

- [ ] **Step 4: Verify key-set parity** across all 4 locales (same extraction+diff technique used in every prior phase).

- [ ] **Step 5: Build**

Run: `yarn nx build template-shared && yarn nx build client`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add libs/template-shared/src/lib/i18n/locales/en.ts libs/template-shared/src/lib/i18n/locales/es.ts libs/template-shared/src/lib/i18n/locales/he.ts libs/template-shared/src/lib/i18n/locales/ru.ts
git commit -m "feat(i18n): add Risk Register bridge strings"
```

---

### Task 13: Client unit tests

**Files:**
- Modify: `apps/client/src/components/assessments/__tests__/AssessmentItemsPanel.unit.test.tsx`
- Modify or create: `apps/client/src/routes/_dashboard/__tests__/risks-detail.unit.test.tsx` (check if this file already exists — it should, from Risk Register Phase A; if so, ADD to it, don't create a duplicate)

- [ ] **Step 1: Read both test files' current content and established mocking conventions first.**

- [ ] **Step 2: Add `AssessmentItemsPanel` coverage** — unlinked item shows Create/Link buttons; Create New Risk dialog requires a category before enabling submit and calls the mocked `useCreateRiskFromAssessmentItem` mutation; Link Existing Risk dialog requires a selection and calls the mocked `useLinkAssessmentItemToRisk` mutation; a linked item shows the risk code/title + Unlink + (conditionally) the Reassess button; Reassess button is disabled when the item has no residual score and enabled when it does; submitting Reassess calls the mocked `useUpdateRisk` mutation with the item's residual values and the typed reason; Unlink calls the mocked `useUnlinkAssessmentItemFromRisk` mutation.

- [ ] **Step 3: Add Risk detail Assessment-tab coverage** — renders real linked-item rows from a fixture (not the hardcoded empty string) when `useAssessmentItemsForRisk` returns data; falls back to the original empty-state text when it returns `[]`.

- [ ] **Step 4: Run**

Run: `yarn nx test client`
Expected: PASS, no regressions, 0 failures across the whole project (same bar every prior phase's test task held itself to).

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/components/assessments/__tests__/AssessmentItemsPanel.unit.test.tsx apps/client/src/routes/_dashboard/__tests__/risks-detail.unit.test.tsx
git commit -m "test(client): cover the Risk Register bridge UI"
```

---

### Task 14: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full affected pipeline**

Run: `yarn nx affected -t lint,build,test --base=dev --head=HEAD`
Expected: all green.

- [ ] **Step 2: Mandatory Playwright smoke check** covering the full bridge end-to-end (in addition to Tasks 10/11's own targeted checks):
1. Create a new Risk from an assessment item (pick a category, submit) — confirm it appears in the Risk Catalog with the right title/owner/scope/inherent score, and confirm `source`/provenance is set correctly if displayed anywhere.
2. On a different item, link to that same newly-created Risk (or another existing one) — confirm the item's Risk Register section shows the linked risk.
3. Submit a reassessment on the linked item — confirm the Risk's residual score updates on its Overview tab and a new History entry with the reason appears.
4. Unlink — confirm the section reverts to Create/Link buttons, and confirm the Risk itself is untouched (still exists, unaffected).
5. On the Risk's own detail page, Assessment tab — confirm the linked item(s) show up with working links back to their assessment.

Known environment gap (from Phase B.2.1's ledger): `useOrgMembers`/org-related Fake-strategy data may need the same workaround prior tasks used (direct API seed or a Playwright route intercept) if any owner/approver picker blocks reaching this feature's UI.

- [ ] **Step 3: Report status**

If everything above is green, Phase B.2.2 is complete and ready for its own PR against `dev`. Phase B.2.3 (Findings → Issue bridge) is a separate spec/plan that starts once this one is reviewed and merged.

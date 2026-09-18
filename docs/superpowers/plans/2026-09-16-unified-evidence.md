# Unified Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `assetId` owner column and real actor tracking (`createdBy`/`verifiedBy`/`verifiedAt`) to the existing, already-unified `RequirementEvidence` type/table, add a verify/reject review action and PATCH/DELETE, and replace 4 independent client-side evidence UIs (plus a new Asset Profile tab) with one shared `EvidencePanel` component.

**Architecture:** `RequirementEvidence` stays one polymorphic type backed by one `requirement_evidence` table — this plan only adds a 6th owner column (`assetId`) and 3 actor-tracking fields, following the exact migration/RLS pattern the `riskId`/`assessmentItemId` additions already used. All 5 backend layers (`DBStrategy` → `FakeNotesStrategy`/`SupabaseNotesStrategy` → notes MS → `notes-client` → gateway) get the new asset owner + 3 new by-id operations (PATCH, DELETE, review). The client gains one new `EvidencePanel` component that 5 surfaces render instead of their own bespoke UI.

**Tech Stack:** NestJS (gateway + notes microservice, TCP transport), Supabase Postgres + RLS, React 19 + shadcn + TanStack Query, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-16-unified-evidence-design.md`

## Global Constraints

- **No self-verification**: `reviewEvidence` rejects a caller whose id matches the evidence's own `createdBy`, enforced in both `FakeNotesStrategy` and `SupabaseNotesStrategy` — never only a disabled client button.
- **Rejection requires a reason**: `reviewEvidence(id, reviewerId, 'rejected', reviewNotes)` throws `evidence_review_notes_required` if `reviewNotes` is missing. Approval (`'verified'`) never requires notes.
- **`PATCH` never changes `verificationStatus`** — metadata edits and status review are separate operations with separate routes.
- **Hard `DELETE`, no soft-delete** — new capability, no existing behavior to preserve here.
- **`createdBy` is captured server-side from the authenticated caller** (`this.uid(req)` at the gateway), never trusted from the request body.
- **New PATCH/DELETE/review gateway routes use `checkOrgAccess(org, 'update'/'delete')`** (the shared CASL helper at `apps/api/src/app/notes/notes.controller.ts:1650` — org creator or `role: admin`), resolving `orgId` from the evidence row itself (`evidence.orgId`), never a client-supplied query param.
- **Follow existing snake_case/RLS conventions exactly** — the `asset_id` migration mirrors the `risk_id` migration (`supabase/migrations/20260912000002_risk_register.sql:257-295`) structurally: add column, drop+recreate the `requirement_evidence_check` CHECK constraint, drop+recreate the `"users manage own evidence"` RLS policy with a new `with check` branch.
- **`EvidencePanel` is one component used by all 5 surfaces**, parameterized by an owner descriptor — not five copies with a shared name.

---

## Task 1: Data model — types, migration, Fake strategy

**Files:**
- Modify: `libs/shared/src/strategies/notes.ts:231-250` (RequirementEvidence type), `:1176-1252` (DBStrategy interface evidence methods)
- Modify: `libs/shared/src/strategies/fakes/fake-notes.ts` (evidence methods, scattered — see below)
- Create: `supabase/migrations/20260916000001_evidence_asset_and_review.sql`
- Test: `libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts`

**Interfaces:**
- Produces: `RequirementEvidence.assetId?: string`, `.createdBy: string`, `.verifiedBy: string | null`, `.verifiedAt: string | null`. `DBStrategy.createAssetEvidence(orgId, assetId, data)`, `.listAssetEvidence(assetId)`, `.updateEvidence(id, patch)`, `.deleteEvidence(id)`, `.reviewEvidence(id, reviewerId, decision, reviewNotes?)`, `.getEvidence(id)`. `EvidencePatch` type (metadata-only, no `verificationStatus`).

- [ ] **Step 1: Extend `RequirementEvidence` and add `EvidencePatch`**

In `libs/shared/src/strategies/notes.ts`, replace the existing interface at line 231:

```ts
export interface RequirementEvidence {
  id: string;
  orgId?: string;
  controlId?: string;
  riskId?: string;
  assessmentItemId?: string;
  frameworkId?: string;
  requirementId?: string;
  assetId?: string;
  title: string;
  owner: string;
  evidenceType: string;
  source: string;
  collectionDate: string;
  periodCovered: string;
  expirationDate: string;
  verificationStatus: 'verified' | 'pending_review' | 'rejected' | 'expired';
  url?: string;
  createdBy: string;
  verifiedBy: string | null;
  verifiedAt: string | null;
  linkedControls?: string[];
  linkedRequirements?: string[];
}

export interface EvidencePatch {
  title?: string;
  owner?: string;
  evidenceType?: string;
  source?: string;
  collectionDate?: string;
  periodCovered?: string;
  expirationDate?: string;
  url?: string;
}
```

- [ ] **Step 2: Add the new `DBStrategy` methods**

In the same file, immediately after the existing `createAssessmentItemEvidence` signature (around line 1252), add:

```ts
  createAssetEvidence(
    orgId: string,
    assetId: string,
    data: Omit<RequirementEvidence, 'id' | 'assetId'>,
  ): Promise<RequirementEvidence>;
  listAssetEvidence(assetId: string): Promise<RequirementEvidence[]>;
  getEvidence(id: string): Promise<RequirementEvidence | null>;
  updateEvidence(id: string, patch: EvidencePatch): Promise<RequirementEvidence>;
  deleteEvidence(id: string): Promise<void>;
  reviewEvidence(
    id: string,
    reviewerId: string,
    decision: 'verified' | 'rejected',
    reviewNotes?: string,
  ): Promise<RequirementEvidence>;
```

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260916000001_evidence_asset_and_review.sql`:

```sql
-- Evidence gains assetId as a sixth possible owner (control_id, framework_id,
-- risk_id, assessment_item_id already exist from prior migrations), plus
-- real actor tracking for who created and who verified/rejected an item.
alter table public.requirement_evidence
  add column asset_id uuid references public.assets(id) on delete cascade;

alter table public.requirement_evidence
  add column created_by uuid;

alter table public.requirement_evidence
  add column verified_by uuid;

alter table public.requirement_evidence
  add column verified_at timestamptz;

alter table public.requirement_evidence drop constraint if exists requirement_evidence_check;
alter table public.requirement_evidence
  add constraint requirement_evidence_check
  check (
    control_id is not null
    or framework_id is not null
    or risk_id is not null
    or assessment_item_id is not null
    or asset_id is not null
  );

create index requirement_evidence_asset_idx on public.requirement_evidence(asset_id);

-- Recreate "users manage own evidence" with an added asset_id branch,
-- reproducing the existing org_id/control_id/risk_id/assessment_item_id
-- structure as-is.
drop policy if exists "users manage own evidence" on public.requirement_evidence;

create policy "users manage own evidence"
  on public.requirement_evidence for all
  using (
    exists (select 1 from public.org_profiles o where o.id = org_id and o.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.org_profiles o where o.id = org_id and o.user_id = auth.uid())
    and (
      control_id is null
      or exists (
        select 1 from public.internal_controls c
        where c.id = control_id and c.org_id = requirement_evidence.org_id
      )
    )
    and (
      risk_id is null
      or exists (
        select 1 from public.risks r
        where r.id = requirement_evidence.risk_id and r.org_id = requirement_evidence.org_id
      )
    )
    and (
      assessment_item_id is null
      or exists (
        select 1 from public.risk_assessment_items rai
        join public.risk_assessments ra on ra.id = rai.assessment_id
        where rai.id = requirement_evidence.assessment_item_id
          and ra.org_id = requirement_evidence.org_id
      )
    )
    and (
      asset_id is null
      or exists (
        select 1 from public.assets a
        where a.id = requirement_evidence.asset_id and a.org_id = requirement_evidence.org_id
      )
    )
  );
```

- [ ] **Step 4: Write failing Fake-strategy contract tests**

In `libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts`, find the existing evidence-adjacent describe blocks (search for `createControlEvidence` to locate them) and add a new `describe('unified evidence', ...)` block after them:

```ts
describe('unified evidence', () => {
  let s: FakeNotesStrategy;
  beforeEach(() => {
    s = new FakeNotesStrategy();
  });

  it('creates and lists evidence scoped to an asset', async () => {
    const ev = await s.createAssetEvidence('org1', 'asset-1', {
      title: 'Firewall config export',
      owner: 'Network Team',
      evidenceType: 'config',
      source: 'internal',
      collectionDate: '2026-09-01T00:00:00.000Z',
      periodCovered: '2026-Q3',
      expirationDate: '2027-09-01T00:00:00.000Z',
      verificationStatus: 'pending_review',
      createdBy: 'user-1',
      verifiedBy: null,
      verifiedAt: null,
    });
    expect(ev.assetId).toBe('asset-1');
    expect(ev.createdBy).toBe('user-1');
    const list = await s.listAssetEvidence('asset-1');
    expect(list.map((e) => e.id)).toEqual([ev.id]);
  });

  it('updates evidence metadata without touching verificationStatus', async () => {
    const ev = await s.createControlEvidence('org1', 'control-1', {
      title: 'Old title',
      owner: 'IT',
      evidenceType: 'screenshot',
      source: 'internal',
      collectionDate: '2026-09-01T00:00:00.000Z',
      periodCovered: '2026-Q3',
      expirationDate: '2027-09-01T00:00:00.000Z',
      verificationStatus: 'pending_review',
      createdBy: 'user-1',
      verifiedBy: null,
      verifiedAt: null,
    });
    const updated = await s.updateEvidence(ev.id, {
      title: 'New title',
      verificationStatus: 'verified',
    } as never);
    expect(updated.title).toBe('New title');
    expect(updated.verificationStatus).toBe('pending_review');
  });

  it('deletes evidence', async () => {
    const ev = await s.createControlEvidence('org1', 'control-1', {
      title: 'T',
      owner: 'IT',
      evidenceType: 'doc',
      source: 'internal',
      collectionDate: '2026-09-01T00:00:00.000Z',
      periodCovered: '2026-Q3',
      expirationDate: '2027-09-01T00:00:00.000Z',
      verificationStatus: 'pending_review',
      createdBy: 'user-1',
      verifiedBy: null,
      verifiedAt: null,
    });
    await s.deleteEvidence(ev.id);
    expect(await s.getEvidence(ev.id)).toBeNull();
  });

  it('verifies evidence, recording reviewer and timestamp', async () => {
    const ev = await s.createControlEvidence('org1', 'control-1', {
      title: 'T',
      owner: 'IT',
      evidenceType: 'doc',
      source: 'internal',
      collectionDate: '2026-09-01T00:00:00.000Z',
      periodCovered: '2026-Q3',
      expirationDate: '2027-09-01T00:00:00.000Z',
      verificationStatus: 'pending_review',
      createdBy: 'user-1',
      verifiedBy: null,
      verifiedAt: null,
    });
    const reviewed = await s.reviewEvidence(ev.id, 'reviewer-1', 'verified');
    expect(reviewed.verificationStatus).toBe('verified');
    expect(reviewed.verifiedBy).toBe('reviewer-1');
    expect(reviewed.verifiedAt).not.toBeNull();
  });

  it('rejects self-verification', async () => {
    const ev = await s.createControlEvidence('org1', 'control-1', {
      title: 'T',
      owner: 'IT',
      evidenceType: 'doc',
      source: 'internal',
      collectionDate: '2026-09-01T00:00:00.000Z',
      periodCovered: '2026-Q3',
      expirationDate: '2027-09-01T00:00:00.000Z',
      verificationStatus: 'pending_review',
      createdBy: 'user-1',
      verifiedBy: null,
      verifiedAt: null,
    });
    await expect(s.reviewEvidence(ev.id, 'user-1', 'verified')).rejects.toThrow(
      'evidence_self_review_forbidden',
    );
  });

  it('requires reviewNotes on rejection', async () => {
    const ev = await s.createControlEvidence('org1', 'control-1', {
      title: 'T',
      owner: 'IT',
      evidenceType: 'doc',
      source: 'internal',
      collectionDate: '2026-09-01T00:00:00.000Z',
      periodCovered: '2026-Q3',
      expirationDate: '2027-09-01T00:00:00.000Z',
      verificationStatus: 'pending_review',
      createdBy: 'user-1',
      verifiedBy: null,
      verifiedAt: null,
    });
    await expect(s.reviewEvidence(ev.id, 'reviewer-1', 'rejected')).rejects.toThrow(
      'evidence_review_notes_required',
    );
    const rejected = await s.reviewEvidence(ev.id, 'reviewer-1', 'rejected', 'Not sufficient');
    expect(rejected.verificationStatus).toBe('rejected');
  });
});
```

- [ ] **Step 5: Run tests to verify they fail**

Run: `yarn nx test shared --skip-nx-cache -t "unified evidence"`
Expected: FAIL — `createAssetEvidence`/`updateEvidence`/`deleteEvidence`/`reviewEvidence`/`getEvidence` not defined on `FakeNotesStrategy`, and `createdBy`/`verifiedBy`/`verifiedAt` missing from every existing evidence-creating call in the test file's fixtures compiling against the new required type fields (TS will also flag the 4 existing `create*Evidence` call sites across the whole `fake-notes.contract.unit.test.ts` file, since `createdBy` is now required — Step 6 fixes this).

- [ ] **Step 6: Implement in `FakeNotesStrategy`**

In `libs/shared/src/strategies/fakes/fake-notes.ts`, the backing store is `private evidence: RequirementEvidence[] = [];` (line 112). Update the 4 existing create methods to accept and stamp `createdBy` (it's already part of `data` since the type now requires it — no signature change needed, just confirm nothing strips it). Then add, near `createAssessmentItemEvidence`:

```ts
  async createAssetEvidence(
    orgId: string,
    assetId: string,
    data: Omit<RequirementEvidence, 'id' | 'assetId'>,
  ): Promise<RequirementEvidence> {
    const ev: RequirementEvidence = {
      id: `ev-${globalThis.crypto.randomUUID().slice(0, 8)}`,
      orgId,
      assetId,
      ...data,
    };
    this.evidence.unshift(ev);
    return ev;
  }

  async listAssetEvidence(assetId: string): Promise<RequirementEvidence[]> {
    return this.evidence.filter((e) => e.assetId === assetId);
  }

  async getEvidence(id: string): Promise<RequirementEvidence | null> {
    return this.evidence.find((e) => e.id === id) ?? null;
  }

  async updateEvidence(id: string, patch: EvidencePatch): Promise<RequirementEvidence> {
    const ev = this.evidence.find((e) => e.id === id);
    if (!ev) throw new Error(`evidence_not_found: ${id}`);
    Object.assign(ev, patch);
    return ev;
  }

  async deleteEvidence(id: string): Promise<void> {
    this.evidence = this.evidence.filter((e) => e.id !== id);
  }

  async reviewEvidence(
    id: string,
    reviewerId: string,
    decision: 'verified' | 'rejected',
    reviewNotes?: string,
  ): Promise<RequirementEvidence> {
    const ev = this.evidence.find((e) => e.id === id);
    if (!ev) throw new Error(`evidence_not_found: ${id}`);
    if (ev.createdBy === reviewerId) {
      throw new Error('evidence_self_review_forbidden');
    }
    if (decision === 'rejected' && !reviewNotes) {
      throw new Error('evidence_review_notes_required');
    }
    ev.verificationStatus = decision;
    ev.verifiedBy = reviewerId;
    ev.verifiedAt = new Date().toISOString();
    return ev;
  }
```

`updateEvidence`'s `Object.assign(ev, patch)` is safe here specifically because `EvidencePatch` (Step 1) has no `verificationStatus` field — TypeScript already prevents a caller from smuggling a status change through the type; there's nothing further to strip at runtime.

- [ ] **Step 7: Fix the 4 existing evidence-creating call sites' fixtures across the test file**

Every existing call to `createControlEvidence`/`createFrameworkEvidence`/`createRiskEvidence`/`createAssessmentItemEvidence` in `fake-notes.contract.unit.test.ts` (search for these 4 names) now fails to type-check because the object literal passed as `data` is missing the 3 new required fields. Add `createdBy: 'user-1', verifiedBy: null, verifiedAt: null,` to each existing evidence-creation object literal in this file (not the ones you just added in Step 4, which already have them).

- [ ] **Step 8: Run tests to verify they pass**

Run: `yarn nx test shared --skip-nx-cache`
Expected: PASS, all tests including the 6 new ones and every pre-existing evidence test with its fixture fixed.

- [ ] **Step 9: Lint, build, commit**

```bash
npx prettier --write libs/shared/src/strategies/notes.ts libs/shared/src/strategies/fakes/fake-notes.ts libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts supabase/migrations/20260916000001_evidence_asset_and_review.sql
yarn nx lint shared
yarn nx build shared
git add libs/shared/src/strategies/notes.ts libs/shared/src/strategies/fakes/fake-notes.ts libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts supabase/migrations/20260916000001_evidence_asset_and_review.sql
git commit -m "feat(evidence): add asset owner, actor tracking, CRUD, and review to RequirementEvidence"
```

---

## Task 2: Supabase strategy

**Files:**
- Modify: `apps/microservices/notes/src/app/supabase-notes.strategy.ts` (evidence section — `evidenceInsertPayload`/`toRequirementEvidence` at lines 463-556, `createRiskEvidence`/`createAssessmentItemEvidence` at lines 3424-3463)

**Interfaces:**
- Consumes: `RequirementEvidence`, `EvidencePatch` from Task 1.
- Produces: `SupabaseNotesStrategy.createAssetEvidence/listAssetEvidence/getEvidence/updateEvidence/deleteEvidence/reviewEvidence` matching Task 1's `DBStrategy` signatures exactly.

- [ ] **Step 1: Update `evidenceInsertPayload` and `toRequirementEvidence`**

Replace both private methods (around line 511-556) with:

```ts
  private evidenceInsertPayload(
    orgId: string,
    data: Omit<RequirementEvidence, 'id'>,
  ): Record<string, unknown> {
    return {
      org_id: orgId,
      framework_id: data.frameworkId ?? null,
      requirement_id: data.requirementId ?? null,
      title: data.title,
      owner: data.owner,
      evidence_type: data.evidenceType,
      source: data.source,
      collection_date: data.collectionDate || new Date().toISOString(),
      period_covered: data.periodCovered,
      expiration_date: data.expirationDate || null,
      verification_status: data.verificationStatus,
      url: data.url ?? null,
      created_by: data.createdBy,
    };
  }

  private toRequirementEvidence(row: Record<string, unknown>): RequirementEvidence {
    return {
      id: row['id'] as string,
      orgId: row['org_id'] as string,
      controlId: row['control_id'] as string | undefined,
      frameworkId: row['framework_id'] as string | undefined,
      requirementId: row['requirement_id'] as string | undefined,
      riskId: row['risk_id'] as string | undefined,
      assessmentItemId: row['assessment_item_id'] as string | undefined,
      assetId: row['asset_id'] as string | undefined,
      title: row['title'] as string,
      owner: row['owner'] as string,
      evidenceType: row['evidence_type'] as string,
      source: row['source'] as string,
      collectionDate: row['collection_date'] as string,
      periodCovered: row['period_covered'] as string,
      expirationDate: row['expiration_date'] as string,
      verificationStatus: row['verification_status'] as RequirementEvidence['verificationStatus'],
      url: row['url'] as string | undefined,
      createdBy: row['created_by'] as string,
      verifiedBy: (row['verified_by'] as string | null) ?? null,
      verifiedAt: (row['verified_at'] as string | null) ?? null,
    };
  }
```

- [ ] **Step 2: Add `createAssetEvidence`/`listAssetEvidence`**

Immediately after `createAssessmentItemEvidence` (around line 3463), add:

```ts
  async listAssetEvidence(assetId: string): Promise<RequirementEvidence[]> {
    const { data, error } = await this.db
      .from('requirement_evidence')
      .select('*')
      .eq('asset_id', assetId);
    return ok(data, error).map((row) => this.toRequirementEvidence(row));
  }

  async createAssetEvidence(
    orgId: string,
    assetId: string,
    data: Omit<RequirementEvidence, 'id' | 'assetId'>,
  ): Promise<RequirementEvidence> {
    const { data: row, error } = await this.db
      .from('requirement_evidence')
      .insert({ ...this.evidenceInsertPayload(orgId, data), asset_id: assetId })
      .select()
      .single();
    return this.toRequirementEvidence(ok(row, error));
  }
```

- [ ] **Step 3: Add `getEvidence`/`updateEvidence`/`deleteEvidence`/`reviewEvidence`**

Immediately after the methods added in Step 2, add:

```ts
  private async getEvidenceOrThrow(id: string): Promise<RequirementEvidence> {
    const { data, error } = await this.db
      .from('requirement_evidence')
      .select('*')
      .eq('id', id)
      .single();
    return this.toRequirementEvidence(ok(data, error));
  }

  async getEvidence(id: string): Promise<RequirementEvidence | null> {
    const { data, error } = await this.db
      .from('requirement_evidence')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? this.toRequirementEvidence(data) : null;
  }

  async updateEvidence(id: string, patch: EvidencePatch): Promise<RequirementEvidence> {
    const payload: Record<string, unknown> = {};
    if (patch.title !== undefined) payload['title'] = patch.title;
    if (patch.owner !== undefined) payload['owner'] = patch.owner;
    if (patch.evidenceType !== undefined) payload['evidence_type'] = patch.evidenceType;
    if (patch.source !== undefined) payload['source'] = patch.source;
    if (patch.collectionDate !== undefined) payload['collection_date'] = patch.collectionDate;
    if (patch.periodCovered !== undefined) payload['period_covered'] = patch.periodCovered;
    if (patch.expirationDate !== undefined) payload['expiration_date'] = patch.expirationDate;
    if (patch.url !== undefined) payload['url'] = patch.url;
    const { data, error } = await this.db
      .from('requirement_evidence')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    return this.toRequirementEvidence(ok(data, error));
  }

  async deleteEvidence(id: string): Promise<void> {
    const { error } = await this.db.from('requirement_evidence').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  async reviewEvidence(
    id: string,
    reviewerId: string,
    decision: 'verified' | 'rejected',
    reviewNotes?: string,
  ): Promise<RequirementEvidence> {
    const current = await this.getEvidenceOrThrow(id);
    if (current.createdBy === reviewerId) {
      throw new Error('evidence_self_review_forbidden');
    }
    if (decision === 'rejected' && !reviewNotes) {
      throw new Error('evidence_review_notes_required');
    }
    const { data, error } = await this.db
      .from('requirement_evidence')
      .update({
        verification_status: decision,
        verified_by: reviewerId,
        verified_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    return this.toRequirementEvidence(ok(data, error));
  }
```

`updateEvidence`'s explicit field-by-field payload construction (rather than spreading `patch` directly) is deliberate: it's the same defense as `EvidencePatch`'s type shape, applied again at the DB-write boundary, so a future change to `EvidencePatch` can't silently smuggle a new column through `updateEvidence` without an explicit line here acknowledging it.

- [ ] **Step 4: Lint and build (no dedicated unit tests — this codebase has none for `SupabaseNotesStrategy`, verified via build/lint only, matching every prior phase's convention for this file)**

```bash
npx prettier --write apps/microservices/notes/src/app/supabase-notes.strategy.ts
yarn nx lint notes
yarn nx build notes
```

- [ ] **Step 5: Commit**

```bash
git add apps/microservices/notes/src/app/supabase-notes.strategy.ts
git commit -m "feat(evidence): implement asset owner, CRUD, and review in SupabaseNotesStrategy"
```

---

## Task 3: Notes microservice controller + notes-client

**Files:**
- Modify: `apps/microservices/notes/src/app/notes.controller.ts` (add handlers near existing evidence handlers, e.g. after line 268's `createControlEvidence` handler and after line 3463-equivalent assessment-item block)
- Modify: `libs/notes-client/src/lib/notes-client.service.ts` (mirror)

**Interfaces:**
- Consumes: `DBStrategy` methods from Task 1/2.
- Produces: `@MessagePattern` names `notes.assets.evidence.list`, `notes.assets.evidence.create`, `notes.evidence.get`, `notes.evidence.update`, `notes.evidence.delete`, `notes.evidence.review`; matching `NotesClientService` methods `listAssetEvidence`, `createAssetEvidence`, `getEvidence`, `updateEvidence`, `deleteEvidence`, `reviewEvidence`.

This task is pure transcription — every method here follows the exact shape of the 8 existing evidence `@MessagePattern`/`notes-client` pairs already in these two files (e.g. `notes.internal-controls.evidence.list`/`.create` at `notes.controller.ts:187-197` and `notes-client.service.ts:199-209`).

- [ ] **Step 1: Add MS controller handlers**

In `apps/microservices/notes/src/app/notes.controller.ts`, add near the existing asset handlers (search for `notes.assets.list`):

```ts
  @MessagePattern('notes.assets.evidence.list')
  listAssetEvidence(@Payload() payload: { assetId: string }): Promise<RequirementEvidence[]> {
    return this.strategy.listAssetEvidence(payload.assetId);
  }

  @MessagePattern('notes.assets.evidence.create')
  createAssetEvidence(
    @Payload()
    payload: { orgId: string; assetId: string; data: Omit<RequirementEvidence, 'id' | 'assetId'> },
  ): Promise<RequirementEvidence> {
    return this.strategy.createAssetEvidence(payload.orgId, payload.assetId, payload.data);
  }

  @MessagePattern('notes.evidence.get')
  getEvidence(@Payload() payload: { id: string }): Promise<RequirementEvidence | null> {
    return this.strategy.getEvidence(payload.id);
  }

  @MessagePattern('notes.evidence.update')
  updateEvidence(
    @Payload() payload: { id: string; patch: EvidencePatch },
  ): Promise<RequirementEvidence> {
    return this.strategy.updateEvidence(payload.id, payload.patch);
  }

  @MessagePattern('notes.evidence.delete')
  deleteEvidence(@Payload() payload: { id: string }): Promise<void> {
    return this.strategy.deleteEvidence(payload.id);
  }

  @MessagePattern('notes.evidence.review')
  reviewEvidence(
    @Payload()
    payload: {
      id: string;
      reviewerId: string;
      decision: 'verified' | 'rejected';
      reviewNotes?: string;
    },
  ): Promise<RequirementEvidence> {
    return this.strategy.reviewEvidence(
      payload.id,
      payload.reviewerId,
      payload.decision,
      payload.reviewNotes,
    );
  }
```

Add `EvidencePatch` to this file's existing `@icore/shared` type import list.

- [ ] **Step 2: Add matching `notes-client` methods**

In `libs/notes-client/src/lib/notes-client.service.ts`, add near the existing asset methods:

```ts
  listAssetEvidence(assetId: string): Promise<RequirementEvidence[]> {
    return signedSend<RequirementEvidence[]>(this.client, 'notes.assets.evidence.list', {
      assetId,
    });
  }

  createAssetEvidence(
    orgId: string,
    assetId: string,
    data: Omit<RequirementEvidence, 'id' | 'assetId'>,
  ): Promise<RequirementEvidence> {
    return signedSend<RequirementEvidence>(this.client, 'notes.assets.evidence.create', {
      orgId,
      assetId,
      data,
    });
  }

  getEvidence(id: string): Promise<RequirementEvidence | null> {
    return signedSend<RequirementEvidence | null>(this.client, 'notes.evidence.get', { id });
  }

  updateEvidence(id: string, patch: EvidencePatch): Promise<RequirementEvidence> {
    return signedSend<RequirementEvidence>(this.client, 'notes.evidence.update', { id, patch });
  }

  deleteEvidence(id: string): Promise<void> {
    return signedSend<void>(this.client, 'notes.evidence.delete', { id });
  }

  reviewEvidence(
    id: string,
    reviewerId: string,
    decision: 'verified' | 'rejected',
    reviewNotes?: string,
  ): Promise<RequirementEvidence> {
    return signedSend<RequirementEvidence>(this.client, 'notes.evidence.review', {
      id,
      reviewerId,
      decision,
      reviewNotes,
    });
  }
```

Add `EvidencePatch` to this file's existing `@icore/shared` type import list.

- [ ] **Step 3: Lint and build**

```bash
npx prettier --write apps/microservices/notes/src/app/notes.controller.ts libs/notes-client/src/lib/notes-client.service.ts
yarn nx lint notes
yarn nx lint notes-client
yarn nx build notes
yarn nx build notes-client
```

- [ ] **Step 4: Commit**

```bash
git add apps/microservices/notes/src/app/notes.controller.ts libs/notes-client/src/lib/notes-client.service.ts
git commit -m "feat(evidence): wire asset evidence and CRUD/review through notes MS and notes-client"
```

---

## Task 4: Gateway routes

**Files:**
- Modify: `apps/api/src/app/notes/notes.controller.ts` (new routes near existing evidence routes; `createdBy` stamping added to the 4 existing create routes)
- Create: `apps/api/src/app/notes/__tests__/evidence.controller.unit.test.ts`

**Interfaces:**
- Consumes: `NotesClientService` methods from Task 3; `checkOrgAccess` (existing private method, line 1650).
- Produces: `POST/GET assets/:id/evidence`, `PATCH/DELETE notes/evidence/:id`, `POST notes/evidence/:id/review`.

- [ ] **Step 1: Stamp `createdBy` on the 4 existing create routes**

In `apps/api/src/app/notes/notes.controller.ts`, each of the 4 existing evidence create routes (`createControlEvidence` ~line 260, `createFrameworkEvidence` ~line 460, `createRiskEvidence` ~line 1235, `createAssessmentItemEvidence` ~line 1445) currently builds its `body`/call without capturing the caller. Change each to call `this.uid(req)` and pass it through as `createdBy` on the data object, e.g. for `createControlEvidence`:

```ts
  @Post('internal-controls/:id/evidence')
  createControlEvidence(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: Omit<RequirementEvidence, 'id' | 'controlId' | 'createdBy'>,
  ) {
    const userId = this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    return this.notes.createControlEvidence(orgId, id, { ...body, createdBy: userId });
  }
```

Apply the equivalent `{ ...body, createdBy: userId }` change to `createFrameworkEvidence`, `createRiskEvidence`, and `createAssessmentItemEvidence`, narrowing each route's `@Body()` type to also omit `createdBy` (matching the pattern above: `Omit<RequirementEvidence, 'id' | '<ownerField>' | 'createdBy'>`, or just `Omit<RequirementEvidence, 'id' | 'createdBy'>` for `createFrameworkEvidence` which has no owner-field omission today).

- [ ] **Step 2: Add asset evidence routes**

Add near the existing asset routes (search for `@Get('assets')`):

```ts
  @Get('assets/:id/evidence')
  @ApiOperation({ summary: 'List evidence attached to an asset' })
  async listAssetEvidence(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
  ) {
    this.uid(req);
    return this.notes.listAssetEvidence(id);
  }

  @Post('assets/:id/evidence')
  @ApiOperation({ summary: 'Attach evidence to an asset' })
  async createAssetEvidence(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: Omit<RequirementEvidence, 'id' | 'assetId' | 'createdBy'>,
  ) {
    const userId = this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    return this.notes.createAssetEvidence(orgId, id, { ...body, createdBy: userId });
  }
```

- [ ] **Step 3: Add `PATCH`/`DELETE`/review routes**

Add near the above:

```ts
  @Patch('evidence/:id')
  @ApiOperation({ summary: 'Edit evidence metadata' })
  async updateEvidence(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() patch: EvidencePatch,
  ) {
    const evidence = await this.notes.getEvidence(id);
    if (!evidence || !evidence.orgId) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(evidence.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.updateEvidence(id, patch);
  }

  @Delete('evidence/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete evidence' })
  async deleteEvidence(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    const evidence = await this.notes.getEvidence(id);
    if (!evidence || !evidence.orgId) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(evidence.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'delete');
    return this.notes.deleteEvidence(id);
  }

  @Post('evidence/:id/review')
  @ApiOperation({ summary: 'Verify or reject evidence' })
  async reviewEvidence(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: { decision: 'verified' | 'rejected'; reviewNotes?: string },
  ) {
    const userId = this.uid(req);
    const evidence = await this.notes.getEvidence(id);
    if (!evidence || !evidence.orgId) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(evidence.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.reviewEvidence(id, userId, body.decision, body.reviewNotes);
  }
```

Add `HttpCode`, `Patch`, `Delete` to this file's existing `@nestjs/common` import list if not already present (check the top of the file — `Delete`/`HttpCode` are already used by `deleteException`, confirm `Patch` is imported too since `updateException`/other PATCH routes already exist).

- [ ] **Step 4: Write gateway controller unit tests**

Create `apps/api/src/app/notes/__tests__/evidence.controller.unit.test.ts`, modeled directly on `exceptions.controller.unit.test.ts`'s structure (same `reqAs`/`reqAsAdmin` helpers, same `makeController` helper):

```ts
import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import type { AiClientService } from '@icore/ai-client';
import type { NotesClientService } from '@icore/notes-client';
import type { Organization, RequirementEvidence, VerifiedToken } from '@icore/shared';
import { NotesController } from '../notes.controller';
import { AbilityFactory } from '../../abilities/ability.factory';
import type { StandardsQueueService } from '../standards-queue.service';

const ORG: Organization = {
  id: 'org-1',
  userId: 'org-creator',
  name: 'Acme',
} as unknown as Organization;

const EVIDENCE: RequirementEvidence = {
  id: 'evidence-1',
  orgId: 'org-1',
  controlId: 'control-1',
  title: 'Firewall config',
  owner: 'IT',
  evidenceType: 'config',
  source: 'internal',
  collectionDate: '2026-09-01T00:00:00Z',
  periodCovered: '2026-Q3',
  expirationDate: '2027-09-01T00:00:00Z',
  verificationStatus: 'pending_review',
  createdBy: 'creator-1',
  verifiedBy: null,
  verifiedAt: null,
} as unknown as RequirementEvidence;

function makeNotes(overrides: Partial<NotesClientService> = {}): NotesClientService {
  return {
    getEvidence: vi.fn().mockResolvedValue(EVIDENCE),
    getOrganizationById: vi.fn().mockResolvedValue(ORG),
    updateEvidence: vi.fn().mockResolvedValue({ ...EVIDENCE, title: 'Updated' }),
    deleteEvidence: vi.fn().mockResolvedValue(undefined),
    reviewEvidence: vi.fn().mockResolvedValue({ ...EVIDENCE, verificationStatus: 'verified' }),
    ...overrides,
  } as unknown as NotesClientService;
}

function makeController(notes: NotesClientService): NotesController {
  return new NotesController(
    notes,
    {} as unknown as AiClientService,
    new AbilityFactory(),
    {} as unknown as StandardsQueueService,
  );
}

function reqAs(uid: string): Request & { user?: VerifiedToken } {
  return { user: { uid } as VerifiedToken } as Request & { user?: VerifiedToken };
}

function reqAsAdmin(uid: string): Request & { user?: VerifiedToken } {
  return { user: { uid, role: 'admin' } as VerifiedToken } as Request & { user?: VerifiedToken };
}

describe('NotesController — evidence authorization', () => {
  describe('updateEvidence', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).updateEvidence(reqAs('outsider'), 'evidence-1', { title: 'X' }),
      ).rejects.toThrow(ForbiddenException);
      expect(notes.updateEvidence).not.toHaveBeenCalled();
    });

    it('allows the org creator', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).updateEvidence(reqAs('org-creator'), 'evidence-1', {
          title: 'Updated',
        }),
      ).resolves.toMatchObject({ title: 'Updated' });
    });

    it('throws NotFound when the evidence does not exist', async () => {
      const notes = makeNotes({ getEvidence: vi.fn().mockResolvedValue(null) });
      await expect(
        makeController(notes).updateEvidence(reqAs('org-creator'), 'missing', { title: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteEvidence', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).deleteEvidence(reqAs('outsider'), 'evidence-1'),
      ).rejects.toThrow(ForbiddenException);
      expect(notes.deleteEvidence).not.toHaveBeenCalled();
    });

    it('allows an admin who is not the org creator', async () => {
      const notes = makeNotes();
      await makeController(notes).deleteEvidence(reqAsAdmin('platform-admin'), 'evidence-1');
      expect(notes.deleteEvidence).toHaveBeenCalledWith('evidence-1');
    });
  });

  describe('reviewEvidence', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).reviewEvidence(reqAs('outsider'), 'evidence-1', {
          decision: 'verified',
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(notes.reviewEvidence).not.toHaveBeenCalled();
    });

    it('lets the org creator review evidence they did not create', async () => {
      const notes = makeNotes();
      await makeController(notes).reviewEvidence(reqAs('org-creator'), 'evidence-1', {
        decision: 'verified',
      });
      expect(notes.reviewEvidence).toHaveBeenCalledWith(
        'evidence-1',
        'org-creator',
        'verified',
        undefined,
      );
    });

    it('propagates the strategy-level self-review check unswallowed', async () => {
      const notes = makeNotes({
        reviewEvidence: vi.fn().mockRejectedValue(new Error('evidence_self_review_forbidden')),
      });
      await expect(
        makeController(notes).reviewEvidence(reqAs('org-creator'), 'evidence-1', {
          decision: 'verified',
        }),
      ).rejects.toThrow('evidence_self_review_forbidden');
    });

    it('throws NotFound when the evidence does not exist', async () => {
      const notes = makeNotes({ getEvidence: vi.fn().mockResolvedValue(null) });
      await expect(
        makeController(notes).reviewEvidence(reqAs('org-creator'), 'missing', {
          decision: 'verified',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `yarn nx test api --skip-nx-cache`
Expected: PASS, including the new `evidence.controller.unit.test.ts` file and every pre-existing api test.

- [ ] **Step 6: Lint, build, commit**

```bash
npx prettier --write apps/api/src/app/notes/notes.controller.ts apps/api/src/app/notes/__tests__/evidence.controller.unit.test.ts
yarn nx lint api
yarn nx build api
git add apps/api/src/app/notes/notes.controller.ts apps/api/src/app/notes/__tests__/evidence.controller.unit.test.ts
git commit -m "feat(evidence): add asset evidence and PATCH/DELETE/review gateway routes with tests"
```

---

## Task 5: `EvidencePanel` shared component, query hooks, i18n

**Files:**
- Create: `apps/client/src/components/evidence/EvidencePanel.tsx`
- Create: `apps/client/src/components/evidence/__tests__/EvidencePanel.unit.test.tsx`
- Modify: `apps/client/src/queries/assets.ts` (add evidence hooks)
- Create: `apps/client/src/queries/evidence.ts` (owner-agnostic update/delete/review hooks)
- Modify: `libs/template-shared/src/lib/i18n/locales/{en,es,he,ru}.ts`

**Interfaces:**
- Consumes: `RequirementEvidence`, `EvidencePatch` types; the 4 existing per-owner list/create hooks (`useControlEvidence`/`useCreateControlEvidence`, `useFrameworkEvidence`/`useCreateFrameworkEvidence`, `useRiskEvidence`/`useCreateRiskEvidence`, `useAssessmentItemEvidence`/`useCreateAssessmentItemEvidence` — all already exist, unchanged signatures) plus new `useAssetEvidence`/`useCreateAssetEvidence` (this task).
- Produces: `EvidencePanel` component with props `{ orgId: string; ownerType: 'control' | 'framework' | 'risk' | 'assessmentItem' | 'asset'; ownerId: string; requirementFilter?: string; currentUserId: string }`. `useUpdateEvidence()`, `useDeleteEvidence()`, `useReviewEvidence()` (owner-agnostic, keyed by evidence id, invalidate all evidence query keys broadly via `queryKey: ['evidence']` prefix — see Step 3).

- [ ] **Step 1: Narrow the 4 existing create-evidence hooks' input types to exclude `createdBy`**

Task 4 changes the 4 existing gateway create routes (`internal-controls/:id/evidence`, `frameworks/:id/evidence`, `risks/:id/evidence`, `assessments/items/:itemId/evidence`) to inject `createdBy` server-side and narrow their `@Body()` type to omit it — the client must never send it. Update each existing hook's mutation input type to match:

In `apps/client/src/queries/controls.ts`, change `useCreateControlEvidence`'s generic from `Omit<RequirementEvidence, 'id' | 'controlId'>` to `Omit<RequirementEvidence, 'id' | 'controlId' | 'createdBy'>`.

In `apps/client/src/queries/frameworks.ts`, change `useCreateFrameworkEvidence`'s generic from `Omit<RequirementEvidence, 'id'>` to `Omit<RequirementEvidence, 'id' | 'createdBy'>`.

In `apps/client/src/queries/risks.ts`, change `useCreateRiskEvidence`'s generic from `Omit<RequirementEvidence, 'id' | 'riskId'>` to `Omit<RequirementEvidence, 'id' | 'riskId' | 'createdBy'>`.

In `apps/client/src/queries/assessments.ts`, change `useCreateAssessmentItemEvidence`'s generic from `Omit<RequirementEvidence, 'id' | 'assessmentItemId'>` to `Omit<RequirementEvidence, 'id' | 'assessmentItemId' | 'createdBy'>`.

None of these 4 files' `mutationFn` bodies need changes — only the `useMutation<RequirementEvidence, Error, ...>` generic's second-to-last type argument, since the function body just forwards whatever object it's given as JSON.

- [ ] **Step 2: Add asset evidence query hooks**

In `apps/client/src/queries/assets.ts`, add near the existing hooks:

```ts
export function useAssetEvidence(assetId: string) {
  return useQuery<RequirementEvidence[]>({
    queryKey: ['assets', assetId, 'evidence'],
    queryFn: () => api<RequirementEvidence[]>(`/notes/assets/${assetId}/evidence`),
    enabled: !!assetId,
  });
}

export function useCreateAssetEvidence(orgId: string, assetId: string) {
  const qc = useQueryClient();
  return useMutation<RequirementEvidence, Error, Omit<RequirementEvidence, 'id' | 'assetId' | 'createdBy'>>({
    mutationFn: (data) =>
      api<RequirementEvidence>(
        `/notes/assets/${assetId}/evidence?orgId=${encodeURIComponent(orgId)}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assets', assetId, 'evidence'] }),
  });
}
```

Add `RequirementEvidence` to this file's existing `@icore/shared` type import list.

- [ ] **Step 3: Create owner-agnostic update/delete/review hooks**

Create `apps/client/src/queries/evidence.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { EvidencePatch, RequirementEvidence } from '@icore/shared';

export type { EvidencePatch, RequirementEvidence };

export function useUpdateEvidence() {
  const qc = useQueryClient();
  return useMutation<RequirementEvidence, Error, { id: string; patch: EvidencePatch }>({
    mutationFn: ({ id, patch }) =>
      api<RequirementEvidence>(`/notes/evidence/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      }),
    onSuccess: () => qc.invalidateQueries({ predicate: (q) => q.queryKey.includes('evidence') }),
  });
}

export function useDeleteEvidence() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => api<void>(`/notes/evidence/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ predicate: (q) => q.queryKey.includes('evidence') }),
  });
}

export function useReviewEvidence() {
  const qc = useQueryClient();
  return useMutation<
    RequirementEvidence,
    Error,
    { id: string; decision: 'verified' | 'rejected'; reviewNotes?: string }
  >({
    mutationFn: ({ id, decision, reviewNotes }) =>
      api<RequirementEvidence>(`/notes/evidence/${id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, reviewNotes }),
      }),
    onSuccess: () => qc.invalidateQueries({ predicate: (q) => q.queryKey.includes('evidence') }),
  });
}
```

The broad `predicate: (q) => q.queryKey.includes('evidence')` invalidation (rather than a precise per-owner key) is deliberate: `useUpdateEvidence`/`useDeleteEvidence`/`useReviewEvidence` are owner-agnostic by design (`EvidencePanel` calls them the same way regardless of `ownerType`), so they can't know which of the 5 owner-scoped query keys (`['assets', id, 'evidence']`, `['risks', id, 'evidence']`, etc.) to target precisely — invalidating anything with `'evidence'` anywhere in its key is the simple, correct-if-slightly-broader option, and evidence lists are small enough that refetching a few extra ones costs nothing.

- [ ] **Step 4: Write failing `EvidencePanel` tests**

Create `apps/client/src/components/evidence/__tests__/EvidencePanel.unit.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { createIcoreI18n, ICORE_LOCALES } from '@icore/template-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { RequirementEvidence } from '@icore/shared';

let mockEvidence: RequirementEvidence[] = [];
const createMutate = vi.fn();
const updateMutate = vi.fn();
const deleteMutate = vi.fn();
const reviewMutate = vi.fn();

vi.mock('@/queries/controls', () => ({
  useControlEvidence: () => ({ data: mockEvidence }),
  useCreateControlEvidence: () => ({ mutate: createMutate, isPending: false }),
}));

vi.mock('@/queries/evidence', () => ({
  useUpdateEvidence: () => ({ mutate: updateMutate, isPending: false }),
  useDeleteEvidence: () => ({ mutate: deleteMutate, isPending: false }),
  useReviewEvidence: () => ({ mutate: reviewMutate, isPending: false }),
}));

const i18n = createIcoreI18n({ resources: ICORE_LOCALES });

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient();
  return (
    <QueryClientProvider client={qc}>
      <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>
    </QueryClientProvider>
  );
}

const EVIDENCE: RequirementEvidence = {
  id: 'ev-1',
  orgId: 'org1',
  controlId: 'control-1',
  title: 'Firewall config export',
  owner: 'Network Team',
  evidenceType: 'config',
  source: 'internal',
  collectionDate: '2026-09-01T00:00:00.000Z',
  periodCovered: '2026-Q3',
  expirationDate: '2027-09-01T00:00:00.000Z',
  verificationStatus: 'pending_review',
  createdBy: 'creator-1',
  verifiedBy: null,
  verifiedAt: null,
};

describe('EvidencePanel', () => {
  beforeEach(() => {
    mockEvidence = [];
    createMutate.mockClear();
    updateMutate.mockClear();
    deleteMutate.mockClear();
    reviewMutate.mockClear();
  });

  it('renders an empty state with no evidence', async () => {
    const { EvidencePanel } = await import('../EvidencePanel');
    render(
      wrap(
        <EvidencePanel
          orgId="org1"
          ownerType="control"
          ownerId="control-1"
          currentUserId="me"
        />,
      ),
    );
    expect(screen.getByText(/no evidence/i)).toBeTruthy();
  });

  it('renders an evidence item with its verification badge', async () => {
    mockEvidence = [EVIDENCE];
    const { EvidencePanel } = await import('../EvidencePanel');
    render(
      wrap(
        <EvidencePanel
          orgId="org1"
          ownerType="control"
          ownerId="control-1"
          currentUserId="me"
        />,
      ),
    );
    expect(screen.getByText('Firewall config export')).toBeTruthy();
  });

  it('submits the create form with all fields', async () => {
    const { EvidencePanel } = await import('../EvidencePanel');
    render(
      wrap(
        <EvidencePanel
          orgId="org1"
          ownerType="control"
          ownerId="control-1"
          currentUserId="me"
        />,
      ),
    );
    fireEvent.click(screen.getByText(/add evidence/i));
    fireEvent.change(screen.getByPlaceholderText(/title/i), { target: { value: 'New evidence' } });
    fireEvent.click(screen.getByText(/^save$/i));
    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'New evidence', verificationStatus: 'pending_review' }),
      expect.anything(),
    );
  });

  it('shows verify/reject actions only when the current user is not the creator', async () => {
    mockEvidence = [EVIDENCE];
    const { EvidencePanel } = await import('../EvidencePanel');
    const { rerender } = render(
      wrap(
        <EvidencePanel
          orgId="org1"
          ownerType="control"
          ownerId="control-1"
          currentUserId="creator-1"
        />,
      ),
    );
    expect(screen.queryByText(/^verify$/i)).toBeNull();

    rerender(
      wrap(
        <EvidencePanel
          orgId="org1"
          ownerType="control"
          ownerId="control-1"
          currentUserId="someone-else"
        />,
      ),
    );
    expect(screen.getByText(/^verify$/i)).toBeTruthy();
  });

  it('calls delete when the delete action is clicked', async () => {
    mockEvidence = [EVIDENCE];
    const { EvidencePanel } = await import('../EvidencePanel');
    render(
      wrap(
        <EvidencePanel
          orgId="org1"
          ownerType="control"
          ownerId="control-1"
          currentUserId="me"
        />,
      ),
    );
    fireEvent.click(screen.getByText(/delete/i));
    expect(deleteMutate).toHaveBeenCalledWith('ev-1');
  });
});
```

- [ ] **Step 5: Run tests to verify they fail**

Run: `yarn nx test client --skip-nx-cache -t "EvidencePanel"`
Expected: FAIL — `apps/client/src/components/evidence/EvidencePanel.tsx` does not exist yet.

- [ ] **Step 6: Implement `EvidencePanel`**

Create `apps/client/src/components/evidence/EvidencePanel.tsx`:

```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Plus, Trash2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { safeHref } from '@/lib/safe-href';
import type { RequirementEvidence } from '@icore/shared';
import { useControlEvidence, useCreateControlEvidence } from '@/queries/controls';
import { useFrameworkEvidence, useCreateFrameworkEvidence } from '@/queries/frameworks';
import { useRiskEvidence, useCreateRiskEvidence } from '@/queries/risks';
import {
  useAssessmentItemEvidence,
  useCreateAssessmentItemEvidence,
} from '@/queries/assessments';
import { useAssetEvidence, useCreateAssetEvidence } from '@/queries/assets';
import { useUpdateEvidence, useDeleteEvidence, useReviewEvidence } from '@/queries/evidence';

type OwnerType = 'control' | 'framework' | 'risk' | 'assessmentItem' | 'asset';

interface EvidencePanelProps {
  orgId: string;
  ownerType: OwnerType;
  ownerId: string;
  currentUserId: string;
  /** Framework evidence only: narrow the list to items linked to one requirement. */
  requirementFilter?: string;
}

const EMPTY_FORM = {
  title: '',
  owner: '',
  evidenceType: '',
  source: '',
  collectionDate: '',
  periodCovered: '',
  expirationDate: '',
  url: '',
};

function useOwnerEvidence(props: EvidencePanelProps) {
  const control = useControlEvidence(props.ownerType === 'control' ? props.ownerId : '');
  const framework = useFrameworkEvidence(
    props.ownerType === 'framework' ? props.ownerId : '',
    props.orgId,
  );
  const risk = useRiskEvidence(props.ownerType === 'risk' ? props.ownerId : '');
  const assessmentItem = useAssessmentItemEvidence(
    props.ownerType === 'assessmentItem' ? props.ownerId : '',
  );
  const asset = useAssetEvidence(props.ownerType === 'asset' ? props.ownerId : '');

  switch (props.ownerType) {
    case 'control':
      return control.data ?? [];
    case 'framework':
      return (framework.data ?? []).filter(
        (e) => !props.requirementFilter || e.requirementId === props.requirementFilter,
      );
    case 'risk':
      return risk.data ?? [];
    case 'assessmentItem':
      return assessmentItem.data ?? [];
    case 'asset':
      return asset.data ?? [];
  }
}

function useCreateOwnerEvidence(props: EvidencePanelProps) {
  const control = useCreateControlEvidence(props.orgId, props.ownerId);
  const framework = useCreateFrameworkEvidence(props.orgId, props.ownerId);
  const risk = useCreateRiskEvidence(props.orgId, props.ownerId);
  const assessmentItem = useCreateAssessmentItemEvidence(props.orgId, props.ownerId);
  const asset = useCreateAssetEvidence(props.orgId, props.ownerId);

  switch (props.ownerType) {
    case 'control':
      return control;
    case 'framework':
      return framework;
    case 'risk':
      return risk;
    case 'assessmentItem':
      return assessmentItem;
    case 'asset':
      return asset;
  }
}

export function EvidencePanel(props: EvidencePanelProps) {
  const { t } = useTranslation();
  const evidence = useOwnerEvidence(props);
  const createMut = useCreateOwnerEvidence(props);
  const updateMut = useUpdateEvidence();
  const deleteMut = useDeleteEvidence();
  const reviewMut = useReviewEvidence();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);

  function handleCreate() {
    if (!form.title.trim()) return;
    const base = {
      title: form.title,
      owner: form.owner,
      evidenceType: form.evidenceType,
      source: form.source,
      collectionDate: form.collectionDate || new Date().toISOString(),
      periodCovered: form.periodCovered,
      expirationDate: form.expirationDate,
      verificationStatus: 'pending_review' as const,
      url: form.url || undefined,
    };
    const payload =
      props.ownerType === 'framework'
        ? { ...base, frameworkId: props.ownerId, requirementId: props.requirementFilter }
        : base;
    createMut.mutate(payload as never, {
      onSuccess: () => {
        setForm(EMPTY_FORM);
        setOpen(false);
      },
    });
  }

  function handleSaveEdit(id: string) {
    updateMut.mutate(
      {
        id,
        patch: {
          title: form.title,
          owner: form.owner,
          evidenceType: form.evidenceType,
          source: form.source,
          collectionDate: form.collectionDate,
          periodCovered: form.periodCovered,
          expirationDate: form.expirationDate,
          url: form.url || undefined,
        },
      },
      { onSuccess: () => setEditingId(null) },
    );
  }

  function startEdit(e: RequirementEvidence) {
    setEditingId(e.id);
    setForm({
      title: e.title,
      owner: e.owner,
      evidenceType: e.evidenceType,
      source: e.source,
      collectionDate: e.collectionDate,
      periodCovered: e.periodCovered,
      expirationDate: e.expirationDate,
      url: e.url ?? '',
    });
  }

  return (
    <div className="space-y-3">
      {evidence.length === 0 ? (
        <p className="text-xs text-muted-foreground italic bg-muted/20 p-4 rounded border text-center">
          {t('evidence.empty')}
        </p>
      ) : (
        <div className="space-y-2">
          {evidence.map((e) => {
            const href = safeHref(e.url);
            const isEditing = editingId === e.id;
            const canReview = e.createdBy !== props.currentUserId;
            if (isEditing) {
              return (
                <div key={e.id} className="space-y-1.5 border border-border rounded p-2">
                  <Input
                    value={form.title}
                    onChange={(ev) => setForm((f) => ({ ...f, title: ev.target.value }))}
                    placeholder={t('evidence.titlePlaceholder')}
                    className="h-8 text-xs"
                  />
                  <Input
                    value={form.url}
                    onChange={(ev) => setForm((f) => ({ ...f, url: ev.target.value }))}
                    placeholder={t('evidence.urlPlaceholder')}
                    className="h-8 text-xs"
                  />
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" onClick={() => handleSaveEdit(e.id)}>
                      {t('common.save')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                      {t('common.cancel')}
                    </Button>
                  </div>
                </div>
              );
            }
            return (
              <div
                key={e.id}
                className="text-xs border border-border rounded px-3 py-2 space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{e.title}</span>
                  <span className="text-muted-foreground/70">
                    {t(`evidence.status.${e.verificationStatus}`)}
                  </span>
                </div>
                <div className="text-muted-foreground/70">
                  {e.owner} · {e.evidenceType}
                </div>
                {e.url &&
                  (href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted-foreground/70 underline cursor-pointer"
                    >
                      {e.url}
                    </a>
                  ) : (
                    <span className="text-muted-foreground/70">{e.url}</span>
                  ))}
                <div className="flex items-center gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => startEdit(e)}
                    className="text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    {t('common.edit')}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteMut.mutate(e.id)}
                    className="text-muted-foreground hover:text-destructive cursor-pointer"
                  >
                    <Trash2 size={12} className="inline mr-0.5" />
                    {t('common.delete')}
                  </button>
                  {canReview && (
                    <>
                      <button
                        type="button"
                        onClick={() => reviewMut.mutate({ id: e.id, decision: 'verified' })}
                        className="text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        <CheckCircle2 size={12} className="inline mr-0.5" />
                        {t('evidence.verify')}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          reviewMut.mutate({
                            id: e.id,
                            decision: 'rejected',
                            reviewNotes: t('evidence.rejectedByReviewer'),
                          })
                        }
                        className="text-muted-foreground hover:text-destructive cursor-pointer"
                      >
                        <XCircle size={12} className="inline mr-0.5" />
                        {t('evidence.reject')}
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {open ? (
        <div className="space-y-1.5 border border-border rounded p-2">
          <Label className="text-xs">{t('evidence.titlePlaceholder')}</Label>
          <Input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder={t('evidence.titlePlaceholder')}
            className="h-8 text-xs"
          />
          <Input
            value={form.owner}
            onChange={(e) => setForm((f) => ({ ...f, owner: e.target.value }))}
            placeholder={t('evidence.ownerPlaceholder')}
            className="h-8 text-xs"
          />
          <Input
            value={form.evidenceType}
            onChange={(e) => setForm((f) => ({ ...f, evidenceType: e.target.value }))}
            placeholder={t('evidence.typePlaceholder')}
            className="h-8 text-xs"
          />
          <Input
            value={form.source}
            onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
            placeholder={t('evidence.sourcePlaceholder')}
            className="h-8 text-xs"
          />
          <Input
            type="date"
            value={form.collectionDate.slice(0, 10)}
            onChange={(e) => setForm((f) => ({ ...f, collectionDate: e.target.value }))}
            className="h-8 text-xs"
          />
          <Input
            value={form.periodCovered}
            onChange={(e) => setForm((f) => ({ ...f, periodCovered: e.target.value }))}
            placeholder={t('evidence.periodPlaceholder')}
            className="h-8 text-xs"
          />
          <Input
            type="date"
            value={form.expirationDate.slice(0, 10)}
            onChange={(e) => setForm((f) => ({ ...f, expirationDate: e.target.value }))}
            className="h-8 text-xs"
          />
          <Input
            value={form.url}
            onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
            placeholder={t('evidence.urlPlaceholder')}
            className="h-8 text-xs"
          />
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={!form.title.trim() || createMut.isPending}
            >
              {t('common.save')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setOpen(false);
                setForm(EMPTY_FORM);
              }}
            >
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Plus size={14} className="mr-1.5" />
          {t('evidence.addEvidence')}
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `yarn nx test client --skip-nx-cache -t "EvidencePanel"`
Expected: PASS.

- [ ] **Step 8: Add i18n keys to all 4 locales**

In `libs/template-shared/src/lib/i18n/locales/en.ts`, add a new top-level `evidence` key (placed alphabetically, e.g. near `exceptions`):

```ts
  evidence: {
    empty: 'No evidence attached yet.',
    addEvidence: 'Add Evidence',
    titlePlaceholder: 'Evidence title…',
    ownerPlaceholder: 'Owner / team…',
    typePlaceholder: 'Evidence type (e.g. screenshot, config, log)…',
    sourcePlaceholder: 'Source…',
    periodPlaceholder: 'Period covered (e.g. 2026-Q3)…',
    urlPlaceholder: 'Evidence URL (optional)…',
    verify: 'Verify',
    reject: 'Reject',
    rejectedByReviewer: 'Rejected during review',
    status: {
      verified: 'Verified',
      pending_review: 'Pending Review',
      rejected: 'Rejected',
      expired: 'Expired',
    },
  },
```

Add the equivalent block, translated, to `es.ts`, `ru.ts`, `he.ts`:

```ts
// es.ts
  evidence: {
    empty: 'Aún no hay evidencia adjunta.',
    addEvidence: 'Agregar evidencia',
    titlePlaceholder: 'Título de la evidencia…',
    ownerPlaceholder: 'Propietario / equipo…',
    typePlaceholder: 'Tipo de evidencia (ej. captura, configuración, registro)…',
    sourcePlaceholder: 'Fuente…',
    periodPlaceholder: 'Período cubierto (ej. 2026-T3)…',
    urlPlaceholder: 'URL de la evidencia (opcional)…',
    verify: 'Verificar',
    reject: 'Rechazar',
    rejectedByReviewer: 'Rechazada durante la revisión',
    status: {
      verified: 'Verificada',
      pending_review: 'Pendiente de revisión',
      rejected: 'Rechazada',
      expired: 'Expirada',
    },
  },
```

```ts
// ru.ts
  evidence: {
    empty: 'Доказательства ещё не прикреплены.',
    addEvidence: 'Добавить доказательство',
    titlePlaceholder: 'Название доказательства…',
    ownerPlaceholder: 'Владелец / команда…',
    typePlaceholder: 'Тип доказательства (скриншот, конфиг, лог)…',
    sourcePlaceholder: 'Источник…',
    periodPlaceholder: 'Охватываемый период (напр. 2026-Q3)…',
    urlPlaceholder: 'URL доказательства (необязательно)…',
    verify: 'Подтвердить',
    reject: 'Отклонить',
    rejectedByReviewer: 'Отклонено при проверке',
    status: {
      verified: 'Подтверждено',
      pending_review: 'На проверке',
      rejected: 'Отклонено',
      expired: 'Истекло',
    },
  },
```

```ts
// he.ts
  evidence: {
    empty: 'עדיין לא צורפו ראיות.',
    addEvidence: 'הוסף ראיה',
    titlePlaceholder: 'כותרת הראיה…',
    ownerPlaceholder: 'בעלים / צוות…',
    typePlaceholder: 'סוג ראיה (צילום מסך, תצורה, יומן)…',
    sourcePlaceholder: 'מקור…',
    periodPlaceholder: 'תקופה מכוסה (למשל 2026-Q3)…',
    urlPlaceholder: 'כתובת URL של הראיה (אופציונלי)…',
    verify: 'אמת',
    reject: 'דחה',
    rejectedByReviewer: 'נדחה במהלך הביקורת',
    status: {
      verified: 'מאומת',
      pending_review: 'ממתין לבדיקה',
      rejected: 'נדחה',
      expired: 'פג תוקף',
    },
  },
```

- [ ] **Step 9: Lint, build, commit**

```bash
npx prettier --write apps/client/src/components/evidence/EvidencePanel.tsx apps/client/src/components/evidence/__tests__/EvidencePanel.unit.test.tsx apps/client/src/queries/assets.ts apps/client/src/queries/evidence.ts libs/template-shared/src/lib/i18n/locales/en.ts libs/template-shared/src/lib/i18n/locales/es.ts libs/template-shared/src/lib/i18n/locales/ru.ts libs/template-shared/src/lib/i18n/locales/he.ts
yarn nx lint client
yarn nx lint template-shared
yarn nx build client
yarn nx build template-shared
git add apps/client/src/components/evidence/EvidencePanel.tsx apps/client/src/components/evidence/__tests__/EvidencePanel.unit.test.tsx apps/client/src/queries/assets.ts apps/client/src/queries/evidence.ts libs/template-shared/src/lib/i18n/locales/en.ts libs/template-shared/src/lib/i18n/locales/es.ts libs/template-shared/src/lib/i18n/locales/ru.ts libs/template-shared/src/lib/i18n/locales/he.ts
git commit -m "feat(evidence): add shared EvidencePanel component, query hooks, and i18n"
```

---

## Task 6: Migrate Controls-detail and Risk-detail to `EvidencePanel`

**Files:**
- Modify: `apps/client/src/routes/_dashboard/-controls-detail.page.tsx` (evidence tab JSX)
- Modify: `apps/client/src/routes/_dashboard/-risks-detail.page.tsx` (evidence tab JSX)

**Interfaces:**
- Consumes: `EvidencePanel` from Task 5.

Both surfaces are simple owner-scoped swaps: their existing evidence tab renders a read-only list; this task replaces that list with `<EvidencePanel>` and removes the now-unused `useControlEvidence`/`useRiskEvidence` direct calls and their manual JSX (the panel calls those hooks itself).

- [ ] **Step 1: Update `-controls-detail.page.tsx`**

Remove `useControlEvidence` from the imports at the top (the component itself is used inside `EvidencePanel` now, not here) and remove the `const { data: evidence = [] } = useControlEvidence(id);` line. Add imports:

```tsx
import { EvidencePanel } from '@/components/evidence/EvidencePanel';
import { useAuthStore } from '@icore/template-shared';
```

Inside the component, add (near where `orgId`-equivalent values are already read):

```tsx
const currentUserId = useAuthStore((s) => s.user?.id) ?? '';
```

Replace the evidence tab block (currently ~lines 167-182) with:

```tsx
{tab === 'evidence' && (
  <EvidencePanel
    orgId={control?.orgId ?? ''}
    ownerType="control"
    ownerId={id}
    currentUserId={currentUserId}
  />
)}
```

- [ ] **Step 2: Update `-risks-detail.page.tsx`**

Remove `useRiskEvidence` from imports and its call. `activeOrgId` is already in scope via the existing `useActiveOrgStore()` call. Add:

```tsx
import { EvidencePanel } from '@/components/evidence/EvidencePanel';
import { useAuthStore } from '@icore/template-shared';
```

```tsx
const currentUserId = useAuthStore((s) => s.user?.id) ?? '';
```

Replace the evidence tab block (currently ~lines 342-356) with:

```tsx
{tab === 'evidence' && (
  <EvidencePanel
    orgId={activeOrgId ?? ''}
    ownerType="risk"
    ownerId={id}
    currentUserId={currentUserId}
  />
)}
```

- [ ] **Step 3: Update or remove now-obsolete existing tests**

Search `apps/client/src/routes/_dashboard/__tests__/controls-detail.unit.test.tsx` and `risks-detail.unit.test.tsx` for any test asserting the old read-only evidence rendering (e.g. text matching `controls.noEvidence`/`risks.noEvidence`). If found, update the assertion to match `EvidencePanel`'s own empty-state text (`evidence.empty`, already covered by Task 5's own tests) or remove the now-redundant test — `EvidencePanel`'s unit tests already cover its internal behavior; these call-site tests only need to confirm the panel is wired with the right `ownerType`/`ownerId`, e.g.:

```tsx
it('renders the evidence tab with EvidencePanel wired to this control', async () => {
  // ... existing render/setup ...
  fireEvent.click(screen.getByText('Evidence'));
  // EvidencePanel itself renders `evidence.empty` text when the mocked hook returns []
  expect(screen.getByText(/no evidence attached yet/i)).toBeTruthy();
});
```

Adjust to each file's existing mocking conventions (both already mock `@/queries/controls`/`@/queries/risks` — ensure the mock includes `useControlEvidence`/`useRiskEvidence` returning `{ data: [] }`, which `EvidencePanel` now consumes internally).

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn nx test client --skip-nx-cache -t "ControlDetail|RiskDetail|Control Detail|Risk Detail"` (adjust the `-t` pattern to match whatever `describe` names these two test files actually use — check with `grep -n "^describe" apps/client/src/routes/_dashboard/__tests__/controls-detail.unit.test.tsx apps/client/src/routes/_dashboard/__tests__/risks-detail.unit.test.tsx` if the pattern above doesn't match).
Expected: PASS.

- [ ] **Step 5: Lint, build, commit**

```bash
npx prettier --write apps/client/src/routes/_dashboard/-controls-detail.page.tsx apps/client/src/routes/_dashboard/-risks-detail.page.tsx
yarn nx lint client
yarn nx build client
git add apps/client/src/routes/_dashboard/-controls-detail.page.tsx apps/client/src/routes/_dashboard/-risks-detail.page.tsx apps/client/src/routes/_dashboard/__tests__/controls-detail.unit.test.tsx apps/client/src/routes/_dashboard/__tests__/risks-detail.unit.test.tsx
git commit -m "feat(evidence): migrate Controls-detail and Risk-detail to EvidencePanel"
```

---

## Task 7: Migrate Framework's `RequirementDrawer` evidence section to `EvidencePanel`

**Files:**
- Modify: `apps/client/src/components/frameworks/RequirementDrawer.tsx`

**Interfaces:**
- Consumes: `EvidencePanel` from Task 5, with its `requirementFilter` prop.

This is the riskiest surface: today's `RequirementDrawer` evidence section has its own inline create form that hardcodes `periodCovered: '2026-Q3'`, `expirationDate: '2026-12-31'`, and — critically — `verificationStatus: 'verified'` (bypassing the review workflow entirely for every piece of evidence added through this UI). Migrating to `EvidencePanel` fixes this bug as a natural consequence (the panel always creates with `verificationStatus: 'pending_review'`), which is a deliberate, in-scope improvement, not incidental — flag it in the task's commit message.

- [ ] **Step 1: Remove the old inline evidence state and handlers**

In `RequirementDrawer.tsx`, remove: `evidenceTitle`/`evidenceOwner`/`evidenceType`/`evidenceSource`/`evidenceUrl` state, the `addEvidenceMut = useCreateFrameworkEvidence(orgId, framework.id)` line, the `linkedEvidence` computed filter (lines ~150-155), and the `handleCreateEvidence` function (lines ~197-223) along with whatever inline JSX rendered the old add-evidence form and evidence list under `activeSection === 'evidence'` (~line 807 onward).

- [ ] **Step 2: Render `EvidencePanel` in its place**

Add the import:

```tsx
import { EvidencePanel } from '@/components/evidence/EvidencePanel';
```

Where `activeSection === 'evidence'` was rendering the old custom block, render instead:

```tsx
{activeSection === 'evidence' && currentReq && (
  <EvidencePanel
    orgId={orgId}
    ownerType="framework"
    ownerId={framework.id}
    requirementFilter={currentReq.id}
    currentUserId={currentUserId}
  />
)}
```

`currentUserId` needs to be available in this component's scope — if it isn't already, add near the top of the component body:

```tsx
const currentUserId = useAuthStore((s) => s.user?.id) ?? '';
```

with `import { useAuthStore } from '@icore/template-shared';` added to the imports if not already present (check first — this file may already import from `@icore/template-shared` for other hooks).

- [ ] **Step 3: Confirm `EvidencePanel`'s framework create path sets `requirementId` correctly**

Re-read `EvidencePanel.tsx`'s `handleCreate` (Task 5, Step 5) — it already special-cases `ownerType === 'framework'` to include `frameworkId: props.ownerId, requirementId: props.requirementFilter` in the create payload. No further change needed here; this step is a verification checkpoint, not new code — confirm by reading the file that this branch is present before moving on.

- [ ] **Step 4: Update or remove now-obsolete existing tests**

Search for any existing test file covering `RequirementDrawer`'s evidence behavior (e.g. `grep -rln "handleCreateEvidence\|evidenceTitle\|linkedEvidence" apps/client/src/components/frameworks/__tests__/`). If found, remove assertions tied to the deleted inline form/state and replace with a wiring check (renders `EvidencePanel` with the right `ownerId`/`requirementFilter`), following the same pattern as Task 6 Step 3.

- [ ] **Step 5: Run tests, lint, build**

```bash
yarn nx test client --skip-nx-cache
npx prettier --write apps/client/src/components/frameworks/RequirementDrawer.tsx
yarn nx lint client
yarn nx build client
```

Expected: all client tests PASS (this task changes `RequirementDrawer` only — confirm no other test in the suite broke).

- [ ] **Step 6: Commit**

```bash
git add apps/client/src/components/frameworks/RequirementDrawer.tsx
git commit -m "fix(evidence): migrate Framework RequirementDrawer to EvidencePanel, fixing hardcoded verificationStatus='verified' bypass"
```

---

## Task 8: `AssessmentItemEvidence` swap and Asset Profile Evidence tab

**Files:**
- Modify: `apps/client/src/components/assessments/AssessmentItemsPanel.tsx` (replace `AssessmentItemEvidence` call site)
- Delete: `apps/client/src/components/assessments/AssessmentItemEvidence.tsx`
- Modify: `apps/client/src/routes/_dashboard/-assets.page.tsx` (Evidence tab)

**Interfaces:**
- Consumes: `EvidencePanel` from Task 5.

- [ ] **Step 1: Replace the `AssessmentItemEvidence` call site**

In `apps/client/src/components/assessments/AssessmentItemsPanel.tsx`, replace the import of `AssessmentItemEvidence` with `EvidencePanel`, and change the call site (currently `<AssessmentItemEvidence orgId={orgId} itemId={item.id} />` at line 254) to:

```tsx
<EvidencePanel
  orgId={orgId}
  ownerType="assessmentItem"
  ownerId={item.id}
  currentUserId={currentUserId}
/>
```

`currentUserId` needs to be in scope — if `AssessmentItemsPanel` doesn't already have it, add `const currentUserId = useAuthStore((s) => s.user?.id) ?? '';` with the corresponding `@icore/template-shared` import.

- [ ] **Step 2: Delete the old component**

```bash
rm apps/client/src/components/assessments/AssessmentItemEvidence.tsx
```

Check `apps/client/src/components/assessments/__tests__/` for a test file covering it directly (e.g. `AssessmentItemEvidence.unit.test.tsx`) — if one exists, delete it too, since `EvidencePanel`'s own tests (Task 5) already cover this behavior generically.

- [ ] **Step 3: Wire the Asset Profile Evidence tab**

In `apps/client/src/routes/_dashboard/-assets.page.tsx`, add the import:

```tsx
import { EvidencePanel } from '@/components/evidence/EvidencePanel';
```

`orgId` and `viewingAsset` are already in scope at this point in the component (confirmed: `orgId` from `activeOrgId ?? ''`, `viewingAsset` from the existing `useMemo` lookup). Add `currentUserId` near wherever `orgId` is defined:

```tsx
const currentUserId = useAuthStore((s) => s.user?.id) ?? '';
```

(Add `useAuthStore` to this file's `@icore/template-shared` import if not already present — check first, since this file already imports several things from that package.)

Replace the placeholder block (lines 2703-2713):

```tsx
{/* 7. EVIDENCE TAB */}
{profileTab === 'evidence' && viewingAsset && (
  <div className="space-y-4">
    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
      Attached Evidence &amp; Artifacts
    </h4>
    <EvidencePanel
      orgId={orgId}
      ownerType="asset"
      ownerId={viewingAsset.id}
      currentUserId={currentUserId}
    />
  </div>
)}
```

- [ ] **Step 4: Run tests to verify, lint, build**

```bash
yarn nx test client --skip-nx-cache
npx prettier --write apps/client/src/components/assessments/AssessmentItemsPanel.tsx apps/client/src/routes/_dashboard/-assets.page.tsx
yarn nx lint client
yarn nx build client
```

Expected: all client tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/components/assessments/AssessmentItemsPanel.tsx apps/client/src/routes/_dashboard/-assets.page.tsx
git rm apps/client/src/components/assessments/AssessmentItemEvidence.tsx
git commit -m "feat(evidence): migrate AssessmentItemEvidence to EvidencePanel and wire the Asset Profile Evidence tab"
```

---

## Final Verification

Run the full workspace test suite and confirm every project is green before moving to `superpowers:finishing-a-development-branch`:

```bash
yarn nx run-many -t test --parallel=4
```

Then perform mandatory live Playwright verification (per `AGENTS.md`): as a signed-up user with an org, create evidence on the new Asset Profile tab (confirm no crash, appears in list), edit it, delete it, and — reachability permitting per the tracked org-membership gap — verify/reject it as an admin caller.

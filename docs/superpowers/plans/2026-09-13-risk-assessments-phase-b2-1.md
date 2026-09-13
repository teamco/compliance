# Risk Assessments Phase B.2.1 (Guided Wizard + Evidence) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plain create-`Dialog` on the Assessment list page with a multi-step guided wizard (Details → Items → Review) that walks a user through creating an assessment, adding items, scoring them, linking controls, attaching evidence, and setting residual scores — all in one linear flow — and add evidence attachment to `AssessmentItem`s by extending the existing polymorphic `RequirementEvidence` type.

**Architecture:** Same layering as Phase B.1: shared types → Fake strategy → Supabase strategy → notes MS → notes-client → gateway REST → React Query hooks → client components. The only new backend surface is a `riskId`-evidence-style pair of methods scoped to `assessmentItemId` (mirrors the already-shipped `listRiskEvidence`/`createRiskEvidence` pattern exactly — same 5 layers, same shapes). All lifecycle/scoring/control-mapping logic from B.1 is reused unchanged. On the client, the current detail page's Items-tab content is extracted into a shared `AssessmentItemsPanel` component so the wizard and the detail page render identical UI with zero duplicated logic.

**Tech Stack:** NestJS TCP microservices, Supabase/Postgres, React 19 + Vite + shadcn, TanStack Router, React Query, i18next.

**Spec:** `docs/superpowers/specs/2026-09-13-risk-assessments-phase-b2-1-design.md`

## Global Constraints

- One universal wizard step flow for every `AssessmentType` — no CVRA/CTRA-specific branching, consistent with B.1's fully-configurable `AssessmentType`.
- Evidence reuses the existing `requirement_evidence` table/`RequirementEvidence` type via one new nullable `assessment_item_id` column — no new table, no new type.
- Every wizard step persists to the backend immediately on "Next" (no client-side buffering across steps) — closing the wizard mid-flow must not lose already-entered data.
- The wizard's "Finish" button on the Review step only closes the dialog and navigates to the assessment's detail page — it must NOT call `submitForReview`. Submitting for review remains a separate, explicit action on the detail page.
- `AssessmentItemsPanel` (extracted from the current detail-page Items tab) must be byte-for-byte behavior-identical to what it replaces — this is a refactor task, not a rewrite. The detail page and the wizard both render this one component.
- Post-coding routine on every task (per AGENTS.md): `npx prettier --write <files>` → `yarn nx lint <project>` → `yarn nx build <project>` — all green before committing.
- Any UI task must be verified live via Playwright before being marked complete (AGENTS.md, non-negotiable).
- Client overlay pattern (Dialog=create, Sheet=edit, AlertDialog=delete-confirm, independent state) still applies to everything inside the wizard that isn't the wizard shell itself (e.g. the item-delete confirmation already inside `AssessmentItemsPanel` keeps its own `AlertDialog`).

---

### Task 1: Shared types — extend `RequirementEvidence` and `NotesStrategy`

**Files:**
- Modify: `libs/shared/src/strategies/notes.ts`

**Interfaces:**
- Produces: `RequirementEvidence.assessmentItemId?: string`; two new `NotesStrategy` methods `listAssessmentItemEvidence`/`createAssessmentItemEvidence`, consumed by every later task in this plan.

- [ ] **Step 1: Add the field to `RequirementEvidence`**

Find the `RequirementEvidence` interface (search for `export interface RequirementEvidence`) and add one line after `riskId?: string;`:

```typescript
export interface RequirementEvidence {
  id: string;
  orgId?: string;
  controlId?: string;
  riskId?: string;
  frameworkId?: string;
  requirementId?: string;
  assessmentItemId?: string; // NEW
  title: string;
  owner: string;
  evidenceType: string;
  source: string;
  collectionDate: string;
  periodCovered: string;
  expirationDate: string;
  verificationStatus: 'verified' | 'pending_review' | 'rejected' | 'expired';
  url?: string;
  linkedControls?: string[];
  linkedRequirements?: string[];
}
```

- [ ] **Step 2: Add the two methods to `NotesStrategy`**

Find where `listRiskEvidence`/`createRiskEvidence` are declared on the `NotesStrategy` interface and add these two directly after them:

```typescript
  listAssessmentItemEvidence(itemId: string): Promise<RequirementEvidence[]>;
  createAssessmentItemEvidence(
    orgId: string,
    itemId: string,
    data: Omit<RequirementEvidence, 'id' | 'assessmentItemId'>,
  ): Promise<RequirementEvidence>;
```

- [ ] **Step 3: Build**

Run: `yarn nx build shared`
Expected: FAILS — both `FakeNotesStrategy` and `SupabaseNotesStrategy` are missing the two new interface methods. This is expected; Tasks 2 and 4 fix it.

- [ ] **Step 4: Commit**

```bash
git add libs/shared/src/strategies/notes.ts
git commit -m "feat(shared): add assessmentItemId to RequirementEvidence, extend NotesStrategy"
```

---

### Task 2: `FakeNotesStrategy` — implement item evidence + contract tests

**Files:**
- Modify: `libs/shared/src/strategies/fakes/fake-notes.ts`
- Modify: `libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts` (or wherever the existing Assessment/evidence contract tests live — grep for `createRiskEvidence` test coverage first to find the right file/describe block)

**Interfaces:**
- Consumes: `RequirementEvidence.assessmentItemId` (Task 1).
- Produces: `FakeNotesStrategy.listAssessmentItemEvidence`/`createAssessmentItemEvidence`, consumed by Task 8 (client hooks) via the Fake fallback path.

- [ ] **Step 1: Implement the two methods**

Find `listRiskEvidence`/`createRiskEvidence` in this file (search for `async listRiskEvidence`) and add the mirror pair directly after them:

```typescript
  async listAssessmentItemEvidence(itemId: string): Promise<RequirementEvidence[]> {
    return this.evidence.filter((e) => e.assessmentItemId === itemId);
  }

  async createAssessmentItemEvidence(
    orgId: string,
    itemId: string,
    data: Omit<RequirementEvidence, 'id' | 'assessmentItemId'>,
  ): Promise<RequirementEvidence> {
    const ev: RequirementEvidence = {
      id: `ev-${globalThis.crypto.randomUUID().slice(0, 8)}`,
      orgId,
      assessmentItemId: itemId,
      ...data,
    };
    this.evidence.unshift(ev);
    return ev;
  }
```

- [ ] **Step 2: Write contract tests**

Find the existing test(s) covering `createRiskEvidence`/`listRiskEvidence` (grep the test file for `RiskEvidence`) and add an analogous pair immediately after, asserting:
- `createAssessmentItemEvidence` returns an evidence record with `assessmentItemId` set to the passed `itemId` and `orgId` set correctly.
- `listAssessmentItemEvidence` returns only evidence for the requested `itemId`, not evidence belonging to other items or to risk-scoped/control-scoped/framework-scoped evidence records.
- Creating evidence for two different items and listing each returns disjoint results (no cross-item leakage).

- [ ] **Step 3: Build & test**

Run: `yarn nx build shared && yarn nx test shared`
Expected: build passes (Fake side of the interface now satisfied — Supabase side still fails, expected until Task 4); new tests pass.

- [ ] **Step 4: Commit**

```bash
git add libs/shared/src/strategies/fakes/fake-notes.ts libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts
git commit -m "feat(shared): implement assessment item evidence in FakeNotesStrategy"
```

---

### Task 3: Migration — `assessment_item_id` on `requirement_evidence`

**Files:**
- Create: `supabase/migrations/20260913000002_assessment_item_evidence.sql`

**Interfaces:**
- Produces: `requirement_evidence.assessment_item_id` column, consumed by Task 4 (Supabase strategy).

- [ ] **Step 1: Write the migration**

```sql
alter table public.requirement_evidence
  add column assessment_item_id uuid references public.risk_assessment_items(id) on delete cascade;

alter table public.requirement_evidence drop constraint if exists requirement_evidence_check;
alter table public.requirement_evidence
  add constraint requirement_evidence_check
  check (
    control_id is not null
    or framework_id is not null
    or risk_id is not null
    or assessment_item_id is not null
  );

create index requirement_evidence_assessment_item_idx
  on public.requirement_evidence(assessment_item_id);

drop policy if exists "users manage own evidence" on public.requirement_evidence;
create policy "users manage own evidence"
  on public.requirement_evidence for all
  using (
    exists (
      select 1 from public.org_profiles op
      where op.id = requirement_evidence.org_id and op.user_id = auth.uid()
    )
    and (
      control_id is null
      or exists (
        select 1 from public.internal_controls c
        where c.id = requirement_evidence.control_id and c.org_id = requirement_evidence.org_id
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
  );
```

Before finalizing: read the CURRENT `"users manage own evidence"` (or equivalently named) policy in `supabase/migrations/20260912000002_risk_register.sql` (search `requirement_evidence`) to confirm the exact existing policy body and org-scoping join pattern for the `control_id`/`framework_id`/`risk_id` branches — reproduce those exactly rather than guessing, and only ADD the new `assessment_item_id` branch. Also confirm `risk_assessment_items.assessment_id` is the real FK column name (verify against `libs/shared/src/strategies/notes.ts`'s `AssessmentItem` type / the Phase B.1 migration `20260913000001_assessments_phase_b1.sql`) before writing the join.

- [ ] **Step 2: Verify on real Postgres if available**

If `/usr/lib/postgresql/16/bin` exists on this machine, replay the full migration chain (same throwaway-cluster technique used in Phase B.1's Task 4) through this new migration, seed an assessment item and a piece of evidence pointing at it, and confirm: the row inserts, the check constraint doesn't reject it, and a user from a different org cannot read/write it under RLS as a non-superuser role. If no local Postgres is available, do a careful manual re-read instead and say so in your report.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260913000002_assessment_item_evidence.sql
git commit -m "feat(db): add assessment_item_id to requirement_evidence"
```

---

### Task 4: `SupabaseNotesStrategy` — implement item evidence

**Files:**
- Modify: `apps/microservices/notes/src/app/supabase-notes.strategy.ts`

**Interfaces:**
- Consumes: `requirement_evidence.assessment_item_id` (Task 3).
- Produces: `SupabaseNotesStrategy.listAssessmentItemEvidence`/`createAssessmentItemEvidence`.

- [ ] **Step 1: Add the two methods**

Find `listRiskEvidence`/`createRiskEvidence` (search `async listRiskEvidence`) and add the mirror pair directly after them, reusing the existing `evidenceInsertPayload`/`toRequirementEvidence` private helpers exactly as the risk-evidence pair does:

```typescript
  async listAssessmentItemEvidence(itemId: string): Promise<RequirementEvidence[]> {
    const { data, error } = await this.db
      .from('requirement_evidence')
      .select('*')
      .eq('assessment_item_id', itemId);
    return ok(data, error).map((row) => this.toRequirementEvidence(row));
  }

  async createAssessmentItemEvidence(
    orgId: string,
    itemId: string,
    data: Omit<RequirementEvidence, 'id' | 'assessmentItemId'>,
  ): Promise<RequirementEvidence> {
    const { data: row, error } = await this.db
      .from('requirement_evidence')
      .insert({ ...this.evidenceInsertPayload(orgId, data), assessment_item_id: itemId })
      .select()
      .single();
    return this.toRequirementEvidence(ok(row, error));
  }
```

- [ ] **Step 2: Update `toRequirementEvidence` to map the new column**

Find the `private toRequirementEvidence(row: Record<string, unknown>): RequirementEvidence` method and add one line after the existing `riskId: row['risk_id'] as string | undefined,`:

```typescript
      assessmentItemId: row['assessment_item_id'] as string | undefined,
```

Without this, `listAssessmentItemEvidence` would return rows missing `assessmentItemId`, breaking any client code that reads it back.

- [ ] **Step 3: Build**

Run: `yarn nx build shared notes`
Expected: PASS — `NotesStrategy` interface now fully implemented by both strategies.

- [ ] **Step 4: Commit**

```bash
git add apps/microservices/notes/src/app/supabase-notes.strategy.ts
git commit -m "feat(notes): implement assessment item evidence in SupabaseNotesStrategy"
```

---

### Task 5: Notes MS — `@MessagePattern` handlers

**Files:**
- Modify: `apps/microservices/notes/src/app/notes.controller.ts`

**Interfaces:**
- Consumes: `NotesStrategy.listAssessmentItemEvidence`/`createAssessmentItemEvidence` (Tasks 2, 4).
- Produces: message patterns `notes.assessments.items.evidence.list` / `notes.assessments.items.evidence.create`, consumed by Task 6.

- [ ] **Step 1: Add the two handlers**

Find the `listRiskEvidence`/`createRiskEvidence` handlers (search `notes.risks.evidence`) and add this pair after them, following the exact same `@MessagePattern`/`@Payload` shape:

```typescript
  @MessagePattern('notes.assessments.items.evidence.list')
  listAssessmentItemEvidence(
    @Payload() payload: { itemId: string },
  ): Promise<RequirementEvidence[]> {
    return this.strategy.listAssessmentItemEvidence(payload.itemId);
  }

  @MessagePattern('notes.assessments.items.evidence.create')
  createAssessmentItemEvidence(
    @Payload()
    payload: {
      orgId: string;
      itemId: string;
      data: Omit<RequirementEvidence, 'id' | 'assessmentItemId'>;
    },
  ): Promise<RequirementEvidence> {
    return this.strategy.createAssessmentItemEvidence(payload.orgId, payload.itemId, payload.data);
  }
```

- [ ] **Step 2: Build**

Run: `yarn nx build notes`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/microservices/notes/src/app/notes.controller.ts
git commit -m "feat(notes): add message handlers for assessment item evidence"
```

---

### Task 6: `notes-client` — TCP proxy

**Files:**
- Modify: `libs/notes-client/src/lib/notes-client.service.ts`

**Interfaces:**
- Consumes: message patterns from Task 5.
- Produces: `NotesClientService.listAssessmentItemEvidence`/`createAssessmentItemEvidence`, consumed by Task 7.

- [ ] **Step 1: Add the two proxy methods**

Find `listRiskEvidence`/`createRiskEvidence` (search `notes.risks.evidence`) and add this pair after them:

```typescript
  listAssessmentItemEvidence(itemId: string): Promise<RequirementEvidence[]> {
    return signedSend<RequirementEvidence[]>(this.client, 'notes.assessments.items.evidence.list', {
      itemId,
    });
  }

  createAssessmentItemEvidence(
    orgId: string,
    itemId: string,
    data: Omit<RequirementEvidence, 'id' | 'assessmentItemId'>,
  ): Promise<RequirementEvidence> {
    return signedSend<RequirementEvidence>(
      this.client,
      'notes.assessments.items.evidence.create',
      { orgId, itemId, data },
    );
  }
```

- [ ] **Step 2: Build**

Run: `yarn nx build notes-client`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add libs/notes-client/src/lib/notes-client.service.ts
git commit -m "feat(notes-client): proxy assessment item evidence over TCP"
```

---

### Task 7: Gateway REST endpoints

**Files:**
- Modify: `apps/api/src/app/notes/notes.controller.ts`

**Interfaces:**
- Consumes: `NotesClientService` methods (Task 6).
- Produces: `GET /notes/assessments/items/:itemId/evidence`, `POST /notes/assessments/items/:itemId/evidence`, consumed by Task 8.

- [ ] **Step 1: Add the two routes**

Find the `risks/:id/evidence` routes (search `listRiskEvidence` in this file) and add this pair, placed among the other `assessments/items/...` routes already added in Phase B.1 (search `assessments/items` to find that block — route-order matters: this file already has both `assessments/items/:itemId` and `assessments/items/mappings/:mappingId` style routes; place these new ones so no static segment gets shadowed by an earlier `:param` — verify by reading the surrounding routes before inserting):

```typescript
  @Get('assessments/items/:itemId/evidence')
  @ApiOperation({ summary: 'List evidence attached to an assessment item' })
  listAssessmentItemEvidence(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('itemId') itemId: string,
  ) {
    this.uid(req);
    return this.notes.listAssessmentItemEvidence(itemId);
  }

  @Post('assessments/items/:itemId/evidence')
  @ApiOperation({ summary: 'Attach evidence to an assessment item' })
  createAssessmentItemEvidence(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
    @Param('itemId') itemId: string,
    @Body() body: Omit<RequirementEvidence, 'id' | 'assessmentItemId'>,
  ) {
    this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    return this.notes.createAssessmentItemEvidence(orgId, itemId, body);
  }
```

- [ ] **Step 2: Build**

Run: `yarn nx build api`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/app/notes/notes.controller.ts
git commit -m "feat(api): expose assessment item evidence over REST"
```

---

### Task 8: Client — evidence query hooks

**Files:**
- Modify: `apps/client/src/queries/assessments.ts`

**Interfaces:**
- Consumes: `GET/POST /notes/assessments/items/:itemId/evidence` (Task 7).
- Produces: `useAssessmentItemEvidence(itemId)`, `useCreateAssessmentItemEvidence(orgId, itemId)`, consumed by Task 9.

- [ ] **Step 1: Read `apps/client/src/queries/risks.ts`'s `useRiskEvidence`/`useCreateRiskEvidence` (already shown in this task's interfaces) and add the mirror pair to `apps/client/src/queries/assessments.ts`**, at the end of the file, importing `RequirementEvidence` from `@icore/shared` (check the existing import path used for other shared types at the top of this file — match it exactly):

```typescript
export function useAssessmentItemEvidence(itemId: string) {
  return useQuery<RequirementEvidence[]>({
    queryKey: ['assessments', 'items', itemId, 'evidence'],
    queryFn: () => api<RequirementEvidence[]>(`/notes/assessments/items/${itemId}/evidence`),
    enabled: !!itemId,
  });
}

export function useCreateAssessmentItemEvidence(orgId: string, itemId: string) {
  const qc = useQueryClient();
  return useMutation<RequirementEvidence, Error, Omit<RequirementEvidence, 'id' | 'assessmentItemId'>>({
    mutationFn: (data) =>
      api<RequirementEvidence>(
        `/notes/assessments/items/${itemId}/evidence?orgId=${encodeURIComponent(orgId)}`,
        { method: 'POST', body: JSON.stringify(data) },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assessments', 'items', itemId, 'evidence'] }),
  });
}
```

Verify the exact `api()` helper import and `useQuery`/`useMutation`/`useQueryClient` imports already present at the top of this file before adding — match the file's existing style exactly, do not introduce a second import style.

- [ ] **Step 2: Build**

Run: `yarn nx build client`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/queries/assessments.ts
git commit -m "feat(client): add React Query hooks for assessment item evidence"
```

---

### Task 9: Client — `AssessmentItemEvidence` component

**Files:**
- Create: `apps/client/src/components/assessments/AssessmentItemEvidence.tsx`

**Interfaces:**
- Consumes: `useAssessmentItemEvidence`, `useCreateAssessmentItemEvidence` (Task 8).
- Produces: `AssessmentItemEvidence` component, consumed by Task 10 (wired into `AssessmentItemsPanel`'s expanded-item view).

- [ ] **Step 1: Write the component**

Model this directly on `apps/client/src/components/assessments/AssessmentItemControls.tsx` (read it in full first — this task's plan brief above already includes its exact content). Same shape: a list of existing evidence entries plus a small add-form. Unlike controls (which link an existing `InternalControl` by id), evidence is created fresh each time (title/type/source/dates/url are freeform), so the add-form needs more fields than a single `<select>`.

```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  useAssessmentItemEvidence,
  useCreateAssessmentItemEvidence,
} from '@/queries/assessments';

interface AssessmentItemEvidenceProps {
  orgId: string;
  itemId: string;
}

const EMPTY_EVIDENCE_FORM = {
  title: '',
  owner: '',
  evidenceType: '',
  source: '',
  collectionDate: '',
  periodCovered: '',
  expirationDate: '',
  verificationStatus: 'pending_review' as const,
  url: '',
};

export function AssessmentItemEvidence({ orgId, itemId }: AssessmentItemEvidenceProps) {
  const { t } = useTranslation();
  const { data: evidence = [] } = useAssessmentItemEvidence(itemId);
  const createMut = useCreateAssessmentItemEvidence(orgId, itemId);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_EVIDENCE_FORM);

  function handleAdd() {
    if (!form.title.trim()) return;
    createMut.mutate(form, {
      onSuccess: () => {
        setForm(EMPTY_EVIDENCE_FORM);
        setOpen(false);
      },
    });
  }

  return (
    <div className="space-y-2">
      {evidence.map((e) => (
        <div key={e.id} className="text-xs border border-border rounded px-2 py-1.5">
          <div className="flex items-center justify-between">
            <span className="font-medium">{e.title}</span>
            <span className="text-muted-foreground/70">{e.verificationStatus}</span>
          </div>
          {e.url && (
            <a
              href={e.url}
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground/70 underline"
            >
              {e.url}
            </a>
          )}
        </div>
      ))}
      {open ? (
        <div className="space-y-1.5 border border-border rounded p-2">
          <Input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder={t('assessments.evidenceTitlePlaceholder')}
            className="h-8 text-xs"
          />
          <Input
            value={form.url}
            onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
            placeholder={t('assessments.evidenceUrlPlaceholder')}
            className="h-8 text-xs"
          />
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleAdd}
              disabled={!form.title.trim() || createMut.isPending}
              className="h-7 px-2 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground disabled:opacity-40 cursor-pointer"
            >
              {t('assessments.addEvidence')}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setForm(EMPTY_EVIDENCE_FORM);
              }}
              className="h-7 px-2 rounded-md text-xs text-muted-foreground hover:text-foreground cursor-pointer"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="h-8 px-2 flex items-center gap-1 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground cursor-pointer"
        >
          <Plus size={12} />
          {t('assessments.addEvidence')}
        </button>
      )}
    </div>
  );
}
```

Note: `owner`/`evidenceType`/`source`/`collectionDate`/`periodCovered`/`expirationDate` are sent with empty-string/blank defaults from `EMPTY_EVIDENCE_FORM` — the backend's `RequirementEvidence` fields for these are non-optional strings (verify against Task 1's type), so this is intentionally minimal for B.2.1 (title + url are the only two fields actually surfaced in the UI); a fuller evidence-metadata form is not required by the spec and can be added later without a breaking change.

- [ ] **Step 2: Build**

Run: `npx prettier --write apps/client/src/components/assessments/AssessmentItemEvidence.tsx && yarn nx lint client && yarn nx build client`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/components/assessments/AssessmentItemEvidence.tsx
git commit -m "feat(client): add AssessmentItemEvidence component"
```

---

### Task 10: Client — extract `AssessmentItemsPanel` from the detail page, wire in evidence

**Files:**
- Create: `apps/client/src/components/assessments/AssessmentItemsPanel.tsx`
- Modify: `apps/client/src/routes/_dashboard/-assessment-detail.page.tsx`

**Interfaces:**
- Consumes: `AssessmentItemEvidence` (Task 9); all existing item/control/residual hooks already used in the current Items tab (`useAssessmentItems`, `useCreateAssessmentItem`, `useUpdateAssessmentItem`, `useDeleteAssessmentItem`, `useAssessmentItemControlMappings`, `useRiskMethodology`, `useInternalControlsList`, `AssessmentItemControls`).
- Produces: `AssessmentItemsPanel({ orgId, assessmentId }: { orgId: string; assessmentId: string })`, consumed by both the detail page (this task) and the wizard (Task 12).

This is a **behavior-preserving refactor** — the extracted component must render and behave identically to the current inline Items-tab content. No new features, no changed markup beyond what's needed to make it a standalone, parameterized component.

- [ ] **Step 1: Read the CURRENT full content of `-assessment-detail.page.tsx`** (this plan's brief above contains its exact content as of the start of this plan, but re-read the live file first — earlier tasks in this plan don't touch it, so it should be unchanged, but confirm).

- [ ] **Step 2: Create `AssessmentItemsPanel.tsx`**

Move the following out of `AssessmentDetailPage` into a new standalone component:
- State: `itemDialogOpen`, `itemForm`, `expandedItemId`, `confirmDeleteItemId`.
- Hooks: `useAssessmentItems`, `useRiskMethodology`, `useInternalControlsList`, `useCreateAssessmentItem`, `useUpdateAssessmentItem`, `useDeleteAssessmentItem`, `useAssessmentItemControlMappings` (for `expandedItemMappings`/`hasLinkedControls`).
- Functions: `handleCreateItem`, `handleResidualChange`.
- The entire `tab === 'items'` JSX block (the items list, add-item `Dialog`, delete-confirm `AlertDialog`) — this becomes the component's whole return value (drop the `tab === 'items' &&` wrapper condition; the panel itself is what gets conditionally rendered by its caller now).
- Inside the expanded-item block, ADD the evidence section right after the existing Residual Scoring block (which itself sits right after the Linked Controls block):

```tsx
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">
                        {t('assessments.evidence')}
                      </p>
                      <AssessmentItemEvidence orgId={orgId} itemId={item.id} />
                    </div>
```

Add the import: `import { AssessmentItemEvidence } from '@/components/assessments/AssessmentItemEvidence';`

Component signature:

```tsx
interface AssessmentItemsPanelProps {
  orgId: string;
  assessmentId: string;
}

export function AssessmentItemsPanel({ orgId, assessmentId }: AssessmentItemsPanelProps) {
  // ...moved hooks/state/functions, using `assessmentId` wherever the original used
  // the detail page's `id` param, and `orgId` wherever it used the detail page's `orgId`
}
```

Every hook that previously took the detail page's `id` (e.g. `useAssessmentItems(id)`, `useCreateAssessmentItem(id)`) now takes `assessmentId`.

- [ ] **Step 3: Update `-assessment-detail.page.tsx`**

Remove everything moved in Step 2 (the item-related state, hooks, functions, and the `tab === 'items'` JSX block's contents). Replace the `tab === 'items' && (...)` block with:

```tsx
      {tab === 'items' && <AssessmentItemsPanel orgId={orgId} assessmentId={id} />}
```

Add the import: `import { AssessmentItemsPanel } from '@/components/assessments/AssessmentItemsPanel';`

Remove now-unused imports from the detail page (item-related icons/components that moved to the new file — check for `Plus`, `Trash2`, item-related `Dialog`/`AlertDialog` imports, `AssessmentItemControls`, `useRiskMethodology`, `useInternalControlsList`, `useCreateAssessmentItem`, `useUpdateAssessmentItem`, `useDeleteAssessmentItem`, `useAssessmentItemControlMappings`, `AssessmentItem`/`AssessmentItemInput` types — keep only what the Overview tab and lifecycle-action header still use, e.g. `useAssessment`, lifecycle mutation hooks, `useAssessmentTypes`, `useOrgMembers`, `Field` helper).

- [ ] **Step 4: Build**

Run: `npx prettier --write apps/client/src/components/assessments/AssessmentItemsPanel.tsx apps/client/src/routes/_dashboard/-assessment-detail.page.tsx && yarn nx lint client && yarn nx build client`
Expected: PASS.

- [ ] **Step 5: Live verification**

Start the dev stack (Fake-strategy fallback, per AGENTS.md) and use Playwright to open an existing assessment's detail page, Items tab: confirm it renders identically to before this refactor (add item, expand, link control, set residual, delete item — all still work). This is a refactor with no intended behavior change, so this check exists specifically to catch an accidental regression from the extraction.

- [ ] **Step 6: Commit**

```bash
git add apps/client/src/components/assessments/AssessmentItemsPanel.tsx apps/client/src/routes/_dashboard/-assessment-detail.page.tsx
git commit -m "refactor(client): extract AssessmentItemsPanel from detail page, add evidence section"
```

---

### Task 11: Client — `AssessmentWizard` shell + Details step

**Files:**
- Create: `apps/client/src/components/assessments/AssessmentWizard.tsx`

**Interfaces:**
- Consumes: `useCreateAssessment`, `useUpdateAssessment`, `useAssessmentTypes`, `useAssets`, `useVendors`, `useOrgMembers` (all existing, already used by `-assessments.page.tsx`'s current create form — read that file, shown in full in this plan's context above, for the exact field set and hook signatures).
- Produces: `AssessmentWizard({ orgId, open, onOpenChange }: {...})` component shell with step state, consumed by Task 13 (Items/Review steps added) and Task 14 (wired into the list page).

- [ ] **Step 1: Write the wizard shell + Details step**

```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MultiSelect } from '@/components/ui/multi-select';
import { Combobox } from '@/components/ui/combobox';
import { useAssets } from '@/queries/assets';
import { useVendors } from '@/queries/vendors';
import { useOrgMembers } from '@/queries/org-members';
import { useAssessmentTypes } from '@/queries/assessment-types';
import {
  useCreateAssessment,
  useUpdateAssessment,
  type Assessment,
  type AssessmentInput,
} from '@/queries/assessments';

type WizardStep = 'details' | 'items' | 'review';

const EMPTY_FORM: AssessmentInput = {
  title: '',
  assessmentTypeId: '',
  ownerId: '',
};

interface AssessmentWizardProps {
  orgId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AssessmentWizard({ orgId, open, onOpenChange }: AssessmentWizardProps) {
  const { t } = useTranslation();
  const { data: types = [] } = useAssessmentTypes(orgId);
  const { data: assets = [] } = useAssets(orgId);
  const { data: vendors = [] } = useVendors(orgId);
  const { data: members = [] } = useOrgMembers(orgId);
  const createMut = useCreateAssessment(orgId);
  const updateMut = useUpdateAssessment(orgId, /* filled in once assessment exists */ '');

  const [step, setStep] = useState<WizardStep>('details');
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [form, setForm] = useState<AssessmentInput>(EMPTY_FORM);

  const memberOptions = members.map((m) => ({
    value: m.userId,
    label: m.displayName ?? m.email ?? m.userId,
  }));

  function reset() {
    setStep('details');
    setAssessment(null);
    setForm(EMPTY_FORM);
  }

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  }

  function handleDetailsNext() {
    if (!form.title || !form.assessmentTypeId || !form.ownerId) return;
    if (assessment) {
      // returning to Details after already creating — update, don't re-create
      // (Task 13 wires the actual updateMut call once its orgId/id dependency is resolved —
      // see that task for the final form of this branch)
      setStep('items');
      return;
    }
    createMut.mutate(form, {
      onSuccess: (created) => {
        setAssessment(created);
        setStep('items');
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('assessments.newAssessment')}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-1 mb-4 text-xs">
          {(['details', 'items', 'review'] as const).map((s) => (
            <span
              key={s}
              className={`px-2 py-1 rounded ${
                step === s ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
              }`}
            >
              {t(`assessments.wizard.step.${s}`)}
            </span>
          ))}
        </div>

        {step === 'details' && (
          <div className="space-y-3">
            <div>
              <Label htmlFor="wizard-title">{t('assessments.title')}</Label>
              <Input
                id="wizard-title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t('assessments.type')}</Label>
                <select
                  value={form.assessmentTypeId}
                  onChange={(e) => setForm((f) => ({ ...f, assessmentTypeId: e.target.value }))}
                  required
                  className="w-full h-9 rounded-md border border-border bg-surface px-3 text-sm"
                >
                  <option value="">{t('assessments.selectType')}</option>
                  {types
                    .filter((ty) => !ty.archived)
                    .map((ty) => (
                      <option key={ty.id} value={ty.id}>
                        {ty.name}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <Label htmlFor="wizard-owner">{t('assessments.owner')}</Label>
                <Combobox
                  options={memberOptions}
                  value={form.ownerId}
                  onChange={(ownerId) => setForm((f) => ({ ...f, ownerId }))}
                  placeholder={t('assessments.selectOwner')}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="wizard-bu">{t('assessments.businessUnit')}</Label>
                <Input
                  id="wizard-bu"
                  value={form.businessUnit ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, businessUnit: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="wizard-due">{t('assessments.dueDate')}</Label>
                <Input
                  id="wizard-due"
                  type="date"
                  value={form.dueDate ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="wizard-approver">{t('assessments.approver')}</Label>
              <Combobox
                options={memberOptions}
                value={form.approverId ?? ''}
                onChange={(approverId) => setForm((f) => ({ ...f, approverId }))}
                placeholder={t('assessments.selectApprover')}
              />
            </div>
            <div>
              <Label>{t('assessments.inScopeAssets')}</Label>
              <MultiSelect
                options={assets.map((a) => ({ value: a.id, label: a.name }))}
                selected={form.assetIds ?? []}
                onChange={(assetIds) => setForm((f) => ({ ...f, assetIds }))}
                placeholder={t('assessments.noAssets')}
              />
            </div>
            <div>
              <Label>{t('assessments.inScopeVendors')}</Label>
              <MultiSelect
                options={vendors.map((v) => ({ value: v.id, label: v.name }))}
                selected={form.vendorIds ?? []}
                onChange={(vendorIds) => setForm((f) => ({ ...f, vendorIds }))}
                placeholder={t('assessments.noVendors')}
              />
            </div>
            <div className="flex justify-end pt-2">
              <Button
                onClick={handleDetailsNext}
                disabled={!form.title || !form.assessmentTypeId || !form.ownerId || createMut.isPending}
              >
                {t('assessments.wizard.next')}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

Note: `updateMut` is declared with a placeholder empty-string id and its actual wiring (for the "return to Details after Items" edit path) is finished in Task 13, once the real `assessment.id` is available in scope — flag this clearly in your commit/report rather than silently leaving it half-wired; Task 13 depends on you having NOT deleted this line.

- [ ] **Step 2: Build**

Run: `npx prettier --write apps/client/src/components/assessments/AssessmentWizard.tsx && yarn nx lint client && yarn nx build client`
Expected: PASS (component isn't used anywhere yet, so no runtime check possible this task — Task 14 wires it in).

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/components/assessments/AssessmentWizard.tsx
git commit -m "feat(client): add AssessmentWizard shell with Details step"
```

---

### Task 12: Client — Wizard Items step

**Files:**
- Modify: `apps/client/src/components/assessments/AssessmentWizard.tsx`

**Interfaces:**
- Consumes: `AssessmentItemsPanel` (Task 10), `useAssessmentItems` (existing, to compute the item count for the Review-gate).

- [ ] **Step 1: Add the Items step**

Import `AssessmentItemsPanel` and `useAssessmentItems`. After the `step === 'details'` block, add:

```tsx
        {step === 'items' && assessment && (
          <div className="space-y-4">
            <AssessmentItemsPanel orgId={orgId} assessmentId={assessment.id} />
            <ItemsStepFooter
              assessmentId={assessment.id}
              onBack={() => setStep('details')}
              onNext={() => setStep('review')}
            />
          </div>
        )}
```

Add a small helper component in the same file that reads the item count and gates the Next button:

```tsx
function ItemsStepFooter({
  assessmentId,
  onBack,
  onNext,
}: {
  assessmentId: string;
  onBack: () => void;
  onNext: () => void;
}) {
  const { t } = useTranslation();
  const { data: items = [] } = useAssessmentItems(assessmentId);
  return (
    <div className="flex items-center justify-between pt-2 border-t border-border">
      <Button variant="outline" onClick={onBack}>
        {t('assessments.wizard.back')}
      </Button>
      <div className="flex items-center gap-2">
        {items.length === 0 && (
          <span className="text-xs text-muted-foreground">
            {t('assessments.wizard.needOneItemHint')}
          </span>
        )}
        <Button onClick={onNext} disabled={items.length === 0}>
          {t('assessments.wizard.next')}
        </Button>
      </div>
    </div>
  );
}
```

`useAssessmentItems` is already imported in `-assessment-detail.page.tsx`/`AssessmentItemsPanel` — import it the same way here from `@/queries/assessments`.

- [ ] **Step 2: Build**

Run: `npx prettier --write apps/client/src/components/assessments/AssessmentWizard.tsx && yarn nx lint client && yarn nx build client`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/components/assessments/AssessmentWizard.tsx
git commit -m "feat(client): add AssessmentWizard Items step with review-gate"
```

---

### Task 13: Client — Wizard Review step, Finish action, Details-revisit update path

**Files:**
- Modify: `apps/client/src/components/assessments/AssessmentWizard.tsx`

**Interfaces:**
- Consumes: `useAssessmentItems`, `useUpdateAssessment` (already imported/declared in Task 11).
- Produces: complete `AssessmentWizard`, consumed by Task 14.

- [ ] **Step 1: Fix the `updateMut` wiring from Task 11**

Task 11 declared `const updateMut = useUpdateAssessment(orgId, '');` as a placeholder. Now that `assessment` is in scope, change it to only construct the mutation once an assessment exists, and use it in `handleDetailsNext`'s "already created" branch:

```tsx
  const updateMut = useUpdateAssessment(orgId, assessment?.id ?? '');
```

And in `handleDetailsNext`, replace the `if (assessment) { setStep('items'); return; }` branch with:

```tsx
    if (assessment) {
      updateMut.mutate(form, { onSuccess: () => setStep('items') });
      return;
    }
```

Verify `useUpdateAssessment`'s real signature (args, patch shape) against `apps/client/src/queries/assessments.ts` before wiring this — the patch type (`AssessmentPatch`) only accepts `title`/`businessUnit`/`assetIds`/`vendorIds`/`dueDate` per Phase B.1's security fix (NOT `ownerId`/`approverId`/`status`/`assessmentTypeId`) — so if the user changes owner/approver/type after Details was already submitted once, those fields CANNOT be patched through this path. Handle this by disabling the type/owner/approver fields once `assessment` is set (editing them post-creation isn't supported by the backend), rather than silently dropping the user's edit. Add a short inline note/tooltip explaining why, using a new i18n key.

- [ ] **Step 2: Add the Review step**

```tsx
        {step === 'review' && assessment && <ReviewStep assessmentId={assessment.id} onBack={() => setStep('items')} onFinish={() => handleClose(false)} />}
```

```tsx
function ReviewStep({
  assessmentId,
  onBack,
  onFinish,
}: {
  assessmentId: string;
  onBack: () => void;
  onFinish: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: items = [] } = useAssessmentItems(assessmentId);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t('assessments.wizard.reviewIntro')}</p>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className="text-sm border border-border rounded-lg p-3">
            <p className="font-medium">{item.subject}</p>
            <p className="text-xs text-muted-foreground">
              {t('assessments.inherent')}: {item.inherentScore} ({item.inherentLabel})
              {item.residualScore != null &&
                ` · ${t('assessments.residual')}: ${item.residualScore} (${item.residualLabel})`}
            </p>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between pt-2 border-t border-border">
        <Button variant="outline" onClick={onBack}>
          {t('assessments.wizard.back')}
        </Button>
        <Button
          onClick={() => {
            onFinish();
            void navigate({ to: '/assessments/$id', params: { id: assessmentId } });
          }}
        >
          {t('assessments.wizard.finish')}
        </Button>
      </div>
    </div>
  );
}
```

Add the `useNavigate` import from `@tanstack/react-router`. Confirm `onFinish` (which calls `handleClose(false)`, resetting wizard state and calling `onOpenChange(false)`) runs before or doesn't conflict with the navigation — both firing in the same click handler is fine since they act on different things (dialog visibility vs. route), but verify no React warning about updating state during navigation appears in the console during Task 14's live verification.

**Do not** call any `submitForReview`-equivalent mutation here — per this plan's Global Constraints, Finish only closes and navigates; submitting for review stays a separate, explicit action on the detail page.

- [ ] **Step 3: Build**

Run: `npx prettier --write apps/client/src/components/assessments/AssessmentWizard.tsx && yarn nx lint client && yarn nx build client`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/components/assessments/AssessmentWizard.tsx
git commit -m "feat(client): add AssessmentWizard Review step and finish navigation"
```

---

### Task 14: Client — wire the wizard into the list page, remove the old create Dialog

**Files:**
- Modify: `apps/client/src/routes/_dashboard/-assessments.page.tsx`

**Interfaces:**
- Consumes: `AssessmentWizard` (Tasks 11-13).

- [ ] **Step 1: Replace the old create-Dialog with the wizard**

In `-assessments.page.tsx` (its current full content is in this plan's context above): remove `EMPTY_FORM`, `form`/`setForm` state, `handleCreate`, `useCreateAssessment` (unless still needed — check; it's used only by the old form), `useAssets`/`useVendors` (only if the wizard now owns fetching them — it does, in `AssessmentWizard`), the `Dialog`/`DialogContent`/... JSX block for creation, and the now-unused `MultiSelect`/`Combobox` imports if nothing else on this page uses them (check first — `Combobox` might still be needed elsewhere on this page; verify before removing).

Add: `import { AssessmentWizard } from '@/components/assessments/AssessmentWizard';`

Replace the "New Assessment" button's Dialog with:

```tsx
      <AssessmentWizard orgId={orgId} open={createOpen} onOpenChange={setCreateOpen} />
```

Keep `createOpen`/`setCreateOpen` state and the button that sets it — only the Dialog's *contents* move into `AssessmentWizard`, the trigger stays the same.

- [ ] **Step 2: Build**

Run: `npx prettier --write apps/client/src/routes/_dashboard/-assessments.page.tsx && yarn nx lint client && yarn nx build client`
Expected: PASS.

- [ ] **Step 3: Mandatory live Playwright verification**

Per AGENTS.md: start the dev stack, navigate to `/assessments`, click "New Assessment", and drive the FULL wizard end-to-end:
1. Fill Details (title/type/owner/approver/business unit/due date/assets/vendors), click Next — confirm it lands on Items and a new `ASM-XXXXXX` row would appear if you checked the list (it exists in `draft` now).
2. On Items, add at least 2 items with inherent scoring, confirm "Next" is disabled with zero items and enabled once ≥1 exists, link a control to one item, attach a piece of evidence (title + url) to one item, set a residual score on the item with a linked control.
3. Click Next to Review — confirm it shows both items with correct inherent/residual summaries.
4. Click Back once — confirm it returns to Items with all data intact (nothing lost).
5. Click Next then Finish — confirm the wizard closes and you land on that assessment's detail page, Items tab shows the same 2 items with the same scores/controls/evidence you entered.
6. Reopen the wizard for a NEW assessment, fill Details, click Next, then close the wizard (X) before adding any items — confirm on the list page a `draft` assessment now exists with zero items (data wasn't lost, matching the "always-persisted" design decision).

Take screenshots as evidence. Report any console errors.

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/routes/_dashboard/-assessments.page.tsx
git commit -m "feat(client): open AssessmentWizard from the list page, remove old create dialog"
```

---

### Task 15: i18n — en/es/he/ru keys

**Files:**
- Modify: `libs/template-shared/src/lib/i18n/locales/{en,es,he,ru}.ts`

- [ ] **Step 1: Grep the actual code for every new `t('assessments...')` call introduced by Tasks 9-14** — `AssessmentItemEvidence.tsx`, `AssessmentItemsPanel.tsx`, `AssessmentWizard.tsx`, the modified `-assessment-detail.page.tsx`/`-assessments.page.tsx`. Do not trust the key names guessed in this plan's code samples above verbatim — some may differ slightly once written; grep is the source of truth (same discipline as Phase B.1's Task 22).

- [ ] **Step 2: Add the new keys to `en.ts`'s `assessments` block** — expect at least: `evidence`, `addEvidence`, `evidenceTitlePlaceholder`, `evidenceUrlPlaceholder`, `wizard.step.details`, `wizard.step.items`, `wizard.step.review`, `wizard.next`, `wizard.back`, `wizard.finish`, `wizard.needOneItemHint`, `wizard.reviewIntro`, plus whatever short note-key Task 13 introduced for the disabled-fields-on-revisit explanation.

- [ ] **Step 3: Translate into `es.ts`, `he.ts`, `ru.ts`** — real, idiomatic translations, reusing existing terminology from the rest of the `assessments`/`risks` blocks in the same files where applicable (e.g. "owner"/"evidence" terms should match how Risk Register already phrases them).

- [ ] **Step 4: Verify key-set parity** across all 4 locales (same extraction+diff technique as Phase B.1's Task 22).

- [ ] **Step 5: Build**

Run: `yarn nx build template-shared && yarn nx build client`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add libs/template-shared/src/lib/i18n/locales/en.ts libs/template-shared/src/lib/i18n/locales/es.ts libs/template-shared/src/lib/i18n/locales/he.ts libs/template-shared/src/lib/i18n/locales/ru.ts
git commit -m "feat(i18n): add Assessment Phase B.2.1 wizard and evidence strings"
```

---

### Task 16: Client unit tests — `AssessmentWizard`, `AssessmentItemsPanel`, `AssessmentItemEvidence`

**Files:**
- Create: `apps/client/src/components/assessments/__tests__/AssessmentWizard.unit.test.tsx`
- Modify or split: `apps/client/src/routes/_dashboard/__tests__/assessment-detail.unit.test.tsx` — the Items-tab assertions that moved to `AssessmentItemsPanel` in Task 10 should move to a new `apps/client/src/components/assessments/__tests__/AssessmentItemsPanel.unit.test.tsx` rather than being duplicated in both places.

- [ ] **Step 1: Read the CURRENT `assessment-detail.unit.test.tsx`** to identify exactly which existing test cases exercise Items-tab behavior (add item, expand, link control, residual scoring, delete) — these test the code that Task 10 moved into `AssessmentItemsPanel`. Move (not copy) them into the new `AssessmentItemsPanel.unit.test.tsx`, adjusting the render target from the full detail page to the standalone panel component and updating props/mocks accordingly. `assessment-detail.unit.test.tsx` keeps only Overview-tab and lifecycle-button tests, plus a minimal smoke test confirming it renders `AssessmentItemsPanel` when the Items tab is active (no need to re-test the panel's internals from the page-level test — that would duplicate coverage).

- [ ] **Step 2: Add evidence coverage to `AssessmentItemsPanel.unit.test.tsx`** — expanding an item shows the evidence section, adding evidence (title required, url optional) calls the mocked `useCreateAssessmentItemEvidence` mutation, existing evidence renders.

- [ ] **Step 3: Write `AssessmentWizard.unit.test.tsx`** — cover: Details step validation (Next disabled until title/type/owner filled), Details "Next" calls `useCreateAssessment` and advances to Items; Items step "Next" is disabled with zero items (mock `useAssessmentItems` returning `[]`) and enabled with ≥1; Back from Items returns to Details with the assessment already created (no second create call fired); Review step renders items from a fixture; Finish calls `onOpenChange(false)` (via the close path) and navigates to the assessment's detail route, and does NOT call any submit-for-review mutation (assert the mock was never invoked).

Follow the established mocking conventions from `assessments.unit.test.tsx`/`assessment-detail.unit.test.tsx` (whole-module `@/queries/*` mocks, `useAuthStore`/`useOrgMembers` mock fixtures, the `wrap()` render helper) — read those files first for the exact pattern.

- [ ] **Step 4: Run**

Run: `yarn nx test client -- assessment`
Expected: PASS, no regressions in the moved/adjusted tests.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/components/assessments/__tests__/AssessmentWizard.unit.test.tsx apps/client/src/components/assessments/__tests__/AssessmentItemsPanel.unit.test.tsx apps/client/src/routes/_dashboard/__tests__/assessment-detail.unit.test.tsx
git commit -m "test(client): cover AssessmentWizard, extracted AssessmentItemsPanel, and evidence"
```

---

### Task 17: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full affected pipeline**

Run: `yarn nx affected -t lint,build,test --base=dev --head=HEAD`
Expected: all green.

- [ ] **Step 2: Mandatory Playwright smoke check** (in addition to Task 14's wizard-specific walkthrough)

Confirm the pre-existing (not touched by this plan) parts of the Assessment feature still work: list page KPI bar, Manage Types sheet, lifecycle actions (start/submit/approve/complete/archive) on an assessment created via the wizard, and that an assessment created via the OLD path (if any still exist from before this branch) still opens and displays correctly on the detail page (the `AssessmentItemsPanel` extraction in Task 10 must not have broken anything for pre-existing data).

- [ ] **Step 3: Report status**

If everything above is green, Phase B.2.1 is complete and ready for its own PR against `dev`. Phase B.2.2 (Risk Register bridge) and B.2.3 (Findings → Issue bridge) are separate specs/plans that start once this one is reviewed and merged.

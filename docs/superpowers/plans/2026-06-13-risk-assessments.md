# Risk Assessments (CVRA / CTRA) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Risk Assessments module supporting two assessment types — CVRA (Cyber Vulnerability Risk Assessment, asset-based) and CTRA (Cyber Threat Risk Assessment, threat scenario-based) — each with line items, an aggregate risk score, and a simple status workflow (draft → in_review → completed).

**Architecture:** A single `risk_assessments` table with a `type` discriminator and a `risk_assessment_items` child table. Extends `NotesStrategy` following the existing notes MS pattern. The aggregate `riskScore` is recomputed on each item save using the same likelihood×impact formula as the Risk Catalog. Frontend shows a list of assessments per org with a detail drill-down page for items.

**Tech Stack:** NestJS TCP microservices, Supabase (PostgreSQL), TanStack Router (list + detail routes), TanStack Query, shadcn/ui, react-i18next (en/he/ru/es), Vitest

---

## File Map

**New files:**
- `supabase/migrations/20260613000003_risk_assessments.sql`
- `apps/client/src/queries/assessments.ts`
- `apps/client/src/routes/_dashboard/assessments.tsx`
- `apps/client/src/routes/_dashboard/assessments_.$id.tsx`

**Modified files:**
- `libs/shared/src/strategies/notes.ts` — RiskAssessment, RiskAssessmentItem types + NotesStrategy methods
- `libs/shared/src/strategies/fakes/fake-notes.ts` — in-memory implementations
- `libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts` — contract tests
- `apps/microservices/notes/src/app/supabase-notes.strategy.ts` — DB implementations
- `apps/microservices/notes/src/app/notes.controller.ts` — `@MessagePattern` handlers
- `libs/notes-client/src/lib/notes-client.service.ts` — TCP proxy methods
- `apps/api/src/app/notes/notes.controller.ts` — HTTP endpoints
- `libs/template-shared/src/lib/i18n/locales/en.ts` + he/ru/es — i18n keys
- `apps/client/src/components/layout/LayoutSider.tsx` — nav items

---

### Task 1: Types — RiskAssessment and RiskAssessmentItem in `@icore/shared`

**Files:**
- Modify: `libs/shared/src/strategies/notes.ts`

- [ ] **Step 1: Add Risk Assessment types after the Risk Catalog types block**

```typescript
// ─── Risk Assessments ──────────────────────────────────────────────────────

export type AssessmentType = 'cvra' | 'ctra';
export type AssessmentStatus = 'draft' | 'in_review' | 'completed';

export interface RiskAssessment {
  id: string;
  orgId: string;
  userId: string;
  type: AssessmentType;
  title: string;
  scope: string;
  status: AssessmentStatus;
  riskScore: number;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface RiskAssessmentInput {
  type: AssessmentType;
  title: string;
  scope: string;
}

export interface RiskAssessmentPatch {
  title?: string;
  scope?: string;
  status?: AssessmentStatus;
}

export interface RiskAssessmentItem {
  id: string;
  assessmentId: string;
  subject: string;
  description: string;
  likelihood: RiskLikelihood;
  impact: RiskImpact;
  itemScore: number;
  mitigations: string;
  createdAt: string;
  updatedAt: string;
}

export interface RiskAssessmentItemInput {
  subject: string;
  description: string;
  likelihood: RiskLikelihood;
  impact: RiskImpact;
  mitigations?: string;
}

export interface RiskAssessmentItemPatch {
  subject?: string;
  description?: string;
  likelihood?: RiskLikelihood;
  impact?: RiskImpact;
  mitigations?: string;
}
```

- [ ] **Step 2: Add methods to `NotesStrategy` interface**

```typescript
  // Risk Assessments
  listAssessments(orgId: string): Promise<RiskAssessment[]>;
  createAssessment(orgId: string, userId: string, data: RiskAssessmentInput): Promise<RiskAssessment>;
  getAssessment(id: string): Promise<RiskAssessment | null>;
  updateAssessment(id: string, patch: RiskAssessmentPatch): Promise<RiskAssessment>;
  deleteAssessment(id: string): Promise<void>;

  // Assessment items
  listAssessmentItems(assessmentId: string): Promise<RiskAssessmentItem[]>;
  addAssessmentItem(assessmentId: string, data: RiskAssessmentItemInput): Promise<RiskAssessmentItem>;
  updateAssessmentItem(id: string, patch: RiskAssessmentItemPatch): Promise<RiskAssessmentItem>;
  deleteAssessmentItem(id: string): Promise<void>;
```

- [ ] **Step 3: Build shared**

```bash
yarn nx build shared
```

Expected: success.

- [ ] **Step 4: Commit**

```bash
git add libs/shared/src/strategies/notes.ts
git commit -m "feat(shared): add RiskAssessment and RiskAssessmentItem types to NotesStrategy"
```

---

### Task 2: Supabase migration — risk_assessments + risk_assessment_items tables

**Files:**
- Create: `supabase/migrations/20260613000003_risk_assessments.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- risk_assessments
create table public.risk_assessments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.org_profiles(id) on delete cascade,
  user_id uuid not null,
  type text not null check (type in ('cvra','ctra')),
  title text not null,
  scope text not null default '',
  status text not null default 'draft' check (status in ('draft','in_review','completed')),
  risk_score int not null default 0,
  item_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index risk_assessments_org_id_idx on public.risk_assessments(org_id);

alter table public.risk_assessments enable row level security;
create policy "org members read assessments"
  on public.risk_assessments for select using (true);
create policy "users manage own assessments"
  on public.risk_assessments for all using (auth.uid() = user_id);

-- risk_assessment_items
create table public.risk_assessment_items (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.risk_assessments(id) on delete cascade,
  subject text not null,
  description text not null default '',
  likelihood text not null default 'medium' check (likelihood in ('very_low','low','medium','high','very_high')),
  impact text not null default 'medium' check (impact in ('very_low','low','medium','high','very_high')),
  item_score int not null default 9,
  mitigations text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index risk_assessment_items_assessment_id_idx on public.risk_assessment_items(assessment_id);

alter table public.risk_assessment_items enable row level security;
create policy "items inherit assessment access"
  on public.risk_assessment_items for all
  using (
    exists (
      select 1 from public.risk_assessments ra
      where ra.id = assessment_id and ra.user_id = auth.uid()
    )
  );
```

- [ ] **Step 2: Apply migration**

```bash
npx supabase db push
```

Expected: `Applied 1 migration`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260613000003_risk_assessments.sql
git commit -m "feat(db): add risk_assessments and risk_assessment_items tables"
```

---

### Task 3: FakeNotesStrategy — RiskAssessment implementations

**Files:**
- Modify: `libs/shared/src/strategies/fakes/fake-notes.ts`

- [ ] **Step 1: Add imports**

Add to existing `@icore/shared` import:
```
RiskAssessment, RiskAssessmentInput, RiskAssessmentPatch,
RiskAssessmentItem, RiskAssessmentItemInput, RiskAssessmentItemPatch,
```

- [ ] **Step 2: Add methods at the end of `FakeNotesStrategy` class**

```typescript
  // ─── Risk Assessments ────────────────────────────────────────────────────
  private assessments: RiskAssessment[] = [];
  private assessmentItems: RiskAssessmentItem[] = [];

  async listAssessments(orgId: string): Promise<RiskAssessment[]> {
    return this.assessments.filter((a) => a.orgId === orgId);
  }

  async createAssessment(orgId: string, userId: string, data: RiskAssessmentInput): Promise<RiskAssessment> {
    const assessment: RiskAssessment = {
      id: crypto.randomUUID(),
      orgId,
      userId,
      type: data.type,
      title: data.title,
      scope: data.scope,
      status: 'draft',
      riskScore: 0,
      itemCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.assessments.push(assessment);
    return assessment;
  }

  async getAssessment(id: string): Promise<RiskAssessment | null> {
    return this.assessments.find((a) => a.id === id) ?? null;
  }

  async updateAssessment(id: string, patch: RiskAssessmentPatch): Promise<RiskAssessment> {
    const idx = this.assessments.findIndex((a) => a.id === id);
    if (idx === -1) throw new Error('assessment_not_found');
    this.assessments[idx] = { ...this.assessments[idx], ...patch, updatedAt: new Date().toISOString() };
    return this.assessments[idx];
  }

  async deleteAssessment(id: string): Promise<void> {
    this.assessmentItems = this.assessmentItems.filter((i) => i.assessmentId !== id);
    this.assessments = this.assessments.filter((a) => a.id !== id);
  }

  async listAssessmentItems(assessmentId: string): Promise<RiskAssessmentItem[]> {
    return this.assessmentItems.filter((i) => i.assessmentId === assessmentId);
  }

  async addAssessmentItem(assessmentId: string, data: RiskAssessmentItemInput): Promise<RiskAssessmentItem> {
    const score = this.computeRiskScore(data.likelihood, data.impact);
    const item: RiskAssessmentItem = {
      id: crypto.randomUUID(),
      assessmentId,
      subject: data.subject,
      description: data.description,
      likelihood: data.likelihood,
      impact: data.impact,
      itemScore: score,
      mitigations: data.mitigations ?? '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.assessmentItems.push(item);
    this.recomputeAssessmentScore(assessmentId);
    return item;
  }

  async updateAssessmentItem(id: string, patch: RiskAssessmentItemPatch): Promise<RiskAssessmentItem> {
    const idx = this.assessmentItems.findIndex((i) => i.id === id);
    if (idx === -1) throw new Error('item_not_found');
    const updated = { ...this.assessmentItems[idx], ...patch, updatedAt: new Date().toISOString() };
    if (patch.likelihood || patch.impact) {
      updated.itemScore = this.computeRiskScore(updated.likelihood, updated.impact);
    }
    this.assessmentItems[idx] = updated;
    this.recomputeAssessmentScore(updated.assessmentId);
    return this.assessmentItems[idx];
  }

  async deleteAssessmentItem(id: string): Promise<void> {
    const item = this.assessmentItems.find((i) => i.id === id);
    this.assessmentItems = this.assessmentItems.filter((i) => i.id !== id);
    if (item) this.recomputeAssessmentScore(item.assessmentId);
  }

  private recomputeAssessmentScore(assessmentId: string): void {
    const items = this.assessmentItems.filter((i) => i.assessmentId === assessmentId);
    const idx = this.assessments.findIndex((a) => a.id === assessmentId);
    if (idx === -1) return;
    const riskScore = items.length > 0
      ? Math.round(items.reduce((sum, i) => sum + i.itemScore, 0) / items.length)
      : 0;
    this.assessments[idx] = {
      ...this.assessments[idx],
      riskScore,
      itemCount: items.length,
      updatedAt: new Date().toISOString(),
    };
  }
```

Note: `computeRiskScore` is inherited from the Risk Catalog task (same class). If implementing this plan in isolation, add the private helper:
```typescript
  private computeRiskScore(likelihood: RiskLikelihood, impact: RiskImpact): number {
    const L: Record<RiskLikelihood, number> = { very_low: 1, low: 2, medium: 3, high: 4, very_high: 5 };
    const I: Record<RiskImpact, number> = { very_low: 1, low: 2, medium: 3, high: 4, very_high: 5 };
    return L[likelihood] * I[impact];
  }
```

- [ ] **Step 3: Build**

```bash
yarn nx build shared
```

Expected: success.

- [ ] **Step 4: Commit**

```bash
git add libs/shared/src/strategies/fakes/fake-notes.ts
git commit -m "feat(shared): implement RiskAssessment methods in FakeNotesStrategy"
```

---

### Task 4: Contract tests for Risk Assessments

**Files:**
- Modify: `libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts`

- [ ] **Step 1: Add assessment contract tests**

```typescript
describe('risk assessments', () => {
  let s: FakeNotesStrategy;
  beforeEach(() => { s = new FakeNotesStrategy(); });

  it('creates CVRA assessment with draft status', async () => {
    const a = await s.createAssessment('org1', 'u1', {
      type: 'cvra', title: 'Q2 CVRA', scope: 'Payment services',
    });
    expect(a.type).toBe('cvra');
    expect(a.status).toBe('draft');
    expect(a.riskScore).toBe(0);
    expect(a.itemCount).toBe(0);
  });

  it('creates CTRA assessment', async () => {
    const a = await s.createAssessment('org1', 'u1', {
      type: 'ctra', title: 'Ransomware CTRA', scope: 'All systems',
    });
    expect(a.type).toBe('ctra');
  });

  it('adds items and recomputes aggregate score', async () => {
    const a = await s.createAssessment('org1', 'u1', {
      type: 'cvra', title: 'T', scope: 'S',
    });
    await s.addAssessmentItem(a.id, {
      subject: 'Unpatched OS', description: 'Missing patches',
      likelihood: 'high', impact: 'high',
    });
    await s.addAssessmentItem(a.id, {
      subject: 'Weak auth', description: 'No MFA',
      likelihood: 'medium', impact: 'medium',
    });
    const updated = await s.getAssessment(a.id);
    expect(updated!.itemCount).toBe(2);
    expect(updated!.riskScore).toBe(Math.round((16 + 9) / 2)); // (4*4 + 3*3) / 2 = 12
  });

  it('updates assessment status', async () => {
    const a = await s.createAssessment('org1', 'u1', {
      type: 'cvra', title: 'T', scope: 'S',
    });
    const updated = await s.updateAssessment(a.id, { status: 'in_review' });
    expect(updated.status).toBe('in_review');
  });

  it('lists assessments scoped by orgId', async () => {
    await s.createAssessment('org1', 'u1', { type: 'cvra', title: 'T', scope: 'S' });
    expect(await s.listAssessments('org2')).toHaveLength(0);
    expect(await s.listAssessments('org1')).toHaveLength(1);
  });

  it('deletes assessment and its items', async () => {
    const a = await s.createAssessment('org1', 'u1', { type: 'cvra', title: 'T', scope: 'S' });
    await s.addAssessmentItem(a.id, {
      subject: 'X', description: '', likelihood: 'low', impact: 'low',
    });
    await s.deleteAssessment(a.id);
    expect(await s.listAssessments('org1')).toHaveLength(0);
    expect(await s.listAssessmentItems(a.id)).toHaveLength(0);
  });

  it('updates item and recomputes score', async () => {
    const a = await s.createAssessment('org1', 'u1', { type: 'cvra', title: 'T', scope: 'S' });
    const item = await s.addAssessmentItem(a.id, {
      subject: 'X', description: '', likelihood: 'low', impact: 'low',
    });
    await s.updateAssessmentItem(item.id, { likelihood: 'very_high', impact: 'very_high' });
    const updated = await s.getAssessment(a.id);
    expect(updated!.riskScore).toBe(25); // 5*5
  });
});
```

- [ ] **Step 2: Run tests**

```bash
yarn nx test shared
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts
git commit -m "test(shared): add RiskAssessment contract tests"
```

---

### Task 5: SupabaseNotesStrategy — Risk Assessment DB implementations

**Files:**
- Modify: `apps/microservices/notes/src/app/supabase-notes.strategy.ts`

- [ ] **Step 1: Add imports**

Add to existing `@icore/shared` import:
```
RiskAssessment, RiskAssessmentInput, RiskAssessmentPatch,
RiskAssessmentItem, RiskAssessmentItemInput, RiskAssessmentItemPatch,
```

Also add `RiskLikelihood, RiskImpact` if not already imported.

- [ ] **Step 2: Ensure `computeRiskScore` private method exists**

If not present from the Risk Catalog plan (Task 5 of asset-risk-catalogs), add:
```typescript
  private computeRiskScore(likelihood: RiskLikelihood, impact: RiskImpact): number {
    const L: Record<RiskLikelihood, number> = { very_low: 1, low: 2, medium: 3, high: 4, very_high: 5 };
    const I: Record<RiskImpact, number> = { very_low: 1, low: 2, medium: 3, high: 4, very_high: 5 };
    return L[likelihood] * I[impact];
  }
```

- [ ] **Step 3: Add Assessment methods at the end of the class**

```typescript
  async listAssessments(orgId: string): Promise<RiskAssessment[]> {
    const { data, error } = await this.db
      .from('risk_assessments')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });
    return ok(data, error).map(this.toAssessment);
  }

  async createAssessment(orgId: string, userId: string, data: RiskAssessmentInput): Promise<RiskAssessment> {
    const { data: row, error } = await this.db
      .from('risk_assessments')
      .insert({ org_id: orgId, user_id: userId, type: data.type, title: data.title, scope: data.scope })
      .select()
      .single();
    return this.toAssessment(ok(row, error));
  }

  async getAssessment(id: string): Promise<RiskAssessment | null> {
    const { data, error } = await this.db.from('risk_assessments').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? this.toAssessment(data) : null;
  }

  async updateAssessment(id: string, patch: RiskAssessmentPatch): Promise<RiskAssessment> {
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.title !== undefined) update['title'] = patch.title;
    if (patch.scope !== undefined) update['scope'] = patch.scope;
    if (patch.status !== undefined) update['status'] = patch.status;
    const { data, error } = await this.db
      .from('risk_assessments')
      .update(update)
      .eq('id', id)
      .select()
      .single();
    return this.toAssessment(ok(data, error));
  }

  async deleteAssessment(id: string): Promise<void> {
    const { error } = await this.db.from('risk_assessments').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  async listAssessmentItems(assessmentId: string): Promise<RiskAssessmentItem[]> {
    const { data, error } = await this.db
      .from('risk_assessment_items')
      .select('*')
      .eq('assessment_id', assessmentId)
      .order('item_score', { ascending: false });
    return ok(data, error).map(this.toAssessmentItem);
  }

  async addAssessmentItem(assessmentId: string, data: RiskAssessmentItemInput): Promise<RiskAssessmentItem> {
    const itemScore = this.computeRiskScore(data.likelihood, data.impact);
    const { data: row, error } = await this.db
      .from('risk_assessment_items')
      .insert({
        assessment_id: assessmentId,
        subject: data.subject,
        description: data.description,
        likelihood: data.likelihood,
        impact: data.impact,
        item_score: itemScore,
        mitigations: data.mitigations ?? '',
      })
      .select()
      .single();
    const item = this.toAssessmentItem(ok(row, error));
    await this.recomputeAssessmentScore(assessmentId);
    return item;
  }

  async updateAssessmentItem(id: string, patch: RiskAssessmentItemPatch): Promise<RiskAssessmentItem> {
    const existing = await this.db
      .from('risk_assessment_items')
      .select('likelihood, impact, assessment_id')
      .eq('id', id)
      .single();
    if (existing.error) throw new Error(existing.error.message);
    const newLikelihood = patch.likelihood ?? (existing.data['likelihood'] as RiskLikelihood);
    const newImpact = patch.impact ?? (existing.data['impact'] as RiskImpact);
    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      item_score: this.computeRiskScore(newLikelihood, newImpact),
    };
    if (patch.subject !== undefined) update['subject'] = patch.subject;
    if (patch.description !== undefined) update['description'] = patch.description;
    if (patch.likelihood !== undefined) update['likelihood'] = patch.likelihood;
    if (patch.impact !== undefined) update['impact'] = patch.impact;
    if (patch.mitigations !== undefined) update['mitigations'] = patch.mitigations;
    const { data: row, error } = await this.db
      .from('risk_assessment_items')
      .update(update)
      .eq('id', id)
      .select()
      .single();
    const item = this.toAssessmentItem(ok(row, error));
    await this.recomputeAssessmentScore(existing.data['assessment_id'] as string);
    return item;
  }

  async deleteAssessmentItem(id: string): Promise<void> {
    const { data: existing } = await this.db
      .from('risk_assessment_items')
      .select('assessment_id')
      .eq('id', id)
      .single();
    const { error } = await this.db.from('risk_assessment_items').delete().eq('id', id);
    if (error) throw new Error(error.message);
    if (existing) await this.recomputeAssessmentScore(existing['assessment_id'] as string);
  }

  private async recomputeAssessmentScore(assessmentId: string): Promise<void> {
    const { data: items } = await this.db
      .from('risk_assessment_items')
      .select('item_score')
      .eq('assessment_id', assessmentId);
    const rows = items ?? [];
    const riskScore = rows.length > 0
      ? Math.round(rows.reduce((s: number, r: Record<string, unknown>) => s + (r['item_score'] as number), 0) / rows.length)
      : 0;
    await this.db
      .from('risk_assessments')
      .update({ risk_score: riskScore, item_count: rows.length, updated_at: new Date().toISOString() })
      .eq('id', assessmentId);
  }

  private toAssessment(row: Record<string, unknown>): RiskAssessment {
    return {
      id: row['id'] as string,
      orgId: row['org_id'] as string,
      userId: row['user_id'] as string,
      type: row['type'] as AssessmentType,
      title: row['title'] as string,
      scope: row['scope'] as string,
      status: row['status'] as AssessmentStatus,
      riskScore: row['risk_score'] as number,
      itemCount: row['item_count'] as number,
      createdAt: row['created_at'] as string,
      updatedAt: row['updated_at'] as string,
    };
  }

  private toAssessmentItem(row: Record<string, unknown>): RiskAssessmentItem {
    return {
      id: row['id'] as string,
      assessmentId: row['assessment_id'] as string,
      subject: row['subject'] as string,
      description: row['description'] as string,
      likelihood: row['likelihood'] as RiskAssessmentItem['likelihood'],
      impact: row['impact'] as RiskAssessmentItem['impact'],
      itemScore: row['item_score'] as number,
      mitigations: row['mitigations'] as string,
      createdAt: row['created_at'] as string,
      updatedAt: row['updated_at'] as string,
    };
  }
```

- [ ] **Step 4: Build**

```bash
yarn nx build notes
```

Expected: success.

- [ ] **Step 5: Commit**

```bash
git add apps/microservices/notes/src/app/supabase-notes.strategy.ts
git commit -m "feat(notes-ms): implement RiskAssessment Supabase strategy methods"
```

---

### Task 6: Notes MS controller + NotesClientService + Gateway endpoints

**Files:**
- Modify: `apps/microservices/notes/src/app/notes.controller.ts`
- Modify: `libs/notes-client/src/lib/notes-client.service.ts`
- Modify: `apps/api/src/app/notes/notes.controller.ts`

- [ ] **Step 1: Add `@MessagePattern` handlers to notes MS controller**

Add imports: `RiskAssessment, RiskAssessmentInput, RiskAssessmentPatch, RiskAssessmentItem, RiskAssessmentItemInput, RiskAssessmentItemPatch`.

Add handlers:
```typescript
  @MessagePattern('notes.assessments.list')
  listAssessments(@Payload() p: { orgId: string }): Promise<RiskAssessment[]> {
    return this.strategy.listAssessments(p.orgId);
  }
  @MessagePattern('notes.assessments.create')
  createAssessment(@Payload() p: { orgId: string; userId: string; data: RiskAssessmentInput }): Promise<RiskAssessment> {
    return this.strategy.createAssessment(p.orgId, p.userId, p.data);
  }
  @MessagePattern('notes.assessments.get')
  getAssessment(@Payload() p: { id: string }): Promise<RiskAssessment | null> {
    return this.strategy.getAssessment(p.id);
  }
  @MessagePattern('notes.assessments.update')
  updateAssessment(@Payload() p: { id: string; patch: RiskAssessmentPatch }): Promise<RiskAssessment> {
    return this.strategy.updateAssessment(p.id, p.patch);
  }
  @MessagePattern('notes.assessments.delete')
  deleteAssessment(@Payload() p: { id: string }): Promise<void> {
    return this.strategy.deleteAssessment(p.id);
  }
  @MessagePattern('notes.assessments.items.list')
  listAssessmentItems(@Payload() p: { assessmentId: string }): Promise<RiskAssessmentItem[]> {
    return this.strategy.listAssessmentItems(p.assessmentId);
  }
  @MessagePattern('notes.assessments.items.add')
  addAssessmentItem(@Payload() p: { assessmentId: string; data: RiskAssessmentItemInput }): Promise<RiskAssessmentItem> {
    return this.strategy.addAssessmentItem(p.assessmentId, p.data);
  }
  @MessagePattern('notes.assessments.items.update')
  updateAssessmentItem(@Payload() p: { id: string; patch: RiskAssessmentItemPatch }): Promise<RiskAssessmentItem> {
    return this.strategy.updateAssessmentItem(p.id, p.patch);
  }
  @MessagePattern('notes.assessments.items.delete')
  deleteAssessmentItem(@Payload() p: { id: string }): Promise<void> {
    return this.strategy.deleteAssessmentItem(p.id);
  }
```

- [ ] **Step 2: Add TCP proxy methods to `NotesClientService`**

Add imports: same as above.

```typescript
  listAssessments(orgId: string): Promise<RiskAssessment[]> {
    return firstValueFrom(this.client.send<RiskAssessment[]>('notes.assessments.list', { orgId }));
  }
  createAssessment(orgId: string, userId: string, data: RiskAssessmentInput): Promise<RiskAssessment> {
    return firstValueFrom(this.client.send<RiskAssessment>('notes.assessments.create', { orgId, userId, data }));
  }
  getAssessment(id: string): Promise<RiskAssessment | null> {
    return firstValueFrom(this.client.send<RiskAssessment | null>('notes.assessments.get', { id }));
  }
  updateAssessment(id: string, patch: RiskAssessmentPatch): Promise<RiskAssessment> {
    return firstValueFrom(this.client.send<RiskAssessment>('notes.assessments.update', { id, patch }));
  }
  deleteAssessment(id: string): Promise<void> {
    return firstValueFrom(this.client.send<void>('notes.assessments.delete', { id }));
  }
  listAssessmentItems(assessmentId: string): Promise<RiskAssessmentItem[]> {
    return firstValueFrom(this.client.send<RiskAssessmentItem[]>('notes.assessments.items.list', { assessmentId }));
  }
  addAssessmentItem(assessmentId: string, data: RiskAssessmentItemInput): Promise<RiskAssessmentItem> {
    return firstValueFrom(this.client.send<RiskAssessmentItem>('notes.assessments.items.add', { assessmentId, data }));
  }
  updateAssessmentItem(id: string, patch: RiskAssessmentItemPatch): Promise<RiskAssessmentItem> {
    return firstValueFrom(this.client.send<RiskAssessmentItem>('notes.assessments.items.update', { id, patch }));
  }
  deleteAssessmentItem(id: string): Promise<void> {
    return firstValueFrom(this.client.send<void>('notes.assessments.items.delete', { id }));
  }
```

- [ ] **Step 3: Add HTTP endpoints to gateway notes controller**

Add imports: `RiskAssessmentInput, RiskAssessmentPatch, RiskAssessmentItemInput, RiskAssessmentItemPatch`.

```typescript
  @Get('assessments')
  listAssessments(@Req() req: Request & { user?: VerifiedToken }, @Query('orgId') orgId: string) {
    this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    return this.notes.listAssessments(orgId);
  }

  @Post('assessments')
  createAssessment(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
    @Body() body: RiskAssessmentInput,
  ) {
    const userId = this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    return this.notes.createAssessment(orgId, userId, body);
  }

  @Get('assessments/:id')
  async getAssessment(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    const a = await this.notes.getAssessment(id);
    if (!a) throw new NotFoundException();
    return a;
  }

  @Patch('assessments/:id')
  updateAssessment(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() patch: RiskAssessmentPatch,
  ) {
    this.uid(req);
    return this.notes.updateAssessment(id, patch);
  }

  @Delete('assessments/:id')
  @HttpCode(204)
  deleteAssessment(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    return this.notes.deleteAssessment(id);
  }

  @Get('assessments/:id/items')
  listAssessmentItems(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    return this.notes.listAssessmentItems(id);
  }

  @Post('assessments/:id/items')
  addAssessmentItem(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') assessmentId: string,
    @Body() body: RiskAssessmentItemInput,
  ) {
    this.uid(req);
    return this.notes.addAssessmentItem(assessmentId, body);
  }

  @Patch('assessments/items/:itemId')
  updateAssessmentItem(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('itemId') itemId: string,
    @Body() patch: RiskAssessmentItemPatch,
  ) {
    this.uid(req);
    return this.notes.updateAssessmentItem(itemId, patch);
  }

  @Delete('assessments/items/:itemId')
  @HttpCode(204)
  deleteAssessmentItem(@Req() req: Request & { user?: VerifiedToken }, @Param('itemId') itemId: string) {
    this.uid(req);
    return this.notes.deleteAssessmentItem(itemId);
  }
```

- [ ] **Step 4: Build all three**

```bash
yarn nx build notes && yarn nx build notes-client && yarn nx build api
```

Expected: all succeed.

- [ ] **Step 5: Commit**

```bash
git add \
  apps/microservices/notes/src/app/notes.controller.ts \
  libs/notes-client/src/lib/notes-client.service.ts \
  apps/api/src/app/notes/notes.controller.ts
git commit -m "feat: add RiskAssessment MessagePatterns, TCP proxy, and HTTP endpoints"
```

---

### Task 7: Client React Query hooks

**Files:**
- Create: `apps/client/src/queries/assessments.ts`

- [ ] **Step 1: Create `apps/client/src/queries/assessments.ts`**

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  RiskAssessment, RiskAssessmentInput, RiskAssessmentPatch,
  RiskAssessmentItem, RiskAssessmentItemInput, RiskAssessmentItemPatch,
} from '@icore/shared';

export type {
  RiskAssessment, RiskAssessmentInput, RiskAssessmentPatch,
  RiskAssessmentItem, RiskAssessmentItemInput, RiskAssessmentItemPatch,
};

export function useAssessments(orgId: string) {
  return useQuery<RiskAssessment[]>({
    queryKey: ['assessments', orgId],
    queryFn: () => api<RiskAssessment[]>(`/assessments?orgId=${encodeURIComponent(orgId)}`),
    enabled: !!orgId,
  });
}

export function useAssessment(id: string) {
  return useQuery<RiskAssessment>({
    queryKey: ['assessments', id],
    queryFn: () => api<RiskAssessment>(`/assessments/${id}`),
    enabled: !!id,
  });
}

export function useAssessmentItems(assessmentId: string) {
  return useQuery<RiskAssessmentItem[]>({
    queryKey: ['assessments', assessmentId, 'items'],
    queryFn: () => api<RiskAssessmentItem[]>(`/assessments/${assessmentId}/items`),
    enabled: !!assessmentId,
  });
}

export function useCreateAssessment(orgId: string) {
  const qc = useQueryClient();
  return useMutation<RiskAssessment, Error, RiskAssessmentInput>({
    mutationFn: (data) =>
      api<RiskAssessment>(`/assessments?orgId=${encodeURIComponent(orgId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assessments', orgId] }),
  });
}

export function useUpdateAssessment(orgId: string, id: string) {
  const qc = useQueryClient();
  return useMutation<RiskAssessment, Error, RiskAssessmentPatch>({
    mutationFn: (patch) =>
      api<RiskAssessment>(`/assessments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assessments', orgId] });
      qc.invalidateQueries({ queryKey: ['assessments', id] });
    },
  });
}

export function useDeleteAssessment(orgId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => api<void>(`/assessments/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assessments', orgId] }),
  });
}

export function useAddAssessmentItem(assessmentId: string) {
  const qc = useQueryClient();
  return useMutation<RiskAssessmentItem, Error, RiskAssessmentItemInput>({
    mutationFn: (data) =>
      api<RiskAssessmentItem>(`/assessments/${assessmentId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assessments', assessmentId, 'items'] });
      qc.invalidateQueries({ queryKey: ['assessments', assessmentId] });
    },
  });
}

export function useUpdateAssessmentItem(assessmentId: string) {
  const qc = useQueryClient();
  return useMutation<RiskAssessmentItem, Error, { id: string; patch: RiskAssessmentItemPatch }>({
    mutationFn: ({ id, patch }) =>
      api<RiskAssessmentItem>(`/assessments/items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assessments', assessmentId, 'items'] });
      qc.invalidateQueries({ queryKey: ['assessments', assessmentId] });
    },
  });
}

export function useDeleteAssessmentItem(assessmentId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => api<void>(`/assessments/items/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assessments', assessmentId, 'items'] });
      qc.invalidateQueries({ queryKey: ['assessments', assessmentId] });
    },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/client/src/queries/assessments.ts
git commit -m "feat(client): add RiskAssessment React Query hooks"
```

---

### Task 8: Client routes — Assessments list + detail pages

**Files:**
- Create: `apps/client/src/routes/_dashboard/assessments.tsx`
- Create: `apps/client/src/routes/_dashboard/assessments_.$id.tsx`

- [ ] **Step 1: Create `apps/client/src/routes/_dashboard/assessments.tsx`**

```tsx
import { useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Plus, ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageLayout } from '@/components/PageLayout';
import { useActiveOrgStore } from '@/stores/active-org';
import {
  useAssessments, useCreateAssessment, useDeleteAssessment,
  type RiskAssessment, type RiskAssessmentInput,
} from '@/queries/assessments';

export const Route = createFileRoute('/_dashboard/assessments')({
  component: AssessmentsPage,
});

const STATUS_COLORS: Record<RiskAssessment['status'], string> = {
  draft:      'bg-muted text-muted-foreground border-border',
  in_review:  'bg-amber-500/10 text-amber-400 border-amber-500/20',
  completed:  'bg-green-500/10 text-green-400 border-green-500/20',
};

const SCORE_COLOR = (score: number) => {
  if (score >= 20) return 'text-red-400';
  if (score >= 12) return 'text-orange-400';
  if (score >= 6) return 'text-amber-400';
  return 'text-green-400';
};

function AssessmentsPage() {
  const { t } = useTranslation();
  const { activeOrgId } = useActiveOrgStore();
  const orgId = activeOrgId ?? '';

  const { data: assessments = [], isPending } = useAssessments(orgId);
  const createMut = useCreateAssessment(orgId);
  const deleteMut = useDeleteAssessment(orgId);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<RiskAssessmentInput>({ type: 'cvra', title: '', scope: '' });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title) return;
    createMut.mutate(form, {
      onSuccess: () => { setOpen(false); setForm({ type: 'cvra', title: '', scope: '' }); },
    });
  }

  return (
    <PageLayout title={t('nav.assessments')}>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{t('assessments.subtitle')}</p>
        <Button size="sm" onClick={() => setOpen(true)} disabled={!orgId}>
          <Plus size={14} className="mr-1.5" />
          {t('assessments.newAssessment')}
        </Button>
      </div>

      {isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 bg-surface border border-border rounded-xl animate-pulse" />
          ))}
        </div>
      ) : assessments.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
          <ClipboardList size={32} className="opacity-30" />
          <p className="text-sm">{t('assessments.empty')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {assessments.map((a) => (
            <Link
              key={a.id}
              to="/assessments/$id"
              params={{ id: a.id }}
              className="flex items-center gap-4 bg-surface border border-border rounded-xl p-4 hover:border-muted-foreground/40 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-muted text-muted-foreground/80 border border-border">
                    {a.type.toUpperCase()}
                  </span>
                  <span className="font-medium text-sm text-foreground truncate">{a.title}</span>
                  <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border ${STATUS_COLORS[a.status]}`}>
                    {t(`assessments.status.${a.status}`)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground/60">{a.scope} · {a.itemCount} {t('assessments.items')}</p>
              </div>
              <span className={`text-xl font-bold tabular-nums shrink-0 ${SCORE_COLOR(a.riskScore)}`}>
                {a.riskScore}
              </span>
            </Link>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('assessments.newAssessment')}</DialogTitle>
            <DialogDescription>{t('assessments.newDescription')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>{t('assessments.type')}</Label>
              <div className="flex gap-3">
                {(['cvra', 'ctra'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, type }))}
                    className={`flex-1 py-2 rounded-md border text-sm font-medium transition-colors ${
                      form.type === type
                        ? 'border-green-500/40 bg-green-500/10 text-green-400'
                        : 'border-border bg-surface text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {type.toUpperCase()}
                    <span className="block text-[10px] font-normal opacity-70 mt-0.5">
                      {t(`assessments.typeLabel.${type}`)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('assessments.title')}</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder={t('assessments.titlePlaceholder')}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>{t('assessments.scope')}</Label>
              <Input
                value={form.scope}
                onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value }))}
                placeholder={t('assessments.scopePlaceholder')}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
              <Button type="submit" disabled={createMut.isPending}>
                {createMut.isPending ? t('common.saving') : t('common.create')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}
```

- [ ] **Step 2: Create `apps/client/src/routes/_dashboard/assessments_.$id.tsx`**

The `_` before `.` breaks nesting with `assessments.tsx` so the detail page renders standalone under `_dashboard`.

```tsx
import { useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageLayout } from '@/components/PageLayout';
import {
  useAssessment, useAssessmentItems, useAddAssessmentItem,
  useUpdateAssessment, useDeleteAssessmentItem,
  type RiskAssessment, type RiskAssessmentItemInput,
} from '@/queries/assessments';
import { useActiveOrgStore } from '@/stores/active-org';

export const Route = createFileRoute('/_dashboard/assessments/$id')({
  component: AssessmentDetailPage,
});

const LIKELIHOOD_OPTIONS: Array<RiskAssessmentItemInput['likelihood']> = [
  'very_low', 'low', 'medium', 'high', 'very_high',
];
const IMPACT_OPTIONS: Array<RiskAssessmentItemInput['impact']> = [
  'very_low', 'low', 'medium', 'high', 'very_high',
];
const STATUS_OPTIONS: Array<RiskAssessment['status']> = ['draft', 'in_review', 'completed'];

const SCORE_COLOR = (score: number) => {
  if (score >= 20) return 'text-red-400';
  if (score >= 12) return 'text-orange-400';
  if (score >= 6) return 'text-amber-400';
  return 'text-green-400';
};

function AssessmentDetailPage() {
  const { t } = useTranslation();
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { activeOrgId } = useActiveOrgStore();
  const orgId = activeOrgId ?? '';

  const { data: assessment, isPending: aLoading } = useAssessment(id);
  const { data: items = [], isPending: iLoading } = useAssessmentItems(id);
  const addItemMut = useAddAssessmentItem(id);
  const deleteItemMut = useDeleteAssessmentItem(id);
  const updateAssessmentMut = useUpdateAssessment(orgId, id);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<RiskAssessmentItemInput>({
    subject: '', description: '', likelihood: 'medium', impact: 'medium',
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.subject) return;
    addItemMut.mutate(form, {
      onSuccess: () => { setOpen(false); setForm({ subject: '', description: '', likelihood: 'medium', impact: 'medium' }); },
    });
  }

  if (aLoading) {
    return (
      <PageLayout title="…">
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 bg-surface border border-border rounded-lg animate-pulse" />
          ))}
        </div>
      </PageLayout>
    );
  }

  if (!assessment) {
    return (
      <PageLayout title={t('common.notFound')}>
        <p className="text-sm text-muted-foreground">{t('assessments.notFound')}</p>
      </PageLayout>
    );
  }

  return (
    <PageLayout title={assessment.title}>
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => void navigate({ to: '/assessments' })}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={14} />
          {t('assessments.backToList')}
        </button>
        <div className="flex items-center gap-2">
          <select
            value={assessment.status}
            onChange={(e) => updateAssessmentMut.mutate({ status: e.target.value as RiskAssessment['status'] })}
            className="text-xs h-7 rounded border border-border bg-surface px-2 text-foreground focus:outline-none"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{t(`assessments.status.${s}`)}</option>
            ))}
          </select>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus size={14} className="mr-1.5" />
            {t('assessments.addItem')}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4 bg-surface border border-border rounded-xl p-4">
        <div>
          <p className="text-[10px] uppercase font-bold text-muted-foreground/60">{t('assessments.scope')}</p>
          <p className="text-sm text-foreground">{assessment.scope || '—'}</p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-[10px] uppercase font-bold text-muted-foreground/60">{t('assessments.avgScore')}</p>
          <p className={`text-2xl font-bold tabular-nums ${SCORE_COLOR(assessment.riskScore)}`}>
            {assessment.riskScore}
          </p>
        </div>
      </div>

      {iLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 bg-surface border border-border rounded-lg animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-center text-muted-foreground py-12">{t('assessments.noItems')}</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="flex items-start gap-3 bg-surface border border-border rounded-xl p-4">
              <span className={`text-lg font-bold tabular-nums shrink-0 ${SCORE_COLOR(item.itemScore)}`}>
                {item.itemScore}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-foreground">{item.subject}</p>
                {item.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{item.description}</p>
                )}
                <p className="text-[11px] text-muted-foreground/60 mt-1">
                  L: {item.likelihood} · I: {item.impact}
                  {item.mitigations && ` · ${item.mitigations}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => deleteItemMut.mutate(item.id)}
                className="text-xs text-muted-foreground/50 hover:text-destructive transition-colors shrink-0"
              >
                {t('common.delete')}
              </button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('assessments.addItem')}</DialogTitle>
            <DialogDescription>{t('assessments.addItemDescription')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>{t('assessments.subject')}</Label>
              <Input
                value={form.subject}
                onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                placeholder={t('assessments.subjectPlaceholder')}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t('risks.likelihood')}</Label>
                <select
                  value={form.likelihood}
                  onChange={(e) => setForm((f) => ({ ...f, likelihood: e.target.value as typeof form.likelihood }))}
                  className="w-full h-9 rounded-md border border-border bg-surface px-3 text-sm focus:outline-none focus:ring-1 focus:ring-green-500/40"
                >
                  {LIKELIHOOD_OPTIONS.map((l) => (
                    <option key={l} value={l}>{t(`risks.scale.${l}`)}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>{t('risks.impact')}</Label>
                <select
                  value={form.impact}
                  onChange={(e) => setForm((f) => ({ ...f, impact: e.target.value as typeof form.impact }))}
                  className="w-full h-9 rounded-md border border-border bg-surface px-3 text-sm focus:outline-none focus:ring-1 focus:ring-green-500/40"
                >
                  {IMPACT_OPTIONS.map((i) => (
                    <option key={i} value={i}>{t(`risks.scale.${i}`)}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('assessments.description')}</Label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500/40 resize-none"
              />
            </div>
            <div className="space-y-2">
              <Label>{t('assessments.mitigations')}</Label>
              <Input
                value={form.mitigations ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, mitigations: e.target.value }))}
                placeholder={t('assessments.mitigationsPlaceholder')}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
              <Button type="submit" disabled={addItemMut.isPending}>
                {addItemMut.isPending ? t('common.saving') : t('common.create')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add \
  apps/client/src/routes/_dashboard/assessments.tsx \
  apps/client/src/routes/_dashboard/assessments_.$id.tsx
git commit -m "feat(client): add Risk Assessments list and detail pages"
```

---

### Task 9: i18n + nav + final checks

**Files:**
- Modify: `libs/template-shared/src/lib/i18n/locales/en.ts` + he/ru/es
- Modify: `apps/client/src/components/layout/LayoutSider.tsx`

- [ ] **Step 1: Add keys to `en.ts`**

In `nav`:
```typescript
    assessments: 'Risk Assessments',
```

Add new object:
```typescript
  assessments: {
    subtitle: 'CVRA and CTRA risk assessment workflows',
    newAssessment: 'New Assessment',
    newDescription: 'Create a CVRA (Cyber Vulnerability Risk Assessment) or CTRA (Cyber Threat Risk Assessment)',
    empty: 'No assessments yet',
    type: 'Assessment Type',
    typeLabel: {
      cvra: 'Vulnerability-based',
      ctra: 'Threat scenario-based',
    },
    title: 'Title',
    titlePlaceholder: 'e.g. Q2 2026 CVRA — Payment Services',
    scope: 'Scope',
    scopePlaceholder: 'e.g. Payment microservices, customer-facing APIs',
    status: {
      draft: 'Draft',
      in_review: 'In Review',
      completed: 'Completed',
    },
    items: 'items',
    avgScore: 'Avg Score',
    addItem: 'Add Item',
    addItemDescription: 'Add a risk item with likelihood and impact scoring',
    noItems: 'No items yet — add the first risk item',
    subject: 'Subject',
    subjectPlaceholder: 'e.g. Unpatched dependency CVE-2025-1234',
    description: 'Description',
    mitigations: 'Mitigations',
    mitigationsPlaceholder: 'Compensating controls or planned fixes',
    backToList: 'Back to assessments',
    notFound: 'Assessment not found',
  },
```

- [ ] **Step 2: Add keys to he/ru/es locales**

**he.ts** nav: `assessments: 'הערכות סיכונים'`

**ru.ts** nav: `assessments: 'Оценки рисков'`

**es.ts** nav: `assessments: 'Evaluaciones de riesgo'`

For each locale add an `assessments: {...}` object with translated strings following the same key structure.

- [ ] **Step 3: Update `LayoutSider.tsx`**

Add to `NavKey` type:
```typescript
  | 'nav.assessments'
```

Add to `sectionRisk` items:
```typescript
      { labelKey: 'nav.assessments', to: '/assessments', icon: ClipboardList },
```

Add `ClipboardList` to lucide-react import.

- [ ] **Step 4: Lint + prettier + build + tests**

```bash
npx prettier --write \
  libs/shared/src/strategies/notes.ts \
  libs/shared/src/strategies/fakes/fake-notes.ts \
  libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts \
  apps/microservices/notes/src/app/supabase-notes.strategy.ts \
  apps/microservices/notes/src/app/notes.controller.ts \
  libs/notes-client/src/lib/notes-client.service.ts \
  apps/api/src/app/notes/notes.controller.ts \
  apps/client/src/queries/assessments.ts \
  apps/client/src/routes/_dashboard/assessments.tsx \
  apps/client/src/routes/_dashboard/assessments_.\$id.tsx \
  libs/template-shared/src/lib/i18n/locales/en.ts \
  libs/template-shared/src/lib/i18n/locales/he.ts \
  libs/template-shared/src/lib/i18n/locales/ru.ts \
  libs/template-shared/src/lib/i18n/locales/es.ts \
  apps/client/src/components/layout/LayoutSider.tsx

yarn nx lint shared && yarn nx lint notes && yarn nx lint api && yarn nx lint client
yarn nx test shared
yarn nx run-many --target=build --projects=shared,notes,notes-client,api,client
```

Expected: all pass.

- [ ] **Step 5: Commit and PR**

```bash
git add -A
git commit -m "chore: prettier + final wiring — risk assessments module"
gh pr create --base dev --title "feat: Risk Assessments (CVRA/CTRA) module" --body "$(cat <<'EOF'
## Summary
- Risk Assessments module: CVRA (asset vulnerability) and CTRA (threat scenario) workflows
- Assessments have status workflow: draft → in_review → completed
- Line items with likelihood × impact scoring; aggregate score auto-recomputed
- Detail page: drill into items, add/delete, change assessment status
- Full stack: Supabase → notes MS → gateway → React Query → dashboard routes
- i18n: en/he/ru/es

## Test plan
- [ ] Create CVRA assessment → appears in list with score 0
- [ ] Open detail page → shows scope and empty items
- [ ] Add 2 items (e.g. likelihood=high/impact=high and likelihood=low/impact=low) → scores 16 and 4, average 10
- [ ] Change assessment status to "In Review" → badge updates
- [ ] Delete item → score recomputes
- [ ] Create CTRA assessment → type badge shows "CTRA"

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

*Self-review: `recomputeAssessmentScore` called consistently after add/update/delete item in both fake and Supabase strategy. Route detail uses `assessments_.$id.tsx` (underscore) to break TanStack Router nesting — same pattern as `vendors_.$id.tsx`. i18n keys `risks.likelihood`, `risks.impact`, `risks.scale.*` reused from Risk Catalog plan — no duplication.*

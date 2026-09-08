# Asset Catalog & Risk Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two catalog modules — Asset Catalog (inventory of the org's IT assets: systems, services, applications) and Risk Catalog (library of known risk entries that can be tracked and linked to assets) — following the existing notes MS CRUD pattern.

**Architecture:** Both catalogs extend `NotesStrategy`, add Supabase tables, notes MS `@MessagePattern` handlers, `NotesClientService` proxies, gateway HTTP endpoints, React Query hooks, and dashboard pages with nav entries. The risk catalog can optionally reference assets (`assetId`), creating a lightweight risk-per-asset linkage without a separate join table.

**Tech Stack:** NestJS TCP microservices, Supabase (PostgreSQL), TanStack Router, TanStack Query, shadcn/ui, react-i18next (en/he/ru/es), Vitest

---

## File Map

**New files:**
- `supabase/migrations/20260613000002_asset_risk_catalogs.sql`
- `apps/client/src/queries/assets.ts`
- `apps/client/src/queries/risks.ts`
- `apps/client/src/routes/_dashboard/assets.tsx`
- `apps/client/src/routes/_dashboard/risks.tsx`

**Modified files:**
- `libs/shared/src/strategies/notes.ts` — Asset, Risk types + NotesStrategy methods
- `libs/shared/src/strategies/fakes/fake-notes.ts` — in-memory implementations
- `libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts` — contract tests
- `apps/microservices/notes/src/app/supabase-notes.strategy.ts` — DB implementations
- `apps/microservices/notes/src/app/notes.controller.ts` — `@MessagePattern` handlers
- `libs/notes-client/src/lib/notes-client.service.ts` — TCP proxy methods
- `apps/api/src/app/notes/notes.controller.ts` — HTTP endpoints
- `libs/template-shared/src/lib/i18n/locales/en.ts` + he/ru/es — i18n keys
- `apps/client/src/components/layout/LayoutSider.tsx` — nav items

---

### Task 1: Types — Asset and Risk interfaces in `@icore/shared`

**Files:**
- Modify: `libs/shared/src/strategies/notes.ts`

- [ ] **Step 1: Add Asset types**

Insert after the Issues block (after `IssuePatch`):

```typescript
// ─── Assets ────────────────────────────────────────────────────────────────

export type AssetType = 'service' | 'application' | 'infrastructure' | 'data' | 'device' | 'other';
export type AssetCriticality = 'critical' | 'high' | 'medium' | 'low';

export interface Asset {
  id: string;
  orgId: string;
  userId: string;
  name: string;
  type: AssetType;
  criticality: AssetCriticality;
  description: string;
  owner: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AssetInput {
  name: string;
  type: AssetType;
  criticality: AssetCriticality;
  description: string;
  owner: string;
  tags?: string[];
}

export interface AssetPatch {
  name?: string;
  type?: AssetType;
  criticality?: AssetCriticality;
  description?: string;
  owner?: string;
  tags?: string[];
}

// ─── Risks ─────────────────────────────────────────────────────────────────

export type RiskLikelihood = 'very_low' | 'low' | 'medium' | 'high' | 'very_high';
export type RiskImpact = 'very_low' | 'low' | 'medium' | 'high' | 'very_high';
export type RiskTreatment = 'accept' | 'mitigate' | 'transfer' | 'avoid';

const LIKELIHOOD_SCORE: Record<RiskLikelihood, number> = {
  very_low: 1, low: 2, medium: 3, high: 4, very_high: 5,
};

export interface Risk {
  id: string;
  orgId: string;
  userId: string;
  title: string;
  description: string;
  category: string;
  likelihood: RiskLikelihood;
  impact: RiskImpact;
  riskScore: number;
  treatment: RiskTreatment;
  assetId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RiskInput {
  title: string;
  description: string;
  category: string;
  likelihood: RiskLikelihood;
  impact: RiskImpact;
  treatment?: RiskTreatment;
  assetId?: string;
}

export interface RiskPatch {
  title?: string;
  description?: string;
  category?: string;
  likelihood?: RiskLikelihood;
  impact?: RiskImpact;
  treatment?: RiskTreatment;
  assetId?: string | null;
}
```

- [ ] **Step 2: Add methods to `NotesStrategy` interface**

After the Issues methods:

```typescript
  // Assets
  listAssets(orgId: string): Promise<Asset[]>;
  createAsset(orgId: string, userId: string, data: AssetInput): Promise<Asset>;
  getAsset(id: string): Promise<Asset | null>;
  updateAsset(id: string, patch: AssetPatch): Promise<Asset>;
  deleteAsset(id: string): Promise<void>;

  // Risks
  listRisks(orgId: string): Promise<Risk[]>;
  createRisk(orgId: string, userId: string, data: RiskInput): Promise<Risk>;
  getRisk(id: string): Promise<Risk | null>;
  updateRisk(id: string, patch: RiskPatch): Promise<Risk>;
  deleteRisk(id: string): Promise<void>;
```

- [ ] **Step 3: Build shared**

```bash
yarn nx build shared
```

Expected: success.

- [ ] **Step 4: Commit**

```bash
git add libs/shared/src/strategies/notes.ts
git commit -m "feat(shared): add Asset and Risk catalog types to NotesStrategy"
```

---

### Task 2: Supabase migration — assets + risks tables

**Files:**
- Create: `supabase/migrations/20260613000002_asset_risk_catalogs.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- assets
create table public.assets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.org_profiles(id) on delete cascade,
  user_id uuid not null,
  name text not null,
  type text not null default 'other' check (type in ('service','application','infrastructure','data','device','other')),
  criticality text not null default 'medium' check (criticality in ('critical','high','medium','low')),
  description text not null default '',
  owner text not null default '',
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index assets_org_id_idx on public.assets(org_id);

alter table public.assets enable row level security;

create policy "org members read assets"
  on public.assets for select using (true);

create policy "users manage own assets"
  on public.assets for all using (auth.uid() = user_id);

-- risks
create table public.risks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.org_profiles(id) on delete cascade,
  user_id uuid not null,
  title text not null,
  description text not null,
  category text not null,
  likelihood text not null default 'medium' check (likelihood in ('very_low','low','medium','high','very_high')),
  impact text not null default 'medium' check (impact in ('very_low','low','medium','high','very_high')),
  risk_score int not null default 9,
  treatment text not null default 'mitigate' check (treatment in ('accept','mitigate','transfer','avoid')),
  asset_id uuid references public.assets(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index risks_org_id_idx on public.risks(org_id);

alter table public.risks enable row level security;

create policy "org members read risks"
  on public.risks for select using (true);

create policy "users manage own risks"
  on public.risks for all using (auth.uid() = user_id);
```

- [ ] **Step 2: Apply migration**

```bash
npx supabase db push
```

Expected: `Applied 1 migration`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260613000002_asset_risk_catalogs.sql
git commit -m "feat(db): add assets and risks tables"
```

---

### Task 3: FakeNotesStrategy — Asset and Risk implementations

**Files:**
- Modify: `libs/shared/src/strategies/fakes/fake-notes.ts`

- [ ] **Step 1: Add Asset imports and methods**

Add to existing import from `@icore/shared`: `Asset, AssetInput, AssetPatch, Risk, RiskInput, RiskPatch`.

- [ ] **Step 2: Add Asset methods at the end of `FakeNotesStrategy` class**

```typescript
  // ─── Assets ──────────────────────────────────────────────────────────────
  private assets: Asset[] = [];

  async listAssets(orgId: string): Promise<Asset[]> {
    return this.assets.filter((a) => a.orgId === orgId);
  }

  async createAsset(orgId: string, userId: string, data: AssetInput): Promise<Asset> {
    const asset: Asset = {
      id: crypto.randomUUID(),
      orgId,
      userId,
      name: data.name,
      type: data.type,
      criticality: data.criticality,
      description: data.description,
      owner: data.owner,
      tags: data.tags ?? [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.assets.push(asset);
    return asset;
  }

  async getAsset(id: string): Promise<Asset | null> {
    return this.assets.find((a) => a.id === id) ?? null;
  }

  async updateAsset(id: string, patch: AssetPatch): Promise<Asset> {
    const idx = this.assets.findIndex((a) => a.id === id);
    if (idx === -1) throw new Error('asset_not_found');
    this.assets[idx] = { ...this.assets[idx], ...patch, updatedAt: new Date().toISOString() };
    return this.assets[idx];
  }

  async deleteAsset(id: string): Promise<void> {
    this.assets = this.assets.filter((a) => a.id !== id);
  }

  // ─── Risks ───────────────────────────────────────────────────────────────
  private risks: Risk[] = [];

  private computeRiskScore(likelihood: RiskLikelihood, impact: RiskImpact): number {
    const L: Record<RiskLikelihood, number> = { very_low: 1, low: 2, medium: 3, high: 4, very_high: 5 };
    const I: Record<RiskImpact, number> = { very_low: 1, low: 2, medium: 3, high: 4, very_high: 5 };
    return L[likelihood] * I[impact];
  }

  async listRisks(orgId: string): Promise<Risk[]> {
    return this.risks.filter((r) => r.orgId === orgId);
  }

  async createRisk(orgId: string, userId: string, data: RiskInput): Promise<Risk> {
    const risk: Risk = {
      id: crypto.randomUUID(),
      orgId,
      userId,
      title: data.title,
      description: data.description,
      category: data.category,
      likelihood: data.likelihood,
      impact: data.impact,
      riskScore: this.computeRiskScore(data.likelihood, data.impact),
      treatment: data.treatment ?? 'mitigate',
      assetId: data.assetId ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.risks.push(risk);
    return risk;
  }

  async getRisk(id: string): Promise<Risk | null> {
    return this.risks.find((r) => r.id === id) ?? null;
  }

  async updateRisk(id: string, patch: RiskPatch): Promise<Risk> {
    const idx = this.risks.findIndex((r) => r.id === id);
    if (idx === -1) throw new Error('risk_not_found');
    const updated = { ...this.risks[idx], ...patch, updatedAt: new Date().toISOString() };
    if (patch.likelihood || patch.impact) {
      updated.riskScore = this.computeRiskScore(updated.likelihood, updated.impact);
    }
    this.risks[idx] = updated;
    return this.risks[idx];
  }

  async deleteRisk(id: string): Promise<void> {
    this.risks = this.risks.filter((r) => r.id !== id);
  }
```

Also add the `RiskLikelihood, RiskImpact` imports needed by `computeRiskScore`.

- [ ] **Step 3: Build shared**

```bash
yarn nx build shared
```

Expected: success.

- [ ] **Step 4: Commit**

```bash
git add libs/shared/src/strategies/fakes/fake-notes.ts
git commit -m "feat(shared): implement Asset and Risk methods in FakeNotesStrategy"
```

---

### Task 4: Contract tests for Assets and Risks

**Files:**
- Modify: `libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts`

- [ ] **Step 1: Add asset contract tests**

```typescript
describe('assets', () => {
  let s: FakeNotesStrategy;
  beforeEach(() => { s = new FakeNotesStrategy(); });

  it('creates and lists assets for org', async () => {
    const asset = await s.createAsset('org1', 'u1', {
      name: 'Payment API', type: 'service', criticality: 'critical',
      description: 'Handles card payments', owner: 'Platform team',
    });
    expect(asset.type).toBe('service');
    const list = await s.listAssets('org1');
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(asset.id);
  });

  it('updates asset criticality', async () => {
    const asset = await s.createAsset('org1', 'u1', {
      name: 'DB', type: 'infrastructure', criticality: 'low',
      description: '', owner: '',
    });
    const updated = await s.updateAsset(asset.id, { criticality: 'high' });
    expect(updated.criticality).toBe('high');
  });

  it('deletes an asset', async () => {
    const asset = await s.createAsset('org1', 'u1', {
      name: 'N', type: 'other', criticality: 'low', description: '', owner: '',
    });
    await s.deleteAsset(asset.id);
    expect(await s.listAssets('org1')).toHaveLength(0);
  });

  it('scopes by orgId', async () => {
    await s.createAsset('org1', 'u1', {
      name: 'N', type: 'other', criticality: 'low', description: '', owner: '',
    });
    expect(await s.listAssets('org2')).toHaveLength(0);
  });
});

describe('risks', () => {
  let s: FakeNotesStrategy;
  beforeEach(() => { s = new FakeNotesStrategy(); });

  it('creates risk and computes score', async () => {
    const risk = await s.createRisk('org1', 'u1', {
      title: 'SQL Injection', description: 'Input not sanitized',
      category: 'Web Security', likelihood: 'high', impact: 'high',
    });
    expect(risk.riskScore).toBe(16); // 4 * 4
    expect(risk.treatment).toBe('mitigate');
  });

  it('lists risks for org', async () => {
    await s.createRisk('org1', 'u1', {
      title: 'R1', description: '', category: 'Cat', likelihood: 'low', impact: 'low',
    });
    const list = await s.listRisks('org1');
    expect(list).toHaveLength(1);
  });

  it('updates risk treatment', async () => {
    const risk = await s.createRisk('org1', 'u1', {
      title: 'R', description: '', category: 'C', likelihood: 'low', impact: 'low',
    });
    const updated = await s.updateRisk(risk.id, { treatment: 'accept' });
    expect(updated.treatment).toBe('accept');
  });

  it('recomputes score when likelihood changes', async () => {
    const risk = await s.createRisk('org1', 'u1', {
      title: 'R', description: '', category: 'C', likelihood: 'low', impact: 'medium',
    });
    const updated = await s.updateRisk(risk.id, { likelihood: 'very_high' });
    expect(updated.riskScore).toBe(15); // 5 * 3
  });

  it('deletes a risk', async () => {
    const risk = await s.createRisk('org1', 'u1', {
      title: 'R', description: '', category: 'C', likelihood: 'low', impact: 'low',
    });
    await s.deleteRisk(risk.id);
    expect(await s.listRisks('org1')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
yarn nx test shared
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts
git commit -m "test(shared): add Asset and Risk contract tests"
```

---

### Task 5: SupabaseNotesStrategy — DB implementations

**Files:**
- Modify: `apps/microservices/notes/src/app/supabase-notes.strategy.ts`

- [ ] **Step 1: Add imports**

Add to the existing `@icore/shared` import: `Asset, AssetInput, AssetPatch, Risk, RiskInput, RiskPatch, RiskLikelihood, RiskImpact`.

- [ ] **Step 2: Add helper at the top of the class**

```typescript
  private computeRiskScore(likelihood: RiskLikelihood, impact: RiskImpact): number {
    const L: Record<RiskLikelihood, number> = { very_low: 1, low: 2, medium: 3, high: 4, very_high: 5 };
    const I: Record<RiskImpact, number> = { very_low: 1, low: 2, medium: 3, high: 4, very_high: 5 };
    return L[likelihood] * I[impact];
  }
```

- [ ] **Step 3: Add Asset methods at the end of the class**

```typescript
  async listAssets(orgId: string): Promise<Asset[]> {
    const { data, error } = await this.db
      .from('assets')
      .select('*')
      .eq('org_id', orgId)
      .order('name');
    return ok(data, error).map(this.toAsset);
  }

  async createAsset(orgId: string, userId: string, data: AssetInput): Promise<Asset> {
    const { data: row, error } = await this.db
      .from('assets')
      .insert({
        org_id: orgId, user_id: userId,
        name: data.name, type: data.type, criticality: data.criticality,
        description: data.description, owner: data.owner,
        tags: data.tags ?? [],
      })
      .select()
      .single();
    return this.toAsset(ok(row, error));
  }

  async getAsset(id: string): Promise<Asset | null> {
    const { data, error } = await this.db.from('assets').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? this.toAsset(data) : null;
  }

  async updateAsset(id: string, patch: AssetPatch): Promise<Asset> {
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.name !== undefined) update['name'] = patch.name;
    if (patch.type !== undefined) update['type'] = patch.type;
    if (patch.criticality !== undefined) update['criticality'] = patch.criticality;
    if (patch.description !== undefined) update['description'] = patch.description;
    if (patch.owner !== undefined) update['owner'] = patch.owner;
    if (patch.tags !== undefined) update['tags'] = patch.tags;
    const { data, error } = await this.db.from('assets').update(update).eq('id', id).select().single();
    return this.toAsset(ok(data, error));
  }

  async deleteAsset(id: string): Promise<void> {
    const { error } = await this.db.from('assets').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  private toAsset(row: Record<string, unknown>): Asset {
    return {
      id: row['id'] as string,
      orgId: row['org_id'] as string,
      userId: row['user_id'] as string,
      name: row['name'] as string,
      type: row['type'] as Asset['type'],
      criticality: row['criticality'] as Asset['criticality'],
      description: row['description'] as string,
      owner: row['owner'] as string,
      tags: row['tags'] as string[],
      createdAt: row['created_at'] as string,
      updatedAt: row['updated_at'] as string,
    };
  }
```

- [ ] **Step 4: Add Risk methods at the end of the class**

```typescript
  async listRisks(orgId: string): Promise<Risk[]> {
    const { data, error } = await this.db
      .from('risks')
      .select('*')
      .eq('org_id', orgId)
      .order('risk_score', { ascending: false });
    return ok(data, error).map(this.toRisk);
  }

  async createRisk(orgId: string, userId: string, data: RiskInput): Promise<Risk> {
    const riskScore = this.computeRiskScore(data.likelihood, data.impact);
    const { data: row, error } = await this.db
      .from('risks')
      .insert({
        org_id: orgId, user_id: userId,
        title: data.title, description: data.description, category: data.category,
        likelihood: data.likelihood, impact: data.impact,
        risk_score: riskScore,
        treatment: data.treatment ?? 'mitigate',
        asset_id: data.assetId ?? null,
      })
      .select()
      .single();
    return this.toRisk(ok(row, error));
  }

  async getRisk(id: string): Promise<Risk | null> {
    const { data, error } = await this.db.from('risks').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? this.toRisk(data) : null;
  }

  async updateRisk(id: string, patch: RiskPatch): Promise<Risk> {
    const current = await this.getRisk(id);
    if (!current) throw new Error('risk_not_found');
    const newLikelihood = patch.likelihood ?? current.likelihood;
    const newImpact = patch.impact ?? current.impact;
    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      risk_score: this.computeRiskScore(newLikelihood, newImpact),
    };
    if (patch.title !== undefined) update['title'] = patch.title;
    if (patch.description !== undefined) update['description'] = patch.description;
    if (patch.category !== undefined) update['category'] = patch.category;
    if (patch.likelihood !== undefined) update['likelihood'] = patch.likelihood;
    if (patch.impact !== undefined) update['impact'] = patch.impact;
    if (patch.treatment !== undefined) update['treatment'] = patch.treatment;
    if ('assetId' in patch) update['asset_id'] = patch.assetId;
    const { data, error } = await this.db.from('risks').update(update).eq('id', id).select().single();
    return this.toRisk(ok(data, error));
  }

  async deleteRisk(id: string): Promise<void> {
    const { error } = await this.db.from('risks').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  private toRisk(row: Record<string, unknown>): Risk {
    return {
      id: row['id'] as string,
      orgId: row['org_id'] as string,
      userId: row['user_id'] as string,
      title: row['title'] as string,
      description: row['description'] as string,
      category: row['category'] as string,
      likelihood: row['likelihood'] as Risk['likelihood'],
      impact: row['impact'] as Risk['impact'],
      riskScore: row['risk_score'] as number,
      treatment: row['treatment'] as Risk['treatment'],
      assetId: row['asset_id'] as string | null,
      createdAt: row['created_at'] as string,
      updatedAt: row['updated_at'] as string,
    };
  }
```

- [ ] **Step 5: Build**

```bash
yarn nx build notes
```

Expected: success.

- [ ] **Step 6: Commit**

```bash
git add apps/microservices/notes/src/app/supabase-notes.strategy.ts
git commit -m "feat(notes-ms): implement Asset and Risk Supabase strategy methods"
```

---

### Task 6: Notes MS controller + NotesClientService + Gateway

**Files:**
- Modify: `apps/microservices/notes/src/app/notes.controller.ts`
- Modify: `libs/notes-client/src/lib/notes-client.service.ts`
- Modify: `apps/api/src/app/notes/notes.controller.ts`

- [ ] **Step 1: Add `@MessagePattern` handlers to notes MS controller**

Add imports: `Asset, AssetInput, AssetPatch, Risk, RiskInput, RiskPatch`.

Add handlers at the end of `NotesController`:

```typescript
  // ─── Assets ──────────────────────────────────────────────────────────────

  @MessagePattern('notes.assets.list')
  listAssets(@Payload() payload: { orgId: string }): Promise<Asset[]> {
    return this.strategy.listAssets(payload.orgId);
  }

  @MessagePattern('notes.assets.create')
  createAsset(@Payload() payload: { orgId: string; userId: string; data: AssetInput }): Promise<Asset> {
    return this.strategy.createAsset(payload.orgId, payload.userId, payload.data);
  }

  @MessagePattern('notes.assets.get')
  getAsset(@Payload() payload: { id: string }): Promise<Asset | null> {
    return this.strategy.getAsset(payload.id);
  }

  @MessagePattern('notes.assets.update')
  updateAsset(@Payload() payload: { id: string; patch: AssetPatch }): Promise<Asset> {
    return this.strategy.updateAsset(payload.id, payload.patch);
  }

  @MessagePattern('notes.assets.delete')
  deleteAsset(@Payload() payload: { id: string }): Promise<void> {
    return this.strategy.deleteAsset(payload.id);
  }

  // ─── Risks ───────────────────────────────────────────────────────────────

  @MessagePattern('notes.risks.list')
  listRisks(@Payload() payload: { orgId: string }): Promise<Risk[]> {
    return this.strategy.listRisks(payload.orgId);
  }

  @MessagePattern('notes.risks.create')
  createRisk(@Payload() payload: { orgId: string; userId: string; data: RiskInput }): Promise<Risk> {
    return this.strategy.createRisk(payload.orgId, payload.userId, payload.data);
  }

  @MessagePattern('notes.risks.get')
  getRisk(@Payload() payload: { id: string }): Promise<Risk | null> {
    return this.strategy.getRisk(payload.id);
  }

  @MessagePattern('notes.risks.update')
  updateRisk(@Payload() payload: { id: string; patch: RiskPatch }): Promise<Risk> {
    return this.strategy.updateRisk(payload.id, payload.patch);
  }

  @MessagePattern('notes.risks.delete')
  deleteRisk(@Payload() payload: { id: string }): Promise<void> {
    return this.strategy.deleteRisk(payload.id);
  }
```

- [ ] **Step 2: Add TCP proxy methods to `NotesClientService`**

Add imports: `Asset, AssetInput, AssetPatch, Risk, RiskInput, RiskPatch`.

Add at the end of the class:

```typescript
  listAssets(orgId: string): Promise<Asset[]> {
    return firstValueFrom(this.client.send<Asset[]>('notes.assets.list', { orgId }));
  }
  createAsset(orgId: string, userId: string, data: AssetInput): Promise<Asset> {
    return firstValueFrom(this.client.send<Asset>('notes.assets.create', { orgId, userId, data }));
  }
  getAsset(id: string): Promise<Asset | null> {
    return firstValueFrom(this.client.send<Asset | null>('notes.assets.get', { id }));
  }
  updateAsset(id: string, patch: AssetPatch): Promise<Asset> {
    return firstValueFrom(this.client.send<Asset>('notes.assets.update', { id, patch }));
  }
  deleteAsset(id: string): Promise<void> {
    return firstValueFrom(this.client.send<void>('notes.assets.delete', { id }));
  }

  listRisks(orgId: string): Promise<Risk[]> {
    return firstValueFrom(this.client.send<Risk[]>('notes.risks.list', { orgId }));
  }
  createRisk(orgId: string, userId: string, data: RiskInput): Promise<Risk> {
    return firstValueFrom(this.client.send<Risk>('notes.risks.create', { orgId, userId, data }));
  }
  getRisk(id: string): Promise<Risk | null> {
    return firstValueFrom(this.client.send<Risk | null>('notes.risks.get', { id }));
  }
  updateRisk(id: string, patch: RiskPatch): Promise<Risk> {
    return firstValueFrom(this.client.send<Risk>('notes.risks.update', { id, patch }));
  }
  deleteRisk(id: string): Promise<void> {
    return firstValueFrom(this.client.send<void>('notes.risks.delete', { id }));
  }
```

- [ ] **Step 3: Add HTTP endpoints to gateway notes controller**

Add imports: `AssetInput, AssetPatch, RiskInput, RiskPatch`.

Add endpoints at the end of `NotesController`:

```typescript
  // ─── Assets ──────────────────────────────────────────────────────────────

  @Get('assets')
  @ApiOperation({ summary: 'List assets for org' })
  listAssets(@Req() req: Request & { user?: VerifiedToken }, @Query('orgId') orgId: string) {
    this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    return this.notes.listAssets(orgId);
  }

  @Post('assets')
  @ApiOperation({ summary: 'Create asset' })
  createAsset(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
    @Body() body: AssetInput,
  ) {
    const userId = this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    return this.notes.createAsset(orgId, userId, body);
  }

  @Get('assets/:id')
  @ApiOperation({ summary: 'Get asset' })
  async getAsset(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    const asset = await this.notes.getAsset(id);
    if (!asset) throw new NotFoundException();
    return asset;
  }

  @Patch('assets/:id')
  @ApiOperation({ summary: 'Update asset' })
  updateAsset(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() patch: AssetPatch,
  ) {
    this.uid(req);
    return this.notes.updateAsset(id, patch);
  }

  @Delete('assets/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete asset' })
  deleteAsset(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    return this.notes.deleteAsset(id);
  }

  // ─── Risks ───────────────────────────────────────────────────────────────

  @Get('risks')
  @ApiOperation({ summary: 'List risks for org (sorted by risk score desc)' })
  listRisks(@Req() req: Request & { user?: VerifiedToken }, @Query('orgId') orgId: string) {
    this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    return this.notes.listRisks(orgId);
  }

  @Post('risks')
  @ApiOperation({ summary: 'Create risk entry' })
  createRisk(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
    @Body() body: RiskInput,
  ) {
    const userId = this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    return this.notes.createRisk(orgId, userId, body);
  }

  @Get('risks/:id')
  @ApiOperation({ summary: 'Get risk' })
  async getRisk(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    const risk = await this.notes.getRisk(id);
    if (!risk) throw new NotFoundException();
    return risk;
  }

  @Patch('risks/:id')
  @ApiOperation({ summary: 'Update risk' })
  updateRisk(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() patch: RiskPatch,
  ) {
    this.uid(req);
    return this.notes.updateRisk(id, patch);
  }

  @Delete('risks/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete risk' })
  deleteRisk(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    return this.notes.deleteRisk(id);
  }
```

- [ ] **Step 4: Build all three projects**

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
git commit -m "feat: add Asset and Risk MessagePatterns, TCP proxy, and HTTP endpoints"
```

---

### Task 7: Client React Query hooks

**Files:**
- Create: `apps/client/src/queries/assets.ts`
- Create: `apps/client/src/queries/risks.ts`

- [ ] **Step 1: Create `apps/client/src/queries/assets.ts`**

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Asset, AssetInput, AssetPatch } from '@icore/shared';

export type { Asset, AssetInput, AssetPatch };

export function useAssets(orgId: string) {
  return useQuery<Asset[]>({
    queryKey: ['assets', orgId],
    queryFn: () => api<Asset[]>(`/assets?orgId=${encodeURIComponent(orgId)}`),
    enabled: !!orgId,
  });
}

export function useCreateAsset(orgId: string) {
  const qc = useQueryClient();
  return useMutation<Asset, Error, AssetInput>({
    mutationFn: (data) =>
      api<Asset>(`/assets?orgId=${encodeURIComponent(orgId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assets', orgId] }),
  });
}

export function useUpdateAsset(orgId: string) {
  const qc = useQueryClient();
  return useMutation<Asset, Error, { id: string; patch: AssetPatch }>({
    mutationFn: ({ id, patch }) =>
      api<Asset>(`/assets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assets', orgId] }),
  });
}

export function useDeleteAsset(orgId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => api<void>(`/assets/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assets', orgId] }),
  });
}
```

- [ ] **Step 2: Create `apps/client/src/queries/risks.ts`**

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Risk, RiskInput, RiskPatch } from '@icore/shared';

export type { Risk, RiskInput, RiskPatch };

export function useRisks(orgId: string) {
  return useQuery<Risk[]>({
    queryKey: ['risks', orgId],
    queryFn: () => api<Risk[]>(`/risks?orgId=${encodeURIComponent(orgId)}`),
    enabled: !!orgId,
  });
}

export function useCreateRisk(orgId: string) {
  const qc = useQueryClient();
  return useMutation<Risk, Error, RiskInput>({
    mutationFn: (data) =>
      api<Risk>(`/risks?orgId=${encodeURIComponent(orgId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['risks', orgId] }),
  });
}

export function useUpdateRisk(orgId: string) {
  const qc = useQueryClient();
  return useMutation<Risk, Error, { id: string; patch: RiskPatch }>({
    mutationFn: ({ id, patch }) =>
      api<Risk>(`/risks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['risks', orgId] }),
  });
}

export function useDeleteRisk(orgId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => api<void>(`/risks/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['risks', orgId] }),
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/queries/assets.ts apps/client/src/queries/risks.ts
git commit -m "feat(client): add Asset and Risk React Query hooks"
```

---

### Task 8: Client routes — Assets page and Risks page

**Files:**
- Create: `apps/client/src/routes/_dashboard/assets.tsx`
- Create: `apps/client/src/routes/_dashboard/risks.tsx`

- [ ] **Step 1: Create `apps/client/src/routes/_dashboard/assets.tsx`**

```tsx
import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Plus, Server } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageLayout } from '@/components/PageLayout';
import { useActiveOrgStore } from '@/stores/active-org';
import { useAssets, useCreateAsset, useDeleteAsset, type Asset, type AssetInput } from '@/queries/assets';

export const Route = createFileRoute('/_dashboard/assets')({
  component: AssetsPage,
});

const CRITICALITY_COLORS: Record<Asset['criticality'], string> = {
  critical: 'bg-red-500/10 text-red-400 border-red-500/20',
  high:     'bg-orange-500/10 text-orange-400 border-orange-500/20',
  medium:   'bg-amber-500/10 text-amber-400 border-amber-500/20',
  low:      'bg-green-500/10 text-green-400 border-green-500/20',
};

const ASSET_TYPES: Array<Asset['type']> = ['service', 'application', 'infrastructure', 'data', 'device', 'other'];
const CRITICALITY_LEVELS: Array<Asset['criticality']> = ['critical', 'high', 'medium', 'low'];

function AssetsPage() {
  const { t } = useTranslation();
  const { activeOrgId } = useActiveOrgStore();
  const orgId = activeOrgId ?? '';

  const { data: assets = [], isPending } = useAssets(orgId);
  const createMut = useCreateAsset(orgId);
  const deleteMut = useDeleteAsset(orgId);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<AssetInput>({
    name: '', type: 'service', criticality: 'medium', description: '', owner: '',
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.owner) return;
    createMut.mutate(form, {
      onSuccess: () => { setOpen(false); setForm({ name: '', type: 'service', criticality: 'medium', description: '', owner: '' }); },
    });
  }

  return (
    <PageLayout title={t('nav.assets')}>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{t('assets.subtitle')}</p>
        <Button size="sm" onClick={() => setOpen(true)} disabled={!orgId}>
          <Plus size={14} className="mr-1.5" />
          {t('assets.addAsset')}
        </Button>
      </div>

      {isPending ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 bg-surface border border-border rounded-xl animate-pulse" />
          ))}
        </div>
      ) : assets.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
          <Server size={32} className="opacity-30" />
          <p className="text-sm">{t('assets.empty')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {assets.map((asset) => (
            <div key={asset.id} className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium text-sm text-foreground truncate">{asset.name}</span>
                <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border shrink-0 ${CRITICALITY_COLORS[asset.criticality]}`}>
                  {t(`assets.criticality.${asset.criticality}`)}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground/60">{t(`assets.type.${asset.type}`)} · {asset.owner}</p>
              {asset.description && (
                <p className="text-xs text-muted-foreground line-clamp-2">{asset.description}</p>
              )}
              <button
                type="button"
                onClick={() => deleteMut.mutate(asset.id)}
                className="self-end text-xs text-muted-foreground/50 hover:text-destructive transition-colors"
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
            <DialogTitle>{t('assets.addAsset')}</DialogTitle>
            <DialogDescription>{t('assets.addDescription')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>{t('assets.name')}</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={t('assets.namePlaceholder')}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t('assets.type')}</Label>
                <select
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as Asset['type'] }))}
                  className="w-full h-9 rounded-md border border-border bg-surface px-3 text-sm focus:outline-none focus:ring-1 focus:ring-green-500/40"
                >
                  {ASSET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label>{t('assets.criticality.label')}</Label>
                <select
                  value={form.criticality}
                  onChange={(e) => setForm((f) => ({ ...f, criticality: e.target.value as Asset['criticality'] }))}
                  className="w-full h-9 rounded-md border border-border bg-surface px-3 text-sm focus:outline-none focus:ring-1 focus:ring-green-500/40"
                >
                  {CRITICALITY_LEVELS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('assets.owner')}</Label>
              <Input
                value={form.owner}
                onChange={(e) => setForm((f) => ({ ...f, owner: e.target.value }))}
                placeholder={t('assets.ownerPlaceholder')}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>{t('assets.description')}</Label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500/40 resize-none"
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

- [ ] **Step 2: Create `apps/client/src/routes/_dashboard/risks.tsx`**

```tsx
import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Plus, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageLayout } from '@/components/PageLayout';
import { useActiveOrgStore } from '@/stores/active-org';
import { useRisks, useCreateRisk, useUpdateRisk, useDeleteRisk, type Risk, type RiskInput } from '@/queries/risks';
import { useAssets } from '@/queries/assets';

export const Route = createFileRoute('/_dashboard/risks')({
  component: RisksPage,
});

const SCORE_COLOR = (score: number) => {
  if (score >= 20) return 'text-red-400';
  if (score >= 12) return 'text-orange-400';
  if (score >= 6) return 'text-amber-400';
  return 'text-green-400';
};

const LIKELIHOOD_OPTIONS: Array<Risk['likelihood']> = ['very_low', 'low', 'medium', 'high', 'very_high'];
const IMPACT_OPTIONS: Array<Risk['impact']> = ['very_low', 'low', 'medium', 'high', 'very_high'];
const TREATMENT_OPTIONS: Array<Risk['treatment']> = ['accept', 'mitigate', 'transfer', 'avoid'];

function RisksPage() {
  const { t } = useTranslation();
  const { activeOrgId } = useActiveOrgStore();
  const orgId = activeOrgId ?? '';

  const { data: risks = [], isPending } = useRisks(orgId);
  const { data: assets = [] } = useAssets(orgId);
  const createMut = useCreateRisk(orgId);
  const updateMut = useUpdateRisk(orgId);
  const deleteMut = useDeleteRisk(orgId);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<RiskInput>({
    title: '', description: '', category: '', likelihood: 'medium', impact: 'medium',
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title || !form.category) return;
    createMut.mutate(form, {
      onSuccess: () => { setOpen(false); setForm({ title: '', description: '', category: '', likelihood: 'medium', impact: 'medium' }); },
    });
  }

  return (
    <PageLayout title={t('nav.risks')}>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{t('risks.subtitle')}</p>
        <Button size="sm" onClick={() => setOpen(true)} disabled={!orgId}>
          <Plus size={14} className="mr-1.5" />
          {t('risks.addRisk')}
        </Button>
      </div>

      {isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 bg-surface border border-border rounded-lg animate-pulse" />
          ))}
        </div>
      ) : risks.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
          <AlertTriangle size={32} className="opacity-30" />
          <p className="text-sm">{t('risks.empty')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {risks.map((risk) => (
            <div key={risk.id} className="flex items-start gap-4 bg-surface border border-border rounded-xl p-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-lg font-bold tabular-nums ${SCORE_COLOR(risk.riskScore)}`}>{risk.riskScore}</span>
                  <span className="font-medium text-sm text-foreground truncate">{risk.title}</span>
                  <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">{risk.category}</span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{risk.description}</p>
                <p className="text-[11px] text-muted-foreground/60 mt-1">
                  L: {risk.likelihood} · I: {risk.impact}
                  {risk.assetId && ` · ${assets.find((a) => a.id === risk.assetId)?.name ?? risk.assetId}`}
                </p>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <select
                  value={risk.treatment}
                  onChange={(e) => updateMut.mutate({ id: risk.id, patch: { treatment: e.target.value as Risk['treatment'] } })}
                  className="text-xs h-7 rounded border border-border bg-surface px-1 text-foreground focus:outline-none focus:ring-1 focus:ring-green-500/40"
                >
                  {TREATMENT_OPTIONS.map((tr) => (
                    <option key={tr} value={tr}>{t(`risks.treatment.${tr}`)}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => deleteMut.mutate(risk.id)}
                  className="text-xs px-2 py-1 rounded text-muted-foreground border border-border hover:text-destructive hover:border-destructive/50 transition-colors"
                >
                  {t('common.delete')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('risks.addRisk')}</DialogTitle>
            <DialogDescription>{t('risks.addDescription')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>{t('risks.title')}</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder={t('risks.titlePlaceholder')}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>{t('risks.category')}</Label>
              <Input
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                placeholder={t('risks.categoryPlaceholder')}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t('risks.likelihood')}</Label>
                <select
                  value={form.likelihood}
                  onChange={(e) => setForm((f) => ({ ...f, likelihood: e.target.value as Risk['likelihood'] }))}
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
                  onChange={(e) => setForm((f) => ({ ...f, impact: e.target.value as Risk['impact'] }))}
                  className="w-full h-9 rounded-md border border-border bg-surface px-3 text-sm focus:outline-none focus:ring-1 focus:ring-green-500/40"
                >
                  {IMPACT_OPTIONS.map((i) => (
                    <option key={i} value={i}>{t(`risks.scale.${i}`)}</option>
                  ))}
                </select>
              </div>
            </div>
            {assets.length > 0 && (
              <div className="space-y-2">
                <Label>{t('risks.linkedAsset')}</Label>
                <select
                  value={form.assetId ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, assetId: e.target.value || undefined }))}
                  className="w-full h-9 rounded-md border border-border bg-surface px-3 text-sm focus:outline-none focus:ring-1 focus:ring-green-500/40"
                >
                  <option value="">{t('risks.noAsset')}</option>
                  {assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            )}
            <div className="space-y-2">
              <Label>{t('risks.description')}</Label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500/40 resize-none"
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

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/routes/_dashboard/assets.tsx apps/client/src/routes/_dashboard/risks.tsx
git commit -m "feat(client): add Asset Catalog and Risk Catalog dashboard pages"
```

---

### Task 9: i18n + nav + final checks

**Files:**
- Modify: `libs/template-shared/src/lib/i18n/locales/en.ts` + he/ru/es
- Modify: `apps/client/src/components/layout/LayoutSider.tsx`

- [ ] **Step 1: Add keys to `en.ts`**

In `nav`:
```typescript
    assets: 'Asset Catalog',
    risks: 'Risk Catalog',
```

Add objects:
```typescript
  assets: {
    subtitle: 'Inventory of organizational IT assets',
    addAsset: 'New Asset',
    addDescription: 'Register an IT asset — service, application, infrastructure, or device',
    empty: 'No assets registered',
    name: 'Asset Name',
    namePlaceholder: 'e.g. Payment API, Customer DB',
    type: 'Type',
    owner: 'Owner',
    ownerPlaceholder: 'e.g. Platform team',
    description: 'Description',
    criticality: {
      label: 'Criticality',
      critical: 'Critical',
      high: 'High',
      medium: 'Medium',
      low: 'Low',
    },
    type: {
      service: 'Service',
      application: 'Application',
      infrastructure: 'Infrastructure',
      data: 'Data',
      device: 'Device',
      other: 'Other',
    },
  },
  risks: {
    subtitle: 'Catalog of identified organizational risks sorted by score',
    addRisk: 'New Risk',
    addDescription: 'Log a risk with likelihood and impact to compute its risk score',
    empty: 'No risks in catalog',
    title: 'Title',
    titlePlaceholder: 'e.g. Unpatched third-party dependency',
    category: 'Category',
    categoryPlaceholder: 'e.g. Supply Chain, Web Security',
    likelihood: 'Likelihood',
    impact: 'Impact',
    description: 'Description',
    linkedAsset: 'Linked Asset (optional)',
    noAsset: 'No asset',
    treatment: {
      accept: 'Accept',
      mitigate: 'Mitigate',
      transfer: 'Transfer',
      avoid: 'Avoid',
    },
    scale: {
      very_low: 'Very Low',
      low: 'Low',
      medium: 'Medium',
      high: 'High',
      very_high: 'Very High',
    },
  },
```

- [ ] **Step 2: Add keys to `he.ts`, `ru.ts`, `es.ts`**

**he.ts** — in `nav`: `assets: 'קטלוג נכסים', risks: 'קטלוג סיכונים'`

**ru.ts** — in `nav`: `assets: 'Каталог активов', risks: 'Каталог рисков'`

**es.ts** — in `nav`: `assets: 'Catálogo de activos', risks: 'Catálogo de riesgos'`

For each locale add minimal objects (note: full translations for all keys follow the same pattern as the exceptions/issues plan — add `assets: {...}` and `risks: {...}` objects with translated strings for each locale).

- [ ] **Step 3: Update `LayoutSider.tsx`**

In `NavKey` type union add:
```typescript
  | 'nav.assets'
  | 'nav.risks'
```

In `sectionRisk` items array, add alongside vendors:
```typescript
      { labelKey: 'nav.assets', to: '/assets', icon: Server },
      { labelKey: 'nav.risks', to: '/risks', icon: AlertTriangle },
```

Add `Server` and `AlertTriangle` to lucide-react import.

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
  apps/client/src/queries/assets.ts \
  apps/client/src/queries/risks.ts \
  apps/client/src/routes/_dashboard/assets.tsx \
  apps/client/src/routes/_dashboard/risks.tsx \
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
git commit -m "feat: add Asset Catalog and Risk Catalog modules with i18n + nav"
gh pr create --base dev --title "feat: Asset Catalog and Risk Catalog modules" --body "$(cat <<'EOF'
## Summary
- Asset Catalog: register and track IT assets (services, apps, infrastructure, data, devices) with criticality ratings
- Risk Catalog: log risks with likelihood × impact scoring (1–25), treatment classification, optional asset linkage
- Full stack: Supabase tables → NotesStrategy → notes MS → gateway → React Query → dashboard pages
- i18n: en/he/ru/es for all new keys
- Nav: both modules in sectionRisk alongside Vendors

## Test plan
- [ ] Create asset → appears in grid with criticality badge
- [ ] Delete asset → removed from grid
- [ ] Create risk with likelihood=high, impact=high → score shows 16 in orange
- [ ] Change treatment via dropdown → updates immediately
- [ ] Create risk linked to an asset → asset name shows in risk row
- [ ] Risk list sorted by score descending

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

*Self-review: risk score computation consistent between fake (Task 3), Supabase strategy (Task 5), and test assertions (Task 4). All file paths exact. No placeholders.*

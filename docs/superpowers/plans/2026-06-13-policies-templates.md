# Policies, Framework Templates & Controls→Policies Mapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three related compliance features: (1) **Policy documents** — org-owned policy texts linked to a framework, with a draft→approved status; (2) **Framework templates** — pre-built policy content seeded per framework that orgs can clone as a starting point; (3) **Controls→Policies mapping** — a many-to-many join linking framework controls to policy documents, surfaced in the Controls page.

**Architecture:** `policies` and `policy_controls` tables live in the notes MS / Supabase. Framework templates are stored in `policy_templates` with a single platform-seed row per framework (seeded via migration). Orgs clone a template to create a policy. Controls→Policies mapping is a junction table `policy_controls` linking `controls.id` + `policies.id`. The Controls page gains a "Linked Policies" count column; clicking a control shows its policies in a side panel.

**Tech Stack:** NestJS TCP microservices, Supabase (PostgreSQL), TanStack Router, TanStack Query, shadcn/ui, react-i18next (en/he/ru/es), Vitest

---

## File Map

**New files:**
- `supabase/migrations/20260613000004_policies_templates.sql`
- `apps/client/src/queries/policies.ts`
- `apps/client/src/routes/_dashboard/policies.tsx`
- `apps/client/src/routes/_dashboard/policies_.$id.tsx`

**Modified files:**
- `libs/shared/src/strategies/notes.ts` — Policy, PolicyTemplate, PolicyControl types + NotesStrategy methods
- `libs/shared/src/strategies/fakes/fake-notes.ts` — in-memory implementations
- `libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts` — contract tests
- `apps/microservices/notes/src/app/supabase-notes.strategy.ts` — DB implementations
- `apps/microservices/notes/src/app/notes.controller.ts` — `@MessagePattern` handlers
- `libs/notes-client/src/lib/notes-client.service.ts` — TCP proxy methods
- `apps/api/src/app/notes/notes.controller.ts` — HTTP endpoints
- `apps/client/src/routes/_dashboard/controls.tsx` — add "Linked Policies" count to controls table
- `apps/client/src/components/controls/ControlsTable.tsx` — policies count column
- `libs/template-shared/src/lib/i18n/locales/en.ts` + he/ru/es — i18n keys
- `apps/client/src/components/layout/LayoutSider.tsx` — nav item

---

### Task 1: Types — Policy, PolicyTemplate, PolicyControl in `@icore/shared`

**Files:**
- Modify: `libs/shared/src/strategies/notes.ts`

- [ ] **Step 1: Add Policy types after the Risk Assessments block**

```typescript
// ─── Policies ──────────────────────────────────────────────────────────────

export type PolicyStatus = 'draft' | 'approved';

export interface Policy {
  id: string;
  orgId: string;
  userId: string;
  frameworkId: string;
  title: string;
  content: string;
  status: PolicyStatus;
  version: number;
  templateId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PolicyInput {
  frameworkId: string;
  title: string;
  content: string;
  templateId?: string;
}

export interface PolicyPatch {
  title?: string;
  content?: string;
  status?: PolicyStatus;
}

// ─── Policy Templates ──────────────────────────────────────────────────────

export interface PolicyTemplate {
  id: string;
  frameworkId: string;
  title: string;
  content: string;
  createdAt: string;
}

// ─── Controls ↔ Policies mapping ───────────────────────────────────────────

export interface PolicyControl {
  id: string;
  policyId: string;
  controlCode: string;
  frameworkId: string;
  createdAt: string;
}

export interface PolicyControlInput {
  controlCode: string;
  frameworkId: string;
}
```

- [ ] **Step 2: Add methods to `NotesStrategy` interface**

```typescript
  // Policies
  listPolicies(orgId: string): Promise<Policy[]>;
  createPolicy(orgId: string, userId: string, data: PolicyInput): Promise<Policy>;
  getPolicy(id: string): Promise<Policy | null>;
  updatePolicy(id: string, patch: PolicyPatch): Promise<Policy>;
  deletePolicy(id: string): Promise<void>;
  cloneTemplate(orgId: string, userId: string, templateId: string): Promise<Policy>;

  // Policy templates (platform-wide seed data)
  listPolicyTemplates(frameworkId?: string): Promise<PolicyTemplate[]>;

  // Controls ↔ Policies
  listPolicyControls(policyId: string): Promise<PolicyControl[]>;
  addPolicyControl(policyId: string, data: PolicyControlInput): Promise<PolicyControl>;
  removePolicyControl(id: string): Promise<void>;
  listPoliciesForControl(controlCode: string, frameworkId: string): Promise<Policy[]>;
```

- [ ] **Step 3: Build shared**

```bash
yarn nx build shared
```

Expected: success.

- [ ] **Step 4: Commit**

```bash
git add libs/shared/src/strategies/notes.ts
git commit -m "feat(shared): add Policy, PolicyTemplate, PolicyControl types to NotesStrategy"
```

---

### Task 2: Supabase migration — policies, policy_templates, policy_controls tables

**Files:**
- Create: `supabase/migrations/20260613000004_policies_templates.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- policy_templates (platform-wide, seeded)
create table public.policy_templates (
  id uuid primary key default gen_random_uuid(),
  framework_id uuid not null references public.frameworks(id) on delete cascade,
  title text not null,
  content text not null,
  created_at timestamptz not null default now()
);

create index policy_templates_framework_id_idx on public.policy_templates(framework_id);

-- Seed one template per framework (content is generic, intended to be customized)
insert into public.policy_templates (framework_id, title, content)
select
  id,
  name || ' Policy Template',
  '# ' || name || ' Policy' || E'\n\n' ||
  '## Purpose' || E'\n' ||
  'This policy establishes ' || name || ' compliance requirements for the organization.' || E'\n\n' ||
  '## Scope' || E'\n' ||
  'This policy applies to all systems, personnel, and processes within the organization.' || E'\n\n' ||
  '## Policy Statements' || E'\n' ||
  '1. The organization shall maintain compliance with ' || name || ' ' || version || ' controls.' || E'\n' ||
  '2. All personnel shall be trained annually on relevant ' || name || ' requirements.' || E'\n' ||
  '3. Compliance status shall be reviewed quarterly.' || E'\n\n' ||
  '## Enforcement' || E'\n' ||
  'Violations of this policy shall be addressed through the organization''s disciplinary process.' || E'\n\n' ||
  '## Review' || E'\n' ||
  'This policy shall be reviewed and updated annually or following significant changes.'
from public.frameworks;

-- policies (org-owned, can be cloned from template or created fresh)
create table public.policies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.org_profiles(id) on delete cascade,
  user_id uuid not null,
  framework_id uuid not null references public.frameworks(id) on delete cascade,
  title text not null,
  content text not null,
  status text not null default 'draft' check (status in ('draft','approved')),
  version int not null default 1,
  template_id uuid references public.policy_templates(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index policies_org_id_idx on public.policies(org_id);
create index policies_framework_id_idx on public.policies(framework_id);

alter table public.policies enable row level security;
create policy "org members read policies"
  on public.policies for select using (true);
create policy "users manage own policies"
  on public.policies for all using (auth.uid() = user_id);

-- policy_controls (many-to-many: policy ↔ framework control codes)
create table public.policy_controls (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.policies(id) on delete cascade,
  control_code text not null,
  framework_id uuid not null references public.frameworks(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(policy_id, control_code, framework_id)
);

create index policy_controls_policy_id_idx on public.policy_controls(policy_id);
create index policy_controls_code_fw_idx on public.policy_controls(control_code, framework_id);

alter table public.policy_controls enable row level security;
create policy "policy_controls inherit policy access"
  on public.policy_controls for all
  using (
    exists (
      select 1 from public.policies p
      where p.id = policy_id and p.user_id = auth.uid()
    )
  );
```

- [ ] **Step 2: Apply migration**

```bash
npx supabase db push
```

Expected: `Applied 1 migration`.

- [ ] **Step 3: Verify templates were seeded**

```bash
npx supabase db execute --sql "select count(*) from policy_templates"
```

Expected: count equals the number of frameworks in the `frameworks` table (should be > 0).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260613000004_policies_templates.sql
git commit -m "feat(db): add policies, policy_templates, and policy_controls tables with seed data"
```

---

### Task 3: FakeNotesStrategy — Policy implementations

**Files:**
- Modify: `libs/shared/src/strategies/fakes/fake-notes.ts`

- [ ] **Step 1: Add imports**

Add to existing `@icore/shared` import:
```
Policy, PolicyInput, PolicyPatch, PolicyTemplate, PolicyControl, PolicyControlInput,
```

- [ ] **Step 2: Add Policy methods at the end of `FakeNotesStrategy` class**

```typescript
  // ─── Policies ────────────────────────────────────────────────────────────
  private policies: Policy[] = [];
  private policyTemplates: PolicyTemplate[] = [
    {
      id: 'tmpl-1',
      frameworkId: 'fw-soc2',
      title: 'SOC 2 Policy Template',
      content: '# SOC 2 Policy\n\nThis policy covers SOC 2 Type II requirements.',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ];
  private policyControls: PolicyControl[] = [];

  async listPolicies(orgId: string): Promise<Policy[]> {
    return this.policies.filter((p) => p.orgId === orgId);
  }

  async createPolicy(orgId: string, userId: string, data: PolicyInput): Promise<Policy> {
    const policy: Policy = {
      id: crypto.randomUUID(),
      orgId,
      userId,
      frameworkId: data.frameworkId,
      title: data.title,
      content: data.content,
      status: 'draft',
      version: 1,
      templateId: data.templateId ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.policies.push(policy);
    return policy;
  }

  async getPolicy(id: string): Promise<Policy | null> {
    return this.policies.find((p) => p.id === id) ?? null;
  }

  async updatePolicy(id: string, patch: PolicyPatch): Promise<Policy> {
    const idx = this.policies.findIndex((p) => p.id === id);
    if (idx === -1) throw new Error('policy_not_found');
    const updated = { ...this.policies[idx], ...patch, updatedAt: new Date().toISOString() };
    if (patch.content !== undefined) updated.version = this.policies[idx].version + 1;
    this.policies[idx] = updated;
    return this.policies[idx];
  }

  async deletePolicy(id: string): Promise<void> {
    this.policyControls = this.policyControls.filter((c) => c.policyId !== id);
    this.policies = this.policies.filter((p) => p.id !== id);
  }

  async cloneTemplate(orgId: string, userId: string, templateId: string): Promise<Policy> {
    const tmpl = this.policyTemplates.find((t) => t.id === templateId);
    if (!tmpl) throw new Error('template_not_found');
    return this.createPolicy(orgId, userId, {
      frameworkId: tmpl.frameworkId,
      title: tmpl.title,
      content: tmpl.content,
      templateId: tmpl.id,
    });
  }

  async listPolicyTemplates(frameworkId?: string): Promise<PolicyTemplate[]> {
    if (frameworkId) return this.policyTemplates.filter((t) => t.frameworkId === frameworkId);
    return [...this.policyTemplates];
  }

  async listPolicyControls(policyId: string): Promise<PolicyControl[]> {
    return this.policyControls.filter((c) => c.policyId === policyId);
  }

  async addPolicyControl(policyId: string, data: PolicyControlInput): Promise<PolicyControl> {
    const existing = this.policyControls.find(
      (c) => c.policyId === policyId && c.controlCode === data.controlCode && c.frameworkId === data.frameworkId,
    );
    if (existing) return existing;
    const pc: PolicyControl = {
      id: crypto.randomUUID(),
      policyId,
      controlCode: data.controlCode,
      frameworkId: data.frameworkId,
      createdAt: new Date().toISOString(),
    };
    this.policyControls.push(pc);
    return pc;
  }

  async removePolicyControl(id: string): Promise<void> {
    this.policyControls = this.policyControls.filter((c) => c.id !== id);
  }

  async listPoliciesForControl(controlCode: string, frameworkId: string): Promise<Policy[]> {
    const policyIds = this.policyControls
      .filter((c) => c.controlCode === controlCode && c.frameworkId === frameworkId)
      .map((c) => c.policyId);
    return this.policies.filter((p) => policyIds.includes(p.id));
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
git commit -m "feat(shared): implement Policy methods in FakeNotesStrategy"
```

---

### Task 4: Contract tests for Policies

**Files:**
- Modify: `libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts`

- [ ] **Step 1: Add policy contract tests**

```typescript
describe('policies', () => {
  let s: FakeNotesStrategy;
  beforeEach(() => { s = new FakeNotesStrategy(); });

  it('creates policy with draft status', async () => {
    const p = await s.createPolicy('org1', 'u1', {
      frameworkId: 'fw1',
      title: 'Access Control Policy',
      content: '# Access Control\n\nAll systems require MFA.',
    });
    expect(p.status).toBe('draft');
    expect(p.version).toBe(1);
  });

  it('approves policy', async () => {
    const p = await s.createPolicy('org1', 'u1', {
      frameworkId: 'fw1', title: 'T', content: 'C',
    });
    const approved = await s.updatePolicy(p.id, { status: 'approved' });
    expect(approved.status).toBe('approved');
  });

  it('bumps version on content update', async () => {
    const p = await s.createPolicy('org1', 'u1', {
      frameworkId: 'fw1', title: 'T', content: 'C v1',
    });
    const updated = await s.updatePolicy(p.id, { content: 'C v2' });
    expect(updated.version).toBe(2);
  });

  it('lists policies scoped by orgId', async () => {
    await s.createPolicy('org1', 'u1', { frameworkId: 'fw1', title: 'T', content: 'C' });
    expect(await s.listPolicies('org2')).toHaveLength(0);
    expect(await s.listPolicies('org1')).toHaveLength(1);
  });

  it('deletes policy and its control mappings', async () => {
    const p = await s.createPolicy('org1', 'u1', { frameworkId: 'fw1', title: 'T', content: 'C' });
    await s.addPolicyControl(p.id, { controlCode: 'AC-1', frameworkId: 'fw1' });
    await s.deletePolicy(p.id);
    expect(await s.listPolicies('org1')).toHaveLength(0);
    expect(await s.listPolicyControls(p.id)).toHaveLength(0);
  });

  it('clones template into a new draft policy', async () => {
    const cloned = await s.cloneTemplate('org1', 'u1', 'tmpl-1');
    expect(cloned.templateId).toBe('tmpl-1');
    expect(cloned.status).toBe('draft');
    expect(cloned.content).toContain('SOC 2');
  });

  it('lists policy templates filtered by framework', async () => {
    const all = await s.listPolicyTemplates();
    const filtered = await s.listPolicyTemplates('fw-soc2');
    expect(filtered.length).toBeLessThanOrEqual(all.length);
    filtered.forEach((t) => expect(t.frameworkId).toBe('fw-soc2'));
  });
});

describe('policy controls mapping', () => {
  let s: FakeNotesStrategy;
  beforeEach(() => { s = new FakeNotesStrategy(); });

  it('adds control mapping and lists it', async () => {
    const p = await s.createPolicy('org1', 'u1', { frameworkId: 'fw1', title: 'T', content: 'C' });
    const pc = await s.addPolicyControl(p.id, { controlCode: 'AC-1', frameworkId: 'fw1' });
    expect(pc.controlCode).toBe('AC-1');
    const list = await s.listPolicyControls(p.id);
    expect(list).toHaveLength(1);
  });

  it('deduplicates: adding same mapping twice returns existing', async () => {
    const p = await s.createPolicy('org1', 'u1', { frameworkId: 'fw1', title: 'T', content: 'C' });
    await s.addPolicyControl(p.id, { controlCode: 'AC-1', frameworkId: 'fw1' });
    await s.addPolicyControl(p.id, { controlCode: 'AC-1', frameworkId: 'fw1' });
    expect(await s.listPolicyControls(p.id)).toHaveLength(1);
  });

  it('lists policies for a given control code', async () => {
    const p = await s.createPolicy('org1', 'u1', { frameworkId: 'fw1', title: 'T', content: 'C' });
    await s.addPolicyControl(p.id, { controlCode: 'AC-1', frameworkId: 'fw1' });
    const policies = await s.listPoliciesForControl('AC-1', 'fw1');
    expect(policies).toHaveLength(1);
    expect(policies[0].id).toBe(p.id);
  });

  it('removes control mapping', async () => {
    const p = await s.createPolicy('org1', 'u1', { frameworkId: 'fw1', title: 'T', content: 'C' });
    const pc = await s.addPolicyControl(p.id, { controlCode: 'AC-1', frameworkId: 'fw1' });
    await s.removePolicyControl(pc.id);
    expect(await s.listPolicyControls(p.id)).toHaveLength(0);
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
git commit -m "test(shared): add Policy and PolicyControl contract tests"
```

---

### Task 5: SupabaseNotesStrategy — Policy DB implementations

**Files:**
- Modify: `apps/microservices/notes/src/app/supabase-notes.strategy.ts`

- [ ] **Step 1: Add imports**

Add to existing `@icore/shared` import:
```
Policy, PolicyInput, PolicyPatch, PolicyTemplate, PolicyControl, PolicyControlInput,
```

- [ ] **Step 2: Add Policy methods at the end of the class**

```typescript
  async listPolicies(orgId: string): Promise<Policy[]> {
    const { data, error } = await this.db
      .from('policies')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });
    return ok(data, error).map(this.toPolicy);
  }

  async createPolicy(orgId: string, userId: string, data: PolicyInput): Promise<Policy> {
    const { data: row, error } = await this.db
      .from('policies')
      .insert({
        org_id: orgId, user_id: userId,
        framework_id: data.frameworkId,
        title: data.title, content: data.content,
        template_id: data.templateId ?? null,
      })
      .select()
      .single();
    return this.toPolicy(ok(row, error));
  }

  async getPolicy(id: string): Promise<Policy | null> {
    const { data, error } = await this.db.from('policies').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? this.toPolicy(data) : null;
  }

  async updatePolicy(id: string, patch: PolicyPatch): Promise<Policy> {
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.title !== undefined) update['title'] = patch.title;
    if (patch.status !== undefined) update['status'] = patch.status;
    if (patch.content !== undefined) {
      update['content'] = patch.content;
      const cur = await this.db.from('policies').select('version').eq('id', id).single();
      update['version'] = ((cur.data?.['version'] as number) ?? 1) + 1;
    }
    const { data, error } = await this.db.from('policies').update(update).eq('id', id).select().single();
    return this.toPolicy(ok(data, error));
  }

  async deletePolicy(id: string): Promise<void> {
    const { error } = await this.db.from('policies').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  async cloneTemplate(orgId: string, userId: string, templateId: string): Promise<Policy> {
    const { data: tmpl, error } = await this.db
      .from('policy_templates')
      .select('*')
      .eq('id', templateId)
      .single();
    if (error || !tmpl) throw new Error('template_not_found');
    return this.createPolicy(orgId, userId, {
      frameworkId: tmpl['framework_id'] as string,
      title: tmpl['title'] as string,
      content: tmpl['content'] as string,
      templateId,
    });
  }

  async listPolicyTemplates(frameworkId?: string): Promise<PolicyTemplate[]> {
    let q = this.db.from('policy_templates').select('*').order('title');
    if (frameworkId) q = q.eq('framework_id', frameworkId);
    const { data, error } = await q;
    return ok(data, error).map((r: Record<string, unknown>) => ({
      id: r['id'] as string,
      frameworkId: r['framework_id'] as string,
      title: r['title'] as string,
      content: r['content'] as string,
      createdAt: r['created_at'] as string,
    }));
  }

  async listPolicyControls(policyId: string): Promise<PolicyControl[]> {
    const { data, error } = await this.db
      .from('policy_controls')
      .select('*')
      .eq('policy_id', policyId)
      .order('created_at');
    return ok(data, error).map(this.toPolicyControl);
  }

  async addPolicyControl(policyId: string, data: PolicyControlInput): Promise<PolicyControl> {
    const { data: row, error } = await this.db
      .from('policy_controls')
      .upsert(
        { policy_id: policyId, control_code: data.controlCode, framework_id: data.frameworkId },
        { onConflict: 'policy_id,control_code,framework_id', ignoreDuplicates: false },
      )
      .select()
      .single();
    return this.toPolicyControl(ok(row, error));
  }

  async removePolicyControl(id: string): Promise<void> {
    const { error } = await this.db.from('policy_controls').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  async listPoliciesForControl(controlCode: string, frameworkId: string): Promise<Policy[]> {
    const { data, error } = await this.db
      .from('policy_controls')
      .select('policy_id')
      .eq('control_code', controlCode)
      .eq('framework_id', frameworkId);
    const policyIds = ok(data, error).map((r: Record<string, unknown>) => r['policy_id'] as string);
    if (policyIds.length === 0) return [];
    const { data: policies, error: pErr } = await this.db
      .from('policies')
      .select('*')
      .in('id', policyIds);
    return ok(policies, pErr).map(this.toPolicy);
  }

  private toPolicy(row: Record<string, unknown>): Policy {
    return {
      id: row['id'] as string,
      orgId: row['org_id'] as string,
      userId: row['user_id'] as string,
      frameworkId: row['framework_id'] as string,
      title: row['title'] as string,
      content: row['content'] as string,
      status: row['status'] as Policy['status'],
      version: row['version'] as number,
      templateId: row['template_id'] as string | null,
      createdAt: row['created_at'] as string,
      updatedAt: row['updated_at'] as string,
    };
  }

  private toPolicyControl(row: Record<string, unknown>): PolicyControl {
    return {
      id: row['id'] as string,
      policyId: row['policy_id'] as string,
      controlCode: row['control_code'] as string,
      frameworkId: row['framework_id'] as string,
      createdAt: row['created_at'] as string,
    };
  }
```

- [ ] **Step 3: Build**

```bash
yarn nx build notes
```

Expected: success.

- [ ] **Step 4: Commit**

```bash
git add apps/microservices/notes/src/app/supabase-notes.strategy.ts
git commit -m "feat(notes-ms): implement Policy Supabase strategy methods"
```

---

### Task 6: Notes MS controller + NotesClientService + Gateway endpoints

**Files:**
- Modify: `apps/microservices/notes/src/app/notes.controller.ts`
- Modify: `libs/notes-client/src/lib/notes-client.service.ts`
- Modify: `apps/api/src/app/notes/notes.controller.ts`

- [ ] **Step 1: Add `@MessagePattern` handlers to notes MS controller**

Add imports: `Policy, PolicyInput, PolicyPatch, PolicyTemplate, PolicyControl, PolicyControlInput`.

Add handlers:
```typescript
  @MessagePattern('notes.policies.list')
  listPolicies(@Payload() p: { orgId: string }): Promise<Policy[]> {
    return this.strategy.listPolicies(p.orgId);
  }
  @MessagePattern('notes.policies.create')
  createPolicy(@Payload() p: { orgId: string; userId: string; data: PolicyInput }): Promise<Policy> {
    return this.strategy.createPolicy(p.orgId, p.userId, p.data);
  }
  @MessagePattern('notes.policies.get')
  getPolicy(@Payload() p: { id: string }): Promise<Policy | null> {
    return this.strategy.getPolicy(p.id);
  }
  @MessagePattern('notes.policies.update')
  updatePolicy(@Payload() p: { id: string; patch: PolicyPatch }): Promise<Policy> {
    return this.strategy.updatePolicy(p.id, p.patch);
  }
  @MessagePattern('notes.policies.delete')
  deletePolicy(@Payload() p: { id: string }): Promise<void> {
    return this.strategy.deletePolicy(p.id);
  }
  @MessagePattern('notes.policies.clone-template')
  cloneTemplate(@Payload() p: { orgId: string; userId: string; templateId: string }): Promise<Policy> {
    return this.strategy.cloneTemplate(p.orgId, p.userId, p.templateId);
  }
  @MessagePattern('notes.policy-templates.list')
  listPolicyTemplates(@Payload() p: { frameworkId?: string }): Promise<PolicyTemplate[]> {
    return this.strategy.listPolicyTemplates(p.frameworkId);
  }
  @MessagePattern('notes.policies.controls.list')
  listPolicyControls(@Payload() p: { policyId: string }): Promise<PolicyControl[]> {
    return this.strategy.listPolicyControls(p.policyId);
  }
  @MessagePattern('notes.policies.controls.add')
  addPolicyControl(@Payload() p: { policyId: string; data: PolicyControlInput }): Promise<PolicyControl> {
    return this.strategy.addPolicyControl(p.policyId, p.data);
  }
  @MessagePattern('notes.policies.controls.remove')
  removePolicyControl(@Payload() p: { id: string }): Promise<void> {
    return this.strategy.removePolicyControl(p.id);
  }
  @MessagePattern('notes.policies.for-control')
  listPoliciesForControl(@Payload() p: { controlCode: string; frameworkId: string }): Promise<Policy[]> {
    return this.strategy.listPoliciesForControl(p.controlCode, p.frameworkId);
  }
```

- [ ] **Step 2: Add TCP proxy methods to `NotesClientService`**

Add same imports. Add:
```typescript
  listPolicies(orgId: string): Promise<Policy[]> {
    return firstValueFrom(this.client.send<Policy[]>('notes.policies.list', { orgId }));
  }
  createPolicy(orgId: string, userId: string, data: PolicyInput): Promise<Policy> {
    return firstValueFrom(this.client.send<Policy>('notes.policies.create', { orgId, userId, data }));
  }
  getPolicy(id: string): Promise<Policy | null> {
    return firstValueFrom(this.client.send<Policy | null>('notes.policies.get', { id }));
  }
  updatePolicy(id: string, patch: PolicyPatch): Promise<Policy> {
    return firstValueFrom(this.client.send<Policy>('notes.policies.update', { id, patch }));
  }
  deletePolicy(id: string): Promise<void> {
    return firstValueFrom(this.client.send<void>('notes.policies.delete', { id }));
  }
  cloneTemplate(orgId: string, userId: string, templateId: string): Promise<Policy> {
    return firstValueFrom(this.client.send<Policy>('notes.policies.clone-template', { orgId, userId, templateId }));
  }
  listPolicyTemplates(frameworkId?: string): Promise<PolicyTemplate[]> {
    return firstValueFrom(this.client.send<PolicyTemplate[]>('notes.policy-templates.list', { frameworkId }));
  }
  listPolicyControls(policyId: string): Promise<PolicyControl[]> {
    return firstValueFrom(this.client.send<PolicyControl[]>('notes.policies.controls.list', { policyId }));
  }
  addPolicyControl(policyId: string, data: PolicyControlInput): Promise<PolicyControl> {
    return firstValueFrom(this.client.send<PolicyControl>('notes.policies.controls.add', { policyId, data }));
  }
  removePolicyControl(id: string): Promise<void> {
    return firstValueFrom(this.client.send<void>('notes.policies.controls.remove', { id }));
  }
  listPoliciesForControl(controlCode: string, frameworkId: string): Promise<Policy[]> {
    return firstValueFrom(this.client.send<Policy[]>('notes.policies.for-control', { controlCode, frameworkId }));
  }
```

- [ ] **Step 3: Add HTTP endpoints to gateway notes controller**

Add imports: `PolicyInput, PolicyPatch, PolicyControlInput`.

```typescript
  @Get('policies')
  listPolicies(@Req() req: Request & { user?: VerifiedToken }, @Query('orgId') orgId: string) {
    this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    return this.notes.listPolicies(orgId);
  }

  @Post('policies')
  createPolicy(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
    @Body() body: PolicyInput,
  ) {
    const userId = this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    return this.notes.createPolicy(orgId, userId, body);
  }

  @Get('policies/:id')
  async getPolicy(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    const p = await this.notes.getPolicy(id);
    if (!p) throw new NotFoundException();
    return p;
  }

  @Patch('policies/:id')
  updatePolicy(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() patch: PolicyPatch,
  ) {
    this.uid(req);
    return this.notes.updatePolicy(id, patch);
  }

  @Delete('policies/:id')
  @HttpCode(204)
  deletePolicy(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    return this.notes.deletePolicy(id);
  }

  @Post('policies/clone/:templateId')
  cloneTemplate(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
    @Param('templateId') templateId: string,
  ) {
    const userId = this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    return this.notes.cloneTemplate(orgId, userId, templateId);
  }

  @Get('policy-templates')
  listPolicyTemplates(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('frameworkId') frameworkId?: string,
  ) {
    this.uid(req);
    return this.notes.listPolicyTemplates(frameworkId);
  }

  @Get('policies/:id/controls')
  listPolicyControls(@Req() req: Request & { user?: VerifiedToken }, @Param('id') policyId: string) {
    this.uid(req);
    return this.notes.listPolicyControls(policyId);
  }

  @Post('policies/:id/controls')
  addPolicyControl(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') policyId: string,
    @Body() body: PolicyControlInput,
  ) {
    this.uid(req);
    return this.notes.addPolicyControl(policyId, body);
  }

  @Delete('policies/controls/:mappingId')
  @HttpCode(204)
  removePolicyControl(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('mappingId') mappingId: string,
  ) {
    this.uid(req);
    return this.notes.removePolicyControl(mappingId);
  }

  @Get('policies/for-control')
  listPoliciesForControl(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('controlCode') controlCode: string,
    @Query('frameworkId') frameworkId: string,
  ) {
    this.uid(req);
    if (!controlCode || !frameworkId) throw new BadRequestException('controlCode and frameworkId required');
    return this.notes.listPoliciesForControl(controlCode, frameworkId);
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
git commit -m "feat: add Policy MessagePatterns, TCP proxy, and HTTP endpoints"
```

---

### Task 7: Client React Query hooks

**Files:**
- Create: `apps/client/src/queries/policies.ts`

- [ ] **Step 1: Create `apps/client/src/queries/policies.ts`**

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  Policy, PolicyInput, PolicyPatch,
  PolicyTemplate, PolicyControl, PolicyControlInput,
} from '@icore/shared';

export type { Policy, PolicyInput, PolicyPatch, PolicyTemplate, PolicyControl, PolicyControlInput };

export function usePolicies(orgId: string) {
  return useQuery<Policy[]>({
    queryKey: ['policies', orgId],
    queryFn: () => api<Policy[]>(`/policies?orgId=${encodeURIComponent(orgId)}`),
    enabled: !!orgId,
  });
}

export function usePolicy(id: string) {
  return useQuery<Policy>({
    queryKey: ['policies', id],
    queryFn: () => api<Policy>(`/policies/${id}`),
    enabled: !!id,
  });
}

export function usePolicyTemplates(frameworkId?: string) {
  return useQuery<PolicyTemplate[]>({
    queryKey: ['policy-templates', frameworkId ?? 'all'],
    queryFn: () =>
      api<PolicyTemplate[]>(
        frameworkId
          ? `/policy-templates?frameworkId=${encodeURIComponent(frameworkId)}`
          : '/policy-templates',
      ),
  });
}

export function usePolicyControls(policyId: string) {
  return useQuery<PolicyControl[]>({
    queryKey: ['policies', policyId, 'controls'],
    queryFn: () => api<PolicyControl[]>(`/policies/${policyId}/controls`),
    enabled: !!policyId,
  });
}

export function usePoliciesForControl(controlCode: string, frameworkId: string) {
  return useQuery<Policy[]>({
    queryKey: ['policies', 'for-control', controlCode, frameworkId],
    queryFn: () =>
      api<Policy[]>(
        `/policies/for-control?controlCode=${encodeURIComponent(controlCode)}&frameworkId=${encodeURIComponent(frameworkId)}`,
      ),
    enabled: !!controlCode && !!frameworkId,
  });
}

export function useCreatePolicy(orgId: string) {
  const qc = useQueryClient();
  return useMutation<Policy, Error, PolicyInput>({
    mutationFn: (data) =>
      api<Policy>(`/policies?orgId=${encodeURIComponent(orgId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['policies', orgId] }),
  });
}

export function useCloneTemplate(orgId: string) {
  const qc = useQueryClient();
  return useMutation<Policy, Error, string>({
    mutationFn: (templateId) =>
      api<Policy>(`/policies/clone/${templateId}?orgId=${encodeURIComponent(orgId)}`, {
        method: 'POST',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['policies', orgId] }),
  });
}

export function useUpdatePolicy(orgId: string, id: string) {
  const qc = useQueryClient();
  return useMutation<Policy, Error, PolicyPatch>({
    mutationFn: (patch) =>
      api<Policy>(`/policies/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['policies', orgId] });
      qc.invalidateQueries({ queryKey: ['policies', id] });
    },
  });
}

export function useDeletePolicy(orgId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => api<void>(`/policies/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['policies', orgId] }),
  });
}

export function useAddPolicyControl(policyId: string) {
  const qc = useQueryClient();
  return useMutation<PolicyControl, Error, PolicyControlInput>({
    mutationFn: (data) =>
      api<PolicyControl>(`/policies/${policyId}/controls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['policies', policyId, 'controls'] }),
  });
}

export function useRemovePolicyControl(policyId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => api<void>(`/policies/controls/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['policies', policyId, 'controls'] }),
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/client/src/queries/policies.ts
git commit -m "feat(client): add Policy React Query hooks"
```

---

### Task 8: Client routes — Policies list + detail pages

**Files:**
- Create: `apps/client/src/routes/_dashboard/policies.tsx`
- Create: `apps/client/src/routes/_dashboard/policies_.$id.tsx`

- [ ] **Step 1: Create `apps/client/src/routes/_dashboard/policies.tsx`**

```tsx
import { useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Plus, FileText } from 'lucide-react';
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
  usePolicies, useCreatePolicy, useCloneTemplate, useDeletePolicy,
  usePolicyTemplates, type Policy, type PolicyInput,
} from '@/queries/policies';
import { useFrameworks } from '@/queries/notes';

export const Route = createFileRoute('/_dashboard/policies')({
  component: PoliciesPage,
});

const STATUS_COLORS: Record<Policy['status'], string> = {
  draft:    'bg-muted text-muted-foreground border-border',
  approved: 'bg-green-500/10 text-green-400 border-green-500/20',
};

function PoliciesPage() {
  const { t } = useTranslation();
  const { activeOrgId } = useActiveOrgStore();
  const orgId = activeOrgId ?? '';

  const { data: policies = [], isPending } = usePolicies(orgId);
  const { data: frameworks = [] } = useFrameworks();
  const { data: templates = [] } = usePolicyTemplates();
  const createMut = useCreatePolicy(orgId);
  const cloneMut = useCloneTemplate(orgId);
  const deleteMut = useDeletePolicy(orgId);

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'scratch' | 'template'>('template');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [form, setForm] = useState<PolicyInput>({ frameworkId: '', title: '', content: '' });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === 'template') {
      if (!selectedTemplate) return;
      cloneMut.mutate(selectedTemplate, { onSuccess: () => setOpen(false) });
    } else {
      if (!form.frameworkId || !form.title) return;
      createMut.mutate(form, {
        onSuccess: () => { setOpen(false); setForm({ frameworkId: '', title: '', content: '' }); },
      });
    }
  }

  return (
    <PageLayout title={t('nav.policies')}>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{t('policies.subtitle')}</p>
        <Button size="sm" onClick={() => setOpen(true)} disabled={!orgId}>
          <Plus size={14} className="mr-1.5" />
          {t('policies.newPolicy')}
        </Button>
      </div>

      {isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 bg-surface border border-border rounded-xl animate-pulse" />
          ))}
        </div>
      ) : policies.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
          <FileText size={32} className="opacity-30" />
          <p className="text-sm">{t('policies.empty')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {policies.map((policy) => (
            <div key={policy.id} className="flex items-center gap-4 bg-surface border border-border rounded-xl p-4">
              <Link
                to="/policies/$id"
                params={{ id: policy.id }}
                className="flex-1 min-w-0 hover:text-green-400 transition-colors"
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-medium text-sm text-foreground truncate">{policy.title}</span>
                  <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border ${STATUS_COLORS[policy.status]}`}>
                    {t(`policies.status.${policy.status}`)}
                  </span>
                  <span className="text-[10px] text-muted-foreground/50">v{policy.version}</span>
                </div>
                <p className="text-[11px] text-muted-foreground/60">
                  {frameworks.find((f) => f.id === policy.frameworkId)?.name ?? policy.frameworkId}
                </p>
              </Link>
              <button
                type="button"
                onClick={() => deleteMut.mutate(policy.id)}
                className="text-xs text-muted-foreground/50 hover:text-destructive transition-colors shrink-0"
              >
                {t('common.delete')}
              </button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('policies.newPolicy')}</DialogTitle>
            <DialogDescription>{t('policies.newDescription')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex gap-2">
              {(['template', 'scratch'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`flex-1 py-1.5 rounded border text-xs font-medium transition-colors ${
                    mode === m
                      ? 'border-green-500/40 bg-green-500/10 text-green-400'
                      : 'border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t(`policies.mode.${m}`)}
                </button>
              ))}
            </div>

            {mode === 'template' ? (
              <div className="space-y-2">
                <Label>{t('policies.selectTemplate')}</Label>
                <select
                  value={selectedTemplate}
                  onChange={(e) => setSelectedTemplate(e.target.value)}
                  className="w-full h-9 rounded-md border border-border bg-surface px-3 text-sm focus:outline-none focus:ring-1 focus:ring-green-500/40"
                  required
                >
                  <option value="" disabled>{t('policies.chooseTemplate')}</option>
                  {templates.map((tmpl) => (
                    <option key={tmpl.id} value={tmpl.id}>
                      {tmpl.title} — {frameworks.find((f) => f.id === tmpl.frameworkId)?.slug.toUpperCase() ?? ''}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>{t('policies.framework')}</Label>
                  <select
                    value={form.frameworkId}
                    onChange={(e) => setForm((f) => ({ ...f, frameworkId: e.target.value }))}
                    className="w-full h-9 rounded-md border border-border bg-surface px-3 text-sm focus:outline-none focus:ring-1 focus:ring-green-500/40"
                    required
                  >
                    <option value="" disabled>{t('exceptions.selectFramework')}</option>
                    {frameworks.map((fw) => (
                      <option key={fw.id} value={fw.id}>{fw.slug.toUpperCase()} — {fw.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>{t('policies.title')}</Label>
                  <Input
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder={t('policies.titlePlaceholder')}
                    required
                  />
                </div>
              </>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
              <Button type="submit" disabled={createMut.isPending || cloneMut.isPending}>
                {(createMut.isPending || cloneMut.isPending) ? t('common.saving') : t('common.create')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}
```

- [ ] **Step 2: Create `apps/client/src/routes/_dashboard/policies_.$id.tsx`**

```tsx
import { useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Plus, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageLayout } from '@/components/PageLayout';
import {
  usePolicy, usePolicyControls, useUpdatePolicy, useDeletePolicy,
  useAddPolicyControl, useRemovePolicyControl, type PolicyControlInput,
} from '@/queries/policies';
import { useActiveOrgStore } from '@/stores/active-org';
import { useFrameworks } from '@/queries/notes';

export const Route = createFileRoute('/_dashboard/policies/$id')({
  component: PolicyDetailPage,
});

function PolicyDetailPage() {
  const { t } = useTranslation();
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { activeOrgId } = useActiveOrgStore();
  const orgId = activeOrgId ?? '';

  const { data: policy, isPending } = usePolicy(id);
  const { data: controls = [] } = usePolicyControls(id);
  const { data: frameworks = [] } = useFrameworks();
  const updateMut = useUpdatePolicy(orgId, id);
  const deleteMut = useDeletePolicy(orgId);
  const addControlMut = useAddPolicyControl(id);
  const removeControlMut = useRemovePolicyControl(id);

  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState('');
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkForm, setLinkForm] = useState<PolicyControlInput>({ controlCode: '', frameworkId: '' });

  function startEdit() {
    setContent(policy?.content ?? '');
    setEditing(true);
  }

  function saveContent() {
    updateMut.mutate({ content }, { onSuccess: () => setEditing(false) });
  }

  function handleDelete() {
    deleteMut.mutate(id, { onSuccess: () => void navigate({ to: '/policies' }) });
  }

  if (isPending) {
    return (
      <PageLayout title="…">
        <div className="h-64 bg-surface border border-border rounded-xl animate-pulse" />
      </PageLayout>
    );
  }

  if (!policy) {
    return <PageLayout title={t('common.notFound')}><p className="text-sm text-muted-foreground">{t('policies.notFound')}</p></PageLayout>;
  }

  return (
    <PageLayout title={policy.title}>
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => void navigate({ to: '/policies' })}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={14} />
          {t('policies.backToList')}
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {frameworks.find((f) => f.id === policy.frameworkId)?.slug.toUpperCase() ?? ''} · v{policy.version}
          </span>
          <select
            value={policy.status}
            onChange={(e) => updateMut.mutate({ status: e.target.value as 'draft' | 'approved' })}
            className="text-xs h-7 rounded border border-border bg-surface px-2 text-foreground focus:outline-none"
          >
            <option value="draft">{t('policies.status.draft')}</option>
            <option value="approved">{t('policies.status.approved')}</option>
          </select>
          <Button size="sm" variant="outline" onClick={startEdit}>{t('common.edit')}</Button>
          <Button size="sm" variant="outline" onClick={() => setLinkOpen(true)}>
            <Link2 size={14} className="mr-1.5" />
            {t('policies.linkControl')}
          </Button>
          <button
            type="button"
            onClick={handleDelete}
            className="text-xs text-muted-foreground/50 hover:text-destructive transition-colors"
          >
            {t('common.delete')}
          </button>
        </div>
      </div>

      {editing ? (
        <div className="space-y-3">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={20}
            className="w-full rounded-md border border-border bg-surface px-4 py-3 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-green-500/40 resize-none"
          />
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setEditing(false)}>{t('common.cancel')}</Button>
            <Button onClick={saveContent} disabled={updateMut.isPending}>
              {updateMut.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-xl p-6">
          <pre className="text-sm text-foreground whitespace-pre-wrap font-mono leading-relaxed">{policy.content}</pre>
        </div>
      )}

      {controls.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">{t('policies.linkedControls')}</p>
          <div className="flex flex-wrap gap-2">
            {controls.map((pc) => (
              <div key={pc.id} className="flex items-center gap-1.5 px-2 py-1 rounded border border-border bg-surface text-xs">
                <span className="text-foreground">{pc.controlCode}</span>
                <span className="text-muted-foreground/40">·</span>
                <span className="text-muted-foreground/60">{frameworks.find((f) => f.id === pc.frameworkId)?.slug.toUpperCase() ?? ''}</span>
                <button
                  type="button"
                  onClick={() => removeControlMut.mutate(pc.id)}
                  className="text-muted-foreground/30 hover:text-destructive transition-colors ml-1"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('policies.linkControl')}</DialogTitle>
            <DialogDescription>{t('policies.linkControlDescription')}</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!linkForm.controlCode || !linkForm.frameworkId) return;
              addControlMut.mutate(linkForm, {
                onSuccess: () => { setLinkOpen(false); setLinkForm({ controlCode: '', frameworkId: '' }); },
              });
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>{t('exceptions.controlCode')}</Label>
              <Input
                value={linkForm.controlCode}
                onChange={(e) => setLinkForm((f) => ({ ...f, controlCode: e.target.value }))}
                placeholder="AC-1"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>{t('exceptions.framework')}</Label>
              <select
                value={linkForm.frameworkId}
                onChange={(e) => setLinkForm((f) => ({ ...f, frameworkId: e.target.value }))}
                className="w-full h-9 rounded-md border border-border bg-surface px-3 text-sm focus:outline-none focus:ring-1 focus:ring-green-500/40"
                required
              >
                <option value="" disabled>{t('exceptions.selectFramework')}</option>
                {frameworks.map((fw) => (
                  <option key={fw.id} value={fw.id}>{fw.slug.toUpperCase()} — {fw.name}</option>
                ))}
              </select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setLinkOpen(false)}>{t('common.cancel')}</Button>
              <Button type="submit" disabled={addControlMut.isPending}>
                {addControlMut.isPending ? t('common.saving') : t('policies.link')}
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
  apps/client/src/routes/_dashboard/policies.tsx \
  apps/client/src/routes/_dashboard/policies_.$id.tsx
git commit -m "feat(client): add Policies list and detail pages with Controls mapping"
```

---

### Task 9: i18n + nav + final checks

**Files:**
- Modify: `libs/template-shared/src/lib/i18n/locales/en.ts` + he/ru/es
- Modify: `apps/client/src/components/layout/LayoutSider.tsx`

- [ ] **Step 1: Add keys to `en.ts`**

In `nav`:
```typescript
    policies: 'Policies',
```

Add new object:
```typescript
  policies: {
    subtitle: 'Policy documents per framework — draft, approve, and link to controls',
    newPolicy: 'New Policy',
    newDescription: 'Create a policy from a framework template or from scratch',
    empty: 'No policies yet',
    framework: 'Framework',
    title: 'Title',
    titlePlaceholder: 'e.g. Access Control Policy',
    selectTemplate: 'From Template',
    chooseTemplate: 'Choose a template…',
    mode: {
      template: 'From Template',
      scratch: 'From Scratch',
    },
    status: {
      draft: 'Draft',
      approved: 'Approved',
    },
    backToList: 'Back to policies',
    notFound: 'Policy not found',
    linkedControls: 'Linked Controls',
    linkControl: 'Link Control',
    link: 'Link',
    linkControlDescription: 'Associate a framework control code with this policy document',
  },
```

- [ ] **Step 2: Add keys to he/ru/es locales**

**he.ts** nav: `policies: 'מדיניות'`
**ru.ts** nav: `policies: 'Политики'`
**es.ts** nav: `policies: 'Políticas'`

Add `policies: {...}` object in each locale with translated strings.

- [ ] **Step 3: Update `LayoutSider.tsx`**

Add to `NavKey` type:
```typescript
  | 'nav.policies'
```

Add to `sectionCompliance` items (after `controls` or `gapAnalysis`):
```typescript
      { labelKey: 'nav.policies', to: '/policies', icon: FileText },
```

Add `FileText` to lucide-react import.

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
  apps/client/src/queries/policies.ts \
  apps/client/src/routes/_dashboard/policies.tsx \
  "apps/client/src/routes/_dashboard/policies_.\$id.tsx" \
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
git commit -m "chore: prettier + final wiring — policies module"
gh pr create --base dev --title "feat: Policies, Framework Templates & Controls mapping" --body "$(cat <<'EOF'
## Summary
- Policies: org-owned policy documents per framework with draft/approved status + version tracking
- Framework Templates: one pre-built template per framework seeded via migration — orgs clone to create policies
- Controls→Policies mapping: link framework control codes to policy documents; visible in policy detail page
- Full stack: Supabase tables (with seed data) → notes MS → gateway → React Query → dashboard routes
- i18n: en/he/ru/es

## Test plan
- [ ] Open Policies page → empty state shown
- [ ] Click "New Policy" → dialog shows "From Template" and "From Scratch" modes
- [ ] Clone a framework template → new policy appears in list as Draft
- [ ] Open policy detail → full content shown as monospace text
- [ ] Click "Edit" → textarea with current content, save bumps version to v2
- [ ] Change status to "Approved" → badge changes to green
- [ ] Link a control (e.g. AC-1) to the policy → chip appears in "Linked Controls" section
- [ ] Remove control link → chip disappears
- [ ] Create policy from scratch → appears in list

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

*Self-review: `cloneTemplate` and `listPoliciesForControl` consistently implemented across fake (Task 3), Supabase (Task 5), and gateway (Task 6). Route files use `_.$id` underscore pattern for standalone detail pages. Policy version bump on content update verified in contract tests (Task 4). Template seed migration inserts one row per framework from the `frameworks` table at migration time — no hardcoded framework IDs.*

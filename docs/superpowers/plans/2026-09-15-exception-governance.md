# Exception Governance (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `Exception` from a text blob with an approval flag into a real governance object: add risk-linkage, a query-time-computed expiry status, a renewal workflow to extend an expiring exception, and fix the complete absence of actor-tracking on approve/reject.

**Architecture:** New `ExceptionRenewal` entity (one row per renewal cycle, modeled directly on `RiskAcceptance`/`IssueValidation`) tracks the renewal review lifecycle; `Exception` gains `riskId`, `reviewFrequencyDays`, `reviewedBy`, `reviewedAt`. A pure `effectiveExceptionStatus()` function computes `'expired'` at read time from `status`+`expiresAt` — no job/cron infrastructure, mirroring `getActiveRiskAcceptance`'s query-time approach. Backend changes span all 5 layers. Client gets a new `ExceptionDetailSheet` (Overview/Renewal tabs) replacing the flat inline row as the way to view/act on an exception, plus `expiresAt`/`riskId` added to the existing create form.

**Tech Stack:** NestJS TCP microservices, Supabase (Postgres + RLS), React 19 + TanStack Query + shadcn/ui, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-15-exception-governance-design.md`

## Global Constraints

- No self-approval: `approveException`/`rejectException` must reject a caller whose id matches the exception's `ownerId`. No self-review on renewal: `reviewExceptionRenewal` must reject a caller whose id matches the renewal's `requestedBy`. Both enforced server-side in both strategies.
- Effective status is computed, never stored as a side effect of a read: `status === 'approved' && expiresAt !== null && new Date(expiresAt).getTime() < Date.now()` → `'expired'`, else `status` unchanged. A `GET`/list call never writes to the row it returns.
- `ExceptionRenewal` history accumulates naturally — rejecting a renewal never deletes/overwrites the row; the next request creates a new one.
- `riskId` links to an existing Risk only — no create-new-risk-from-exception flow in this phase.
- New `exception_renewals` table gets org-scoped + actor-scoped RLS from the start (`exists (select 1 from org_profiles ...)` + actor check), never `using(true)` — the mistake made and corrected in the prior phase's (Issue closure-validation) first migration draft must not repeat here.
- Gateway routes resolve `orgId` from the owning record (the `Exception` row, or the `ExceptionRenewal` row), never from a client-supplied query param.
- `Exception.status` stored value transitions only via explicit action (create → `pending`; approve → `approved`; reject → `rejected`); a renewal being approved changes `expiresAt` only, never `status` directly.

---

### Task 1: Shared types, `effectiveExceptionStatus`, Supabase migration, and Fake strategy implementation

**Files:**
- Modify: `libs/shared/src/strategies/notes.ts:427-462` (Exception-related types)
- Modify: `libs/shared/src/strategies/fakes/fake-notes.ts` (add `exceptionRenewals` collection + 6 new/changed methods)
- Create: `supabase/migrations/20260915000002_exception_governance.sql`
- Modify: `libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts:12-90ish` (exceptions describe block)

**Interfaces:**
- Produces: `Exception.riskId`, `Exception.reviewFrequencyDays`, `Exception.reviewedBy`, `Exception.reviewedAt`; `effectiveExceptionStatus(exception)`; `ExceptionRenewalStatus`, `ExceptionRenewal`, `ExceptionRenewalRequestInput` types; and these `DBStrategy` interface methods:
  ```ts
  approveException(id: string, approverId: string): Promise<Exception>;
  rejectException(id: string, approverId: string): Promise<Exception>;
  requestExceptionRenewal(
    exceptionId: string,
    requestedBy: string,
    data: ExceptionRenewalRequestInput,
  ): Promise<ExceptionRenewal>;
  reviewExceptionRenewal(
    id: string,
    reviewerId: string,
    decision: 'approved' | 'rejected',
    reviewNotes?: string,
  ): Promise<ExceptionRenewal>;
  getExceptionRenewal(id: string): Promise<ExceptionRenewal | null>;
  getActiveExceptionRenewal(exceptionId: string): Promise<ExceptionRenewal | null>;
  listExceptionRenewals(exceptionId: string): Promise<ExceptionRenewal[]>;
  ```
  `approveException`/`rejectException` change signature — this is a breaking change to the existing `DBStrategy` interface, propagated through every layer in Tasks 2-3.
- Consumes: nothing from other tasks (this is the foundation task).

- [ ] **Step 1: Update `Exception`/`ExceptionInput`/`ExceptionPatch`, add `effectiveExceptionStatus`, add `ExceptionRenewal` types**

In `libs/shared/src/strategies/notes.ts`, replace lines 427-462 with:

```ts
export type ExceptionStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export interface Exception {
  id: string;
  orgId: string;
  userId: string;
  controlCode: string;
  standardCode?: string;
  frameworkId: string;
  title: string;
  statement: string;
  justification: string;
  ownerId: string;
  compensatingControls?: string;
  status: ExceptionStatus;
  expiresAt: string | null;
  riskId: string | null;
  reviewFrequencyDays: number | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExceptionInput {
  controlCode: string;
  standardCode?: string;
  frameworkId: string;
  title: string;
  statement: string;
  justification: string;
  ownerId: string;
  compensatingControls?: string;
  expiresAt?: string;
  riskId?: string;
  reviewFrequencyDays?: number;
}

export interface ExceptionPatch {
  title?: string;
  statement?: string;
  justification?: string;
  ownerId?: string;
  compensatingControls?: string;
  expiresAt?: string | null;
  riskId?: string | null;
  reviewFrequencyDays?: number | null;
}

export function effectiveExceptionStatus(
  exception: Pick<Exception, 'status' | 'expiresAt'>,
): ExceptionStatus {
  const isLapsed =
    exception.expiresAt !== null && new Date(exception.expiresAt).getTime() < Date.now();
  return exception.status === 'approved' && isLapsed ? 'expired' : exception.status;
}

export type ExceptionRenewalStatus = 'pending' | 'approved' | 'rejected';

export interface ExceptionRenewal {
  id: string;
  exceptionId: string;
  orgId: string;
  requestedBy: string;
  proposedExpiresAt: string;
  justification: string;
  status: ExceptionRenewalStatus;
  reviewedBy: string | null;
  reviewNotes: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface ExceptionRenewalRequestInput {
  proposedExpiresAt: string;
  justification: string;
}
```

Then find the `DBStrategy` interface's Exceptions section (search for `approveException(id: string): Promise<Exception>;` and `rejectException(id: string): Promise<Exception>;` inside the interface, not the implementation) and replace those two lines with:

```ts
  approveException(id: string, approverId: string): Promise<Exception>;
  rejectException(id: string, approverId: string): Promise<Exception>;
  requestExceptionRenewal(
    exceptionId: string,
    requestedBy: string,
    data: ExceptionRenewalRequestInput,
  ): Promise<ExceptionRenewal>;
  reviewExceptionRenewal(
    id: string,
    reviewerId: string,
    decision: 'approved' | 'rejected',
    reviewNotes?: string,
  ): Promise<ExceptionRenewal>;
  getExceptionRenewal(id: string): Promise<ExceptionRenewal | null>;
  getActiveExceptionRenewal(exceptionId: string): Promise<ExceptionRenewal | null>;
  listExceptionRenewals(exceptionId: string): Promise<ExceptionRenewal[]>;
```

- [ ] **Step 2: Run typecheck to confirm the interface change compiles (implementations don't exist yet, so `FakeNotesStrategy`/`SupabaseNotesStrategy` will fail to satisfy `DBStrategy` — that's expected until Step 3 and Task 2 land)**

Run: `yarn tsc --noEmit -p libs/shared/tsconfig.lib.json 2>&1 | head -30`
Expected: errors naming `FakeNotesStrategy`/`SupabaseNotesStrategy` as missing the new methods and having the wrong `approveException`/`rejectException` signature — confirms the interface change took effect.

- [ ] **Step 3: Implement the type/signature changes + 5 new methods in `FakeNotesStrategy`**

In `libs/shared/src/strategies/fakes/fake-notes.ts`, find `private exceptions = new Map<string, Exception>();` (search for it — it's declared near the other collections) and add immediately after it:

```ts
  private exceptionRenewals: ExceptionRenewal[] = [];
```

Update `createException`'s `Exception` object literal to add the four new fields (insert after `expiresAt: data.expiresAt ?? null,`):

```ts
      expiresAt: data.expiresAt ?? null,
      riskId: data.riskId ?? null,
      reviewFrequencyDays: data.reviewFrequencyDays ?? null,
      reviewedBy: null,
      reviewedAt: null,
```

Replace `approveException` and `rejectException` with:

```ts
  async approveException(id: string, approverId: string): Promise<Exception> {
    const existing = this.exceptions.get(id);
    if (!existing) throw new Error('exception_not_found');
    if (existing.ownerId === approverId) {
      throw new Error('exception_self_approval_forbidden');
    }
    const approved: Exception = {
      ...existing,
      status: 'approved',
      reviewedBy: approverId,
      reviewedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.exceptions.set(id, approved);
    return approved;
  }

  async rejectException(id: string, approverId: string): Promise<Exception> {
    const existing = this.exceptions.get(id);
    if (!existing) throw new Error(`exception_not_found: ${id}`);
    if (existing.ownerId === approverId) {
      throw new Error('exception_self_approval_forbidden');
    }
    const rejected: Exception = {
      ...existing,
      status: 'rejected',
      reviewedBy: approverId,
      reviewedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.exceptions.set(id, rejected);
    return rejected;
  }
```

Then add these 5 methods immediately after `deleteException`:

```ts
  async requestExceptionRenewal(
    exceptionId: string,
    requestedBy: string,
    data: ExceptionRenewalRequestInput,
  ): Promise<ExceptionRenewal> {
    const exception = this.exceptions.get(exceptionId);
    if (!exception) throw new Error(`exception_not_found: ${exceptionId}`);
    if (exception.ownerId !== requestedBy) {
      throw new Error('exception_renewal_only_owner_can_request');
    }
    const renewal: ExceptionRenewal = {
      id: globalThis.crypto.randomUUID(),
      exceptionId,
      orgId: exception.orgId,
      requestedBy,
      proposedExpiresAt: data.proposedExpiresAt,
      justification: data.justification,
      status: 'pending',
      reviewedBy: null,
      reviewNotes: null,
      reviewedAt: null,
      createdAt: new Date().toISOString(),
    };
    this.exceptionRenewals.unshift(renewal);
    return renewal;
  }

  async reviewExceptionRenewal(
    id: string,
    reviewerId: string,
    decision: 'approved' | 'rejected',
    reviewNotes?: string,
  ): Promise<ExceptionRenewal> {
    const renewal = this.exceptionRenewals.find((r) => r.id === id);
    if (!renewal) throw new Error(`exception_renewal_not_found: ${id}`);
    if (renewal.status !== 'pending') {
      throw new Error(`exception_renewal_already_decided: ${id}`);
    }
    if (renewal.requestedBy === reviewerId) {
      throw new Error('exception_renewal_self_review_forbidden');
    }
    if (decision === 'rejected' && !reviewNotes) {
      throw new Error('exception_renewal_review_notes_required');
    }
    renewal.status = decision;
    renewal.reviewedBy = reviewerId;
    renewal.reviewNotes = reviewNotes ?? null;
    renewal.reviewedAt = new Date().toISOString();

    if (decision === 'approved') {
      const exception = this.exceptions.get(renewal.exceptionId);
      if (exception) {
        this.exceptions.set(renewal.exceptionId, {
          ...exception,
          expiresAt: renewal.proposedExpiresAt,
          updatedAt: new Date().toISOString(),
        });
      }
    }
    return renewal;
  }

  async getExceptionRenewal(id: string): Promise<ExceptionRenewal | null> {
    return this.exceptionRenewals.find((r) => r.id === id) ?? null;
  }

  async getActiveExceptionRenewal(exceptionId: string): Promise<ExceptionRenewal | null> {
    return (
      this.exceptionRenewals.find((r) => r.exceptionId === exceptionId && r.status === 'pending') ??
      null
    );
  }

  async listExceptionRenewals(exceptionId: string): Promise<ExceptionRenewal[]> {
    return this.exceptionRenewals.filter((r) => r.exceptionId === exceptionId);
  }
```

- [ ] **Step 4: Write the migration**

Create `supabase/migrations/20260915000002_exception_governance.sql`:

```sql
-- Exception governance: risk-linkage, renewal workflow, and approve/reject actor-tracking.

alter table public.exceptions
  add column risk_id uuid references public.risks(id) on delete set null,
  add column review_frequency_days integer,
  add column reviewed_by uuid,
  add column reviewed_at timestamptz;

create table public.exception_renewals (
  id uuid primary key default gen_random_uuid(),
  exception_id uuid not null references public.exceptions(id) on delete cascade,
  org_id uuid not null references public.org_profiles(id) on delete cascade,
  requested_by uuid not null,
  proposed_expires_at timestamptz not null,
  justification text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid,
  review_notes text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index exception_renewals_exception_idx on public.exception_renewals(exception_id);
create index exception_renewals_org_idx on public.exception_renewals(org_id);

alter table public.exception_renewals enable row level security;

create policy "org members read exception renewals"
  on public.exception_renewals for select
  using (
    exists (select 1 from public.org_profiles o where o.id = org_id and o.user_id = auth.uid())
  );

create policy "requester or reviewer manage exception renewals"
  on public.exception_renewals for all
  using (
    exists (select 1 from public.org_profiles o where o.id = org_id and o.user_id = auth.uid())
    and (requested_by = auth.uid() or reviewed_by = auth.uid())
  )
  with check (
    exists (select 1 from public.org_profiles o where o.id = org_id and o.user_id = auth.uid())
    and (requested_by = auth.uid() or reviewed_by = auth.uid())
  );
```

No constraint-name-lookup dance is needed here (unlike the prior phase's `issues` status-column edit) — this migration only adds new nullable columns to `exceptions`, it doesn't touch the existing `status` check constraint.

- [ ] **Step 5: Update the 2 existing tests that call `approveException`/`rejectException` with the old 1-arg signature**

In `libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts`, inside `describe('exceptions', ...)`, find the two tests `'approves an exception'` and `'rejects an exception'` and update the calls to pass a second, different-from-owner actor id:

```ts
  it('approves an exception', async () => {
    const exc = await s.createException('org1', 'u1', {
      controlCode: 'AC-1',
      frameworkId: 'fw1',
      title: 'T',
      justification: 'J',
      statement: 'S',
      ownerId: 'owner-1',
    });
    const approved = await s.approveException(exc.id, 'approver-1');
    expect(approved.status).toBe('approved');
    expect(approved.reviewedBy).toBe('approver-1');
  });

  it('rejects an exception', async () => {
    const exc = await s.createException('org1', 'u1', {
      controlCode: 'AC-1',
      frameworkId: 'fw1',
      title: 'T',
      justification: 'J',
      statement: 'S',
      ownerId: 'owner-1',
    });
    const rejected = await s.rejectException(exc.id, 'approver-1');
    expect(rejected.status).toBe('rejected');
    expect(rejected.reviewedBy).toBe('approver-1');
  });
```

- [ ] **Step 6: Add new tests for the actor fix, `effectiveExceptionStatus`, and the renewal workflow**

Add these tests inside `describe('exceptions', ...)`, after the tests from Step 5:

```ts
  it('rejects self-approval', async () => {
    const exc = await s.createException('org1', 'u1', {
      controlCode: 'AC-1',
      frameworkId: 'fw1',
      title: 'T',
      justification: 'J',
      statement: 'S',
      ownerId: 'owner-1',
    });
    await expect(s.approveException(exc.id, 'owner-1')).rejects.toThrow(
      'exception_self_approval_forbidden',
    );
    await expect(s.rejectException(exc.id, 'owner-1')).rejects.toThrow(
      'exception_self_approval_forbidden',
    );
  });
```

Add a new top-level `describe` block after the `describe('exceptions', ...)` block closes:

```ts
describe('effectiveExceptionStatus', () => {
  it('returns approved when expiresAt is in the future', () => {
    const future = new Date(Date.now() + 86400_000).toISOString();
    expect(effectiveExceptionStatus({ status: 'approved', expiresAt: future })).toBe('approved');
  });

  it('returns expired when an approved exception has lapsed', () => {
    const past = new Date(Date.now() - 86400_000).toISOString();
    expect(effectiveExceptionStatus({ status: 'approved', expiresAt: past })).toBe('expired');
  });

  it('leaves pending and rejected unaffected by expiresAt', () => {
    const past = new Date(Date.now() - 86400_000).toISOString();
    expect(effectiveExceptionStatus({ status: 'pending', expiresAt: past })).toBe('pending');
    expect(effectiveExceptionStatus({ status: 'rejected', expiresAt: past })).toBe('rejected');
  });

  it('returns approved when expiresAt is null', () => {
    expect(effectiveExceptionStatus({ status: 'approved', expiresAt: null })).toBe('approved');
  });
});

describe('exception renewals', () => {
  let s: FakeNotesStrategy;
  beforeEach(() => {
    s = new FakeNotesStrategy();
  });

  it('runs a renewal through request -> approve, extending expiresAt', async () => {
    const oldExpiry = new Date(Date.now() - 1000).toISOString();
    const exc = await s.createException('org1', 'u1', {
      controlCode: 'AC-1',
      frameworkId: 'fw1',
      title: 'T',
      justification: 'J',
      statement: 'S',
      ownerId: 'owner-1',
      expiresAt: oldExpiry,
    });
    await s.approveException(exc.id, 'approver-1');

    const newExpiry = new Date(Date.now() + 86400_000 * 30).toISOString();
    const renewal = await s.requestExceptionRenewal(exc.id, 'owner-1', {
      proposedExpiresAt: newExpiry,
      justification: 'Compensating control still in place, extending review window',
    });
    expect(renewal.status).toBe('pending');

    const reviewed = await s.reviewExceptionRenewal(renewal.id, 'reviewer-1', 'approved');
    expect(reviewed.status).toBe('approved');

    const updated = await s.getException(exc.id);
    expect(updated!.expiresAt).toBe(newExpiry);
    expect(updated!.status).toBe('approved');
  });

  it('rejects a request from someone other than the exception owner', async () => {
    const exc = await s.createException('org1', 'u1', {
      controlCode: 'AC-1',
      frameworkId: 'fw1',
      title: 'T',
      justification: 'J',
      statement: 'S',
      ownerId: 'owner-1',
    });
    await expect(
      s.requestExceptionRenewal(exc.id, 'not-the-owner', {
        proposedExpiresAt: new Date().toISOString(),
        justification: 'J',
      }),
    ).rejects.toThrow('exception_renewal_only_owner_can_request');
  });

  it('rejects self-review of a renewal request', async () => {
    const exc = await s.createException('org1', 'u1', {
      controlCode: 'AC-1',
      frameworkId: 'fw1',
      title: 'T',
      justification: 'J',
      statement: 'S',
      ownerId: 'owner-1',
    });
    const renewal = await s.requestExceptionRenewal(exc.id, 'owner-1', {
      proposedExpiresAt: new Date().toISOString(),
      justification: 'J',
    });
    await expect(s.reviewExceptionRenewal(renewal.id, 'owner-1', 'approved')).rejects.toThrow(
      'exception_renewal_self_review_forbidden',
    );
  });

  it('requires reviewNotes on rejection and preserves history on re-request', async () => {
    const exc = await s.createException('org1', 'u1', {
      controlCode: 'AC-1',
      frameworkId: 'fw1',
      title: 'T',
      justification: 'J',
      statement: 'S',
      ownerId: 'owner-1',
    });
    const first = await s.requestExceptionRenewal(exc.id, 'owner-1', {
      proposedExpiresAt: new Date().toISOString(),
      justification: 'First attempt',
    });
    await expect(s.reviewExceptionRenewal(first.id, 'reviewer-1', 'rejected')).rejects.toThrow(
      'exception_renewal_review_notes_required',
    );
    await s.reviewExceptionRenewal(first.id, 'reviewer-1', 'rejected', 'Not enough justification');

    const second = await s.requestExceptionRenewal(exc.id, 'owner-1', {
      proposedExpiresAt: new Date().toISOString(),
      justification: 'Second attempt with more detail',
    });
    expect(second.id).not.toBe(first.id);

    const history = await s.listExceptionRenewals(exc.id);
    expect(history).toHaveLength(2);
    expect(history.find((r) => r.id === first.id)?.status).toBe('rejected');
  });
```

Add `effectiveExceptionStatus` to this test file's existing import from `@icore/shared` (or wherever `FakeNotesStrategy`/types are imported from in this file — check the current import line and extend it).

- [ ] **Step 7: Run the tests**

Run: `yarn nx test shared --skip-nx-cache -t exception`
Expected: all `exceptions`, `effectiveExceptionStatus`, and `exception renewals` describe-block tests pass.

- [ ] **Step 8: Prettier, lint, build, commit**

```bash
npx prettier --write libs/shared/src/strategies/notes.ts libs/shared/src/strategies/fakes/fake-notes.ts libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts supabase/migrations/20260915000002_exception_governance.sql
yarn nx lint shared
yarn nx build shared
git add libs/shared/src/strategies/notes.ts libs/shared/src/strategies/fakes/fake-notes.ts libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts supabase/migrations/20260915000002_exception_governance.sql
git commit -m "feat(shared): add Exception governance (risk-linkage, renewal workflow, actor-tracked approve/reject)"
```

---

### Task 2: SupabaseNotesStrategy implementation

**Files:**
- Modify: `apps/microservices/notes/src/app/supabase-notes.strategy.ts` (Exceptions section ~line 1817-1908, plus a new "Exception Renewals" section)

**Interfaces:**
- Consumes: `Exception`, `ExceptionRenewal`, `ExceptionRenewalRequestInput`, `effectiveExceptionStatus` from Task 1.
- Produces: real-DB implementations of the same methods Task 1 added to `FakeNotesStrategy`, satisfying the `DBStrategy` interface for the Supabase provider.

- [ ] **Step 1: Add the 4 new fields to `toException`, and fix `updateException`/`approveException`/`rejectException`**

In `toException` (the private mapper, near the end of the Exceptions section), add after `expiresAt: row['expires_at'] as string | null,`:

```ts
      riskId: row['risk_id'] as string | null,
      reviewFrequencyDays: row['review_frequency_days'] as number | null,
      reviewedBy: row['reviewed_by'] as string | null,
      reviewedAt: row['reviewed_at'] as string | null,
```

In `updateException`, add handling for the 2 new patchable fields (insert after the `if ('expiresAt' in patch) update['expires_at'] = patch.expiresAt;` line):

```ts
    if ('riskId' in patch) update['risk_id'] = patch.riskId;
    if ('reviewFrequencyDays' in patch) update['review_frequency_days'] = patch.reviewFrequencyDays;
```

In `createException`'s insert object, add after `expires_at: data.expiresAt ?? null,`:

```ts
        risk_id: data.riskId ?? null,
        review_frequency_days: data.reviewFrequencyDays ?? null,
```

Replace `approveException` and `rejectException` with:

```ts
  private async getExceptionOrThrow(id: string): Promise<Exception> {
    const { data, error } = await this.db.from('exceptions').select('*').eq('id', id).single();
    return this.toException(ok(data, error));
  }

  async approveException(id: string, approverId: string): Promise<Exception> {
    const current = await this.getExceptionOrThrow(id);
    if (current.ownerId === approverId) {
      throw new Error('exception_self_approval_forbidden');
    }
    const { data, error } = await this.db
      .from('exceptions')
      .update({
        status: 'approved',
        reviewed_by: approverId,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    return this.toException(ok(data, error));
  }

  async rejectException(id: string, approverId: string): Promise<Exception> {
    const current = await this.getExceptionOrThrow(id);
    if (current.ownerId === approverId) {
      throw new Error('exception_self_approval_forbidden');
    }
    const { data, error } = await this.db
      .from('exceptions')
      .update({
        status: 'rejected',
        reviewed_by: approverId,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    return this.toException(ok(data, error));
  }
```

- [ ] **Step 2: Add the "Exception Renewals" section**

Add this new section immediately after `toException` (end of the Exceptions section, before whatever section follows it):

```ts
  // ─── Exception Renewals ──────────────────────────────────────────────────

  async requestExceptionRenewal(
    exceptionId: string,
    requestedBy: string,
    data: ExceptionRenewalRequestInput,
  ): Promise<ExceptionRenewal> {
    const exception = await this.getExceptionOrThrow(exceptionId);
    if (exception.ownerId !== requestedBy) {
      throw new Error('exception_renewal_only_owner_can_request');
    }
    const { data: row, error } = await this.db
      .from('exception_renewals')
      .insert({
        exception_id: exceptionId,
        org_id: exception.orgId,
        requested_by: requestedBy,
        proposed_expires_at: data.proposedExpiresAt,
        justification: data.justification,
      })
      .select()
      .single();
    return this.toExceptionRenewal(ok(row, error));
  }

  private async getExceptionRenewalOrThrow(id: string): Promise<ExceptionRenewal> {
    const { data, error } = await this.db
      .from('exception_renewals')
      .select('*')
      .eq('id', id)
      .single();
    return this.toExceptionRenewal(ok(data, error));
  }

  async reviewExceptionRenewal(
    id: string,
    reviewerId: string,
    decision: 'approved' | 'rejected',
    reviewNotes?: string,
  ): Promise<ExceptionRenewal> {
    const current = await this.getExceptionRenewalOrThrow(id);
    if (current.status !== 'pending') {
      throw new Error(`exception_renewal_already_decided: ${id}`);
    }
    if (current.requestedBy === reviewerId) {
      throw new Error('exception_renewal_self_review_forbidden');
    }
    if (decision === 'rejected' && !reviewNotes) {
      throw new Error('exception_renewal_review_notes_required');
    }

    if (decision === 'approved') {
      const { error: exceptionUpdateError } = await this.db
        .from('exceptions')
        .update({
          expires_at: current.proposedExpiresAt,
          updated_at: new Date().toISOString(),
        })
        .eq('id', current.exceptionId);
      if (exceptionUpdateError) throw new Error(exceptionUpdateError.message);
    }

    const { data, error } = await this.db
      .from('exception_renewals')
      .update({
        status: decision,
        review_notes: reviewNotes ?? null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('status', 'pending')
      .select()
      .single();
    return this.toExceptionRenewal(ok(data, error));
  }

  async getExceptionRenewal(id: string): Promise<ExceptionRenewal | null> {
    const { data, error } = await this.db
      .from('exception_renewals')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? this.toExceptionRenewal(data) : null;
  }

  async getActiveExceptionRenewal(exceptionId: string): Promise<ExceptionRenewal | null> {
    const { data, error } = await this.db
      .from('exception_renewals')
      .select('*')
      .eq('exception_id', exceptionId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? this.toExceptionRenewal(data) : null;
  }

  async listExceptionRenewals(exceptionId: string): Promise<ExceptionRenewal[]> {
    const { data, error } = await this.db
      .from('exception_renewals')
      .select('*')
      .eq('exception_id', exceptionId)
      .order('created_at', { ascending: false });
    return ok(data, error).map((row) => this.toExceptionRenewal(row));
  }

  private toExceptionRenewal(row: Record<string, unknown>): ExceptionRenewal {
    return {
      id: row['id'] as string,
      exceptionId: row['exception_id'] as string,
      orgId: row['org_id'] as string,
      requestedBy: row['requested_by'] as string,
      proposedExpiresAt: row['proposed_expires_at'] as string,
      justification: row['justification'] as string,
      status: row['status'] as ExceptionRenewalStatus,
      reviewedBy: row['reviewed_by'] as string | null,
      reviewNotes: row['review_notes'] as string | null,
      reviewedAt: row['reviewed_at'] as string | null,
      createdAt: row['created_at'] as string,
    };
  }
```

Note the write ordering in `reviewExceptionRenewal`: the `exceptions` update happens first (and its error is checked, not fire-and-forget) — this deliberately follows the corrected pattern from the prior phase's final review (Issue closure-validation's `reviewIssueValidation` initially had a silent fire-and-forget write that was fixed after the final review; this plan writes it correctly from the start).

- [ ] **Step 2b: Add the new type imports**

At the top of `apps/microservices/notes/src/app/supabase-notes.strategy.ts`, find the existing `Exception`/`ExceptionInput`/`ExceptionPatch` import line and add `ExceptionRenewal`, `ExceptionRenewalStatus`, `ExceptionRenewalRequestInput` to it.

- [ ] **Step 3: Prettier, lint, build**

```bash
npx prettier --write apps/microservices/notes/src/app/supabase-notes.strategy.ts
yarn nx lint notes
yarn nx build notes
```

No new unit tests in this task, matching the established convention (confirmed in the prior phase: only `FakeNotesStrategy` gets direct unit-test coverage; verify correctness by reading this code against the Fake strategy's already-tested logic).

- [ ] **Step 4: Commit**

```bash
git add apps/microservices/notes/src/app/supabase-notes.strategy.ts
git commit -m "feat(notes): implement Exception governance in SupabaseNotesStrategy"
```

---

### Task 3: MS controller handlers, notes-client, and gateway routes

**Files:**
- Modify: `apps/microservices/notes/src/app/notes.controller.ts` (Exceptions `@MessagePattern` section, ~line 564-598)
- Modify: `libs/notes-client/src/lib/notes-client.service.ts` (Exceptions section, ~line 666-691)
- Modify: `apps/api/src/app/notes/notes.controller.ts` (Exceptions gateway routes, ~line 744-800)

**Interfaces:**
- Consumes: the `DBStrategy` methods from Tasks 1-2 (`approveException`, `rejectException`, `requestExceptionRenewal`, `reviewExceptionRenewal`, `getExceptionRenewal`, `listExceptionRenewals`). `getActiveExceptionRenewal` is intentionally NOT wired through this task — same rationale as the prior phase's `getActiveIssueValidation`: it's a strategy-internal/test-facing method, the client derives the active renewal from the full list it already fetches for the history section.
- Produces: gateway REST routes `POST /api/notes/exceptions/:id/renewals`, `POST /api/notes/exception-renewals/:id/review`, `GET /api/notes/exceptions/:id/renewals` — consumed by Task 4's client hooks. Existing `POST /api/notes/exceptions/:id/approve` and `/reject` routes change to resolve and pass the actor id.

- [ ] **Step 1: Update MS `@MessagePattern` handlers**

In `apps/microservices/notes/src/app/notes.controller.ts`, replace the existing `approveException`/`rejectException` handlers:

```ts
  @MessagePattern('notes.exceptions.approve')
  approveException(
    @Payload() payload: { id: string; approverId: string },
  ): Promise<Exception> {
    return this.strategy.approveException(payload.id, payload.approverId);
  }

  @MessagePattern('notes.exceptions.reject')
  rejectException(
    @Payload() payload: { id: string; approverId: string },
  ): Promise<Exception> {
    return this.strategy.rejectException(payload.id, payload.approverId);
  }
```

Add these 4 new handlers immediately after the existing `deleteException` handler (end of the Exceptions section):

```ts
  @MessagePattern('notes.exceptions.renewals.request')
  requestExceptionRenewal(
    @Payload()
    payload: { exceptionId: string; requestedBy: string; data: ExceptionRenewalRequestInput },
  ): Promise<ExceptionRenewal> {
    return this.strategy.requestExceptionRenewal(
      payload.exceptionId,
      payload.requestedBy,
      payload.data,
    );
  }

  @MessagePattern('notes.exceptions.renewals.review')
  reviewExceptionRenewal(
    @Payload()
    payload: {
      id: string;
      reviewerId: string;
      decision: 'approved' | 'rejected';
      reviewNotes?: string;
    },
  ): Promise<ExceptionRenewal> {
    return this.strategy.reviewExceptionRenewal(
      payload.id,
      payload.reviewerId,
      payload.decision,
      payload.reviewNotes,
    );
  }

  @MessagePattern('notes.exceptions.renewals.get')
  getExceptionRenewal(@Payload() payload: { id: string }): Promise<ExceptionRenewal | null> {
    return this.strategy.getExceptionRenewal(payload.id);
  }

  @MessagePattern('notes.exceptions.renewals.list')
  listExceptionRenewals(
    @Payload() payload: { exceptionId: string },
  ): Promise<ExceptionRenewal[]> {
    return this.strategy.listExceptionRenewals(payload.exceptionId);
  }
```

Add `ExceptionRenewal`, `ExceptionRenewalRequestInput` to the existing `Exception`/`ExceptionInput`/`ExceptionPatch` import at the top of the file.

- [ ] **Step 2: Update/add `notes-client` methods**

In `libs/notes-client/src/lib/notes-client.service.ts`, replace `approveException`/`rejectException`:

```ts
  approveException(id: string, approverId: string): Promise<Exception> {
    return signedSend<Exception>(this.client, 'notes.exceptions.approve', { id, approverId });
  }

  rejectException(id: string, approverId: string): Promise<Exception> {
    return signedSend<Exception>(this.client, 'notes.exceptions.reject', { id, approverId });
  }
```

Add these 4 methods immediately after the existing `deleteException`:

```ts
  requestExceptionRenewal(
    exceptionId: string,
    requestedBy: string,
    data: ExceptionRenewalRequestInput,
  ): Promise<ExceptionRenewal> {
    return signedSend<ExceptionRenewal>(this.client, 'notes.exceptions.renewals.request', {
      exceptionId,
      requestedBy,
      data,
    });
  }

  reviewExceptionRenewal(
    id: string,
    reviewerId: string,
    decision: 'approved' | 'rejected',
    reviewNotes?: string,
  ): Promise<ExceptionRenewal> {
    return signedSend<ExceptionRenewal>(this.client, 'notes.exceptions.renewals.review', {
      id,
      reviewerId,
      decision,
      reviewNotes,
    });
  }

  getExceptionRenewal(id: string): Promise<ExceptionRenewal | null> {
    return signedSend<ExceptionRenewal | null>(this.client, 'notes.exceptions.renewals.get', {
      id,
    });
  }

  listExceptionRenewals(exceptionId: string): Promise<ExceptionRenewal[]> {
    return signedSend<ExceptionRenewal[]>(this.client, 'notes.exceptions.renewals.list', {
      exceptionId,
    });
  }
```

Add `ExceptionRenewal`, `ExceptionRenewalRequestInput` to this file's existing type import.

- [ ] **Step 3: Update gateway routes with org-resolved authorization**

In `apps/api/src/app/notes/notes.controller.ts`, replace the existing `approveException`/`rejectException` routes:

```ts
  @Post('exceptions/:id/approve')
  @ApiOperation({ summary: 'Approve exception' })
  approveException(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    const userId = this.uid(req);
    return this.notes.approveException(id, userId);
  }

  @Post('exceptions/:id/reject')
  @ApiOperation({ summary: 'Reject exception' })
  rejectException(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    const userId = this.uid(req);
    return this.notes.rejectException(id, userId);
  }
```

No `checkOrgAccess`/`getOrganizationById` call — deliberately matching the corrected `RiskAcceptance`/Issue-closure-validation pattern: `uid()` for authentication, the strategy's own actor check (`ownerId === approverId` self-approval guard) is the authorization boundary. Do not add an org-update CASL gate here — that is the exact class of bug (C1) the prior phase's final review found and fixed for Issue closure-validation.

Add immediately after the existing `deleteException` route:

```ts
  @Post('exceptions/:id/renewals')
  @ApiOperation({ summary: 'Owner requests a renewal (new expiry) for an exception' })
  async requestExceptionRenewal(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: ExceptionRenewalRequestInput,
  ) {
    const userId = this.uid(req);
    const exception = await this.notes.getException(id);
    if (!exception) throw new NotFoundException();
    if (exception.ownerId !== userId) throw new ForbiddenException();
    return this.notes.requestExceptionRenewal(id, userId, body);
  }

  @Post('exception-renewals/:id/review')
  @ApiOperation({ summary: 'A different user approves or rejects a pending exception renewal' })
  async reviewExceptionRenewal(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: { decision: 'approved' | 'rejected'; reviewNotes?: string },
  ) {
    const userId = this.uid(req);
    return this.notes.reviewExceptionRenewal(id, userId, body.decision, body.reviewNotes);
  }

  @Get('exceptions/:id/renewals')
  @ApiOperation({ summary: 'List renewal history for an exception' })
  async listExceptionRenewals(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
  ) {
    const userId = this.uid(req);
    const exception = await this.notes.getException(id);
    if (!exception) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(exception.orgId);
    if (!org) throw new NotFoundException();
    const renewals = await this.notes.listExceptionRenewals(id);
    const isPartyToException =
      exception.ownerId === userId ||
      renewals.some((r) => r.requestedBy === userId || r.reviewedBy === userId);
    if (org.userId !== userId && !isPartyToException) throw new ForbiddenException();
    return renewals;
  }
```

This mirrors Issue closure-validation's corrected `listIssueValidations` route exactly: org creator OR anyone who is a party to the record's history — never a bare `checkOrgAccess('read')`, which would lock out the very reviewer who needs to read it, and never unauthenticated-beyond-`uid()`, which was the exact cross-tenant gap (C2) found in that phase's final review.

Add `ExceptionRenewalRequestInput` to this file's imports.

- [ ] **Step 4: Prettier, lint, build, test**

```bash
npx prettier --write apps/microservices/notes/src/app/notes.controller.ts libs/notes-client/src/lib/notes-client.service.ts apps/api/src/app/notes/notes.controller.ts
yarn nx lint notes
yarn nx lint api
yarn nx lint notes-client
yarn nx build notes
yarn nx build api
yarn nx build notes-client
yarn nx test shared --skip-nx-cache -t exception
```

Expected: green — this task only adds wiring on top of the strategy methods Tasks 1-2 already implemented and tested; no shared-lib source changes happen here, so the `shared` test run is a regression check.

- [ ] **Step 5: Commit**

```bash
git add apps/microservices/notes/src/app/notes.controller.ts libs/notes-client/src/lib/notes-client.service.ts apps/api/src/app/notes/notes.controller.ts
git commit -m "feat(notes): wire Exception governance through MS, notes-client, and gateway"
```

---

### Task 4: Client queries and Exceptions page updates

**Files:**
- Modify: `apps/client/src/queries/exceptions.ts`
- Modify: `apps/client/src/routes/_dashboard/-exceptions.page.tsx`
- Modify: any existing test file for this page if one exists — check `apps/client/src/routes/_dashboard/__tests__/` for an `exceptions.unit.test.tsx` before writing new assertions; read it first if found.

**Interfaces:**
- Consumes: gateway routes from Task 3, `useRisks(orgId)` (already exists in `apps/client/src/queries/risks.ts:20`).
- Produces: `useExceptionRenewals(exceptionId)`, `useRequestExceptionRenewal(orgId)`, `useReviewExceptionRenewal(orgId)` hooks, and a `selectedExceptionId` state slot in `ExceptionsPage` — consumed by Task 5's `ExceptionDetailSheet`.

- [ ] **Step 1: Add the 3 new query hooks and update `useApproveException`/`useRejectException`'s mutation signature note**

`useApproveException`/`useRejectException` don't need a signature change on the client side — the mutation still takes just the exception `id: string` as its variable; the actor id is resolved server-side from the auth token (`this.uid(req)`), exactly like Issue closure-validation's approve/reject flow. No client code change needed for those two hooks — leave them as-is.

In `apps/client/src/queries/exceptions.ts`, update the type import line and add the new hooks:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  Exception,
  ExceptionInput,
  ExceptionPatch,
  ExceptionRenewal,
  ExceptionRenewalRequestInput,
} from '@icore/shared';

export type { Exception, ExceptionInput, ExceptionPatch, ExceptionRenewal, ExceptionRenewalRequestInput };
```

Append after the existing `useDeleteException`:

```ts
export function useExceptionRenewals(exceptionId: string) {
  return useQuery<ExceptionRenewal[]>({
    queryKey: ['exceptions', exceptionId, 'renewals'],
    queryFn: () => api<ExceptionRenewal[]>(`/notes/exceptions/${exceptionId}/renewals`),
    enabled: !!exceptionId,
  });
}

export function useRequestExceptionRenewal(orgId: string) {
  const qc = useQueryClient();
  return useMutation<ExceptionRenewal, Error, { id: string; data: ExceptionRenewalRequestInput }>({
    mutationFn: ({ id, data }) =>
      api<ExceptionRenewal>(`/notes/exceptions/${id}/renewals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: (_result, { id }) => {
      qc.invalidateQueries({ queryKey: ['exceptions', orgId] });
      qc.invalidateQueries({ queryKey: ['exceptions', id, 'renewals'] });
    },
  });
}

export function useReviewExceptionRenewal(orgId: string) {
  const qc = useQueryClient();
  return useMutation<
    ExceptionRenewal,
    Error,
    { id: string; exceptionId: string; decision: 'approved' | 'rejected'; reviewNotes?: string }
  >({
    mutationFn: ({ id, decision, reviewNotes }) =>
      api<ExceptionRenewal>(`/notes/exception-renewals/${id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, reviewNotes }),
      }),
    onSuccess: (_result, { exceptionId }) => {
      qc.invalidateQueries({ queryKey: ['exceptions', orgId] });
      qc.invalidateQueries({ queryKey: ['exceptions', exceptionId, 'renewals'] });
    },
  });
}
```

Both hooks' success type is `ExceptionRenewal`, matching what the gateway's `requestExceptionRenewal`/`reviewExceptionRenewal` routes actually return (Task 3) — the strategy methods return the renewal row, not the underlying `Exception`.

- [ ] **Step 2: Update `-exceptions.page.tsx`: `EMPTY_FORM`, create-form fields, effective-status badge, clickable row**

In `apps/client/src/routes/_dashboard/-exceptions.page.tsx`:

Add the import:

```tsx
import { effectiveExceptionStatus } from '@icore/shared';
import { useRisks } from '@/queries/risks';
```

Update `EMPTY_FORM`:

```ts
const EMPTY_FORM: ExceptionInput = {
  title: '',
  frameworkId: '',
  standardCode: '',
  controlCode: '',
  statement: '',
  justification: '',
  ownerId: '',
  compensatingControls: '',
  expiresAt: '',
  riskId: '',
};
```

In `ExceptionRow`, replace `exception.status` in the badge with the computed effective status:

```tsx
          <span
            className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border ${STATUS_COLORS[effectiveExceptionStatus(exception)]}`}
          >
            {t(`exceptions.status.${effectiveExceptionStatus(exception)}`)}
          </span>
```

Make the row clickable (same pattern as Issue closure-validation's `-issues.page.tsx`), and drop the inline approve/reject buttons in favor of opening the detail Sheet — but keep Delete on the row for now (Delete has no need to move into the Sheet):

```tsx
function ExceptionRow({
  exception,
  frameworks,
  onOpen,
  onDelete,
}: {
  exception: Exception;
  frameworks: Framework[];
  onOpen: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const { data: linkedFindings = [] } = useFindingsByLink({ exceptionId: exception.id });
  const linkedFinding = linkedFindings[0];
  const status = effectiveExceptionStatus(exception);

  return (
    <div className="flex items-start gap-4 bg-surface border border-border rounded-xl p-4">
      <button type="button" onClick={onOpen} className="flex-1 min-w-0 text-left cursor-pointer">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-sm text-foreground truncate">{exception.title}</span>
          <span
            className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border ${STATUS_COLORS[status]}`}
          >
            {t(`exceptions.status.${status}`)}
          </span>
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2">{exception.justification}</p>
        <p className="text-[11px] text-muted-foreground/60 mt-1">
          {exception.controlCode} ·{' '}
          {frameworks.find((f) => f.id === exception.frameworkId)?.slug.toUpperCase() ??
            exception.frameworkId}
        </p>
        {linkedFinding && (
          <span className="font-mono text-xs underline text-muted-foreground">
            {t('exceptions.linkedFinding', { code: linkedFinding.code })}
          </span>
        )}
      </button>
      <div className="flex gap-1.5 shrink-0">
        <button
          type="button"
          onClick={onDelete}
          className="text-xs px-2 py-1 rounded text-muted-foreground border border-border hover:text-destructive hover:border-destructive/50 transition-colors cursor-pointer"
        >
          {t('common.delete')}
        </button>
      </div>
    </div>
  );
}
```

The approve/reject buttons move into Task 5's `ExceptionDetailSheet` footer (same convention as Issue closure-validation's Sheet-actions-in-footer rule). The `<Link>`-to-control replaced with `<span>` for the same reason as the prior phase: a `<button>` cannot contain a nested `<Link>`.

In `ExceptionsPage`, add `selectedExceptionId` state, the `useRisks` hook, and risk options for the create form:

```tsx
  const [selectedExceptionId, setSelectedExceptionId] = useState<string | null>(null);
  const { data: risks = [] } = useRisks(orgId);
  const riskOptions = risks.map((r) => ({ value: r.id, label: r.title }));
```

(Verified: `Risk.title` is the correct field name — `libs/shared/src/strategies/notes.ts:723-728`.)

Update the `exceptions.map` block:

```tsx
          {exceptions.map((exc) => (
            <ExceptionRow
              key={exc.id}
              exception={exc}
              frameworks={frameworks}
              onOpen={() => setSelectedExceptionId(exc.id)}
              onDelete={() => deleteMut.mutate(exc.id)}
            />
          ))}
```

Remove the now-unused `approveMut`/`rejectMut` hook calls and their imports (`useApproveException`, `useRejectException`) from `ExceptionsPage` — they move into Task 5's `ExceptionDetailSheet`, which will import them directly.

Add `expiresAt` (required date input) and `riskId` (optional `Combobox`) to the create form, in the grid alongside the existing owner field:

```tsx
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t('exceptions.expiresAt')}</Label>
                <Input
                  type="date"
                  value={form.expiresAt?.slice(0, 10) ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>{t('exceptions.linkedRisk')}</Label>
                <Combobox
                  options={riskOptions}
                  value={form.riskId ?? ''}
                  onChange={(v) => setForm((f) => ({ ...f, riskId: v }))}
                  placeholder={t('exceptions.selectRisk')}
                  searchPlaceholder={t('exceptions.searchRisk')}
                />
              </div>
            </div>
```

Add `!form.expiresAt` to `handleSubmit`'s required-fields guard (alongside the existing `!form.title || !form.frameworkId || ...`).

Task 5 adds the `<ExceptionDetailSheet>` render and its import; this task stops at having `selectedExceptionId`/`setSelectedExceptionId` in scope (same intentionally-unread-until-next-task shape as Issue closure-validation's Task 4 — if lint flags it, add a scoped `eslint-disable-next-line @typescript-eslint/no-unused-vars` with a comment noting Task 5 consumes it, matching the precedent from the prior phase).

- [ ] **Step 3: Update the existing `exceptions.unit.test.tsx`**

`apps/client/src/routes/_dashboard/__tests__/exceptions.unit.test.tsx` already exists. Two concrete changes are required:

1. `mockException` (the fixture object) is missing the 4 new required `Exception` fields and will fail to typecheck. Add after `expiresAt: null,`:

```ts
  riskId: null,
  reviewFrequencyDays: null,
  reviewedBy: null,
  reviewedAt: null,
```

2. The test `'shows a link back to the originating control when a Finding links to the exception'` (inside `describe('ExceptionsPage — reverse back-link to originating Finding', ...)`) currently asserts the finding cross-reference is a real `<a>` tag:

```ts
    const link = screen.getByText('From Finding FIND-000303');
    expect(link.closest('a')?.getAttribute('href')).toBe('/controls/c1');
```

Task 4's Step 2 replaces that `<Link>` with a plain `<span>` (same reason as Issue closure-validation's identical change: a `<button>` cannot contain a nested `<Link>`). Replace the assertion with:

```ts
    const linkText = screen.getByText('From Finding FIND-000303');
    expect(linkText.tagName).toBe('SPAN');
```

No other changes are needed in this file: the `'renders all 8 fields in order'` test only matches a fixed regex of 8 specific field labels, which doesn't overlap with the new `expiresAt`/`riskId` field labels, so it stays passing unchanged; the combobox-index test (`'resets Standard and Control code comboboxes when Framework changes'`) only touches `comboboxes()[0..2]` (Framework/Standard/Control), and the new Risk `Combobox` is inserted after Owner (index 3) in Task 4's Step 2 form layout, so those indices are unaffected.

- [ ] **Step 4: Run tests, prettier, lint, build**

```bash
npx prettier --write apps/client/src/queries/exceptions.ts apps/client/src/routes/_dashboard/-exceptions.page.tsx
yarn nx lint client --skip-nx-cache
yarn nx build client --skip-nx-cache
yarn nx test client --skip-nx-cache
```

Expected: green (full suite, not filtered — this task changes a shared row component's props, which could affect other tests that render `-exceptions.page.tsx`).

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/queries/exceptions.ts apps/client/src/routes/_dashboard/-exceptions.page.tsx
git commit -m "feat(client): add Exception renewal query hooks, risk-linkage, and required expiry to create form"
```

---

### Task 5: `ExceptionDetailSheet` component

**Files:**
- Create: `apps/client/src/components/exceptions/ExceptionDetailSheet.tsx`
- Create: `apps/client/src/components/exceptions/__tests__/ExceptionDetailSheet.unit.test.tsx`
- Modify: `apps/client/src/routes/_dashboard/-exceptions.page.tsx` (render the Sheet)

**Interfaces:**
- Consumes: `useExceptionRenewals`, `useRequestExceptionRenewal`, `useReviewExceptionRenewal` (Task 4), `useApproveException`, `useRejectException` (existing), `useRisks` (existing), `useOrgMembers`/`useAuthStore` (existing, same as `IssueDetailSheet`).
- Produces: `<ExceptionDetailSheet exception={Exception} orgId={string} open={boolean} onOpenChange={(open: boolean) => void} />`.

- [ ] **Step 1: Write the component**

Create `apps/client/src/components/exceptions/ExceptionDetailSheet.tsx`. Follow `IssueDetailSheet.tsx`'s established structure exactly (read that file first for the current, corrected shape — it went through a final-review fix round that moved actions into a shared footer, added `px-4` to the tab strip, and used `flex flex-col p-0` on `SheetContent` — this plan's component must match that corrected structure from the start, not the pre-fix version):

```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore, useNotify } from '@icore/template-shared';
import { effectiveExceptionStatus, type Exception } from '@icore/shared';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  useExceptionRenewals,
  useRequestExceptionRenewal,
  useReviewExceptionRenewal,
  useApproveException,
  useRejectException,
} from '@/queries/exceptions';
import { useRisks } from '@/queries/risks';

type DetailTab = 'overview' | 'renewal';

export function ExceptionDetailSheet({
  exception,
  orgId,
  open,
  onOpenChange,
}: {
  exception: Exception;
  orgId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const notify = useNotify();
  const currentUserId = useAuthStore((s) => s.user?.id);
  const { data: risks = [] } = useRisks(orgId);
  const { data: renewals = [] } = useExceptionRenewals(exception.id);
  const requestMut = useRequestExceptionRenewal(orgId);
  const reviewMut = useReviewExceptionRenewal(orgId);
  const approveMut = useApproveException(orgId);
  const rejectMut = useRejectException(orgId);

  const [tab, setTab] = useState<DetailTab>('overview');
  const [proposedExpiresAt, setProposedExpiresAt] = useState('');
  const [renewalJustification, setRenewalJustification] = useState('');
  const [rejectNotes, setRejectNotes] = useState('');

  const status = effectiveExceptionStatus(exception);
  const linkedRisk = risks.find((r) => r.id === exception.riskId);
  const pendingRenewal = renewals.find((r) => r.status === 'pending');
  const isOwner = currentUserId === exception.ownerId;
  const isRenewalReviewer = !!pendingRenewal && pendingRenewal.requestedBy !== currentUserId;
  const canRequestRenewal =
    isOwner &&
    (status === 'approved' || status === 'expired') &&
    !pendingRenewal &&
    !!proposedExpiresAt &&
    !!renewalJustification;

  const tabs: DetailTab[] = ['overview', 'renewal'];

  function handleApprove() {
    approveMut.mutate(exception.id, {
      onSuccess: () => notify.success(t('exceptions.detail.approved')),
      onError: () => notify.error(t('error.unknown')),
    });
  }

  function handleReject() {
    rejectMut.mutate(exception.id, {
      onSuccess: () => notify.success(t('exceptions.detail.rejected')),
      onError: () => notify.error(t('error.unknown')),
    });
  }

  function handleRequestRenewal() {
    if (!canRequestRenewal) return;
    requestMut.mutate(
      { id: exception.id, data: { proposedExpiresAt, justification: renewalJustification } },
      {
        onSuccess: () => {
          notify.success(t('exceptions.detail.renewalRequested'));
          setProposedExpiresAt('');
          setRenewalJustification('');
        },
        onError: () => notify.error(t('error.unknown')),
      },
    );
  }

  function handleApproveRenewal() {
    if (!pendingRenewal) return;
    reviewMut.mutate(
      { id: pendingRenewal.id, exceptionId: exception.id, decision: 'approved' },
      {
        onSuccess: () => notify.success(t('exceptions.detail.renewalApproved')),
        onError: () => notify.error(t('error.unknown')),
      },
    );
  }

  function handleRejectRenewal() {
    if (!pendingRenewal || !rejectNotes) return;
    reviewMut.mutate(
      {
        id: pendingRenewal.id,
        exceptionId: exception.id,
        decision: 'rejected',
        reviewNotes: rejectNotes,
      },
      {
        onSuccess: () => {
          notify.success(t('exceptions.detail.renewalRejected'));
          setRejectNotes('');
        },
        onError: () => notify.error(t('error.unknown')),
      },
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col p-0">
        <SheetHeader>
          <SheetTitle>{exception.title}</SheetTitle>
        </SheetHeader>

        <div className="border-b border-border flex gap-1 px-4">
          {tabs.map((tKey) => (
            <button
              key={tKey}
              type="button"
              onClick={() => setTab(tKey)}
              className={`px-3 py-2 text-sm border-b-2 -mb-px cursor-pointer ${
                tab === tKey
                  ? 'border-green-500 text-foreground font-medium'
                  : 'border-transparent text-muted-foreground'
              }`}
            >
              {t(`exceptions.detail.tab.${tKey}`)}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {tab === 'overview' && (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">{exception.statement}</p>
              <p>
                {t('exceptions.justification')}: <span>{exception.justification}</span>
              </p>
              {exception.compensatingControls && (
                <p>
                  {t('exceptions.compensatingControls')}: <span>{exception.compensatingControls}</span>
                </p>
              )}
              <p>
                {t('exceptions.detail.status')}: <strong>{t(`exceptions.status.${status}`)}</strong>
              </p>
              {exception.expiresAt && (
                <p>
                  {t('exceptions.detail.expiresAt')}: <strong>{exception.expiresAt.slice(0, 10)}</strong>
                </p>
              )}
              <p>
                {t('exceptions.detail.linkedRisk')}:{' '}
                <strong>{linkedRisk ? linkedRisk.title : t('exceptions.detail.noLinkedRisk')}</strong>
              </p>
            </div>
          )}

          {tab === 'renewal' && (
            <div className="space-y-4">
              {pendingRenewal ? (
                <div className="border border-border rounded-lg p-3 space-y-2 text-sm">
                  <p>
                    {t('exceptions.detail.renewalPendingReview', {
                      date: pendingRenewal.proposedExpiresAt.slice(0, 10),
                    })}
                  </p>
                  <p className="text-muted-foreground">{pendingRenewal.justification}</p>
                  {isRenewalReviewer && (
                    <textarea
                      value={rejectNotes}
                      onChange={(e) => setRejectNotes(e.target.value)}
                      placeholder={t('exceptions.detail.rejectNotesPlaceholder')}
                      rows={2}
                      className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm resize-none"
                    />
                  )}
                </div>
              ) : (
                isOwner &&
                (status === 'approved' || status === 'expired') && (
                  <div className="space-y-2">
                    <label className="block space-y-1.5">
                      <span className="text-xs text-muted-foreground">
                        {t('exceptions.detail.proposedExpiresAt')}
                      </span>
                      <input
                        type="date"
                        value={proposedExpiresAt}
                        onChange={(e) => setProposedExpiresAt(e.target.value)}
                        className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="block space-y-1.5">
                      <span className="text-xs text-muted-foreground">
                        {t('exceptions.detail.renewalJustification')}
                      </span>
                      <textarea
                        value={renewalJustification}
                        onChange={(e) => setRenewalJustification(e.target.value)}
                        rows={3}
                        className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm resize-none"
                      />
                    </label>
                  </div>
                )
              )}

              {renewals.length > 0 && (
                <div className="pt-3 border-t border-border space-y-2">
                  <h3 className="text-xs text-muted-foreground">{t('exceptions.detail.renewalHistory')}</h3>
                  {renewals.map((r) => (
                    <div key={r.id} className="text-xs border border-border rounded p-2 space-y-0.5">
                      <p>{t(`exceptions.detail.renewalHistoryStatus.${r.status}`)} — {r.proposedExpiresAt.slice(0, 10)}</p>
                      {r.reviewNotes && <p className="text-muted-foreground">{r.reviewNotes}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <footer className="border-t border-border p-4 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          {tab === 'overview' && status === 'pending' && !isOwner && (
            <>
              <Button className="flex-1" onClick={handleApprove} disabled={approveMut.isPending}>
                {t('exceptions.approve')}
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleReject}
                disabled={rejectMut.isPending}
              >
                {t('exceptions.reject')}
              </Button>
            </>
          )}
          {tab === 'renewal' && !pendingRenewal && canRequestRenewal && (
            <Button className="flex-1" onClick={handleRequestRenewal} disabled={requestMut.isPending}>
              {t('exceptions.detail.requestRenewal')}
            </Button>
          )}
          {tab === 'renewal' && pendingRenewal && isRenewalReviewer && (
            <>
              <Button className="flex-1" onClick={handleApproveRenewal} disabled={reviewMut.isPending}>
                {t('exceptions.detail.approveRenewal')}
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleRejectRenewal}
                disabled={reviewMut.isPending || !rejectNotes}
              >
                {t('exceptions.detail.rejectRenewal')}
              </Button>
            </>
          )}
        </footer>
      </SheetContent>
    </Sheet>
  );
}
```

Note: the base approve/reject footer buttons only render `!isOwner` — this mirrors the same self-approval guard as the strategy layer, so the button is hidden for the person who can't legally use it (defense in depth, matching `IssueDetailSheet`'s `isAssignedValidator`-gated rendering).

- [ ] **Step 2: Wire it into `-exceptions.page.tsx`**

Add the import:

```tsx
import { ExceptionDetailSheet } from '@/components/exceptions/ExceptionDetailSheet';
```

Render it just before the closing `</PageLayout>` tag, guarding against the same delete-while-open crash class the prior phase's final review found and fixed for `IssueDetailSheet`:

```tsx
      {selectedExceptionId &&
        exceptions.find((e) => e.id === selectedExceptionId) && (
          <ExceptionDetailSheet
            exception={exceptions.find((e) => e.id === selectedExceptionId)!}
            orgId={orgId}
            open={!!selectedExceptionId}
            onOpenChange={(o) => !o && setSelectedExceptionId(null)}
          />
        )}
```

This plan writes the crash-safe guard from the start — Issue closure-validation's `-issues.page.tsx` needed a final-review fix round to add this exact guard; do not repeat that mistake here.

- [ ] **Step 3: Write the tests**

Create `apps/client/src/components/exceptions/__tests__/ExceptionDetailSheet.unit.test.tsx`. Follow `IssueDetailSheet.unit.test.tsx`'s established structure exactly (read that file first — it has a mutable `mockCurrentUserId` pattern that lets a test switch perspective between the owner and a reviewer, added in that component's own final-review fix round; this plan's test file must use that pattern from the start, not the earlier hardcoded-owner-only version). Cover:

1. Renders the overview tab with statement/justification/status/linked-risk by default.
2. As the owner, on an `'approved'` exception with a lapsed `expiresAt`: the renewal tab shows the date/justification inputs and a "Request Renewal" button.
3. As a different user (not the owner) with a `pendingRenewal` present: the renewal tab shows Approve/Reject buttons; Reject stays disabled until notes are typed.
4. As the owner themselves, with a `pendingRenewal` present: no Approve/Reject buttons render (self-review is blocked in the UI, matching the server-side guard).
5. Approve/reject on the base exception (`status === 'pending'`) only renders for a non-owner user.

Verify `useRisks`, `useAuthStore`, `useNotify`'s real shapes match what's mocked (same verification discipline as the prior phase's Task 5 — do not assume field names, check the actual hook definitions first) before finalizing the mocks.

- [ ] **Step 4: Run tests, prettier, lint, build, commit**

```bash
yarn nx test client --skip-nx-cache
npx prettier --write apps/client/src/components/exceptions/ExceptionDetailSheet.tsx apps/client/src/components/exceptions/__tests__/ExceptionDetailSheet.unit.test.tsx apps/client/src/routes/_dashboard/-exceptions.page.tsx
yarn nx lint client --skip-nx-cache
yarn nx build client --skip-nx-cache
git add apps/client/src/components/exceptions/ExceptionDetailSheet.tsx apps/client/src/components/exceptions/__tests__/ExceptionDetailSheet.unit.test.tsx apps/client/src/routes/_dashboard/-exceptions.page.tsx
git commit -m "feat(client): add ExceptionDetailSheet with renewal workflow and risk-linkage display"
```

---

### Task 6: i18n keys across 4 locales

**Files:**
- Modify: `libs/template-shared/src/lib/i18n/locales/en.ts`
- Modify: `libs/template-shared/src/lib/i18n/locales/es.ts`
- Modify: `libs/template-shared/src/lib/i18n/locales/he.ts`
- Modify: `libs/template-shared/src/lib/i18n/locales/ru.ts`

**Interfaces:**
- Consumes: nothing (translation strings only).
- Produces: `exceptions.expiresAt`, `exceptions.linkedRisk`, `exceptions.selectRisk`, `exceptions.searchRisk` (create-form labels), and the full `exceptions.detail.*` key group used by Task 5's `ExceptionDetailSheet`.

- [ ] **Step 1: Update `en.ts`**

In `libs/template-shared/src/lib/i18n/locales/en.ts`, inside the `exceptions:` block, add these keys near the existing `compensatingControls`/`compensatingControlsPlaceholder` pair:

```ts
    expiresAt: 'Expires On',
    linkedRisk: 'Linked Risk',
    selectRisk: 'Select a risk…',
    searchRisk: 'Search risks…',
```

Add a new `detail:` key group immediately after the existing `status:` block (still inside `exceptions:`):

```ts
    detail: {
      tab: {
        overview: 'Overview',
        renewal: 'Renewal',
      },
      status: 'Status',
      expiresAt: 'Expires',
      linkedRisk: 'Linked Risk',
      noLinkedRisk: 'None',
      approved: 'Exception approved',
      rejected: 'Exception rejected',
      requestRenewal: 'Request Renewal',
      renewalRequested: 'Renewal requested',
      proposedExpiresAt: 'New Expiry Date',
      renewalJustification: 'Justification for Renewal',
      renewalPendingReview: 'Renewal pending review — proposed new expiry {{date}}',
      approveRenewal: 'Approve Renewal',
      rejectRenewal: 'Reject Renewal',
      renewalApproved: 'Renewal approved',
      renewalRejected: 'Renewal rejected',
      rejectNotesPlaceholder: 'Explain why this renewal is being rejected…',
      renewalHistory: 'Renewal History',
      renewalHistoryStatus: {
        pending: 'Pending',
        approved: 'Approved',
        rejected: 'Rejected',
      },
    },
```

- [ ] **Step 2: Add matching blocks to `es.ts`, `he.ts`, `ru.ts`**

Read each file's existing `exceptions:` block first (already has `approve`/`reject`/`status.*` translated) to match its established terminology for this module before writing the new keys — reuse the same words that block already uses for "exception", "approve", "reject", "owner", rather than introducing new phrasing. Write genuine, natural translations for every key in both new blocks (the 4-key form-label group and the full `detail:` group) — not machine-literal English copies. Follow the exact same key structure as Step 1's English version in each of the 3 files.

- [ ] **Step 3: Check for an i18n key-parity test**

Same as the prior phase: check whether an existing test asserts key-set parity across all 4 locale files. If one exists, no new test is needed. If none exists, skip adding one — out of scope for a phase-1 feature plan.

- [ ] **Step 4: Run the client test suite, prettier, lint, build, commit**

```bash
npx prettier --write libs/template-shared/src/lib/i18n/locales/en.ts libs/template-shared/src/lib/i18n/locales/es.ts libs/template-shared/src/lib/i18n/locales/he.ts libs/template-shared/src/lib/i18n/locales/ru.ts
yarn nx lint template-shared
yarn nx build template-shared
yarn nx test client --skip-nx-cache
git add libs/template-shared/src/lib/i18n/locales/en.ts libs/template-shared/src/lib/i18n/locales/es.ts libs/template-shared/src/lib/i18n/locales/he.ts libs/template-shared/src/lib/i18n/locales/ru.ts
git commit -m "feat(i18n): add Exception governance strings to all 4 locales"
```

---

## Post-Plan Note

Per `AGENTS.md`'s non-negotiable UI rule, live Playwright verification happens once at the end of the whole branch, not as a per-task checklist item. The final reviewer/finish step must confirm live in-browser, with real distinct users (not a synthetic component harness — same discipline the prior phase's final verification used): an owner can request a renewal on an expired exception, a different real user can approve it (new `expiresAt` takes effect, status reads `'approved'` again instead of `'expired'`) or reject it with notes (history preserved, exception stays `'expired'`); self-approval and self-review are blocked both in the UI and, more importantly, when bypassed via direct API calls with the owner/requester's own token.

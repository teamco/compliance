# Issues Form Fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Issue Reporter, Affected Asset(s), and Issue Owner to the "New Issue" dialog, in order: Title, Severity, Description, Issue Reporter, Affected Asset(s), Issue Owner.

**Architecture:** Extend `Issue`/`IssueInput`/`IssuePatch` with `reporterId`, `ownerId` (required) and `affectedAssets` (optional free text). Reporter/Owner reuse the `useOrgMembers`/`Combobox`/`listOrgMembers` chain already built for the Exceptions form — no new backend capability. Only the data model, one migration, and the two `NotesStrategy` implementations' field mapping need to change.

**Tech Stack:** NestJS (TCP microservices), React 19 + Vite + shadcn/ui + TanStack Query, Supabase (Postgres), Vitest + Testing Library.

## Global Constraints

- Post-coding routine before every commit: `npx prettier --write <files>` → `yarn nx lint <project>` → `yarn nx build <project>` — all green.
- Unit tests: Vitest, files named `*.unit.test.ts(x)` in `__tests__/` next to source.
- Never import a concrete strategy in app code — inject via factory token (`AuthStrategy`, `NotesStrategy`).
- UI change is not "done" without Playwright verification in a running browser — reading the code is not verification.
- Design spec: `docs/superpowers/specs/2026-08-02-issues-form-fields-design.md`.

---

### Task 1: Issue data model — reporterId, ownerId, affectedAssets (Fake)

**Files:**
- Modify: `libs/shared/src/strategies/notes.ts` (`Issue`, `IssueInput`, `IssuePatch` interfaces, in the `// ─── Issues ─────` section)
- Modify: `libs/shared/src/strategies/fakes/fake-notes.ts` (`createIssue` method)
- Modify: `libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts` (5 existing `createIssue` call sites in the `describe('issues', ...)` block, plus one new test)

**Interfaces:**
- Produces: `Issue.reporterId: string`, `Issue.ownerId: string`, `Issue.affectedAssets?: string` (same on `IssueInput`; `IssuePatch` gets all three as optional). Task 3 (Supabase strategy) and Task 4 (client form) depend on these exact field names.

- [ ] **Step 1: Write the failing test**

In `libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts`, inside the `describe('issues', ...)` block, add after the existing `'creates and lists issues for org'` test:

```ts
  it('carries reporterId, ownerId, and affectedAssets through create', async () => {
    const issue = await s.createIssue('org1', 'u1', {
      title: 'MFA not enforced',
      description: 'Admin accounts lack MFA',
      severity: 'high',
      reporterId: 'user-reporter-1',
      ownerId: 'user-owner-1',
      affectedAssets: 'Payment API, Customer DB',
    });
    expect(issue.reporterId).toBe('user-reporter-1');
    expect(issue.ownerId).toBe('user-owner-1');
    expect(issue.affectedAssets).toBe('Payment API, Customer DB');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn nx test shared -- fake-notes.contract.unit.test.ts`
Expected: FAIL — TypeScript error, `reporterId`/`ownerId` do not exist on type `IssueInput`.

- [ ] **Step 3: Extend the types**

In `libs/shared/src/strategies/notes.ts`, find the `// ─── Issues ────` section and replace the `Issue`, `IssueInput`, `IssuePatch` interfaces with:

```ts
export interface Issue {
  id: string;
  orgId: string;
  userId: string;
  title: string;
  description: string;
  severity: IssueSeverity;
  reporterId: string;
  ownerId: string;
  affectedAssets?: string;
  status: IssueStatus;
  source: IssueSource;
  sourceId: string | null;
  dueDate: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IssueInput {
  title: string;
  description: string;
  severity: IssueSeverity;
  reporterId: string;
  ownerId: string;
  affectedAssets?: string;
  source?: IssueSource;
  sourceId?: string;
  dueDate?: string;
}

export interface IssuePatch {
  title?: string;
  description?: string;
  severity?: IssueSeverity;
  reporterId?: string;
  ownerId?: string;
  affectedAssets?: string;
  status?: IssueStatus;
  dueDate?: string | null;
  resolvedAt?: string | null;
}
```

- [ ] **Step 4: Update FakeNotesStrategy.createIssue**

In `libs/shared/src/strategies/fakes/fake-notes.ts`, find the `createIssue` method (in the `// ─── Issues ────` section) and add the three new fields to the object literal:

```ts
  async createIssue(orgId: string, userId: string, data: IssueInput): Promise<Issue> {
    const now = new Date().toISOString();
    const issue: Issue = {
      id: globalThis.crypto.randomUUID(),
      orgId,
      userId,
      title: data.title,
      description: data.description,
      severity: data.severity,
      reporterId: data.reporterId,
      ownerId: data.ownerId,
      affectedAssets: data.affectedAssets,
      status: 'open',
      source: data.source ?? 'manual',
      sourceId: data.sourceId ?? null,
      dueDate: data.dueDate ?? null,
      resolvedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.issues.set(issue.id, issue);
    return issue;
  }
```

`updateIssue` in this same file already does `{ ...existing, ...patch, ... }` (object-spread) — it needs NO change; the three new optional `IssuePatch` fields flow through automatically.

- [ ] **Step 5: Fix the other pre-existing `createIssue` call sites in the test file**

In `libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts`, every OTHER `s.createIssue('org1', 'u1', { ... })` call inside `describe('issues', ...)` besides the one from Step 1 is now missing the required `reporterId`/`ownerId` fields and will fail to compile. Before assuming a fixed count, run `grep -n "createIssue(" libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts` yourself and fix every match in the `issues` describe block (there were 5 in the plan-writing pass — `'updates issue status to resolved...'`, `'clears resolvedAt...'`, `'deletes an issue'`, `'scopes issues by orgId'`, plus the one Step 1 already covers — but verify the actual current count rather than trusting this number, the same way a prior task in a related plan found the brief undercounted by one). Add `reporterId: 'reporter-1', ownerId: 'owner-1',` to each one that's missing them.

- [ ] **Step 6: Run test to verify it passes**

Run: `yarn nx test shared -- fake-notes.contract.unit.test.ts`
Expected: PASS (all issues tests)

- [ ] **Step 7: Lint, build, commit**

```bash
npx prettier --write libs/shared/src/strategies/notes.ts libs/shared/src/strategies/fakes/fake-notes.ts libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts
yarn nx lint shared
yarn nx build shared
git add libs/shared/src/strategies/notes.ts libs/shared/src/strategies/fakes/fake-notes.ts libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts
git commit -m "feat(shared): add reporterId, ownerId, affectedAssets to Issue"
```

---

### Task 2: Supabase migration — issue reporter/owner/asset columns

**Files:**
- Create: `supabase/migrations/20260802000003_issues_reporter_owner_fields.sql`

**Interfaces:**
- Produces: `issues.reporter_id uuid`, `issues.owner_id uuid`, `issues.affected_assets text`. Task 3 (`SupabaseNotesStrategy`) reads/writes these column names.

No JS test — verified by applying to the live Supabase project and confirming no SQL errors, same as the analogous Exceptions migration.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260802000003_issues_reporter_owner_fields.sql`:

```sql
-- Issues: add reporter, owner, and affected-assets fields.
alter table public.issues
  add column reporter_id uuid references auth.users(id),
  add column owner_id uuid references auth.users(id),
  add column affected_assets text;
```

- [ ] **Step 2: Apply and verify**

This step is performed by the controller via Supabase MCP (`apply_migration`), not by an implementer subagent — same constraint as the Exceptions migration: applying schema changes to the real remote project is a human-gated decision. If you are an implementer subagent executing this task, STOP after creating the file and report DONE — do not attempt to apply it yourself.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260802000003_issues_reporter_owner_fields.sql
git commit -m "feat(db): add issue reporter/owner/affected-assets fields"
```

---

### Task 3: SupabaseNotesStrategy — issue field mapping

**Files:**
- Modify: `apps/microservices/notes/src/app/supabase-notes.strategy.ts` (`createIssue`, `updateIssue`, `toIssue` methods, in the `// ─── Issues ────` section)

**Interfaces:**
- Consumes: `Issue`, `IssueInput`, `IssuePatch` from Task 1 (already imported in this file).
- Produces: same field-mapping behavior as `FakeNotesStrategy`, backed by Postgres.

No new unit test (integration-only strategy) — verification is `yarn nx build notes` (type-checks against the `NotesStrategy` interface) and `yarn nx lint notes`.

- [ ] **Step 1: Update createIssue**

Find the `createIssue` method in `apps/microservices/notes/src/app/supabase-notes.strategy.ts`. Its `.insert({...})` call currently has `org_id`, `user_id`, `title`, `description`, `severity`, `source`, `source_id`, `due_date`. Add three keys:

```ts
        reporter_id: data.reporterId,
        owner_id: data.ownerId,
        affected_assets: data.affectedAssets ?? null,
```

(insert them anywhere in the object literal — e.g. right after `severity: data.severity,` — order doesn't matter for a Postgres insert).

- [ ] **Step 2: Update updateIssue**

Find the `updateIssue` method in the same file. It uses the guard pattern `if (patch.x !== undefined) update['x'] = patch.x;` for `title`/`description`/`severity`. Add the same guards for the three new fields:

```ts
    if (patch.reporterId !== undefined) update['reporter_id'] = patch.reporterId;
    if (patch.ownerId !== undefined) update['owner_id'] = patch.ownerId;
    if (patch.affectedAssets !== undefined) update['affected_assets'] = patch.affectedAssets;
```

- [ ] **Step 3: Update toIssue**

Find the private `toIssue` method in the same file. Add three fields to the returned object:

```ts
      reporterId: row['reporter_id'] as string,
      ownerId: row['owner_id'] as string,
      affectedAssets: row['affected_assets'] as string | undefined,
```

- [ ] **Step 4: Lint, build, commit**

```bash
npx prettier --write apps/microservices/notes/src/app/supabase-notes.strategy.ts
yarn nx lint notes
yarn nx build notes
git add apps/microservices/notes/src/app/supabase-notes.strategy.ts
git commit -m "feat(notes): map issue reporter/owner/affected-assets fields"
```

---

### Task 4: Rework the New Issue dialog + i18n

**Files:**
- Modify: `apps/client/src/routes/_dashboard/issues.tsx` (imports, form state, submit handler, dialog form body)
- Modify: `libs/template-shared/src/lib/i18n/locales/en.ts` (the `issues: {...}` block)
- Modify: `libs/template-shared/src/lib/i18n/locales/ru.ts` (the `issues: {...}` block)
- Modify: `libs/template-shared/src/lib/i18n/locales/he.ts` (the `issues: {...}` block)
- Modify: `libs/template-shared/src/lib/i18n/locales/es.ts` (the `issues: {...}` block)
- Test: `apps/client/src/routes/_dashboard/__tests__/issues.unit.test.tsx` (new)

**Interfaces:**
- Consumes: `Combobox` (`@/components/ui/combobox`, already exists), `useOrgMembers` (`@/queries/org-members`, already exists), `Issue`/`IssueInput` (Task 1).

- [ ] **Step 1: Write the failing test**

Create `apps/client/src/routes/_dashboard/__tests__/issues.unit.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { createIcoreI18n, ICORE_LOCALES } from '@icore/template-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const createMutate = vi.fn();

vi.mock('@/queries/issues', () => ({
  useIssues: () => ({ data: [], isPending: false }),
  useCreateIssue: () => ({ mutate: createMutate, isPending: false }),
  useUpdateIssue: () => ({ mutate: vi.fn() }),
  useDeleteIssue: () => ({ mutate: vi.fn() }),
}));

vi.mock('@/queries/org-members', () => ({
  useOrgMembers: () => ({
    data: [
      { userId: 'u1', displayName: 'Alice', email: 'alice@x.com', role: 'owner' },
      { userId: 'u2', displayName: 'Bob', email: 'bob@x.com', role: 'viewer' },
    ],
  }),
}));

vi.mock('@/stores/active-org', () => ({
  useActiveOrgStore: () => ({ activeOrgId: 'org1' }),
}));

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (opts: { component: React.ComponentType }) => ({ options: opts }),
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

describe('IssuesPage — New Issue dialog', () => {
  beforeEach(() => {
    createMutate.mockClear();
  });

  it('renders all 6 fields in order when the dialog opens', async () => {
    const { IssuesPage } = await import('../issues');
    render(wrap(<IssuesPage />));
    fireEvent.click(screen.getByText('New Issue'));

    const labels = screen.getAllByText(
      /^(Title|Severity|Description|Issue Reporter|Affected Asset\(s\)|Issue Owner)$/,
    );
    expect(labels.map((l) => l.textContent)).toEqual([
      'Title',
      'Severity',
      'Description',
      'Issue Reporter',
      'Affected Asset(s)',
      'Issue Owner',
    ]);
  });

  it('does not submit without a Reporter and Owner selected', async () => {
    const { IssuesPage } = await import('../issues');
    render(wrap(<IssuesPage />));
    fireEvent.click(screen.getByText('New Issue'));

    fireEvent.change(screen.getByPlaceholderText('Brief description of the issue'), {
      target: { value: 'Some title' },
    });
    fireEvent.change(screen.getByPlaceholderText('Detailed description, impact, and context'), {
      target: { value: 'Some description' },
    });
    fireEvent.click(screen.getByText('Create'));

    expect(createMutate).not.toHaveBeenCalled();
  });
});
```

Note: `IssuesPage` is currently not exported from `apps/client/src/routes/_dashboard/issues.tsx` (only `Route` is exported, `IssuesPage` is a local function). Step 2 will export it.

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn nx test client -- issues.unit.test.tsx`
Expected: FAIL — `IssuesPage` is not exported, and/or field labels don't match the current 3-field form.

- [ ] **Step 3: Rewrite issues.tsx**

Replace the full contents of `apps/client/src/routes/_dashboard/issues.tsx` with:

```tsx
import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Plus, Bug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageLayout } from '@/components/PageLayout';
import { useActiveOrgStore } from '@/stores/active-org';
import {
  useIssues,
  useCreateIssue,
  useUpdateIssue,
  useDeleteIssue,
  type Issue,
  type IssueInput,
} from '@/queries/issues';
import { useOrgMembers } from '@/queries/org-members';

export const Route = createFileRoute('/_dashboard/issues')({
  component: IssuesPage,
});

const SEVERITY_COLORS: Record<Issue['severity'], string> = {
  critical: 'bg-red-500/10 text-red-400 border-red-500/20',
  high: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  medium: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  low: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  info: 'bg-muted text-muted-foreground border-border',
};

const STATUS_COLORS: Record<Issue['status'], string> = {
  open: 'bg-red-500/10 text-red-400 border-red-500/20',
  in_progress: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  resolved: 'bg-green-500/10 text-green-400 border-green-500/20',
  wont_fix: 'bg-muted text-muted-foreground border-border',
};

const SEVERITY_OPTIONS: Array<Issue['severity']> = ['critical', 'high', 'medium', 'low', 'info'];
const STATUS_OPTIONS: Array<Issue['status']> = ['open', 'in_progress', 'resolved', 'wont_fix'];

const EMPTY_FORM: IssueInput = {
  title: '',
  description: '',
  severity: 'medium',
  reporterId: '',
  ownerId: '',
  affectedAssets: '',
};

export function IssuesPage() {
  const { t } = useTranslation();
  const { activeOrgId } = useActiveOrgStore();
  const orgId = activeOrgId ?? '';

  const { data: issues = [], isPending } = useIssues(orgId);
  const { data: members = [] } = useOrgMembers(orgId);
  const createMut = useCreateIssue(orgId);
  const updateMut = useUpdateIssue(orgId);
  const deleteMut = useDeleteIssue(orgId);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<IssueInput>(EMPTY_FORM);

  const memberOptions = members.map((m) => ({
    value: m.userId,
    label: m.displayName ?? m.email ?? m.userId,
  }));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title || !form.description || !form.reporterId || !form.ownerId) return;
    createMut.mutate(form, {
      onSuccess: () => {
        setOpen(false);
        setForm(EMPTY_FORM);
      },
    });
  }

  return (
    <PageLayout title={t('nav.issues')}>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{t('issues.subtitle')}</p>
        <Button size="sm" onClick={() => setOpen(true)} disabled={!orgId}>
          <Plus size={14} className="mr-1.5" />
          {t('issues.addIssue')}
        </Button>
      </div>

      {isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-16 bg-surface border border-border rounded-lg animate-pulse"
            />
          ))}
        </div>
      ) : issues.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
          <Bug size={32} className="opacity-30" />
          <p className="text-sm">{t('issues.empty')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {issues.map((issue) => (
            <div
              key={issue.id}
              className="flex items-start gap-4 bg-surface border border-border rounded-xl p-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-medium text-sm text-foreground truncate">
                    {issue.title}
                  </span>
                  <span
                    className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border ${SEVERITY_COLORS[issue.severity]}`}
                  >
                    {t(`issues.severity.${issue.severity}`)}
                  </span>
                  <span
                    className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border ${STATUS_COLORS[issue.status]}`}
                  >
                    {t(`issues.status.${issue.status}`)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{issue.description}</p>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <select
                  value={issue.status}
                  onChange={(e) =>
                    updateMut.mutate({
                      id: issue.id,
                      patch: { status: e.target.value as Issue['status'] },
                    })
                  }
                  className="text-xs h-7 rounded border border-border bg-surface px-1 text-foreground focus:outline-none focus:ring-1 focus:ring-green-500/40"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {t(`issues.status.${s}`)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => deleteMut.mutate(issue.id)}
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
            <DialogTitle>{t('issues.addIssue')}</DialogTitle>
            <DialogDescription>{t('issues.addDescription')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>{t('issues.title')}</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder={t('issues.titlePlaceholder')}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>{t('issues.severity')}</Label>
              <select
                value={form.severity}
                onChange={(e) =>
                  setForm((f) => ({ ...f, severity: e.target.value as Issue['severity'] }))
                }
                className="w-full h-9 rounded-md border border-border bg-surface px-3 text-sm focus:outline-none focus:ring-1 focus:ring-green-500/40"
              >
                {SEVERITY_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {t(`issues.severity.${s}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>{t('issues.description')}</Label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder={t('issues.descriptionPlaceholder')}
                rows={3}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500/40 resize-none"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>{t('issues.reporter')}</Label>
              <Combobox
                options={memberOptions}
                value={form.reporterId}
                onChange={(v) => setForm((f) => ({ ...f, reporterId: v }))}
                placeholder={t('issues.selectReporter')}
                searchPlaceholder={t('issues.searchMembers')}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('issues.affectedAssets')}</Label>
              <Input
                value={form.affectedAssets}
                onChange={(e) => setForm((f) => ({ ...f, affectedAssets: e.target.value }))}
                placeholder={t('issues.affectedAssetsPlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('issues.owner')}</Label>
              <Combobox
                options={memberOptions}
                value={form.ownerId}
                onChange={(v) => setForm((f) => ({ ...f, ownerId: v }))}
                placeholder={t('issues.selectOwner')}
                searchPlaceholder={t('issues.searchMembers')}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t('common.cancel')}
              </Button>
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

- [ ] **Step 4: Add i18n keys — en.ts**

In `libs/template-shared/src/lib/i18n/locales/en.ts`, find the `issues: {...}` block and add these keys (after `descriptionPlaceholder`, before `severity: {`):

```ts
    reporter: 'Issue Reporter',
    selectReporter: 'Select reporter…',
    searchMembers: 'Search members…',
    affectedAssets: 'Affected Asset(s)',
    affectedAssetsPlaceholder: 'e.g. Payment API, Customer DB',
    owner: 'Issue Owner',
    selectOwner: 'Select owner…',
```

- [ ] **Step 5: Add i18n keys — ru.ts, he.ts, es.ts**

In `libs/template-shared/src/lib/i18n/locales/ru.ts`, find the `issues: {...}` block and add (same insertion point, after `descriptionPlaceholder`, before `severity: {`):

```ts
    reporter: 'Автор проблемы',
    selectReporter: 'Выберите автора…',
    searchMembers: 'Поиск участников…',
    affectedAssets: 'Затронутые активы',
    affectedAssetsPlaceholder: 'например: Payment API, Customer DB',
    owner: 'Ответственный',
    selectOwner: 'Выберите ответственного…',
```

In `libs/template-shared/src/lib/i18n/locales/he.ts`, find the `issues: {...}` block and add (same insertion point):

```ts
    reporter: 'מדווח הממצא',
    selectReporter: 'בחר מדווח…',
    searchMembers: 'חיפוש חברים…',
    affectedAssets: 'נכסים מושפעים',
    affectedAssetsPlaceholder: 'לדוגמה: Payment API, Customer DB',
    owner: 'בעלים אחראי',
    selectOwner: 'בחר בעלים…',
```

In `libs/template-shared/src/lib/i18n/locales/es.ts`, find the `issues: {...}` block and add (same insertion point):

```ts
    reporter: 'Informante del problema',
    selectReporter: 'Seleccionar informante…',
    searchMembers: 'Buscar miembros…',
    affectedAssets: 'Activo(s) afectado(s)',
    affectedAssetsPlaceholder: 'p. ej. Payment API, Customer DB',
    owner: 'Propietario del problema',
    selectOwner: 'Seleccionar propietario…',
```

- [ ] **Step 6: Run test to verify it passes**

Run: `yarn nx test client -- issues.unit.test.tsx`
Expected: PASS

- [ ] **Step 7: Run the full client test suite (regression check)**

Run: `yarn nx test client`
Expected: all pass — no other test imports `IssuesPage` or the old 3-field form structure.

- [ ] **Step 8: Lint, build, commit**

```bash
npx prettier --write apps/client/src/routes/_dashboard/issues.tsx apps/client/src/routes/_dashboard/__tests__/issues.unit.test.tsx libs/template-shared/src/lib/i18n/locales/en.ts libs/template-shared/src/lib/i18n/locales/ru.ts libs/template-shared/src/lib/i18n/locales/he.ts libs/template-shared/src/lib/i18n/locales/es.ts
yarn nx lint client
yarn nx lint template-shared
yarn nx build client
yarn nx build template-shared
git add apps/client/src/routes/_dashboard/issues.tsx apps/client/src/routes/_dashboard/__tests__/issues.unit.test.tsx libs/template-shared/src/lib/i18n/locales/en.ts libs/template-shared/src/lib/i18n/locales/ru.ts libs/template-shared/src/lib/i18n/locales/he.ts libs/template-shared/src/lib/i18n/locales/es.ts
git commit -m "feat(client): add Reporter, Affected Asset(s), Owner to New Issue dialog"
```

---

### Task 5: Playwright verification

Per AGENTS.md: "Any UI change MUST be verified in browser via Playwright MCP before reporting complete." Reading the code is not sufficient.

- [ ] **Step 1: Start the app**

Run: `yarn dev` (or the individual `yarn nx run <project>:serve` targets).

- [ ] **Step 2: Navigate and open the dialog**

Using the Playwright MCP tools: navigate to `http://localhost:4200/issues` with a logged-in session for an org that has at least one org member available (the Reporter/Owner Comboboxes need at least one option to meaningfully test selection), click "New Issue".

- [ ] **Step 3: Verify field order and behavior**

Confirm, in order: Title, Severity (select, unchanged), Description, Issue Reporter (combobox), Affected Asset(s) (text input), Issue Owner (combobox). Fill all required fields (Title, Description, Reporter, Owner), leave Affected Asset(s) blank, submit — confirm it succeeds. Open again, fill everything including Affected Asset(s), submit — confirm it succeeds and the value round-trips (check via a subsequent `GET /notes/issues` response or by editing, if edit UI exposes it — otherwise confirming no error is sufficient given there's no issue-edit UI yet).

- [ ] **Step 4: Screenshot as evidence**

Take a Playwright screenshot of the open dialog showing all 6 fields, attach it to the completion report.

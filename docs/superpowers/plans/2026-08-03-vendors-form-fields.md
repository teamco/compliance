# Vendors Form Fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "Vendor Contract Owner" to the Add Vendor dialog and reorder fields to: Vendor Name, Web Domain, Vendor Contract Owner, Vendor Criticality (the existing `tier` field, moved one slot later).

**Architecture:** Extend `Vendor`/`VendorInput` with `contractOwnerId` (`Vendor.contractOwnerId: string | null` since the DB column is nullable with no backfill; `VendorInput.contractOwnerId: string`, required on create/update). Unlike Notes/Auth, vendor CRUD has no Strategy/Fake abstraction — it's a plain `VendorRiskService` talking directly to Supabase, so there is no in-memory double to update, only the one real service. Reuse the `useOrgMembers`/`Combobox` chain already built for Exceptions and Issues — no new backend capability.

**Tech Stack:** NestJS (TCP microservices), React 19 + Vite + shadcn/ui + TanStack Query, Supabase (Postgres), Vitest + Testing Library.

## Global Constraints

- Post-coding routine before every commit: `npx prettier --write <files>` → `yarn nx lint <project>` → `yarn nx build <project>` — all green.
- Unit tests: Vitest, files named `*.unit.test.ts(x)` in `__tests__/` next to source.
- Never import a concrete strategy in app code — inject via factory token.
- UI change is not "done" without Playwright verification in a running browser — reading the code is not verification.
- Design spec: `docs/superpowers/specs/2026-08-03-vendors-form-fields-design.md`.
- Learned from the Issues plan's final review: when a new field is required on the write-side type but the underlying DB column is nullable with no backfill, type the read-side (`Vendor`) as nullable and the write-side (`VendorInput`) as required from the start — don't repeat the mistake of typing both as non-nullable and having to fix it after review.

---

### Task 1: Vendor data model + VendorRiskService field mapping

**Files:**
- Modify: `libs/shared/src/strategies/vendor-risk.ts` (`Vendor`, `VendorInput`)
- Modify: `apps/microservices/vendor-risk/src/app/vendor-risk.service.ts` (`createVendor`, `updateVendor`, `mapVendor`)

**Interfaces:**
- Produces: `Vendor.contractOwnerId: string | null`, `VendorInput.contractOwnerId: string`. Task 3 (client form) depends on this exact field name and the required/nullable split.

No new unit test — vendor CRUD has no Fake/Strategy layer to test in isolation (unlike `NotesStrategy`/`AuthStrategy`), and `VendorRiskService` is a thin Supabase pass-through with no existing test file in this repo. Verification is `yarn nx build vendor-risk` (type-checks `VendorRiskService` against the new `Vendor`/`VendorInput` shapes) and `yarn nx build shared`.

- [ ] **Step 1: Extend the types**

In `libs/shared/src/strategies/vendor-risk.ts`, find the `Vendor` interface and add one field (after `tier: VendorTier;`):

```ts
export interface Vendor {
  id: string;
  orgId: string;
  name: string;
  domain: string;
  tags: string[];
  tier: VendorTier;
  contractOwnerId: string | null;
  rescanIntervalDays: number;
  alertThreshold: number;
  lastScannedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
```

Then replace the `VendorInput` type (currently `export type VendorInput = Omit<Vendor, 'id' | 'orgId' | 'lastScannedAt' | 'createdAt' | 'updatedAt'>;`) with:

```ts
export type VendorInput = Omit<
  Vendor,
  'id' | 'orgId' | 'lastScannedAt' | 'createdAt' | 'updatedAt' | 'contractOwnerId'
> & {
  contractOwnerId: string;
};
```

(`VendorInput` still derives from `Vendor` via `Omit` for every other field, but overrides `contractOwnerId` back to a required non-null `string` — the DB column is nullable for existing/legacy rows, but every new create/update must supply a real owner.)

- [ ] **Step 2: Update VendorRiskService.createVendor**

In `apps/microservices/vendor-risk/src/app/vendor-risk.service.ts`, find `createVendor`'s `.insert({...})` call. It currently has `org_id`, `name`, `domain`, `tags`, `tier`, `rescan_interval_days`, `alert_threshold`. Add one key:

```ts
        contract_owner_id: input.contractOwnerId,
```

(insert it anywhere in the object literal, e.g. right after `tier: input.tier,`).

- [ ] **Step 3: Update VendorRiskService.updateVendor**

Find `updateVendor`'s guarded-update object. It uses `if (patch.x !== undefined) update['y'] = patch.x;` for `name`/`domain`/`tags`/`tier`/`rescanIntervalDays`/`alertThreshold`. Add:

```ts
    if (patch.contractOwnerId !== undefined) update['contract_owner_id'] = patch.contractOwnerId;
```

- [ ] **Step 4: Update the private mapVendor method**

Find `mapVendor`. Add one field to the returned object:

```ts
      contractOwnerId: row['contract_owner_id'] as string | null,
```

- [ ] **Step 5: Lint, build, commit**

```bash
npx prettier --write libs/shared/src/strategies/vendor-risk.ts apps/microservices/vendor-risk/src/app/vendor-risk.service.ts
yarn nx lint shared
yarn nx lint vendor-risk
yarn nx build shared
yarn nx build vendor-risk
git add libs/shared/src/strategies/vendor-risk.ts apps/microservices/vendor-risk/src/app/vendor-risk.service.ts
git commit -m "feat(shared,vendor-risk): add contractOwnerId to Vendor"
```

---

### Task 2: Supabase migration — vendor contract owner column

**Files:**
- Create: `supabase/migrations/20260803000001_vendors_contract_owner_field.sql`

**Interfaces:**
- Produces: `vendors.contract_owner_id uuid`. Task 1's `VendorRiskService` reads/writes this column name (already implemented in Task 1 — this task just needs to exist before Task 1's code is exercised against a real database).

No JS test — verified by applying to the live Supabase project and confirming no SQL errors, same as the analogous Exceptions/Issues migrations.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260803000001_vendors_contract_owner_field.sql`:

```sql
-- Vendors: add contract owner field.
alter table public.vendors
  add column contract_owner_id uuid references auth.users(id);
```

- [ ] **Step 2: Apply and verify**

This step is performed by the controller via Supabase MCP (`apply_migration`), not by an implementer subagent — same constraint as the Exceptions and Issues migrations: applying schema changes to the real remote project is a human-gated decision. If you are an implementer subagent executing this task, STOP after creating the file and report DONE — do not attempt to apply it yourself.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260803000001_vendors_contract_owner_field.sql
git commit -m "feat(db): add vendor contract owner field"
```

---

### Task 3: Rework the Add Vendor dialog + i18n

**Files:**
- Modify: `apps/client/src/routes/_dashboard/vendors.tsx` (`AddVendorDialog` function only — imports, state, validation, submit, dialog form body)
- Modify: `libs/template-shared/src/lib/i18n/locales/en.ts` (the `vendors: {...}` block)
- Modify: `libs/template-shared/src/lib/i18n/locales/ru.ts` (the `vendors: {...}` block)
- Modify: `libs/template-shared/src/lib/i18n/locales/he.ts` (the `vendors: {...}` block)
- Modify: `libs/template-shared/src/lib/i18n/locales/es.ts` (the `vendors: {...}` block)
- Test: `apps/client/src/routes/_dashboard/__tests__/vendors.unit.test.tsx` (new)

**Interfaces:**
- Consumes: `Combobox` (`@/components/ui/combobox`, already exists), `useOrgMembers` (`@/queries/org-members`, already exists), `Vendor`/`VendorInput` (Task 1).

- [ ] **Step 1: Write the failing test**

`vendors.tsx` currently exports `Route` (with `component: VendorsPage` inline) but does NOT export `VendorsPage` itself. Step 3 exports it directly — matching how `exceptions.tsx`/`issues.tsx` were changed in prior plans — so this test imports `{ VendorsPage }` directly, the same way the Issues/Exceptions tests do it.

Create `apps/client/src/routes/_dashboard/__tests__/vendors.unit.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { createIcoreI18n, ICORE_LOCALES } from '@icore/template-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const createMutate = vi.fn();

vi.mock('@/queries/vendors', () => ({
  useVendors: () => ({ data: [], isPending: false }),
  useCreateVendor: () => ({ mutate: createMutate, isPending: false }),
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
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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

describe('VendorsPage — Add Vendor dialog', () => {
  beforeEach(() => {
    createMutate.mockClear();
  });

  it('shows a Contract Owner combobox after the Name/Domain inputs', async () => {
    const { VendorsPage } = await import('../vendors');
    render(wrap(<VendorsPage />));
    fireEvent.click(screen.getByText('Add Vendor'));

    expect(screen.getByPlaceholderText('Vendor name')).toBeTruthy();
    expect(screen.getByPlaceholderText('Domain (e.g. example.com)')).toBeTruthy();
    expect(screen.getByText('Select contract owner…')).toBeTruthy();
  });

  it('does not submit without a Contract Owner selected', async () => {
    const { VendorsPage } = await import('../vendors');
    render(wrap(<VendorsPage />));
    fireEvent.click(screen.getByText('Add Vendor'));

    fireEvent.change(screen.getByPlaceholderText('Vendor name'), {
      target: { value: 'Acme Corp' },
    });
    fireEvent.change(screen.getByPlaceholderText('Domain (e.g. example.com)'), {
      target: { value: 'acme.com' },
    });
    const submitButtons = screen.getAllByText('Add Vendor');
    fireEvent.click(submitButtons[submitButtons.length - 1]);

    expect(createMutate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn nx test client -- vendors.unit.test.tsx`
Expected: FAIL — `VendorsPage` is not exported, and/or "Select contract owner…" text doesn't exist yet.

- [ ] **Step 3: Export VendorsPage and rework AddVendorDialog**

In `apps/client/src/routes/_dashboard/vendors.tsx`:

1. Change `function VendorsPage() {` to `export function VendorsPage() {`.
2. Add two imports at the top: `import { Combobox } from '@/components/ui/combobox';` and `import { useOrgMembers } from '@/queries/org-members';`.
3. In `AddVendorDialog`, add a `contractOwnerId` state field and wire in `useOrgMembers`. Replace the full function body with:

```tsx
function AddVendorDialog({
  open,
  orgId,
  onClose,
}: {
  open: boolean;
  orgId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const create = useCreateVendor(orgId);
  const { data: members = [] } = useOrgMembers(orgId);
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [contractOwnerId, setContractOwnerId] = useState('');
  const [tier, setTier] = useState<VendorInput['tier']>('medium');
  const [errors, setErrors] = useState<{ name?: string; domain?: string; contractOwnerId?: string }>(
    {},
  );

  const DOMAIN_RE = /^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;

  const memberOptions = members.map((m) => ({
    value: m.userId,
    label: m.displayName ?? m.email ?? m.userId,
  }));

  function validate() {
    const e: { name?: string; domain?: string; contractOwnerId?: string } = {};
    if (!name.trim()) e.name = t('vendors.nameRequired');
    if (!domain.trim()) e.domain = t('vendors.domainRequired');
    else if (!DOMAIN_RE.test(domain.trim())) e.domain = t('vendors.domainInvalid');
    if (!contractOwnerId) e.contractOwnerId = t('vendors.contractOwnerRequired');
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function submit() {
    if (!validate()) return;
    create.mutate(
      {
        name: name.trim(),
        domain: domain.trim(),
        contractOwnerId,
        tier,
        tags: [],
        rescanIntervalDays: 7,
        alertThreshold: 10,
      },
      {
        onSuccess: () => {
          onClose();
          setName('');
          setDomain('');
          setContractOwnerId('');
          setErrors({});
        },
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          onClose();
          setErrors({});
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('vendors.addVendor')}</DialogTitle>
          <DialogDescription className="sr-only">{t('vendors.addVendor')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Input
              placeholder={t('vendors.vendorName')}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
              }}
              className={errors.name ? 'border-red-500 focus-visible:ring-red-500' : ''}
            />
            {errors.name && <p className="text-xs text-red-400">{errors.name}</p>}
          </div>
          <div className="space-y-1">
            <Input
              placeholder={t('vendors.domain')}
              value={domain}
              onChange={(e) => {
                setDomain(e.target.value);
                if (errors.domain) setErrors((prev) => ({ ...prev, domain: undefined }));
              }}
              className={errors.domain ? 'border-red-500 focus-visible:ring-red-500' : ''}
            />
            {errors.domain && <p className="text-xs text-red-400">{errors.domain}</p>}
          </div>
          <div className="space-y-1">
            <Combobox
              options={memberOptions}
              value={contractOwnerId}
              onChange={(v) => {
                setContractOwnerId(v);
                if (errors.contractOwnerId)
                  setErrors((prev) => ({ ...prev, contractOwnerId: undefined }));
              }}
              placeholder={t('vendors.selectContractOwner')}
              searchPlaceholder={t('vendors.searchMembers')}
            />
            {errors.contractOwnerId && (
              <p className="text-xs text-red-400">{errors.contractOwnerId}</p>
            )}
          </div>
          <Select value={tier} onValueChange={(v) => setTier(v as VendorInput['tier'])}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent side="top">
              {TIER_OPTIONS.map((tierOption) => (
                <SelectItem key={tierOption} value={tierOption}>
                  {t(`vendors.tier.${tierOption}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending && <Loader2 size={14} className="mr-2 animate-spin" />}
            {t('vendors.addVendor')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

This changes: added `contractOwnerId` state, `memberOptions`, a `Combobox` field between Domain and the Criticality `Select` (field order: Name, Domain, Contract Owner, Criticality — matching the spec), and `contractOwnerId` added to both `validate()` and the `create.mutate` payload.

- [ ] **Step 4: Add i18n keys — en.ts**

In `libs/template-shared/src/lib/i18n/locales/en.ts`, find the `vendors: {...}` block and add these keys (after `domain: 'Domain (e.g. example.com)',`, before `empty:`):

```ts
    contractOwner: 'Vendor Contract Owner',
    selectContractOwner: 'Select contract owner…',
    searchMembers: 'Search members…',
    contractOwnerRequired: 'Contract owner is required',
```

- [ ] **Step 5: Add i18n keys — ru.ts, he.ts, es.ts**

In `libs/template-shared/src/lib/i18n/locales/ru.ts`, find the `vendors: {...}` block and add (same insertion point, after `domain:`, before `empty:`):

```ts
    contractOwner: 'Ответственный за контракт',
    selectContractOwner: 'Выберите ответственного…',
    searchMembers: 'Поиск участников…',
    contractOwnerRequired: 'Ответственный за контракт обязателен',
```

In `libs/template-shared/src/lib/i18n/locales/he.ts`, find the `vendors: {...}` block and add (same insertion point):

```ts
    contractOwner: 'בעל החוזה עם הספק',
    selectContractOwner: 'בחר בעל חוזה…',
    searchMembers: 'חיפוש חברים…',
    contractOwnerRequired: 'בעל חוזה הוא שדה חובה',
```

In `libs/template-shared/src/lib/i18n/locales/es.ts`, find the `vendors: {...}` block and add (same insertion point):

```ts
    contractOwner: 'Propietario del Contrato',
    selectContractOwner: 'Seleccionar propietario del contrato…',
    searchMembers: 'Buscar miembros…',
    contractOwnerRequired: 'El propietario del contrato es obligatorio',
```

- [ ] **Step 6: Run test to verify it passes**

Run: `yarn nx test client -- vendors.unit.test.tsx`
Expected: PASS

- [ ] **Step 7: Run the full client test suite (regression check)**

Run: `yarn nx test client`
Expected: all pass — no other test imports `VendorsPage` or the old 3-field `AddVendorDialog` structure.

- [ ] **Step 8: Lint, build, commit**

```bash
npx prettier --write apps/client/src/routes/_dashboard/vendors.tsx apps/client/src/routes/_dashboard/__tests__/vendors.unit.test.tsx libs/template-shared/src/lib/i18n/locales/en.ts libs/template-shared/src/lib/i18n/locales/ru.ts libs/template-shared/src/lib/i18n/locales/he.ts libs/template-shared/src/lib/i18n/locales/es.ts
yarn nx lint client
yarn nx lint template-shared
yarn nx build client
yarn nx build template-shared
git add apps/client/src/routes/_dashboard/vendors.tsx apps/client/src/routes/_dashboard/__tests__/vendors.unit.test.tsx libs/template-shared/src/lib/i18n/locales/en.ts libs/template-shared/src/lib/i18n/locales/ru.ts libs/template-shared/src/lib/i18n/locales/he.ts libs/template-shared/src/lib/i18n/locales/es.ts
git commit -m "feat(client): add Vendor Contract Owner field to Add Vendor dialog"
```

---

### Task 4: Playwright verification

Per AGENTS.md: "Any UI change MUST be verified in browser via Playwright MCP before reporting complete." Reading the code is not sufficient.

- [ ] **Step 1: Start the app**

Run: `yarn dev` (or the individual `yarn nx run <project>:serve` targets).

- [ ] **Step 2: Navigate and open the dialog**

Using the Playwright MCP tools: navigate to `http://localhost:4200/vendors` with a logged-in session for an org that has at least one org member available, click "Add Vendor".

- [ ] **Step 3: Verify field order and behavior**

Confirm, in order: Vendor Name, Web Domain, Vendor Contract Owner (combobox), Vendor Criticality (select, unchanged values). Type in the Contract Owner combobox's search box and confirm the list filters. Fill Name/Domain, leave Contract Owner unset, click "Add Vendor" — confirm it does NOT submit and shows the required-field error. Then select a Contract Owner and submit — confirm it succeeds.

- [ ] **Step 4: Screenshot as evidence**

Take a Playwright screenshot of the open dialog showing all 4 fields, attach it to the completion report.

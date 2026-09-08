# Exceptions Form Fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the "New Exception" dialog to 8 fields in a fixed order (Title, Framework, Standard, Control code, Statement, Justification, Owner, Compensating Controls), with searchable dropdowns for Framework/Standard/Control code/Owner, backed by new `listStandardsByFramework` (NotesStrategy) and `listOrgMembers` (AuthStrategy) capabilities.

**Architecture:** Extend `Exception`/`ExceptionInput`/`ExceptionPatch` with `statement`, `ownerId`, `compensatingControls`. Add two new strategy methods end-to-end (Fake → Supabase → MS controller → gateway client service → gateway HTTP controller → client query hook), reusing the existing TCP strategy-factory pattern throughout. Add a reusable shadcn `Combobox` (Popover + cmdk) component since none exists yet, and use it for all 4 dropdown fields. One new Supabase migration adds exception columns and fixes an overly-restrictive RLS policy on `organization_members` (currently self-row-only) to allow org-scoped reads.

**Tech Stack:** NestJS (TCP microservices), React 19 + Vite + shadcn/ui + TanStack Query, Supabase (Postgres + RLS), Vitest + Testing Library.

## Global Constraints

- Post-coding routine before every commit: `npx prettier --write <files>` → `yarn nx lint <project>` → `yarn nx build <project>` — all green.
- Unit tests: Vitest, files named `*.unit.test.ts(x)` in `__tests__/` next to source.
- Never import a concrete strategy in app code — inject via factory token (`AuthStrategy`, `NotesStrategy`).
- UI change is not "done" without Playwright verification in a running browser (Task 12) — reading the code is not verification.
- Design spec: `docs/superpowers/specs/2026-08-02-exceptions-form-fields-design.md`.

---

### Task 1: Reusable searchable Combobox UI component

**Files:**
- Create: `apps/client/src/components/ui/popover.tsx`
- Create: `apps/client/src/components/ui/command.tsx`
- Create: `apps/client/src/components/ui/combobox.tsx`
- Test: `apps/client/src/components/ui/__tests__/combobox.unit.test.tsx`
- Modify: `package.json:118-119` (add `@radix-ui/react-popover` between `react-label` and `react-select`)
- Modify: `package.json:130-131` (add `cmdk` between `clsx` and `cookie-parser`)

**Interfaces:**
- Produces: `Combobox` component — `apps/client/src/components/ui/combobox.tsx`, exported as `Combobox`, props `{ options: ComboboxOption[]; value: string; onChange: (value: string) => void; placeholder?: string; searchPlaceholder?: string; emptyText?: string; disabled?: boolean }` where `ComboboxOption = { value: string; label: string }`. Task 11 imports this from `@/components/ui/combobox`.

- [ ] **Step 1: Add dependencies**

Edit `package.json`, insert into the `dependencies` block:

```json
    "@radix-ui/react-label": "^2.1.15",
    "@radix-ui/react-popover": "^1.1.23",
    "@radix-ui/react-select": "^2.3.7",
```

and:

```json
    "clsx": "^2.1.1",
    "cmdk": "^1.1.1",
    "cookie-parser": "^1.4.7",
```

Run: `yarn install`
Expected: lockfile updates, no errors.

- [ ] **Step 2: Write the failing test**

Create `apps/client/src/components/ui/__tests__/combobox.unit.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Combobox } from '../combobox';

describe('Combobox', () => {
  const options = [
    { value: 'a', label: 'Alpha' },
    { value: 'b', label: 'Beta' },
  ];

  it('shows placeholder when no value is selected', () => {
    render(<Combobox options={options} value="" onChange={vi.fn()} placeholder="Pick one" />);
    expect(screen.getByRole('combobox')).toHaveTextContent('Pick one');
  });

  it('shows the selected option label', () => {
    render(<Combobox options={options} value="b" onChange={vi.fn()} />);
    expect(screen.getByRole('combobox')).toHaveTextContent('Beta');
  });

  it('opens the list and calls onChange when an option is clicked', () => {
    const onChange = vi.fn();
    render(<Combobox options={options} value="" onChange={onChange} />);
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByText('Alpha'));
    expect(onChange).toHaveBeenCalledWith('a');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `yarn nx test client -- combobox.unit.test.tsx`
Expected: FAIL — `Cannot find module '../combobox'`

- [ ] **Step 4: Create the Popover primitive**

Create `apps/client/src/components/ui/popover.tsx`:

```tsx
import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { cn } from '@/lib/utils';

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = 'center', sideOffset = 4, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        'z-50 w-72 rounded-md border border-border bg-background p-0 text-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
        className,
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverContent };
```

- [ ] **Step 5: Create the Command (cmdk) primitive**

Create `apps/client/src/components/ui/command.tsx`:

```tsx
import * as React from 'react';
import { Command as CommandPrimitive } from 'cmdk';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

const Command = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className, ...props }, ref) => (
  <CommandPrimitive
    ref={ref}
    className={cn(
      'flex h-full w-full flex-col overflow-hidden rounded-md bg-background text-foreground',
      className,
    )}
    {...props}
  />
));
Command.displayName = CommandPrimitive.displayName;

const CommandInput = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Input>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>(({ className, ...props }, ref) => (
  <div className="flex items-center border-b border-border px-3">
    <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
    <CommandPrimitive.Input
      ref={ref}
      className={cn(
        'flex h-9 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  </div>
));
CommandInput.displayName = CommandPrimitive.Input.displayName;

const CommandList = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.List
    ref={ref}
    className={cn('max-h-64 overflow-y-auto overflow-x-hidden', className)}
    {...props}
  />
));
CommandList.displayName = CommandPrimitive.List.displayName;

const CommandEmpty = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Empty>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>((props, ref) => (
  <CommandPrimitive.Empty
    ref={ref}
    className="py-6 text-center text-sm text-muted-foreground"
    {...props}
  />
));
CommandEmpty.displayName = CommandPrimitive.Empty.displayName;

const CommandGroup = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Group>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Group
    ref={ref}
    className={cn('overflow-hidden p-1 text-foreground', className)}
    {...props}
  />
));
CommandGroup.displayName = CommandPrimitive.Group.displayName;

const CommandItem = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none aria-selected:bg-muted aria-selected:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className,
    )}
    {...props}
  />
));
CommandItem.displayName = CommandPrimitive.Item.displayName;

export { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem };
```

- [ ] **Step 6: Create the Combobox composed component**

Create `apps/client/src/components/ui/combobox.tsx`:

```tsx
import * as React from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from './command';

export interface ComboboxOption {
  value: string;
  label: string;
}

export interface ComboboxProps {
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyText = 'No results found.',
  disabled = false,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className={cn('truncate', !selected && 'text-muted-foreground')}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  onSelect={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      option.value === value ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `yarn nx test client -- combobox.unit.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 8: Lint, build, commit**

```bash
npx prettier --write apps/client/src/components/ui/popover.tsx apps/client/src/components/ui/command.tsx apps/client/src/components/ui/combobox.tsx apps/client/src/components/ui/__tests__/combobox.unit.test.tsx package.json
yarn nx lint client
yarn nx build client
git add package.json yarn.lock apps/client/src/components/ui/popover.tsx apps/client/src/components/ui/command.tsx apps/client/src/components/ui/combobox.tsx apps/client/src/components/ui/__tests__/combobox.unit.test.tsx
git commit -m "feat(client): add reusable searchable Combobox component"
```

---

### Task 2: Exception data model — statement, ownerId, compensatingControls

**Files:**
- Modify: `libs/shared/src/strategies/notes.ts:116-144` (`Exception`, `ExceptionInput`, `ExceptionPatch`)
- Modify: `libs/shared/src/strategies/fakes/fake-notes.ts:522-540` (`createException`)
- Modify: `libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts` (5 existing `createException` call sites need `statement`/`ownerId`)
- Test: `libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts` (new round-trip test)

**Interfaces:**
- Produces: `Exception.statement: string`, `Exception.ownerId: string`, `Exception.compensatingControls?: string` (same on `ExceptionInput`); `ExceptionPatch.statement?/ownerId?/compensatingControls?`. Tasks 4, 6, 9, 11 depend on these field names.

- [ ] **Step 1: Write the failing test**

In `libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts`, add after the existing `'creates and lists exceptions for org'` test (inside the same `describe('exceptions', ...)` block):

```ts
  it('carries statement, ownerId, and compensatingControls through create', async () => {
    const exc = await s.createException('org1', 'u1', {
      controlCode: 'AC-1',
      frameworkId: 'fw1',
      title: 'Cannot implement AC-1',
      statement: 'AC-1 requires MFA on all admin accounts.',
      justification: 'Legacy system limitation',
      ownerId: 'user-owner-1',
      compensatingControls: 'Manual quarterly access review',
    });
    expect(exc.statement).toBe('AC-1 requires MFA on all admin accounts.');
    expect(exc.ownerId).toBe('user-owner-1');
    expect(exc.compensatingControls).toBe('Manual quarterly access review');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn nx test shared -- fake-notes.contract.unit.test.ts`
Expected: FAIL — TypeScript error, `statement`/`ownerId` do not exist on type `ExceptionInput`.

- [ ] **Step 3: Extend the types**

In `libs/shared/src/strategies/notes.ts`, replace lines 116-144:

```ts
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
}

export interface ExceptionPatch {
  title?: string;
  statement?: string;
  justification?: string;
  ownerId?: string;
  compensatingControls?: string;
  expiresAt?: string | null;
}
```

- [ ] **Step 4: Update FakeNotesStrategy.createException**

In `libs/shared/src/strategies/fakes/fake-notes.ts`, replace lines 522-540:

```ts
  async createException(orgId: string, userId: string, data: ExceptionInput): Promise<Exception> {
    const now = new Date().toISOString();
    const exc: Exception = {
      id: globalThis.crypto.randomUUID(),
      orgId,
      userId,
      controlCode: data.controlCode,
      standardCode: data.standardCode,
      frameworkId: data.frameworkId,
      title: data.title,
      statement: data.statement,
      justification: data.justification,
      ownerId: data.ownerId,
      compensatingControls: data.compensatingControls,
      status: 'pending',
      expiresAt: data.expiresAt ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.exceptions.set(exc.id, exc);
    return exc;
  }
```

- [ ] **Step 5: Fix the 4 other existing `createException` call sites**

In `libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts`, every other `s.createException('org1', 'u1', { ... })` call (in `'approves an exception'`, `'rejects an exception'`, `'updates exception fields'`, `'deletes an exception'`) is missing the now-required `statement`/`ownerId` fields. Add them to each:

```ts
      statement: 'S',
      ownerId: 'owner-1',
```

(insert right after the `justification:` line in each of those 4 call sites — TypeScript will point at each one if missed).

- [ ] **Step 6: Run test to verify it passes**

Run: `yarn nx test shared -- fake-notes.contract.unit.test.ts`
Expected: PASS (all exceptions tests)

- [ ] **Step 7: Lint, build, commit**

```bash
npx prettier --write libs/shared/src/strategies/notes.ts libs/shared/src/strategies/fakes/fake-notes.ts libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts
yarn nx lint shared
yarn nx build shared
git add libs/shared/src/strategies/notes.ts libs/shared/src/strategies/fakes/fake-notes.ts libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts
git commit -m "feat(shared): add statement, ownerId, compensatingControls to Exception"
```

---

### Task 3: NotesStrategy.listStandardsByFramework (Fake)

**Files:**
- Modify: `libs/shared/src/strategies/notes.ts:442-445` (`NotesStrategy` interface)
- Modify: `libs/shared/src/strategies/fakes/fake-notes.ts:93-95` (add method after `listControlsByFramework`)
- Test: `libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts` (new test)

**Interfaces:**
- Consumes: `StandardsDocument` (`orgId`, `standards: DocumentStandard[]`), `DocumentStandard.frameworkMappings: { frameworkId: string; standardCode: string }[]` — both already defined in `notes.ts:42-49,66-75`.
- Produces: `NotesStrategy.listStandardsByFramework(orgId: string, frameworkId: string): Promise<DocumentStandard[]>`. Tasks 6, 9, 10 depend on this exact name/signature.

- [ ] **Step 1: Write the failing test**

In `libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts`, add a new top-level `describe` block (after the `describe('exceptions', ...)` block):

```ts
describe('listStandardsByFramework', () => {
  let s: FakeNotesStrategy;
  beforeEach(() => {
    s = new FakeNotesStrategy();
  });

  it('returns standards mapped to the given framework, deduplicated by code', async () => {
    const { id } = await s.createStandardsDocument('u1', 'org1', ['fw1']);
    await s.saveStandardsDocument(id, [
      {
        code: 'STD-1',
        title: 'Access Control',
        objective: 'Restrict access',
        scope: 'All systems',
        requirements: ['MFA required'],
        frameworkMappings: [{ frameworkId: 'fw1', standardCode: 'AC-1' }],
      },
      {
        code: 'STD-2',
        title: 'Unrelated',
        objective: 'N/A',
        scope: 'N/A',
        requirements: [],
        frameworkMappings: [{ frameworkId: 'fw2', standardCode: 'X-1' }],
      },
    ]);

    const result = await s.listStandardsByFramework('org1', 'fw1');
    expect(result).toHaveLength(1);
    expect(result[0].code).toBe('STD-1');
  });

  it('returns an empty array for an org with no standards documents', async () => {
    const result = await s.listStandardsByFramework('org-none', 'fw1');
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn nx test shared -- fake-notes.contract.unit.test.ts`
Expected: FAIL — `s.listStandardsByFramework is not a function`

- [ ] **Step 3: Add the interface method**

In `libs/shared/src/strategies/notes.ts`, in the `NotesStrategy` interface, change line 445 from:

```ts
  listControlsByFramework(frameworkId: string): Promise<FrameworkControl[]>;
```

to:

```ts
  listControlsByFramework(frameworkId: string): Promise<FrameworkControl[]>;
  listStandardsByFramework(orgId: string, frameworkId: string): Promise<DocumentStandard[]>;
```

- [ ] **Step 4: Implement in FakeNotesStrategy**

In `libs/shared/src/strategies/fakes/fake-notes.ts`, after the `listControlsByFramework` method (line 95), add:

```ts

  async listStandardsByFramework(orgId: string, frameworkId: string): Promise<DocumentStandard[]> {
    const docs = [...this.docs.values()].filter((d) => d.orgId === orgId);
    const seen = new Set<string>();
    const result: DocumentStandard[] = [];
    for (const doc of docs) {
      for (const std of doc.standards) {
        if (std.frameworkMappings.some((m) => m.frameworkId === frameworkId) && !seen.has(std.code)) {
          seen.add(std.code);
          result.push(std);
        }
      }
    }
    return result;
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `yarn nx test shared -- fake-notes.contract.unit.test.ts`
Expected: PASS

- [ ] **Step 6: Lint, build, commit**

```bash
npx prettier --write libs/shared/src/strategies/notes.ts libs/shared/src/strategies/fakes/fake-notes.ts libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts
yarn nx lint shared
yarn nx build shared
git add libs/shared/src/strategies/notes.ts libs/shared/src/strategies/fakes/fake-notes.ts libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts
git commit -m "feat(shared): add NotesStrategy.listStandardsByFramework"
```

---

### Task 4: AuthStrategy.listOrgMembers (Fake)

**Files:**
- Modify: `libs/shared/src/strategies/auth.ts:18-74` (add `OrgMember` type + interface method)
- Modify: `libs/shared/src/strategies/fakes/fake-auth.ts` (add seed map + method)
- Test: `libs/shared/src/strategies/__tests__/auth.contract.unit.test.ts`

**Interfaces:**
- Produces: `OrgMember = { userId: string; displayName?: string; email?: string; role: string }` (exported from `libs/shared/src/strategies/auth.ts`), `AuthStrategy.listOrgMembers(orgId: string): Promise<OrgMember[]>`. Tasks 7, 9, 10 depend on this exact name/signature/shape.
- `FakeAuthStrategy` gets a test-only helper `seedOrgMember(orgId: string, member: OrgMember): void` (same pattern as `FakeNotesStrategy.seedFramework`).

- [ ] **Step 1: Write the failing test**

The auth contract test (`runAuthContract`) is shared across strategy implementations and doesn't have a seeding hook for org membership in its generic helper interface — add a strategy-specific test instead, in a new file `libs/shared/src/strategies/fakes/__tests__/fake-auth.unit.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { FakeAuthStrategy } from '../fake-auth';

describe('FakeAuthStrategy.listOrgMembers', () => {
  let strategy: FakeAuthStrategy;

  beforeEach(() => {
    strategy = new FakeAuthStrategy();
  });

  it('returns an empty array when no members are seeded', async () => {
    expect(await strategy.listOrgMembers('org1')).toEqual([]);
  });

  it('returns seeded members for the given org only', async () => {
    strategy.seedOrgMember('org1', { userId: 'u1', displayName: 'Alice', email: 'alice@x.com', role: 'owner' });
    strategy.seedOrgMember('org2', { userId: 'u2', displayName: 'Bob', email: 'bob@x.com', role: 'viewer' });

    const members = await strategy.listOrgMembers('org1');
    expect(members).toEqual([
      { userId: 'u1', displayName: 'Alice', email: 'alice@x.com', role: 'owner' },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn nx test shared -- fake-auth.unit.test.ts`
Expected: FAIL — `strategy.seedOrgMember is not a function`

- [ ] **Step 3: Add the `OrgMember` type and interface method**

In `libs/shared/src/strategies/auth.ts`, after the `OAuthStartResult` interface (line 43), add:

```ts

export interface OrgMember {
  userId: string;
  displayName?: string;
  email?: string;
  role: string;
}
```

Then add to the `AuthStrategy` interface (after `completeOAuth`, line 73):

```ts
  completeOAuth(provider: OAuthProvider, code: string, state: string): Promise<AuthSession>;
  listOrgMembers(orgId: string): Promise<OrgMember[]>;
```

- [ ] **Step 4: Implement in FakeAuthStrategy**

In `libs/shared/src/strategies/fakes/fake-auth.ts`, update the import at the top:

```ts
import type {
  AuthSession,
  AuthStrategy,
  MagicLinkRequest,
  OAuthProvider,
  OAuthStartResult,
  OrgMember,
  VerifiedToken,
} from '../auth';
```

Add a private field to the class (alongside the other maps, e.g. after `private lastOAuthState: string | null = null;`):

```ts
  private readonly orgMembers = new Map<string, OrgMember[]>();
```

Add these two methods (e.g. right before the closing `}` of the class, after `completeOAuth`):

```ts

  seedOrgMember(orgId: string, member: OrgMember): void {
    const existing = this.orgMembers.get(orgId) ?? [];
    this.orgMembers.set(orgId, [...existing, member]);
  }

  async listOrgMembers(orgId: string): Promise<OrgMember[]> {
    return this.orgMembers.get(orgId) ?? [];
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `yarn nx test shared -- fake-auth.unit.test.ts`
Expected: PASS

- [ ] **Step 6: Lint, build, commit**

```bash
npx prettier --write libs/shared/src/strategies/auth.ts libs/shared/src/strategies/fakes/fake-auth.ts libs/shared/src/strategies/fakes/__tests__/fake-auth.unit.test.ts
yarn nx lint shared
yarn nx build shared
git add libs/shared/src/strategies/auth.ts libs/shared/src/strategies/fakes/fake-auth.ts libs/shared/src/strategies/fakes/__tests__/fake-auth.unit.test.ts
git commit -m "feat(shared): add AuthStrategy.listOrgMembers"
```

---

### Task 5: Supabase migration — exception columns + organization_members RLS fix

**Files:**
- Create: `supabase/migrations/20260802000001_exceptions_owner_fields.sql`

**Interfaces:**
- Produces: `exceptions.statement text not null`, `exceptions.owner_id uuid`, `exceptions.compensating_controls text`. Task 6 (`SupabaseNotesStrategy`) reads/writes these column names.
- Produces: `organization_members` SELECT is readable by any member of the same org (was self-row-only). Task 7 (`SupabaseAuthStrategy.listOrgMembers`) depends on this.

No JS test — Supabase migrations are verified by applying them to a local/dev Supabase instance. This task's "test" is running the migration and confirming no SQL errors.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260802000001_exceptions_owner_fields.sql`:

```sql
-- Exceptions: add gap-statement, owner, and compensating-controls fields.
alter table public.exceptions
  add column statement text not null default '',
  add column owner_id uuid references auth.users(id),
  add column compensating_controls text;

alter table public.exceptions alter column statement drop default;

-- organization_members was scaffolded self-row-only ("v2, no API/UI in v1").
-- The Exception "Owner" picker needs to list all members of the current org.
drop policy if exists "org_members_own" on public.organization_members;

create policy "org_members_read_own_org"
  on public.organization_members for select
  using (
    exists (
      select 1 from public.organization_members self
      where self.org_id = organization_members.org_id
        and self.user_id = auth.uid()
    )
  );

create policy "org_members_write_own_row"
  on public.organization_members for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

- [ ] **Step 2: Apply and verify**

Run: `npx supabase db push` (against the local/dev Supabase project configured in this workspace)
Expected: migration applies with no errors; `select * from public.exceptions limit 1;` shows the 3 new columns.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260802000001_exceptions_owner_fields.sql
git commit -m "feat(db): add exception owner/statement fields, fix organization_members read RLS"
```

---

### Task 6: SupabaseNotesStrategy — listStandardsByFramework + exception field mapping

**Files:**
- Modify: `apps/microservices/notes/src/app/supabase-notes.strategy.ts:145-166` (insert method after `listControlsByFramework`)
- Modify: `apps/microservices/notes/src/app/supabase-notes.strategy.ts:1019-1097` (`createException`, `updateException`, `toException`)

**Interfaces:**
- Consumes: `Exception`, `ExceptionInput`, `ExceptionPatch`, `DocumentStandard` from Task 2/3 (already imported in this file).
- Produces: same `listStandardsByFramework`/exception-field behavior as `FakeNotesStrategy`, backed by Postgres.

This task has no new unit test (integration-only strategy, exercised by the Supabase project directly) — verification is via `yarn nx build notes` (type-checks against the `NotesStrategy` interface) and manual smoke test against a local Supabase instance.

- [ ] **Step 1: Implement listStandardsByFramework**

In `apps/microservices/notes/src/app/supabase-notes.strategy.ts`, after the `listControlsByFramework` method (after line 166, before `listOrganizations`), add:

```ts

  async listStandardsByFramework(orgId: string, frameworkId: string): Promise<DocumentStandard[]> {
    const { data, error } = await this.db
      .from('generated_standards')
      .select('standards')
      .eq('org_profile_id', orgId)
      .eq('status', 'completed');
    const rows = ok(data, error) as Array<{ standards: DocumentStandard[] }>;
    const seen = new Set<string>();
    const result: DocumentStandard[] = [];
    for (const row of rows) {
      for (const std of row.standards ?? []) {
        if (
          std.frameworkMappings?.some((m) => m.frameworkId === frameworkId) &&
          !seen.has(std.code)
        ) {
          seen.add(std.code);
          result.push(std);
        }
      }
    }
    return result;
  }
```

- [ ] **Step 2: Update createException**

Replace the `.insert({...})` body inside `createException` (lines 1022-1031):

```ts
      .insert({
        org_id: orgId,
        user_id: userId,
        control_code: data.controlCode,
        standard_code: data.standardCode ?? null,
        framework_id: data.frameworkId,
        title: data.title,
        statement: data.statement,
        justification: data.justification,
        owner_id: data.ownerId,
        compensating_controls: data.compensatingControls ?? null,
        expires_at: data.expiresAt ?? null,
      })
```

- [ ] **Step 3: Update updateException**

In `updateException` (lines 1043-1051), add the new patchable fields:

```ts
  async updateException(id: string, patch: ExceptionPatch): Promise<Exception> {
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.title !== undefined) update['title'] = patch.title;
    if (patch.statement !== undefined) update['statement'] = patch.statement;
    if (patch.justification !== undefined) update['justification'] = patch.justification;
    if (patch.ownerId !== undefined) update['owner_id'] = patch.ownerId;
    if (patch.compensatingControls !== undefined)
      update['compensating_controls'] = patch.compensatingControls;
    if ('expiresAt' in patch) update['expires_at'] = patch.expiresAt;
    const { data, error } = await this.db
      .from('exceptions')
      .update(update)
      .eq('id', id)
      .select()
      .single();
    return this.toException(ok(data, error));
  }
```

- [ ] **Step 4: Update toException**

Replace the `toException` method (lines 1082-1097):

```ts
  private toException(row: Record<string, unknown>): Exception {
    return {
      id: row['id'] as string,
      orgId: row['org_id'] as string,
      userId: row['user_id'] as string,
      controlCode: row['control_code'] as string,
      standardCode: row['standard_code'] as string | undefined,
      frameworkId: row['framework_id'] as string,
      title: row['title'] as string,
      statement: row['statement'] as string,
      justification: row['justification'] as string,
      ownerId: row['owner_id'] as string,
      compensatingControls: row['compensating_controls'] as string | undefined,
      status: row['status'] as Exception['status'],
      expiresAt: row['expires_at'] as string | null,
      createdAt: row['created_at'] as string,
      updatedAt: row['updated_at'] as string,
    };
  }
```

- [ ] **Step 5: Lint, build, commit**

```bash
npx prettier --write apps/microservices/notes/src/app/supabase-notes.strategy.ts
yarn nx lint notes
yarn nx build notes
git add apps/microservices/notes/src/app/supabase-notes.strategy.ts
git commit -m "feat(notes): implement listStandardsByFramework, exception owner fields"
```

---

### Task 7: SupabaseAuthStrategy — listOrgMembers

**Files:**
- Modify: `libs/auth-strategies/supabase/src/lib/supabase-auth.strategy.ts:18` (add method)

**Interfaces:**
- Consumes: `OrgMember` from Task 4, `organization_members`/`profiles` tables (Task 5 migration for the RLS fix).
- Produces: `SupabaseAuthStrategy.listOrgMembers(orgId: string): Promise<OrgMember[]>`.

No new unit test (Supabase-backed, integration-only) — verified via `yarn nx build auth` (type-checks against `AuthStrategy`) and manual smoke test.

- [ ] **Step 1: Update the import**

In `libs/auth-strategies/supabase/src/lib/supabase-auth.strategy.ts`, change the import block (lines 3-11):

```ts
import {
  TokenExpiredError,
  type AuthSession,
  type AuthStrategy,
  type MagicLinkRequest,
  type OAuthProvider,
  type OAuthStartResult,
  type OrgMember,
  type VerifiedToken,
} from '@icore/shared';
```

- [ ] **Step 2: Implement listOrgMembers**

Add this method to the `SupabaseAuthStrategy` class, e.g. after `getRole` (after line 193, before `private toSession`):

```ts

  async listOrgMembers(orgId: string): Promise<OrgMember[]> {
    const { data: members, error } = await this.client
      .from('organization_members')
      .select('user_id, role')
      .eq('org_id', orgId);
    if (error) throw new Error(error.message);
    const rows = (members ?? []) as Array<{ user_id: string; role: string }>;
    if (rows.length === 0) return [];

    const { data: profiles, error: profilesError } = await this.client
      .from('profiles')
      .select('id, email, display_name')
      .in(
        'id',
        rows.map((r) => r.user_id),
      );
    if (profilesError) throw new Error(profilesError.message);
    const profileMap = new Map(
      (profiles ?? []).map((p) => {
        const row = p as { id: string; email?: string; display_name?: string };
        return [row.id, row];
      }),
    );

    return rows.map((r) => {
      const profile = profileMap.get(r.user_id);
      return {
        userId: r.user_id,
        role: r.role,
        email: profile?.email,
        displayName: profile?.display_name,
      };
    });
  }
```

- [ ] **Step 3: Lint, build, commit**

```bash
npx prettier --write libs/auth-strategies/supabase/src/lib/supabase-auth.strategy.ts
yarn nx lint auth-strategies-supabase
yarn nx build auth-strategies-supabase
git add libs/auth-strategies/supabase/src/lib/supabase-auth.strategy.ts
git commit -m "feat(auth): implement SupabaseAuthStrategy.listOrgMembers"
```

(If `yarn nx lint auth-strategies-supabase` reports an unknown project, run `yarn nx show projects | grep auth-strategies` first to confirm the exact project name and use that instead.)

---

### Task 8: MS message-pattern controllers

**Files:**
- Modify: `apps/microservices/notes/src/app/notes.controller.ts` (add `@MessagePattern('notes.standards.by-framework')`)
- Modify: `apps/microservices/auth/src/app/auth.controller.ts` (add `@MessagePattern('auth.org.members.list')`)

**Interfaces:**
- Consumes: `strategy.listStandardsByFramework` (Task 6), `strategy.listOrgMembers` (Task 7).
- Produces: TCP message patterns `notes.standards.by-framework` and `auth.org.members.list`, consumed by Task 9's gateway client services.

- [ ] **Step 1: Add the notes MS handler**

In `apps/microservices/notes/src/app/notes.controller.ts`, find the `listControls` handler (`@MessagePattern` for `listControlsByFramework`, mirroring the gateway's `@Get('frameworks/:id/controls')` at line 68-72 of the gateway controller — the MS-side equivalent is the message-pattern handler near the top of this file, same pattern as `notes.exceptions.list` at line 231). Add immediately after it:

```ts
  @MessagePattern('notes.standards.by-framework')
  listStandardsByFramework(
    @Payload() payload: { orgId: string; frameworkId: string },
  ): Promise<DocumentStandard[]> {
    return this.strategy.listStandardsByFramework(payload.orgId, payload.frameworkId);
  }
```

Ensure `DocumentStandard` is imported at the top of the file (check the existing `import type { ... } from '@icore/shared'` block; add `DocumentStandard` to it if not already present).

- [ ] **Step 2: Add the auth MS handler**

In `apps/microservices/auth/src/app/auth.controller.ts`, update the import block (lines 4-11):

```ts
import {
  TokenExpiredError,
  type AuthSession,
  type AuthStrategy,
  type OAuthProvider,
  type OAuthStartResult,
  type OrgMember,
  type VerifiedToken,
} from '@icore/shared';
```

Add this handler after `getProfile` (after line 135, before `updateProfile`):

```ts

  @MessagePattern('auth.org.members.list')
  listOrgMembers(@Payload() payload: { orgId: string }): Promise<OrgMember[]> {
    return this.strategy.listOrgMembers(payload.orgId);
  }
```

- [ ] **Step 3: Lint, build, commit**

```bash
npx prettier --write apps/microservices/notes/src/app/notes.controller.ts apps/microservices/auth/src/app/auth.controller.ts
yarn nx lint notes
yarn nx lint auth
yarn nx build notes
yarn nx build auth
git add apps/microservices/notes/src/app/notes.controller.ts apps/microservices/auth/src/app/auth.controller.ts
git commit -m "feat(notes,auth): add standards-by-framework and org-members MS handlers"
```

---

### Task 9: Gateway wiring — client services + HTTP controllers

**Files:**
- Modify: `libs/notes-client/src/lib/notes-client.service.ts:70-74` (add `listStandardsByFramework`)
- Modify: `libs/auth-client/src/lib/auth-client.service.ts:9-13` (add `listOrgMembers`)
- Modify: `apps/api/src/app/notes/notes.controller.ts:68-72` (add `GET /notes/frameworks/:id/standards`)
- Modify: `apps/api/src/app/auth/auth.controller.ts:39-43` (add `GET /auth/org/members`)

**Interfaces:**
- Consumes: MS message patterns from Task 8.
- Produces: `GET /api/notes/frameworks/:frameworkId/standards?orgId=...` and `GET /api/auth/org/members?orgId=...`. Task 10's client hooks call these exact paths.

- [ ] **Step 1: Add NotesClientService method**

In `libs/notes-client/src/lib/notes-client.service.ts`, add `DocumentStandard` to the existing type-only import block if not already there, then add this method after `listControlsByFramework` (after line 74):

```ts

  listStandardsByFramework(orgId: string, frameworkId: string): Promise<DocumentStandard[]> {
    return firstValueFrom(
      this.client.send<DocumentStandard[]>('notes.standards.by-framework', { orgId, frameworkId }),
    );
  }
```

- [ ] **Step 2: Add AuthClientService method**

In `libs/auth-client/src/lib/auth-client.service.ts`, update the import (line 4):

```ts
import type { AuthSession, OAuthProvider, OAuthStartResult, OrgMember, VerifiedToken } from '@icore/shared';
```

Add this method after `getProfile` (after line 60, before `updateProfile`):

```ts

  listOrgMembers(orgId: string): Promise<OrgMember[]> {
    return firstValueFrom(this.client.send<OrgMember[]>('auth.org.members.list', { orgId }));
  }
```

- [ ] **Step 3: Add the gateway notes HTTP endpoint**

In `apps/api/src/app/notes/notes.controller.ts`, add `DocumentStandard` to the type-only import block, then add this endpoint after `listControls` (after line 72):

```ts

  @Get('frameworks/:id/standards')
  @ApiOperation({ summary: 'List standards mapped to a framework for the current org' })
  listStandards(@Query('orgId') orgId: string, @Param('id') id: string) {
    if (!orgId) throw new BadRequestException('orgId required');
    return this.notes.listStandardsByFramework(orgId, id);
  }
```

- [ ] **Step 4: Add the gateway auth HTTP endpoint**

In `apps/api/src/app/auth/auth.controller.ts`, add this endpoint after `me` (after line 145, before `setRole`):

```ts

  @Get('org/members')
  @ApiOperation({ summary: 'List members of an organization' })
  listOrgMembers(@Query('orgId') orgId: string) {
    if (!orgId) throw new BadRequestException('orgId required');
    return this.authClient.listOrgMembers(orgId);
  }
```

`BadRequestException` and `Query` are already imported in this file (see lines 1-11).

- [ ] **Step 5: Lint, build, commit**

```bash
npx prettier --write libs/notes-client/src/lib/notes-client.service.ts libs/auth-client/src/lib/auth-client.service.ts apps/api/src/app/notes/notes.controller.ts apps/api/src/app/auth/auth.controller.ts
yarn nx lint notes-client
yarn nx lint auth-client
yarn nx lint api
yarn nx build api
git add libs/notes-client/src/lib/notes-client.service.ts libs/auth-client/src/lib/auth-client.service.ts apps/api/src/app/notes/notes.controller.ts apps/api/src/app/auth/auth.controller.ts
git commit -m "feat(api): expose standards-by-framework and org-members endpoints"
```

---

### Task 10: Client query hooks

**Files:**
- Modify: `apps/client/src/queries/notes.ts` (add `useFrameworkStandards`)
- Create/Modify: `apps/client/src/queries/org-members.ts` (new file for `useOrgMembers`)

**Interfaces:**
- Produces: `useFrameworkStandards(orgId: string, frameworkId: string)` returning `UseQueryResult<DocumentStandard[]>`; `useOrgMembers(orgId: string)` returning `UseQueryResult<OrgMember[]>`. Task 11 imports both.

- [ ] **Step 1: Add useFrameworkStandards**

In `apps/client/src/queries/notes.ts`, add this hook after `useFrameworkControls` (after line 69):

```ts

export function useFrameworkStandards(orgId: string, frameworkId: string) {
  return useQuery<DocumentStandard[]>({
    queryKey: ['notes', 'orgs', orgId, 'frameworks', frameworkId, 'standards'],
    queryFn: () =>
      api<DocumentStandard[]>(
        `/notes/frameworks/${frameworkId}/standards?orgId=${encodeURIComponent(orgId)}`,
      ),
    enabled: !!orgId && !!frameworkId,
  });
}
```

(`DocumentStandard` is already imported/re-exported at the top of this file — line 6-11.)

- [ ] **Step 2: Create useOrgMembers**

Create `apps/client/src/queries/org-members.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { OrgMember } from '@icore/shared';

export type { OrgMember };

export function useOrgMembers(orgId: string) {
  return useQuery<OrgMember[]>({
    queryKey: ['auth', 'org', orgId, 'members'],
    queryFn: () => api<OrgMember[]>(`/auth/org/members?orgId=${encodeURIComponent(orgId)}`),
    enabled: !!orgId,
  });
}
```

- [ ] **Step 3: Lint, build, commit**

```bash
npx prettier --write apps/client/src/queries/notes.ts apps/client/src/queries/org-members.ts
yarn nx lint client
yarn nx build client
git add apps/client/src/queries/notes.ts apps/client/src/queries/org-members.ts
git commit -m "feat(client): add useFrameworkStandards and useOrgMembers hooks"
```

---

### Task 11: Rework the New Exception dialog + i18n

**Files:**
- Modify: `apps/client/src/routes/_dashboard/exceptions.tsx` (imports, state, submit handler, dialog form body)
- Modify: `libs/template-shared/src/lib/i18n/locales/en.ts:482-502`
- Modify: `libs/template-shared/src/lib/i18n/locales/ru.ts:448-469`
- Modify: `libs/template-shared/src/lib/i18n/locales/he.ts:443-458`
- Modify: `libs/template-shared/src/lib/i18n/locales/es.ts:461-482`
- Test: `apps/client/src/routes/_dashboard/__tests__/exceptions.unit.test.tsx` (new)

**Interfaces:**
- Consumes: `Combobox` (Task 1), `Exception`/`ExceptionInput` (Task 2), `useFrameworkStandards`/`useFrameworkControls`/`useFrameworks` (Task 10 + existing), `useOrgMembers` (Task 10).

- [ ] **Step 1: Write the failing test**

Create `apps/client/src/routes/_dashboard/__tests__/exceptions.unit.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { createIcoreI18n, ICORE_LOCALES } from '@icore/template-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const createMutate = vi.fn();

vi.mock('@/queries/exceptions', () => ({
  useExceptions: () => ({ data: [], isPending: false }),
  useCreateException: () => ({ mutate: createMutate, isPending: false }),
  useApproveException: () => ({ mutate: vi.fn() }),
  useRejectException: () => ({ mutate: vi.fn() }),
  useDeleteException: () => ({ mutate: vi.fn() }),
}));

vi.mock('@/queries/notes', () => ({
  useFrameworks: () => ({
    data: [{ id: 'fw1', slug: 'soc2', name: 'SOC 2', description: '', version: '1', category: 'security' }],
  }),
  useFrameworkStandards: () => ({
    data: [{ code: 'STD-1', title: 'Access Control', objective: '', scope: '', requirements: [], frameworkMappings: [] }],
  }),
  useFrameworkControls: () => ({
    data: [{ id: 'c1', frameworkId: 'fw1', code: 'AC-1', title: 'Access Control', description: '', category: '' }],
  }),
}));

vi.mock('@/queries/org-members', () => ({
  useOrgMembers: () => ({
    data: [{ userId: 'u1', displayName: 'Alice', email: 'alice@x.com', role: 'owner' }],
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

describe('ExceptionsPage — New Exception dialog', () => {
  beforeEach(() => {
    createMutate.mockClear();
  });

  it('renders all 8 fields in order when the dialog opens', async () => {
    const { ExceptionsPage } = await import('../exceptions');
    render(wrap(<ExceptionsPage />));
    fireEvent.click(screen.getByText('New Exception'));

    const labels = screen.getAllByText(
      /^(Title|Framework|Standard|Control Code|Statement|Justification|Owner|Compensating Controls)$/,
    );
    expect(labels.map((l) => l.textContent)).toEqual([
      'Title',
      'Framework',
      'Standard',
      'Control Code',
      'Statement',
      'Justification',
      'Owner',
      'Compensating Controls',
    ]);
  });

  it('resets Standard and Control code comboboxes when Framework changes', async () => {
    const { ExceptionsPage } = await import('../exceptions');
    render(wrap(<ExceptionsPage />));
    fireEvent.click(screen.getByText('New Exception'));

    const comboboxes = screen.getAllByRole('combobox');
    fireEvent.click(comboboxes[0]); // first combobox in field order = Framework
    fireEvent.click(screen.getByText('SOC2 — SOC 2'));

    // After picking a framework, Standard/Control comboboxes show their placeholders again (reset).
    expect(screen.getByText('Select standard…')).toBeTruthy();
    expect(screen.getByText('Select control…')).toBeTruthy();
  });
});
```

Note: `ExceptionsPage` is currently not exported from `apps/client/src/routes/_dashboard/exceptions.tsx` (only `Route` is exported, `ExceptionsPage` is a local function). Step 2 will export it.

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn nx test client -- exceptions.unit.test.tsx`
Expected: FAIL — `ExceptionsPage` is not exported, and/or field labels don't match current 4-field form.

- [ ] **Step 3: Rewrite exceptions.tsx**

Replace the full contents of `apps/client/src/routes/_dashboard/exceptions.tsx` with:

```tsx
import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Plus, ShieldAlert } from 'lucide-react';
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
  useExceptions,
  useCreateException,
  useApproveException,
  useRejectException,
  useDeleteException,
  type Exception,
  type ExceptionInput,
} from '@/queries/exceptions';
import { useFrameworks, useFrameworkStandards, useFrameworkControls } from '@/queries/notes';
import { useOrgMembers } from '@/queries/org-members';

export const Route = createFileRoute('/_dashboard/exceptions')({
  component: ExceptionsPage,
});

const STATUS_COLORS: Record<Exception['status'], string> = {
  pending: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  approved: 'bg-green-500/10 text-green-400 border-green-500/20',
  rejected: 'bg-red-500/10 text-red-400 border-red-500/20',
  expired: 'bg-muted text-muted-foreground border-border',
};

const EMPTY_FORM: ExceptionInput = {
  title: '',
  frameworkId: '',
  standardCode: '',
  controlCode: '',
  statement: '',
  justification: '',
  ownerId: '',
  compensatingControls: '',
};

export function ExceptionsPage() {
  const { t } = useTranslation();
  const { activeOrgId } = useActiveOrgStore();
  const orgId = activeOrgId ?? '';

  const { data: exceptions = [], isPending } = useExceptions(orgId);
  const { data: frameworks = [] } = useFrameworks();
  const { data: members = [] } = useOrgMembers(orgId);
  const createMut = useCreateException(orgId);
  const approveMut = useApproveException(orgId);
  const rejectMut = useRejectException(orgId);
  const deleteMut = useDeleteException(orgId);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ExceptionInput>(EMPTY_FORM);

  const { data: standards = [] } = useFrameworkStandards(orgId, form.frameworkId);
  const { data: controls = [] } = useFrameworkControls(form.frameworkId);

  const frameworkOptions = frameworks.map((fw) => ({
    value: fw.id,
    label: `${fw.slug.toUpperCase()} — ${fw.name}`,
  }));
  const standardOptions = standards.map((s) => ({ value: s.code, label: `${s.code} — ${s.title}` }));
  const controlOptions = controls.map((c) => ({ value: c.code, label: `${c.code} — ${c.title}` }));
  const ownerOptions = members.map((m) => ({
    value: m.userId,
    label: m.displayName ?? m.email ?? m.userId,
  }));

  function handleFrameworkChange(frameworkId: string) {
    setForm((f) => ({ ...f, frameworkId, standardCode: '', controlCode: '' }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (
      !form.title ||
      !form.frameworkId ||
      !form.controlCode ||
      !form.statement ||
      !form.justification ||
      !form.ownerId
    )
      return;
    createMut.mutate(form, {
      onSuccess: () => {
        setOpen(false);
        setForm(EMPTY_FORM);
      },
    });
  }

  return (
    <PageLayout title={t('nav.exceptions')}>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{t('exceptions.subtitle')}</p>
        <Button size="sm" onClick={() => setOpen(true)} disabled={!orgId}>
          <Plus size={14} className="mr-1.5" />
          {t('exceptions.addException')}
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
      ) : exceptions.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
          <ShieldAlert size={32} className="opacity-30" />
          <p className="text-sm">{t('exceptions.empty')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {exceptions.map((exc) => (
            <div
              key={exc.id}
              className="flex items-start gap-4 bg-surface border border-border rounded-xl p-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-sm text-foreground truncate">{exc.title}</span>
                  <span
                    className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border ${STATUS_COLORS[exc.status]}`}
                  >
                    {t(`exceptions.status.${exc.status}`)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{exc.justification}</p>
                <p className="text-[11px] text-muted-foreground/60 mt-1">
                  {exc.controlCode} ·{' '}
                  {frameworks.find((f) => f.id === exc.frameworkId)?.slug.toUpperCase() ??
                    exc.frameworkId}
                </p>
              </div>
              <div className="flex gap-1.5 shrink-0">
                {exc.status === 'pending' && (
                  <>
                    <button
                      type="button"
                      onClick={() => approveMut.mutate(exc.id)}
                      className="text-xs px-2 py-1 rounded bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 transition-colors"
                    >
                      {t('exceptions.approve')}
                    </button>
                    <button
                      type="button"
                      onClick={() => rejectMut.mutate(exc.id)}
                      className="text-xs px-2 py-1 rounded bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors"
                    >
                      {t('exceptions.reject')}
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => deleteMut.mutate(exc.id)}
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
            <DialogTitle>{t('exceptions.addException')}</DialogTitle>
            <DialogDescription>{t('exceptions.addDescription')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>{t('exceptions.title')}</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder={t('exceptions.titlePlaceholder')}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>{t('exceptions.framework')}</Label>
              <Combobox
                options={frameworkOptions}
                value={form.frameworkId}
                onChange={handleFrameworkChange}
                placeholder={t('exceptions.selectFramework')}
                searchPlaceholder={t('exceptions.searchFramework')}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('exceptions.standard')}</Label>
              <Combobox
                options={standardOptions}
                value={form.standardCode ?? ''}
                onChange={(v) => setForm((f) => ({ ...f, standardCode: v }))}
                placeholder={t('exceptions.selectStandard')}
                searchPlaceholder={t('exceptions.searchStandard')}
                disabled={!form.frameworkId}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('exceptions.controlCode')}</Label>
              <Combobox
                options={controlOptions}
                value={form.controlCode}
                onChange={(v) => setForm((f) => ({ ...f, controlCode: v }))}
                placeholder={t('exceptions.selectControl')}
                searchPlaceholder={t('exceptions.searchControl')}
                disabled={!form.frameworkId}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('exceptions.statement')}</Label>
              <textarea
                value={form.statement}
                onChange={(e) => setForm((f) => ({ ...f, statement: e.target.value }))}
                placeholder={t('exceptions.statementPlaceholder')}
                rows={3}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500/40 resize-none"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>{t('exceptions.justification')}</Label>
              <textarea
                value={form.justification}
                onChange={(e) => setForm((f) => ({ ...f, justification: e.target.value }))}
                placeholder={t('exceptions.justificationPlaceholder')}
                rows={3}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500/40 resize-none"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>{t('exceptions.owner')}</Label>
              <Combobox
                options={ownerOptions}
                value={form.ownerId}
                onChange={(v) => setForm((f) => ({ ...f, ownerId: v }))}
                placeholder={t('exceptions.selectOwner')}
                searchPlaceholder={t('exceptions.searchOwner')}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('exceptions.compensatingControls')}</Label>
              <textarea
                value={form.compensatingControls}
                onChange={(e) => setForm((f) => ({ ...f, compensatingControls: e.target.value }))}
                placeholder={t('exceptions.compensatingControlsPlaceholder')}
                rows={3}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500/40 resize-none"
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

In `libs/template-shared/src/lib/i18n/locales/en.ts`, replace lines 482-502 with:

```ts
  exceptions: {
    subtitle: 'Track control exceptions and approved deviations',
    addException: 'New Exception',
    addDescription: 'Request an exception when a control cannot be fully implemented',
    empty: 'No exceptions yet',
    title: 'Title',
    titlePlaceholder: 'Brief description of the exception',
    framework: 'Framework',
    selectFramework: 'Select framework…',
    searchFramework: 'Search frameworks…',
    standard: 'Standard',
    selectStandard: 'Select standard…',
    searchStandard: 'Search standards…',
    controlCode: 'Control Code',
    selectControl: 'Select control…',
    searchControl: 'Search controls…',
    statement: 'Statement',
    statementPlaceholder: 'Quote or paraphrase the standard text that is not met',
    justification: 'Justification',
    justificationPlaceholder: 'Why this control cannot be met',
    owner: 'Owner',
    selectOwner: 'Select owner…',
    searchOwner: 'Search members…',
    compensatingControls: 'Compensating Controls',
    compensatingControlsPlaceholder: 'Compensating controls in place, if any',
    approve: 'Approve',
    reject: 'Reject',
    status: {
      pending: 'Pending',
      approved: 'Approved',
      rejected: 'Rejected',
      expired: 'Expired',
    },
  },
```

- [ ] **Step 5: Add i18n keys — ru.ts, he.ts, es.ts**

In `libs/template-shared/src/lib/i18n/locales/ru.ts`, replace lines 448-469 (the `exceptions: {...}` block) with:

```ts
  exceptions: {
    subtitle: 'Отслеживание исключений из требований контролей',
    addException: 'Новое исключение',
    addDescription: 'Запрос исключения, когда контроль не может быть полностью реализован',
    empty: 'Исключений пока нет',
    title: 'Название',
    titlePlaceholder: 'Краткое описание исключения',
    framework: 'Фреймворк',
    selectFramework: 'Выберите фреймворк…',
    searchFramework: 'Поиск фреймворков…',
    standard: 'Стандарт',
    selectStandard: 'Выберите стандарт…',
    searchStandard: 'Поиск стандартов…',
    controlCode: 'Код контроля',
    selectControl: 'Выберите контроль…',
    searchControl: 'Поиск контролей…',
    statement: 'Формулировка',
    statementPlaceholder: 'Цитата или пересказ текста стандарта, который не выполняется',
    justification: 'Обоснование',
    justificationPlaceholder: 'Почему контроль не может быть выполнен',
    owner: 'Владелец',
    selectOwner: 'Выберите владельца…',
    searchOwner: 'Поиск участников…',
    compensatingControls: 'Компенсирующие меры',
    compensatingControlsPlaceholder: 'Компенсирующие меры, если применяются',
    approve: 'Одобрить',
    reject: 'Отклонить',
    status: {
      pending: 'На рассмотрении',
      approved: 'Одобрено',
      rejected: 'Отклонено',
      expired: 'Истекло',
    },
  },
```

In `libs/template-shared/src/lib/i18n/locales/he.ts`, replace lines 443-458 with:

```ts
  exceptions: {
    subtitle: 'מעקב אחר חריגות בקרה וסטיות מאושרות',
    addException: 'חריגה חדשה',
    addDescription: 'בקשת חריגה כאשר לא ניתן ליישם בקרה במלואה',
    empty: 'אין חריגות עדיין',
    title: 'כותרת',
    titlePlaceholder: 'תיאור קצר של החריגה',
    framework: 'מסגרת',
    selectFramework: 'בחר מסגרת…',
    searchFramework: 'חיפוש מסגרות…',
    standard: 'תקן',
    selectStandard: 'בחר תקן…',
    searchStandard: 'חיפוש תקנים…',
    controlCode: 'קוד בקרה',
    selectControl: 'בחר בקרה…',
    searchControl: 'חיפוש בקרות…',
    statement: 'הצהרה',
    statementPlaceholder: 'ציטוט או תיאור של נוסח התקן שאינו מתקיים',
    justification: 'הצדקה',
    justificationPlaceholder: 'מדוע לא ניתן לעמוד בבקרה',
    owner: 'בעלים',
    selectOwner: 'בחר בעלים…',
    searchOwner: 'חיפוש חברים…',
    compensatingControls: 'בקרות מפצות',
    compensatingControlsPlaceholder: 'בקרות מפצות קיימות, אם ישנן',
    approve: 'אשר',
    reject: 'דחה',
    status: { pending: 'ממתין', approved: 'מאושר', rejected: 'נדחה', expired: 'פג תוקף' },
  },
```

In `libs/template-shared/src/lib/i18n/locales/es.ts`, replace lines 461-482 with:

```ts
  exceptions: {
    subtitle: 'Seguimiento de excepciones de controles y desviaciones aprobadas',
    addException: 'Nueva excepción',
    addDescription:
      'Solicitar una excepción cuando un control no puede implementarse completamente',
    empty: 'Sin excepciones aún',
    title: 'Título',
    titlePlaceholder: 'Breve descripción de la excepción',
    framework: 'Marco de trabajo',
    selectFramework: 'Seleccionar marco…',
    searchFramework: 'Buscar marcos…',
    standard: 'Estándar',
    selectStandard: 'Seleccionar estándar…',
    searchStandard: 'Buscar estándares…',
    controlCode: 'Código de control',
    selectControl: 'Seleccionar control…',
    searchControl: 'Buscar controles…',
    statement: 'Declaración',
    statementPlaceholder: 'Cita o paráfrasis del texto del estándar que no se cumple',
    justification: 'Justificación',
    justificationPlaceholder: 'Por qué no se puede cumplir el control',
    owner: 'Propietario',
    selectOwner: 'Seleccionar propietario…',
    searchOwner: 'Buscar miembros…',
    compensatingControls: 'Controles compensatorios',
    compensatingControlsPlaceholder: 'Controles compensatorios existentes, si los hay',
    approve: 'Aprobar',
    reject: 'Rechazar',
    status: {
      pending: 'Pendiente',
      approved: 'Aprobado',
      rejected: 'Rechazado',
      expired: 'Expirado',
    },
  },
```

- [ ] **Step 6: Run test to verify it passes**

Run: `yarn nx test client -- exceptions.unit.test.tsx`
Expected: PASS

- [ ] **Step 7: Run the full client test suite (regression check)**

Run: `yarn nx test client`
Expected: all pass — no other test imports `ExceptionsPage` or the old 4-field form structure.

- [ ] **Step 8: Lint, build, commit**

```bash
npx prettier --write apps/client/src/routes/_dashboard/exceptions.tsx apps/client/src/routes/_dashboard/__tests__/exceptions.unit.test.tsx libs/template-shared/src/lib/i18n/locales/en.ts libs/template-shared/src/lib/i18n/locales/ru.ts libs/template-shared/src/lib/i18n/locales/he.ts libs/template-shared/src/lib/i18n/locales/es.ts
yarn nx lint client
yarn nx lint template-shared
yarn nx build client
yarn nx build template-shared
git add apps/client/src/routes/_dashboard/exceptions.tsx apps/client/src/routes/_dashboard/__tests__/exceptions.unit.test.tsx libs/template-shared/src/lib/i18n/locales/en.ts libs/template-shared/src/lib/i18n/locales/ru.ts libs/template-shared/src/lib/i18n/locales/he.ts libs/template-shared/src/lib/i18n/locales/es.ts
git commit -m "feat(client): rework New Exception dialog with 8 fields and searchable dropdowns"
```

---

### Task 12: Playwright verification

Per AGENTS.md: "Any UI change MUST be verified in browser via Playwright MCP before reporting complete." Reading the code is not sufficient.

- [ ] **Step 1: Start the app**

Run: `yarn dev` (or `yarn nx run api:serve` + `yarn nx run notes:serve` + `yarn nx run auth:serve` + `yarn nx run client:serve` individually)

- [ ] **Step 2: Navigate and open the dialog**

Using the Playwright MCP tools: navigate to `http://localhost:4200/exceptions`, log in with a test account that has an active org, click "New Exception".

- [ ] **Step 3: Verify field order and behavior**

Confirm, in order: Title, Framework (combobox), Standard (combobox, disabled until Framework picked), Control Code (combobox, disabled until Framework picked), Statement (textarea), Justification (textarea), Owner (combobox), Compensating Controls (textarea). Type in each Combobox's search box and confirm the list filters. Pick a Framework, confirm Standard/Control code reset to their placeholders. Fill all required fields and submit; confirm the dialog closes and the new exception appears in the list.

- [ ] **Step 4: Screenshot as evidence**

Take a Playwright screenshot of the open dialog showing all 8 fields, attach it to the completion report.

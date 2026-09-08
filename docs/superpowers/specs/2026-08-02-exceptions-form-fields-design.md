# Exceptions — New Exception Form Rework — Design Spec

**Branch:** `feature/exceptions-form-fields`
**Date:** 2026-08-02

---

## Problem

The "New Exception" dialog (`apps/client/src/routes/_dashboard/exceptions.tsx`) has 4 fields (Control code, Framework, Title, Justification) using raw unstyled HTML `<select>`/`<textarea>` instead of shadcn components, and is missing fields required for a real compliance exception record: which Standard/requirement text isn't met, who owns the exception, and what compensating controls are in place.

---

## Scope

- Rework the New Exception dialog: new field set, new order, shadcn-consistent searchable dropdowns.
- Add `statement`, `ownerId`, `compensatingControls` to the Exception data model.
- Wire up `standardCode` in the UI (already exists on the type, never exposed).
- New backend capability: list standards for a framework (derived from existing AI-generated `StandardsDocument` content).
- New backend capability: list organization members (Owner picker), including an RLS policy fix on the currently self-only-visible `organization_members` table.
- New reusable `Combobox` UI component (searchable select), since none exists in the client's `components/ui`.

Out of scope: editing/approving exceptions UI (unchanged), org-member management UI (only read access needed here), any change to how `StandardsDocument` is generated.

---

## Field order (final)

| # | Field | Widget | Source |
|---|---|---|---|
| 1 | Title | `Input` | manual (existing) |
| 2 | Framework | searchable `Combobox` | `useFrameworks()` (existing, widget upgraded from native `<select>`) |
| 3 | Standard | searchable `Combobox`, cascades on Framework | **new** `useFrameworkStandards(frameworkId)` |
| 4 | Control code | searchable `Combobox`, cascades on Framework | `useFrameworkControls(frameworkId)` (existing hook, widget upgraded from `Input`) |
| 5 | Statement | `Textarea`, same style as Justification | manual (**new**) |
| 6 | Justification | `Textarea` | manual (existing, unchanged, kept as distinct field — see rationale below) |
| 7 | Owner | searchable `Combobox` | **new** `useOrgMembers()` |
| 8 | Compensating Controls | `Textarea` | manual (**new**) |

**Statement vs Justification rationale:** kept as two separate fields. `statement` documents the specific standard text/requirement not met (compliance-gap evidence). `justification` documents the business reason the exception was approved (risk-acceptance rationale). Standard GRC exception-register pattern; renaming would touch existing schema/i18n/tests for no benefit.

Selecting a new Framework resets Standard and Control code (dependent fields cleared).

---

## Data model (`libs/shared/src/strategies/notes.ts`)

```typescript
export interface Exception {
  id: string;
  orgId: string;
  userId: string;
  controlCode: string;
  standardCode?: string;
  frameworkId: string;
  title: string;
  statement: string;              // new
  justification: string;
  ownerId: string;                 // new
  compensatingControls?: string;   // new
  status: ExceptionStatus;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExceptionInput {
  controlCode: string;
  standardCode?: string;
  frameworkId: string;
  title: string;
  statement: string;              // new
  justification: string;
  ownerId: string;                 // new
  compensatingControls?: string;   // new
  expiresAt?: string;
}

export interface ExceptionPatch {
  statement?: string;
  ownerId?: string;
  compensatingControls?: string;
  // existing patchable fields (title, justification, expiresAt, status) unchanged
}
```

`NotesStrategy` gains:

```typescript
listStandardsByFramework(frameworkId: string): Promise<DocumentStandard[]>;
```

implemented by filtering the org's `StandardsDocument.standards` where `frameworkMappings[].frameworkId === frameworkId`, deduplicated by `code`. `FakeNotesStrategy` gets a `seedStandardsDocument`-style helper so dev/test fallback isn't empty.

`AuthStrategy` gains:

```typescript
listOrgMembers(orgId: string): Promise<{ userId: string; displayName?: string; email?: string; role: string }[]>;
```

implemented in `SupabaseAuthStrategy` via a join on `organization_members` + `auth.users`/profile data. `FakeAuthStrategy` gets a seed list for dev/tests.

---

## Backend / infra

- **Supabase migration**: `organization_members` RLS currently only allows `auth.uid() = user_id` (self-row only — table was scaffolded "v2, no API/UI in v1"). New policy needed: any authenticated member of `org_id` can `SELECT` all rows for that `org_id`. Write access stays restricted (out of scope to change here).
- **New gateway endpoints**: `GET /api/notes/frameworks/:frameworkId/standards` (notes MS/`NotesStrategy`), `GET /api/auth/org/members` (auth MS/`AuthStrategy`, since org-member records live alongside auth/profile data).
- Both new endpoints follow existing TCP strategy-factory pattern (`AuthStrategy`/`NotesStrategy` injected via factory token, no direct strategy imports in app code).

---

## Client

- New `apps/client/src/components/ui/combobox.tsx` — shadcn Popover + Command (`cmdk`) based searchable select. `cmdk` needs adding as a dependency (not currently in `package.json`). Reused for all 4 dropdowns (Framework, Standard, Control code, Owner).
- New hooks in `apps/client/src/queries/notes.ts`: `useFrameworkStandards(frameworkId)` (mirrors `useFrameworkControls`, `enabled: !!frameworkId`).
- New hook in `apps/client/src/queries/` (auth or org): `useOrgMembers()`.
- Form state (`ExceptionInput`) extended with `statement`, `ownerId`, `compensatingControls`; submit validation requires `statement` and `ownerId` (matching existing required-field pattern for `justification`/`controlCode`).
- i18n: new keys `exceptions.statement*`, `exceptions.owner*`, `exceptions.compensatingControls*` in `en.ts`, `ru.ts`, `he.ts`, `es.ts`.

---

## Testing

- Unit tests (Vitest, `FakeNotesStrategy`/`FakeAuthStrategy`): `listStandardsByFramework` filtering logic, `listOrgMembers` shape.
- Contract test updates: `notes.contract.unit.test.ts` (new method), new/updated `auth.contract.unit.test.ts` case for `listOrgMembers`.
- Client: form test verifying Framework change resets Standard/Control code; submit validation covers new required fields.
- Playwright: New Exception dialog end-to-end — fill all 8 fields, submit, verify list row (per AGENTS.md UI verification rule).

---

## Risks / open items

- RLS policy change on `organization_members` needs review — it's the first real read-access opening on a table marked "no API/UI in v1"; scope the policy tightly to `SELECT` only, same-org rows.
- `listStandardsByFramework` quality depends on how consistently `frameworkMappings` is populated by the AI-generation step — may return sparse/empty lists for orgs whose `StandardsDocument` predates a given framework mapping. Not a blocker, but expect placeholder/empty states in the combobox.

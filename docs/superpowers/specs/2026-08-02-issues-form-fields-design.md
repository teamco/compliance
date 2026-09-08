# Issues — New Issue Form Rework — Design Spec

**Branch:** `feature/issues-form-fields`
**Date:** 2026-08-02

---

## Problem

The "New Issue" dialog (`apps/client/src/routes/_dashboard/issues.tsx`) has 3 fields (Title, Severity, Description) with no way to record who reported an issue, who owns resolving it, or which asset(s) it affects — all standard fields in a real issue-tracking/GRC workflow.

---

## Scope

- Add 3 fields to the New Issue dialog: Issue Reporter, Affected Asset(s), Issue Owner.
- Extend `Issue`/`IssueInput`/`IssuePatch` with `reporterId`, `ownerId` (required), `affectedAssets` (optional free text).
- New migration: `reporter_id`, `owner_id`, `affected_assets` columns on `issues`.
- Reuse existing infrastructure: `useOrgMembers` hook and `Combobox` component (both built for the Exceptions form) power the Reporter and Owner dropdowns — no new backend capability needed.

Out of scope: converting Affected Asset(s) to a dropdown (explicitly deferred by request — "may switch to drop down in the future"), any change to Severity/Status handling, editing UI for existing issues.

---

## Field order (final)

| # | Field | Widget | Source |
|---|---|---|---|
| 1 | Title | `Input` | manual (existing) |
| 2 | Severity | native `<select>` | manual (existing, unchanged) |
| 3 | Description | `Textarea` | manual (existing) |
| 4 | Issue Reporter | searchable `Combobox` | **new**, `useOrgMembers(orgId)` |
| 5 | Affected Asset(s) | `Input` (free text) | manual (**new**) |
| 6 | Issue Owner | searchable `Combobox` | **new**, `useOrgMembers(orgId)` |

Reporter and Owner are both required (matches the "select the name" framing — these identify accountable people, not optional metadata). Affected Asset(s) is optional free text, comma-separated names for now; a real Asset picker is explicitly deferred.

---

## Data model (`libs/shared/src/strategies/notes.ts`)

```typescript
export interface Issue {
  id: string;
  orgId: string;
  userId: string;
  title: string;
  description: string;
  severity: IssueSeverity;
  reporterId: string;              // new
  ownerId: string;                 // new
  affectedAssets?: string;         // new
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
  reporterId: string;              // new
  ownerId: string;                 // new
  affectedAssets?: string;         // new
  source?: IssueSource;
  sourceId?: string;
  dueDate?: string;
}

export interface IssuePatch {
  title?: string;
  description?: string;
  severity?: IssueSeverity;
  reporterId?: string;             // new
  ownerId?: string;                // new
  affectedAssets?: string;         // new
  status?: IssueStatus;
  dueDate?: string | null;
  resolvedAt?: string | null;
}
```

No new `NotesStrategy`/`AuthStrategy` methods — `reporterId`/`ownerId` are populated from the same `useOrgMembers(orgId)` → `listOrgMembers` chain already built and shipped for Exceptions.

---

## Backend

- **Migration**: `alter table public.issues add column reporter_id uuid references auth.users(id), add column owner_id uuid references auth.users(id), add column affected_assets text;` — same nullable-FK pattern as `exceptions.owner_id` (no backfill needed for a new optional-until-set field on a table where these columns didn't exist before; existing rows simply get `NULL`).
- **`FakeNotesStrategy`**: `createIssue` gets explicit field mapping (mirrors the existing pattern for `title`/`description`/`severity`); `updateIssue` already uses object-spread (`{ ...existing, ...patch }`) so it needs no change — new patch fields flow through automatically.
- **`SupabaseNotesStrategy`**: `createIssue`'s `.insert({...})` gets 3 new keys (`reporter_id`, `owner_id`, `affected_assets`); `updateIssue` (field-by-field guard pattern, unlike the Fake) gets 3 new `if (patch.x !== undefined)` guards; `toIssue` mapper reads the 3 new columns back.
- **Gateway/MS**: no changes — `createIssue`/`updateIssue` are already generic `IssueInput`/`IssuePatch` pass-throughs at the controller, client-service, and message-pattern layers (verified: no per-field destructuring exists at any of those layers today).

---

## Client

- `apps/client/src/routes/_dashboard/issues.tsx`: add `useOrgMembers(orgId)` (already exists from the Exceptions work), two `Combobox` fields (Reporter, Owner) following the exact pattern already used for Exceptions' Owner field, one new `Input` (Affected Asset(s)).
- Submit validation extended to require `reporterId`/`ownerId` alongside the existing `title`/`description` checks.
- i18n: new keys `issues.reporter*`, `issues.affectedAssets*`, `issues.owner*` across `en/ru/he/es`.

---

## Testing

- Unit tests (Vitest, `FakeNotesStrategy`): `createIssue` round-trip test asserting the 3 new fields.
- Client: extend/add a component test verifying the 6 fields render in order and required-field validation includes Reporter/Owner (mirrors the Exceptions form's existing test pattern).
- No Supabase-strategy or MS-layer test needed (integration-only, no new capability — consistent with how Exceptions' analogous plumbing was handled).

---

## Risks / open items

- None significant — this reuses infrastructure (Combobox, useOrgMembers, org-scope authz already added to `/auth/org/members`) that was already reviewed and hardened during the Exceptions work. The main residual risk carried over from that work (Owner dropdown depends on `organization_members` having real membership data, currently backed only by the org-creator fallback) applies identically here to both Reporter and Owner.

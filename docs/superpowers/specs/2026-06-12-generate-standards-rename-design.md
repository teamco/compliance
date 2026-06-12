# Generate Standards Rename — Design Spec

**Branch:** `feature/security-modules-expansion`  
**Date:** 2026-06-12  
**Approach:** Big-bang rename (Option A) — single PR, no adapters

---

## Problem

`generateStandards` produces items typed as `GeneratedControl[]` and stored as `controls` throughout the stack. In GRC, Standards and Controls are distinct entities. Standards define *what must be done*; Controls define *how to implement it*. The current naming conflates them, which misleads users and blocks item 8 (Controls ↔ Standards mapping).

---

## Types

### AI output (`libs/shared/src/strategies/ai.ts`)

Remove `GeneratedControl`. Add:

```ts
export interface GeneratedStandard {
  id: string;
  title: string;
  objective: string;
  scope: string;
  requirements: string[];
}
```

`StandardsResult` changes:
```ts
// before
{ frameworkId: string; controls: GeneratedControl[] }
// after
{ frameworkId: string; standards: GeneratedStandard[] }
```

`analyzeGap` signature: `controls: GeneratedControl[]` → `standards: GeneratedStandard[]`

### Stored shape (`libs/shared/src/strategies/notes.ts`)

Remove `StandardControl`. Add:

```ts
export interface DocumentStandard {
  code: string;
  title: string;
  objective: string;
  scope: string;
  requirements: string[];
  frameworkMappings: { frameworkId: string; standardCode: string }[];
}
```

- `StandardsDocument.controls: StandardControl[]` → `standards: DocumentStandard[]`
- `StandardsSnapshot.controls: StandardControl[]` → `standards: DocumentStandard[]`
- `ControlPatch` → `StandardPatch: { objective?: string; scope?: string }`
- `saveStandardsDocument(id, controls)` → `saveStandardsDocument(id, standards)`
- `updateControl(...)` → `updateStandard(...)`
- `StandardControlPriority` — removed (no priority on Standards)

---

## Database

New migration file `supabase/migrations/20260612000001_rename_controls_to_standards.sql`:

```sql
alter table public.generated_standards  rename column controls to standards;
alter table public.standards_snapshots  rename column controls to standards;
```

Both columns are `jsonb` — rename only, no data type change, no backfill needed.

---

## AI Prompt (`libs/ai-strategies/anthropic/src/lib/anthropic-ai.strategy.ts`)

### `generateStandards`

New system prompt:
```
You are a compliance standards expert. Generate formal security standards for the given frameworks.
Return ONLY a valid JSON array matching this TypeScript type:
Array<{
  frameworkId: string;
  standards: Array<{
    id: string;
    title: string;
    objective: string;
    scope: string;
    requirements: string[]
  }>
}>
No markdown, no explanation — raw JSON only.
```

New user prompt instructs Claude to produce Standards-level language (what must be done), not Controls-level (how to implement). Example distinction:
- Standard (correct): "All user accounts must use multi-factor authentication"
- Control (wrong): "Configure Okta MFA with TOTP as primary factor"

Model stays `claude-opus-4-8`.

### `analyzeGap`

System prompt: replace "controls" with "standards" throughout.  
Method signature: `controls: GeneratedControl[]` → `standards: GeneratedStandard[]`.

---

## Gateway (`apps/api/src/app/notes/standards-queue.service.ts`)

Mapping from `GeneratedStandard` → `DocumentStandard`:

```ts
const standards: DocumentStandard[] = aiResults.flatMap((r) =>
  r.standards.map((s) => ({
    code: s.id,
    title: s.title,
    objective: s.objective,
    scope: s.scope,
    requirements: s.requirements,
    frameworkMappings: [{ frameworkId: r.frameworkId, standardCode: s.id }],
  })),
);
await this.notes.saveStandardsDocument(docId, standards);
```

---

## Notes Microservice (`apps/microservices/notes/src/app/supabase-notes.strategy.ts`)

- All `.update({ controls })` → `.update({ standards })`
- All `.select('..., controls, ...')` → `.select('..., standards, ...')`
- `updateControl` method → `updateStandard`
- Internal variable renames: `controls` → `standards`, `c.code` refs updated

---

## AI Client (`libs/ai-client/src/lib/ai-client.service.ts`)

- `analyzeGap(controls: GeneratedControl[], ...)` → `analyzeGap(standards: GeneratedStandard[], ...)`

---

## Client

### `apps/client/src/queries/notes.ts`
- `StandardsDocument.controls` → `standards: DocumentStandard[]`
- Query reads updated accordingly

### `apps/client/src/routes/_dashboard/standards.tsx`
- Document card: show `doc.standards.length` + label "standards"
- UI subtitle: "AI-generated compliance standards tailored to your organization"

### `apps/client/src/routes/_dashboard/standards.$id.tsx`
- "Control Assessment" → "Standards Assessment"
- Pass `doc.standards` to gap analysis

### `libs/template-shared/src/lib/i18n/locales/en.ts` (+ he/ru/es)

| Old key | New key | New value |
|---------|---------|-----------|
| `standards.subtitle` | same | "AI-generated compliance standards tailored to your organization" |
| `standards.controls` | `standards.count` | `'{{count}} standards'` |
| `standards.controlsTitle` | `standards.assessmentTitle` | `'Standards Assessment'` |
| `standards.controlsSubtitle` | `standards.assessmentSubtitle` | updated text |
| `standards.generateFirst` | same | updated text |
| `gap.controlsMapped` | `gap.standardsMapped` | `'standards mapped'` |
| `gap.generateFirst` | same | updated text |

---

## Tests

No new test files. Updates only:

| File | Change |
|------|--------|
| `libs/shared/src/strategies/__tests__/ai.contract.unit.test.ts` | `controls[]` → `standards[]`, field renames |
| `libs/ai-strategies/anthropic/src/lib/__tests__/anthropic-ai.contract.unit.test.ts` | same |
| `libs/shared/src/strategies/__tests__/fake-notes-admin.unit.test.ts` | `StandardControl` → `DocumentStandard` |
| `libs/shared/src/strategies/__tests__/notes.contract.unit.test.ts` | same |
| `libs/shared/src/strategies/fakes/fake-ai.ts` | return `standards[]` with new fields |
| `libs/shared/src/strategies/fakes/fake-notes.ts` | internal `controls` map → `standards` |

---

## Out of scope

- Controls ↔ Standards mapping UI (item 8 — separate branch)
- Policy templates (item 6 — separate branch)
- Renaming the `public.controls` catalog table (different entity — seeded framework controls, not AI-generated)

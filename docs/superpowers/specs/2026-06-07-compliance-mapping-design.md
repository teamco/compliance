# Module 6 — Compliance Mapping Engine

**Date:** 2026-06-07  
**Status:** Approved

## Summary

New `/controls` page showing a cross-reference matrix: which generated standard controls cover which compliance framework controls. Link from `standards/$id` into this page pre-filtered by document.

---

## Data Model

No new backend work required. All data is already available client-side:

- `StandardControl.frameworkMappings: { frameworkId: string; controlCode: string }[]` — populated during AI generation
- `GET /notes/frameworks` — returns all 4 seeded frameworks (SOC2, ISO 27001, NIST CSF, GDPR)
- `GET /notes/standards/:id` — returns full document with controls array

---

## Page: `/controls`

### URL Parameters
- `?docId=<uuid>` — pre-selects a standards document (used when navigating from `standards/$id`)

### Layout

```
[Select document ▾]  [Frameworks: SOC2 ✓ ISO ✓ NIST ✓ GDPR ✓]  [Show gaps only □]
────────────────────────────────────────────────────────────────────
Coverage badge: "42/58 controls mapped across selected frameworks"
────────────────────────────────────────────────────────────────────
| Code  | Title        | Priority | Category | SOC2 | ISO  | NIST | GDPR |
|-------|--------------|----------|----------|------|------|------|------|
| AC-01 | Access Ctrl  | critical | Access   |  ✓   |  ✓   |  -   |  -   |
| AC-02 | ...          | high     | Access   |  -   |  ✓   |  ✓   |  -   |
```

### Table Columns
- `code`, `title`, `priority` (colour-coded badge), `category`
- One column per selected framework — cell shows:
  - Green checkmark + tooltip with `controlCode` (e.g. "CC6.1") if mapped
  - Grey dash if not mapped

### Filters
- **Document selector** — dropdown of completed/approved/published standards docs
- **Framework multi-select** — toggle visibility of framework columns (all on by default)
- **Show gaps only** — hides rows where ALL selected frameworks are covered

### Coverage Badge
Counts distinct controls that have ≥1 mapping to any selected framework. Format: `X/Y controls mapped`.

### Empty States
- No document selected → prompt to select
- Document has no controls (pending) → inform user

---

## Link from `standards/$id`

Button "View Mapping →" placed next to the WorkflowBar component. Navigates to `/controls?docId=<id>`. Only shown when `doc.status === 'completed'`.

---

## Components

| Component | Location | Responsibility |
|-----------|----------|----------------|
| `ControlsPage` | `routes/_dashboard/controls.tsx` | Page root, state: docId, selected frameworks, gaps filter |
| `ControlsTable` | `components/controls/ControlsTable.tsx` | Renders matrix table, accepts controls + frameworks |
| `FrameworkCell` | inline in ControlsTable | Green check w/ tooltip or grey dash |
| `CoverageBadge` | inline in ControlsPage | Computes and renders "X/Y mapped" |

---

## Queries

Reuse existing:
- `useStandardsDocuments()` — for document selector
- `useStandardsDocument(id)` — for controls data  
- `useFrameworks()` — for framework columns

No new API endpoints needed.

---

## Navigation

Add `/controls` to `LayoutSider.tsx` nav — replace the current `soon: true` stub on the Controls nav item. Icon: `Shield` (already imported).

---

## Out of Scope

- Manual re-mapping of controls to frameworks (AI-assigned only)
- Framework controls catalog editor
- Evidence capture UI
- Export to CSV/PDF

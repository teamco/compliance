# Report Export — PDF / CSV / JSON

## Overview

Gap analysis reports (`/gap-analysis/:id`) and standards documents
(`/standards/:id`) can be exported as **PDF**, **CSV**, or **JSON** from an
**Export** dropdown in each page header. PDF layout is driven by selectable
**report templates** stored in the database and managed in
**Settings → Report Templates** (admin).

## Formats

| Format | Generated   | Library                | Use case                  |
| ------ | ----------- | ---------------------- | ------------------------- |
| PDF    | client-side | `@react-pdf/renderer`  | branded, printable report |
| CSV    | client-side | none (RFC 4180 writer) | tabular data → Excel      |
| JSON   | client-side | none                   | raw data / integrations   |

All three run in the browser from data already loaded on the page — no backend
export endpoint, no server round-trip.

Code: `apps/client/src/lib/export/` (`pdf.tsx`, `csv.ts`, `json.ts`,
`download.ts`). UI: `apps/client/src/components/export/ExportMenu.tsx`.

## PDF templates

A template defines the PDF layout/branding. Stored in `report_templates`
(global, admin-managed). Fields:

| Field                                                             | Meaning                                                     |
| ----------------------------------------------------------------- | ----------------------------------------------------------- |
| `name`                                                            | template label shown in the export menu                     |
| `scope`                                                           | `gap` \| `standards` \| `all` — which reports it applies to |
| `brand_name`                                                      | header brand; empty → falls back to the org name            |
| `accent_color`                                                    | hex; header rule, score, badges                             |
| `include_summary` / `include_details` / `include_recommendations` | section toggles                                             |
| `footer_note`                                                     | left footer text (e.g. "Confidential")                      |
| `favorite_org_ids`                                                | orgs that favorited this template (see below)               |

The footer always carries the product name **ComplianceIQ** + page numbers.
Header shows brand, report type, date, org, and template name.

Templates are seeded with **Default** (all sections) and **Executive Summary**
(no details). Manage them in **Settings → Report Templates**.

## Per-org favorites

A template stays global but can be **favorited (assigned) to specific orgs** so
it surfaces first in that org's export menu (marked with a ★), avoiding a scan
through every template.

- Set in the template form (Settings) or inline via the ★ in the export menu.
- The export menu sorts favorites for the current org to the top.

## Access control

| Action                            | Who                    | Enforcement                                |
| --------------------------------- | ---------------------- | ------------------------------------------ |
| List templates                    | any authenticated user | gateway GET (no gate)                      |
| Create / update / delete template | admin                  | `@CheckAbility('manage','ReportTemplate')` |
| Add / remove org favorite         | org owner              | gateway checks CASL `read` on the org      |

## Architecture

```
client ExportMenu / TemplatesTab
  → gateway ReportTemplatesController (/notes/report-templates)
  → notes-client (TCP: notes.templates.*)
  → notes MS → NotesStrategy (supabase: report_templates table)
```

- shared types: `ReportTemplate`, `ReportTemplateInput`, CASL `ReportTemplate`
  subject (`libs/shared/src/strategies/notes.ts`, `.../abilities/subjects.ts`).
- Gap reports persist enriched `findings` (controlId, title, status) in
  `GapAnalysisResult.findings` at save time so the report shows a per-control
  compliance breakdown.

## Migrations

- `20260608185327_create_report_templates.sql`
- `20260608191738_report_templates_favorite_orgs.sql`

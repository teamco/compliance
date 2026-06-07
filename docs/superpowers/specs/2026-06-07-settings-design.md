# Settings Module Design

## Overview

A `/settings` page with hash-based tab navigation (`/settings#appearance`, `/settings#notification`, etc.). Tabs restore on page refresh via `window.location.hash`. Two access tiers: all-user tabs and admin-only tabs.

---

## Architecture

### Routing (client)

Single TanStack Router route `/_dashboard/settings`. Hash is read on mount and synced via `history.replaceState` on tab change — no full navigation, no URL search params.

Default tab when no hash: `#appearance`.

### Data Storage

| Data | Location | Owner |
|------|----------|-------|
| `theme`, `language` | new columns on `profiles` table | user |
| `notification_prefs` (channels + events JSON) | new column on `profiles` table | user |
| push subscriptions | new table `push_subscriptions` | user |
| org settings (webhooks, retention) | new table `org_settings` (one row per org) | admin |
| API keys (name, hash, prefix, scopes, last_used) | new table `api_keys` | admin |
| Audit log | read-only SQL query over Supabase auth + notes activity | — |

### API (NestJS gateway → notes MS)

New `settings` NestJS resource:

```
GET  /api/settings/me                  → user preferences
PATCH /api/settings/me                 → save theme / language / notification_prefs

GET  /api/settings/org                 → org settings (admin)
PATCH /api/settings/org                → save webhooks / retention (admin)

GET  /api/settings/api-keys            → list keys (admin)
POST /api/settings/api-keys            → create key, returns full key once (admin)
DELETE /api/settings/api-keys/:id      → revoke key (admin)

POST /api/settings/push-subscription   → save browser push endpoint
DELETE /api/settings/push-subscription → remove push endpoint on permission revoke

GET /api/settings/audit-log            → paginated events (admin)
```

---

## Tabs

### #appearance — All users

- **Theme**: Dark / Light / System (3-way toggle). Saved to `profiles.theme`, applied via `<html data-theme>`.
- **Language**: dropdown EN / RU / HE / ES. Saved to `profiles.language`, calls `i18n.changeLanguage()`.

### #notification — All users

- **Channels** section:
  - In-app toggle (badge on header bell icon)
  - Browser Push toggle + "Enable Push" button (triggers `PushManager.subscribe()`, saves endpoint via `POST /api/settings/push-subscription`)
- **Events** matrix — rows × columns:
  - Rows: Workflow submitted / approved / rejected / published, AI standards generated / gap analysis done, System new framework added
  - Columns: In-app, Push
  - Each cell is a checkbox. Saved as `notification_prefs` JSON on `profiles`.

### #audit-log — Admin only

- Filter bar: user select, event type select, date range picker
- Table: who / action / resource name / timestamp
- "Export CSV" button — downloads filtered results
- Data source: `audit_events` table (written by notes MS on: standard create/update/delete, workflow transitions, control edits, gap analysis runs)

### #export — Admin only

- Step 1: choose object — Standards document (dropdown of completed docs) / Gap Analysis (dropdown) / Controls matrix (dropdown)
- Step 2: choose format — PDF / CSV / JSON (radio)
- "Export" button — triggers download. PDF generated client-side via `@react-pdf/renderer` (React components → PDF Blob → download). CSV/JSON serialized client-side from existing query data.

### #webhooks — Admin only

- List of configured webhooks: URL (truncated), subscribed events (badges), status active/inactive toggle, delete button
- "Add Webhook" form: URL input + events checkboxes + secret input
- "Send test payload" button per webhook → shows 200/4xx response
- Delivery log per webhook: last 10 attempts, HTTP status, timestamp

### #retention — Admin only

- Three dropdowns (30 / 90 / 180 days / Forever):
  - Snapshot version retention
  - Audit log retention
  - Gap analysis results retention
- "Save" button → PATCH `/api/settings/org`

### #api-keys — Admin only

- Table: name / prefix `sk-xxxx…` / created date / last used date / scopes badge / Revoke button
- "Create API Key" button → modal: name input + scopes radio (read-only / full) → on save: show full key once in a copy-to-clipboard field (never shown again)
- Revoke requires typed confirmation: key name

---

## Notifications Delivery

### In-app
Bell icon in `LayoutHeader` with unread count badge. Clicking opens a dropdown list of recent notifications. Notifications stored in `notifications` table (`user_id`, `type`, `payload`, `read_at`).

### Browser Push
Service Worker registered at `/sw.js`. On `PushManager.subscribe()` success, endpoint saved to `push_subscriptions`. Backend sends via `web-push` npm library with VAPID keys (free, no external service). Push payload: `{ title, body, url }`.

### Trigger points
Both channels triggered from the notes MS on:
- Workflow transitions (submit / approve / reject / publish)
- AI job completion (standards generated, gap analysis done)
- New framework added to the system

---

## Migrations

```sql
-- profiles additions
ALTER TABLE profiles ADD COLUMN theme text DEFAULT 'system';
ALTER TABLE profiles ADD COLUMN language text DEFAULT 'en';
ALTER TABLE profiles ADD COLUMN notification_prefs jsonb DEFAULT '{}';

-- push subscriptions
CREATE TABLE push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  keys jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- notifications (in-app)
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  read_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- org settings (single row for v1; org_id = constant UUID, multi-tenancy out of scope)
CREATE TABLE org_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhooks jsonb DEFAULT '[]',
  retention_snapshots_days int DEFAULT 90,
  retention_audit_days int DEFAULT 180,
  retention_gap_analysis_days int DEFAULT 90,
  updated_at timestamptz DEFAULT now()
);

-- api keys (org-level, no user_id)
CREATE TABLE api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  key_hash text NOT NULL,   -- bcrypt hash, never stored plain
  key_prefix text NOT NULL, -- first 8 chars for display: sk-xxxxxxxx
  scopes text NOT NULL DEFAULT 'read',
  last_used_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- audit events (written by notes MS on key actions)
CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  action text NOT NULL,      -- e.g. 'standard.created', 'workflow.approved'
  resource_type text,        -- e.g. 'standard', 'control'
  resource_id uuid,
  meta jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
```

---

## Out of Scope (v1)

- Email notifications (no email provider yet)
- Per-user API keys (org-level only)
- Webhook retry queue (log only, no retry)
- Profile page user preferences (language/theme/timezone/country) — **separate plan**

---

## File Structure

```
apps/client/src/routes/_dashboard/settings.tsx           ← route + tab shell
apps/client/src/components/settings/
  AppearanceTab.tsx
  NotificationTab.tsx
  AuditLogTab.tsx
  ExportTab.tsx
  WebhooksTab.tsx
  RetentionTab.tsx
  ApiKeysTab.tsx
  __tests__/
    AppearanceTab.unit.test.tsx
    NotificationTab.unit.test.tsx
    WebhooksTab.unit.test.tsx
    ApiKeysTab.unit.test.tsx

apps/api/src/settings/
  settings.module.ts
  settings.controller.ts
  settings.service.ts

apps/microservices/notes/src/app/settings/
  settings.module.ts
  settings.service.ts        ← user prefs + org settings + audit log
  settings.controller.ts

supabase/migrations/
  20260607000001_settings.sql

libs/shared/src/lib/contracts/settings.contract.ts       ← DTOs
```

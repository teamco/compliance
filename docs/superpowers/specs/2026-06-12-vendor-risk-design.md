# Vendor Risk Module — Design Spec

**Branch:** `feature/vendor-risk`
**Date:** 2026-06-12

---

## Problem

The platform has no way to assess the security posture of third-party vendors, acquisitions, or the organization itself from an external signal perspective. SecurityScorecard-style ratings are increasingly required for vendor due diligence, M&A, and cyber insurance underwriting.

---

## Scope

- Add Vendor registry with tier classification
- Run baseline scans (own crawler, free/cheap) on every vendor automatically
- Run deep scans (SecurityScorecard API) on demand
- AI-generated analysis and recommendations per scan
- Scheduled re-scanning with score-drop alerts (in-app push + webhook)

Out of scope: own-org score (separate initiative), Controls↔Standards mapping.

---

## Architecture

```
apps/
├── microservices/
│   └── vendor-risk/          new MS — port 4006 TCP / 9234 inspect
libs/
├── vendor-risk-client/       gateway → vendor-risk MS (TCP proxy)
├── vendor-risk-strategies/
│   ├── crawler/              OwnCrawlerStrategy (free baseline)
│   └── scorecard/            SecurityScorecardStrategy (paid, on-demand)
└── shared/                   + VendorRiskStrategy, Vendor*, ScanFinding types
apps/
├── api/                      + VendorRiskModule (HTTP endpoints)
└── client/                   + /vendors and /vendors/:id routes
```

All patterns follow existing conventions: `buildTransport()`, strategy factory with `formatEnvBanner`/`missingEnv`, `FakeVendorRiskStrategy` for tests.

---

## Types (`libs/shared`)

```typescript
export type VendorTier = 'critical' | 'high' | 'medium' | 'low';
export type ScanGrade = 'A' | 'B' | 'C' | 'D' | 'F';
export type ScanMode = 'baseline' | 'deep';
export type ScanCategory = 'dns' | 'email' | 'tls' | 'web' | 'network' | 'breach' | 'reputation';
export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type VendorRiskLevel = 'critical' | 'high' | 'medium' | 'low';

export interface CategoryResult {
  score: number; // 0–100
  grade: ScanGrade;
  findingCount: number;
}

export interface ScanFinding {
  category: ScanCategory;
  severity: FindingSeverity;
  title: string;
  detail: string;
  remediation: string;
}

export interface VendorScanResult {
  score: number;
  grade: ScanGrade;
  breakdown: Record<ScanCategory, CategoryResult>;
  findings: ScanFinding[];
  scorecardData?: unknown; // raw SC API response, deep scans only
}

export interface VendorRiskStrategy {
  scan(domain: string, mode: ScanMode): Promise<VendorScanResult>;
}

export interface Vendor {
  id: string;
  orgId: string;
  name: string;
  domain: string;
  tags: string[];
  tier: VendorTier;
  rescanIntervalDays: number;
  alertThreshold: number;
  lastScannedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type VendorInput = Omit<
  Vendor,
  'id' | 'orgId' | 'lastScannedAt' | 'createdAt' | 'updatedAt'
>;

export interface VendorScan {
  id: string;
  vendorId: string;
  triggeredBy: 'manual' | 'scheduled' | 'deep';
  score: number;
  grade: ScanGrade;
  breakdown: Record<ScanCategory, CategoryResult>;
  findings: ScanFinding[];
  scorecardData: unknown | null;
  scannedAt: string;
}

export interface VendorAiAnalysis {
  id: string;
  scanId: string;
  vendorId: string;
  summary: string;
  riskRating: VendorRiskLevel;
  recommendations: Array<{
    priority: number;
    action: string;
    effort: 'low' | 'medium' | 'high';
  }>;
  model: string;
  inputTokens: number;
  outputTokens: number;
  createdAt: string;
}
```

---

## Strategy Implementations

### `OwnCrawlerStrategy` — always runs

| Category     | Data Source                                          | Cost           |
| ------------ | ---------------------------------------------------- | -------------- |
| `dns`        | Node `dns` module — A/AAAA/MX/NS/DNSSEC              | free           |
| `email`      | SPF/DMARC/DKIM DNS TXT lookup                        | free           |
| `tls`        | `tls.connect()` — cert grade, expiry, chain, ciphers | free           |
| `web`        | HTTP fetch — security headers, CSP, cookie flags     | free           |
| `network`    | Shodan API — open ports, services                    | ~$0.001/lookup |
| `breach`     | HIBP domain search API                               | free tier      |
| `reputation` | AbuseIPDB API — IP blacklist score                   | free tier      |

**Scoring formula:**

```
score = round(
  dns * 0.15 + email * 0.15 + tls * 0.20 +
  web * 0.15 + network * 0.15 + breach * 0.10 + reputation * 0.10
)
```

**Grade thresholds:** A ≥ 90, B ≥ 80, C ≥ 70, D ≥ 60, F < 60.

### `SecurityScorecardStrategy` — `mode: 'deep'` only

Calls `GET https://api.securityscorecard.io/companies/{domain}/factors`.
Result stored in `scorecardData`. Overrides `breakdown` and `score` where SC data is present.

### `HybridVendorRiskStrategy` — default in MS

- `baseline` → `OwnCrawlerStrategy` only
- `deep` → both strategies run in parallel; SC data wins on overlap

---

## Database

### `vendors`

```sql
create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.org_profiles(id) on delete cascade,
  name text not null,
  domain text not null,
  tags text[] not null default '{}',
  tier text not null default 'medium',
  rescan_interval_days int not null default 7,
  alert_threshold int not null default 10,
  last_scanned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### `vendor_scans`

```sql
create table public.vendor_scans (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  triggered_by text not null,
  score int not null,
  grade text not null,
  breakdown jsonb not null,
  findings jsonb not null default '[]',
  scorecard_data jsonb,
  scanned_at timestamptz not null default now()
);
```

### `vendor_ai_analyses`

```sql
create table public.vendor_ai_analyses (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.vendor_scans(id) on delete cascade,
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  summary text not null,
  risk_rating text not null,
  recommendations jsonb not null default '[]',
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  created_at timestamptz not null default now()
);
```

### `vendor_alert_events`

```sql
create table public.vendor_alert_events (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  scan_id uuid not null references public.vendor_scans(id) on delete cascade,
  score_before int not null,
  score_after int not null,
  drop int not null,
  channels text[] not null default '{}',
  fired_at timestamptz not null default now()
);
```

---

## Scheduling & Alerts

**Cron** runs every 6 hours inside vendor-risk MS:

1. `SELECT vendors WHERE last_scanned_at < NOW() - rescan_interval_days ORDER BY tier DESC`
2. Baseline scan each (max 5 concurrent — external API rate limits)
3. Compare `score` with previous scan
4. If `score_before - score_after >= alert_threshold`:
   - Insert `vendor_alert_events`
   - Fire push notification (existing push subscription system)
   - POST to org webhooks (existing webhook infrastructure)
   - Webhook payload: `{ vendor, scoreBefore, scoreAfter, drop, topFindings }`

---

## AI Analysis

**Operation:** `vendor.posture.analyze` — new pattern on **AI MS** (not vendor-risk MS)
**Model:** `claude-sonnet-4-6`
**Trigger:** vendor-risk MS calls AI MS via `AiClientService` after every scan

**`AiStrategy` additions:**

```typescript
interface VendorPostureInput {
  domain: string;
  findings: ScanFinding[];
  breakdown: Record<ScanCategory, CategoryResult>;
}

interface VendorPostureResult {
  summary: string;
  riskRating: VendorRiskLevel;
  recommendations: Array<{ priority: number; action: string; effort: 'low'|'medium'|'high' }>;
}

// added to AiStrategy interface:
analyzeVendorPosture(input: VendorPostureInput): Promise<VendorPostureResult>;
```

**System prompt:** Security analyst tone. Specific, actionable remediation. No generic advice.

**Output stored as** `VendorAiAnalysis` in vendor-risk DB.

---

## HTTP Endpoints (API Gateway)

```
GET    /api/vendors                       list vendors for org
POST   /api/vendors                       add vendor (triggers immediate baseline scan)
GET    /api/vendors/:id                   vendor details + latest scan + AI analysis
PATCH  /api/vendors/:id                   update tier / interval / threshold
DELETE /api/vendors/:id                   remove vendor
POST   /api/vendors/:id/scan              manual baseline scan
POST   /api/vendors/:id/scan/deep         deep scan (SC API)
GET    /api/vendors/:id/scans             scan history
GET    /api/vendors/:id/scans/:scanId     scan detail + findings + AI analysis
```

---

## TCP Message Patterns

### vendor-risk MS

```
vendor.list             { orgId }
vendor.get              { id }
vendor.create           { orgId, input: VendorInput }
vendor.update           { id, patch }
vendor.delete           { id }
vendor.scan             { id, mode }
vendor.scans.list       { vendorId }
vendor.scans.get        { scanId }
```

### AI MS (additions)

```
vendor.posture.analyze  { domain, findings, breakdown } → VendorPostureResult
```

---

## Client UI

### `/vendors` — vendor list

- Cards: name, domain, tier badge, score + grade circle, trend vs previous scan (▲▼ Δscore)
- Filter by tier, grade
- "Add Vendor" button → modal (domain input + tier select)
- Scan-in-progress indicator per card

### `/vendors/:id` — vendor detail

- Score gauge + grade + scanned_at
- Breakdown table — 7 categories, each with sub-score + grade + finding count
- Findings list — grouped by severity, each with remediation text
- AI Analysis block — summary + risk rating badge + recommendations
- Scan history (collapsible rows, like standards snapshots)
- "Run Scan" / "Deep Scan" buttons
- Settings panel (tier, rescan interval, alert threshold)

---

## .env additions

| File                                  | Key vars                                                                                                                                                                            |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/microservices/vendor-risk/.env` | `VENDOR_RISK_PROVIDER=hybrid`, `SHODAN_API_KEY`, `HIBP_API_KEY`, `ABUSEIPDB_API_KEY`, `SCORECARD_API_KEY`, `VENDOR_RISK_TRANSPORT=tcp`, `VENDOR_RISK_HOST`, `VENDOR_RISK_PORT=4006` |

---

## Testing

- `FakeVendorRiskStrategy` — deterministic, returns fixed `VendorScanResult` per domain
- Contract tests for `VendorRiskStrategy` interface (like `ai.contract.unit.test.ts`)
- Unit tests for scoring formula in `OwnCrawlerStrategy`
- Unit tests for alert diff logic (score_before - score_after >= threshold)

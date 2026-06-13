# Vendor Risk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full vendor risk module — registry, baseline/deep scans, AI analysis, scheduled alerts, and client UI.

**Architecture:** New `vendor-risk` MS (port 4006) with HybridVendorRiskStrategy (OwnCrawler + SecurityScorecard). Gateway adds `/api/vendors` REST surface via `vendor-risk-client` TCP proxy. AI MS gains `vendor.posture.analyze`. React client gets `/vendors` list + `/vendors/:id` detail pages.

**Tech Stack:** NestJS microservice, Supabase (direct client in MS), `@nestjs/schedule` for cron, TanStack Query + shadcn/ui on client.

---

### Task 1: Scaffold new Nx libs + MS

**Files:**

- Create: `libs/vendor-risk-client/` (generator)
- Create: `libs/vendor-risk-strategies/crawler/` (generator)
- Create: `libs/vendor-risk-strategies/scorecard/` (generator)
- Create: `apps/microservices/vendor-risk/` (generator)

- [ ] **Step 1: Generate libs**

```bash
yarn nx g @nx/js:lib --name=vendor-risk-client --directory=libs/vendor-risk-client --importPath=@icore/vendor-risk-client --bundler=tsc --unitTestRunner=vitest --no-interactive
yarn nx g @nx/js:lib --name=vendor-risk-crawler --directory=libs/vendor-risk-strategies/crawler --importPath=@icore/vendor-risk-crawler --bundler=tsc --unitTestRunner=vitest --no-interactive
yarn nx g @nx/js:lib --name=vendor-risk-scorecard --directory=libs/vendor-risk-strategies/scorecard --importPath=@icore/vendor-risk-scorecard --bundler=tsc --unitTestRunner=vitest --no-interactive
```

- [ ] **Step 2: Generate vendor-risk MS**

```bash
yarn nx g @nx/nest:app --name=vendor-risk --directory=apps/microservices/vendor-risk --no-interactive
```

- [ ] **Step 3: Add tsconfig.base.json paths**

In `tsconfig.base.json`, inside `"paths"`, add:

```json
"@icore/vendor-risk-client": ["./libs/vendor-risk-client/src/index.ts"],
"@icore/vendor-risk-crawler": ["./libs/vendor-risk-strategies/crawler/src/index.ts"],
"@icore/vendor-risk-scorecard": ["./libs/vendor-risk-strategies/scorecard/src/index.ts"]
```

- [ ] **Step 4: Install @nestjs/schedule**

```bash
yarn add @nestjs/schedule
yarn add -D @types/cron
```

- [ ] **Step 5: Verify scaffold built**

```bash
yarn nx build vendor-risk-client
```

Expected: `Successfully ran target build`

- [ ] **Step 6: Commit**

```bash
git add tsconfig.base.json libs/vendor-risk-client libs/vendor-risk-strategies apps/microservices/vendor-risk package.json yarn.lock
git commit -m "chore: scaffold vendor-risk MS + libs"
```

---

### Task 2: Shared types + VendorRiskStrategy interface

**Files:**

- Create: `libs/shared/src/strategies/vendor-risk.ts`
- Modify: `libs/shared/src/strategies/index.ts`

- [ ] **Step 1: Create `libs/shared/src/strategies/vendor-risk.ts`**

```typescript
export type VendorTier = 'critical' | 'high' | 'medium' | 'low';
export type ScanGrade = 'A' | 'B' | 'C' | 'D' | 'F';
export type ScanMode = 'baseline' | 'deep';
export type ScanCategory = 'dns' | 'email' | 'tls' | 'web' | 'network' | 'breach' | 'reputation';
export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type VendorRiskLevel = 'critical' | 'high' | 'medium' | 'low';

export interface CategoryResult {
  score: number;
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
  scorecardData?: unknown;
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
  recommendations: Array<{ priority: number; action: string; effort: 'low' | 'medium' | 'high' }>;
  model: string;
  inputTokens: number;
  outputTokens: number;
  createdAt: string;
}

export interface VendorPostureInput {
  domain: string;
  findings: ScanFinding[];
  breakdown: Record<ScanCategory, CategoryResult>;
}

export interface VendorPostureResult {
  summary: string;
  riskRating: VendorRiskLevel;
  recommendations: Array<{ priority: number; action: string; effort: 'low' | 'medium' | 'high' }>;
}
```

- [ ] **Step 2: Export from `libs/shared/src/strategies/index.ts`**

Add at end:

```typescript
export * from './vendor-risk';
```

- [ ] **Step 3: Build shared**

```bash
yarn nx build shared
```

Expected: success

- [ ] **Step 4: Commit**

```bash
git add libs/shared/src/strategies/vendor-risk.ts libs/shared/src/strategies/index.ts
git commit -m "feat(shared): add VendorRiskStrategy interface + vendor types"
```

---

### Task 3: AiStrategy extension — analyzeVendorPosture

**Files:**

- Modify: `libs/shared/src/strategies/ai.ts`
- Modify: `libs/shared/src/strategies/fakes/fake-ai.ts`
- Modify: `libs/ai-strategies/anthropic/src/lib/anthropic-ai.strategy.ts`
- Modify: `libs/ai-client/src/lib/ai-client.service.ts`
- Modify: `apps/microservices/ai/src/app/ai.controller.ts`

- [ ] **Step 1: Add to AiStrategy interface in `libs/shared/src/strategies/ai.ts`**

Add these imports at top (they come from vendor-risk.ts via same index):

```typescript
import type { VendorPostureInput, VendorPostureResult } from './vendor-risk';
```

Add to `AiStrategy` interface:

```typescript
analyzeVendorPosture(input: VendorPostureInput): Promise<VendorPostureResult>;
```

- [ ] **Step 2: Implement in `libs/shared/src/strategies/fakes/fake-ai.ts`**

Add import:

```typescript
import type { VendorPostureInput, VendorPostureResult } from '../vendor-risk';
```

Add method to `FakeAiStrategy`:

```typescript
async analyzeVendorPosture(_input: VendorPostureInput): Promise<VendorPostureResult> {
  return {
    summary: 'Fake vendor posture analysis — no real assessment performed.',
    riskRating: 'low',
    recommendations: [{ priority: 1, action: 'No action required (fake).', effort: 'low' }],
  };
}
```

- [ ] **Step 3: Implement in `libs/ai-strategies/anthropic/src/lib/anthropic-ai.strategy.ts`**

Add import:

```typescript
import type { VendorPostureInput, VendorPostureResult } from '@icore/shared';
```

Add method to `AnthropicAiStrategy`:

```typescript
async analyzeVendorPosture(input: VendorPostureInput): Promise<VendorPostureResult> {
  const system = [
    'You are a cybersecurity analyst specializing in vendor risk assessment.',
    'Analyze the provided domain scan results and return specific, actionable findings.',
    'No generic advice — every recommendation must reference a concrete finding.',
    'Return ONLY valid JSON matching this TypeScript type:',
    '{ summary: string; riskRating: "critical"|"high"|"medium"|"low"; recommendations: Array<{ priority: number; action: string; effort: "low"|"medium"|"high" }> }',
    'No markdown, no explanation — raw JSON only.',
  ].join('\n');

  const userPrompt = [
    `Domain: ${input.domain}`,
    `Score breakdown: ${JSON.stringify(input.breakdown)}`,
    `Findings (${input.findings.length}): ${JSON.stringify(input.findings)}`,
  ].join('\n');

  const response = await this.client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const raw = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('');

  return JSON.parse(stripJsonFences(raw)) as VendorPostureResult;
}
```

- [ ] **Step 4: Add proxy in `libs/ai-client/src/lib/ai-client.service.ts`**

Add import:

```typescript
import type { VendorPostureInput, VendorPostureResult } from '@icore/shared';
```

Add method:

```typescript
analyzeVendorPosture(input: VendorPostureInput): Promise<VendorPostureResult> {
  return firstValueFrom(
    this.client
      .send<VendorPostureResult>('vendor.posture.analyze', input)
      .pipe(timeout({ each: BATCH_TIMEOUT_MS })),
  );
}
```

- [ ] **Step 5: Add handler in `apps/microservices/ai/src/app/ai.controller.ts`**

Add import:

```typescript
import type { VendorPostureInput, VendorPostureResult } from '@icore/shared';
```

Add handler:

```typescript
@MessagePattern('vendor.posture.analyze')
analyzeVendorPosture(@Payload() payload: VendorPostureInput): Promise<VendorPostureResult> {
  return this.strategy.analyzeVendorPosture(payload);
}
```

- [ ] **Step 6: Build ai-client + ai MS**

```bash
yarn nx build ai-client && yarn nx build ai
```

Expected: both succeed

- [ ] **Step 7: Commit**

```bash
git add libs/shared/src/strategies/ai.ts libs/shared/src/strategies/fakes/fake-ai.ts libs/ai-strategies/anthropic/src/lib/anthropic-ai.strategy.ts libs/ai-client/src/lib/ai-client.service.ts apps/microservices/ai/src/app/ai.controller.ts
git commit -m "feat(ai): add analyzeVendorPosture operation to AiStrategy + Anthropic impl"
```

---

### Task 4: FakeVendorRiskStrategy + contract harness

**Files:**

- Create: `libs/shared/src/strategies/fakes/fake-vendor-risk.ts`
- Create: `libs/shared/src/strategies/__tests__/vendor-risk.contract.unit.test.ts`
- Modify: `libs/shared/src/strategies/fakes/index.ts`
- Modify: `libs/shared/src/testing.ts`

- [ ] **Step 1: Create `libs/shared/src/strategies/fakes/fake-vendor-risk.ts`**

```typescript
import type {
  CategoryResult,
  ScanCategory,
  ScanMode,
  VendorRiskStrategy,
  VendorScanResult,
} from '../vendor-risk';

function makeCategoryResult(score: number): CategoryResult {
  const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';
  return { score, grade, findingCount: score < 80 ? 1 : 0 };
}

const CATEGORIES: ScanCategory[] = [
  'dns',
  'email',
  'tls',
  'web',
  'network',
  'breach',
  'reputation',
];

export class FakeVendorRiskStrategy implements VendorRiskStrategy {
  async scan(domain: string, _mode: ScanMode): Promise<VendorScanResult> {
    const catScore = domain.includes('bad') ? 40 : 85;
    const breakdown = Object.fromEntries(
      CATEGORIES.map((c) => [c, makeCategoryResult(catScore)]),
    ) as Record<ScanCategory, CategoryResult>;
    const score = catScore;
    const grade = makeCategoryResult(score).grade;
    return {
      score,
      grade,
      breakdown,
      findings:
        catScore < 80
          ? [
              {
                category: 'tls',
                severity: 'high',
                title: 'Weak TLS configuration',
                detail: 'TLS 1.0 still enabled.',
                remediation: 'Disable TLS 1.0 and 1.1 on all endpoints.',
              },
            ]
          : [],
    };
  }
}
```

- [ ] **Step 2: Create `libs/shared/src/strategies/__tests__/vendor-risk.contract.unit.test.ts`**

```typescript
import type { VendorRiskStrategy } from '../vendor-risk';

export function runVendorRiskContract(name: string, factory: () => VendorRiskStrategy): void {
  describe(`VendorRiskStrategy contract: ${name}`, () => {
    let strategy: VendorRiskStrategy;

    beforeEach(() => {
      strategy = factory();
    });

    it('baseline scan returns score 0-100, grade, breakdown with 7 categories', async () => {
      const result = await strategy.scan('example.com', 'baseline');
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(['A', 'B', 'C', 'D', 'F']).toContain(result.grade);
      expect(Array.isArray(result.findings)).toBe(true);
      const cats = ['dns', 'email', 'tls', 'web', 'network', 'breach', 'reputation'];
      for (const cat of cats) {
        expect(result.breakdown[cat as keyof typeof result.breakdown]).toBeDefined();
      }
    });

    it('deep scan returns scorecardData field', async () => {
      const result = await strategy.scan('example.com', 'deep');
      expect(result).toHaveProperty('score');
    });

    it('each finding has required fields', async () => {
      const result = await strategy.scan('bad.example.com', 'baseline');
      for (const f of result.findings) {
        expect(f.category).toBeDefined();
        expect(f.severity).toBeDefined();
        expect(f.title).toBeDefined();
        expect(f.remediation).toBeDefined();
      }
    });
  });
}
```

- [ ] **Step 3: Export from `libs/shared/src/strategies/fakes/index.ts`**

Add:

```typescript
export * from './fake-vendor-risk';
```

- [ ] **Step 4: Export from `libs/shared/src/testing.ts`**

Add:

```typescript
export { runVendorRiskContract } from './strategies/__tests__/vendor-risk.contract.unit.test';
```

- [ ] **Step 5: Run shared tests**

```bash
yarn nx test shared
```

Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add libs/shared/src/strategies/fakes/fake-vendor-risk.ts libs/shared/src/strategies/__tests__/vendor-risk.contract.unit.test.ts libs/shared/src/strategies/fakes/index.ts libs/shared/src/testing.ts
git commit -m "feat(shared): FakeVendorRiskStrategy + contract harness"
```

---

### Task 5: OwnCrawlerStrategy

**Files:**

- Create: `libs/vendor-risk-strategies/crawler/src/lib/own-crawler.strategy.ts`
- Create: `libs/vendor-risk-strategies/crawler/src/lib/__tests__/own-crawler.contract.unit.test.ts`
- Modify: `libs/vendor-risk-strategies/crawler/src/index.ts`

- [ ] **Step 1: Create `libs/vendor-risk-strategies/crawler/src/lib/own-crawler.strategy.ts`**

```typescript
import * as dns from 'node:dns/promises';
import * as tls from 'node:tls';
import type {
  CategoryResult,
  ScanCategory,
  ScanFinding,
  ScanGrade,
  ScanMode,
  VendorRiskStrategy,
  VendorScanResult,
} from '@icore/shared';

function grade(score: number): ScanGrade {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function cat(score: number, findingCount: number): CategoryResult {
  return { score, grade: grade(score), findingCount };
}

export interface OwnCrawlerOptions {
  shodanApiKey?: string;
  hibpApiKey?: string;
  abuseipdbApiKey?: string;
  /** Override fetch — injected in tests */
  fetch?: typeof globalThis.fetch;
}

export class OwnCrawlerStrategy implements VendorRiskStrategy {
  private readonly fetch: typeof globalThis.fetch;

  constructor(private readonly opts: OwnCrawlerOptions = {}) {
    this.fetch = opts.fetch ?? globalThis.fetch;
  }

  async scan(domain: string, _mode: ScanMode): Promise<VendorScanResult> {
    const [dnsR, emailR, tlsR, webR, networkR, breachR, reputationR] = await Promise.allSettled([
      this.checkDns(domain),
      this.checkEmail(domain),
      this.checkTls(domain),
      this.checkWeb(domain),
      this.checkNetwork(domain),
      this.checkBreach(domain),
      this.checkReputation(domain),
    ]);

    function unwrap(
      r: PromiseSettledResult<{ score: number; findings: ScanFinding[] }>,
      fallbackScore = 50,
    ) {
      return r.status === 'fulfilled' ? r.value : { score: fallbackScore, findings: [] };
    }

    const dns_ = unwrap(dnsR);
    const email_ = unwrap(emailR);
    const tls_ = unwrap(tlsR);
    const web_ = unwrap(webR);
    const network_ = unwrap(networkR);
    const breach_ = unwrap(breachR);
    const reputation_ = unwrap(reputationR);

    const score = Math.round(
      dns_.score * 0.15 +
        email_.score * 0.15 +
        tls_.score * 0.2 +
        web_.score * 0.15 +
        network_.score * 0.15 +
        breach_.score * 0.1 +
        reputation_.score * 0.1,
    );

    const findings = [
      ...dns_.findings,
      ...email_.findings,
      ...tls_.findings,
      ...web_.findings,
      ...network_.findings,
      ...breach_.findings,
      ...reputation_.findings,
    ];

    const breakdown: Record<ScanCategory, CategoryResult> = {
      dns: cat(dns_.score, dns_.findings.length),
      email: cat(email_.score, email_.findings.length),
      tls: cat(tls_.score, tls_.findings.length),
      web: cat(web_.score, web_.findings.length),
      network: cat(network_.score, network_.findings.length),
      breach: cat(breach_.score, breach_.findings.length),
      reputation: cat(reputation_.score, reputation_.findings.length),
    };

    return { score, grade: grade(score), breakdown, findings };
  }

  private async checkDns(domain: string): Promise<{ score: number; findings: ScanFinding[] }> {
    const findings: ScanFinding[] = [];
    let score = 100;

    try {
      await dns.resolve4(domain);
    } catch {
      findings.push({
        category: 'dns',
        severity: 'high',
        title: 'No A record',
        detail: `${domain} has no IPv4 A record.`,
        remediation: 'Ensure DNS A record is configured.',
      });
      score -= 30;
    }

    try {
      const mx = await dns.resolveMx(domain);
      if (mx.length === 0) {
        findings.push({
          category: 'dns',
          severity: 'medium',
          title: 'No MX record',
          detail: 'Domain has no MX records configured.',
          remediation: 'Configure MX records for mail delivery.',
        });
        score -= 15;
      }
    } catch {
      score -= 10;
    }

    try {
      const ns = await dns.resolveNs(domain);
      if (ns.length < 2) {
        findings.push({
          category: 'dns',
          severity: 'low',
          title: 'Single nameserver',
          detail: 'Only one NS record found — no redundancy.',
          remediation: 'Add a secondary nameserver for redundancy.',
        });
        score -= 10;
      }
    } catch {
      score -= 5;
    }

    return { score: Math.max(0, score), findings };
  }

  private async checkEmail(domain: string): Promise<{ score: number; findings: ScanFinding[] }> {
    const findings: ScanFinding[] = [];
    let score = 100;

    try {
      const txt = await dns.resolveTxt(domain);
      const flat = txt.flat();
      const hasSPF = flat.some((r) => r.startsWith('v=spf1'));
      const hasDMARC = flat.some((r) => r.includes('v=DMARC1'));

      if (!hasSPF) {
        findings.push({
          category: 'email',
          severity: 'high',
          title: 'No SPF record',
          detail: 'Domain has no SPF TXT record.',
          remediation: 'Add an SPF record to prevent email spoofing.',
        });
        score -= 35;
      }

      if (!hasDMARC) {
        findings.push({
          category: 'email',
          severity: 'high',
          title: 'No DMARC policy',
          detail: 'Domain has no DMARC TXT record.',
          remediation: 'Add a DMARC record with at least p=quarantine.',
        });
        score -= 35;
      }
    } catch {
      score -= 20;
    }

    return { score: Math.max(0, score), findings };
  }

  private checkTls(domain: string): Promise<{ score: number; findings: ScanFinding[] }> {
    return new Promise((resolve) => {
      const findings: ScanFinding[] = [];
      let score = 100;

      const socket = tls.connect(
        { host: domain, port: 443, servername: domain, timeout: 5000 },
        () => {
          const cert = socket.getPeerCertificate();
          const protocol = socket.getProtocol();
          socket.destroy();

          if (protocol === 'TLSv1' || protocol === 'TLSv1.1') {
            findings.push({
              category: 'tls',
              severity: 'high',
              title: `Legacy TLS: ${protocol}`,
              detail: `Server negotiated ${protocol} which is deprecated.`,
              remediation: 'Disable TLS 1.0 and 1.1; require TLS 1.2+.',
            });
            score -= 40;
          }

          if (cert && cert.valid_to) {
            const expiry = new Date(cert.valid_to);
            const daysLeft = Math.floor((expiry.getTime() - Date.now()) / 86_400_000);
            if (daysLeft < 30) {
              findings.push({
                category: 'tls',
                severity: daysLeft < 7 ? 'critical' : 'high',
                title: `Certificate expires in ${daysLeft} days`,
                detail: `Certificate for ${domain} expires ${cert.valid_to}.`,
                remediation: 'Renew the TLS certificate immediately.',
              });
              score -= daysLeft < 7 ? 50 : 25;
            }
          }

          resolve({ score: Math.max(0, score), findings });
        },
      );

      socket.on('error', () => {
        findings.push({
          category: 'tls',
          severity: 'critical',
          title: 'TLS connection failed',
          detail: `Could not establish TLS connection to ${domain}:443.`,
          remediation: 'Ensure HTTPS is enabled and certificate is valid.',
        });
        resolve({ score: 0, findings });
      });
    });
  }

  private async checkWeb(domain: string): Promise<{ score: number; findings: ScanFinding[] }> {
    const findings: ScanFinding[] = [];
    let score = 100;

    try {
      const res = await this.fetch(`https://${domain}`, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000),
      });

      const headers = res.headers;
      const checks: Array<{ header: string; title: string; remediation: string }> = [
        {
          header: 'strict-transport-security',
          title: 'Missing HSTS header',
          remediation: 'Add Strict-Transport-Security with max-age >= 31536000.',
        },
        {
          header: 'x-content-type-options',
          title: 'Missing X-Content-Type-Options',
          remediation: 'Add X-Content-Type-Options: nosniff.',
        },
        {
          header: 'x-frame-options',
          title: 'Missing X-Frame-Options',
          remediation: 'Add X-Frame-Options: DENY or SAMEORIGIN.',
        },
        {
          header: 'content-security-policy',
          title: 'Missing Content-Security-Policy',
          remediation: 'Implement a strict CSP header.',
        },
      ];

      for (const check of checks) {
        if (!headers.get(check.header)) {
          findings.push({
            category: 'web',
            severity: 'medium',
            title: check.title,
            detail: `Response from ${domain} is missing the ${check.header} header.`,
            remediation: check.remediation,
          });
          score -= 15;
        }
      }
    } catch {
      score -= 20;
    }

    return { score: Math.max(0, score), findings };
  }

  private async checkNetwork(domain: string): Promise<{ score: number; findings: ScanFinding[] }> {
    if (!this.opts.shodanApiKey) return { score: 70, findings: [] };

    const findings: ScanFinding[] = [];
    let score = 100;

    try {
      const ips = await dns.resolve4(domain);
      const ip = ips[0];
      const res = await this.fetch(
        `https://api.shodan.io/shodan/host/${ip}?key=${this.opts.shodanApiKey}`,
        {
          signal: AbortSignal.timeout(8000),
        },
      );
      if (res.ok) {
        const data = (await res.json()) as { ports?: number[] };
        const riskyPorts = (data.ports ?? []).filter((p) => [21, 23, 3389, 5900, 445].includes(p));
        for (const port of riskyPorts) {
          findings.push({
            category: 'network',
            severity: 'high',
            title: `Risky port ${port} exposed`,
            detail: `Port ${port} is publicly accessible on ${ip}.`,
            remediation: `Close or firewall port ${port} from public internet.`,
          });
          score -= 20;
        }
      }
    } catch {
      // Shodan unavailable — degrade gracefully
    }

    return { score: Math.max(0, score), findings };
  }

  private async checkBreach(domain: string): Promise<{ score: number; findings: ScanFinding[] }> {
    const findings: ScanFinding[] = [];
    let score = 100;

    try {
      const headers: Record<string, string> = { 'User-Agent': 'VendorRiskScanner/1.0' };
      if (this.opts.hibpApiKey) headers['hibp-api-key'] = this.opts.hibpApiKey;

      const res = await this.fetch(`https://haveibeenpwned.com/api/v3/breacheddomain/${domain}`, {
        headers,
        signal: AbortSignal.timeout(8000),
      });

      if (res.status === 200) {
        const breaches = (await res.json()) as unknown[];
        if (breaches.length > 0) {
          findings.push({
            category: 'breach',
            severity: breaches.length > 3 ? 'critical' : 'high',
            title: `${breaches.length} known data breach(es)`,
            detail: `Domain ${domain} appears in ${breaches.length} breach dataset(s).`,
            remediation: 'Notify affected users and enforce password resets.',
          });
          score -= Math.min(50, breaches.length * 15);
        }
      }
    } catch {
      // HIBP unavailable — no penalty
    }

    return { score: Math.max(0, score), findings };
  }

  private async checkReputation(
    domain: string,
  ): Promise<{ score: number; findings: ScanFinding[] }> {
    if (!this.opts.abuseipdbApiKey) return { score: 70, findings: [] };

    const findings: ScanFinding[] = [];
    let score = 100;

    try {
      const ips = await dns.resolve4(domain);
      const ip = ips[0];
      const res = await this.fetch(
        `https://api.abuseipdb.com/api/v2/check?ipAddress=${ip}&maxAgeInDays=90`,
        {
          headers: { Key: this.opts.abuseipdbApiKey, Accept: 'application/json' },
          signal: AbortSignal.timeout(8000),
        },
      );
      if (res.ok) {
        const data = (await res.json()) as { data?: { abuseConfidenceScore?: number } };
        const abuseScore = data.data?.abuseConfidenceScore ?? 0;
        if (abuseScore > 25) {
          findings.push({
            category: 'reputation',
            severity: abuseScore > 75 ? 'critical' : 'high',
            title: `IP abuse confidence: ${abuseScore}%`,
            detail: `IP ${ip} has ${abuseScore}% abuse confidence on AbuseIPDB.`,
            remediation: 'Investigate IP reputation and consider migrating to a cleaner IP range.',
          });
          score -= Math.min(60, abuseScore);
        }
      }
    } catch {
      // AbuseIPDB unavailable — no penalty
    }

    return { score: Math.max(0, score), findings };
  }
}
```

- [ ] **Step 2: Create `libs/vendor-risk-strategies/crawler/src/lib/__tests__/own-crawler.contract.unit.test.ts`**

```typescript
import { vi } from 'vitest';
import { runVendorRiskContract } from '@icore/shared/testing';
import { OwnCrawlerStrategy } from '../own-crawler.strategy';

vi.mock('node:dns/promises', () => ({
  resolve4: vi.fn().mockResolvedValue(['1.2.3.4']),
  resolveMx: vi.fn().mockResolvedValue([{ exchange: 'mail.example.com', priority: 10 }]),
  resolveNs: vi.fn().mockResolvedValue(['ns1.example.com', 'ns2.example.com']),
  resolveTxt: vi
    .fn()
    .mockResolvedValue([['v=spf1 include:_spf.example.com ~all'], ['v=DMARC1; p=quarantine']]),
}));

vi.mock('node:tls', () => ({
  connect: vi.fn().mockImplementation((_opts: unknown, cb: () => void) => {
    const socket = {
      getPeerCertificate: () => ({ valid_to: new Date(Date.now() + 90 * 86400000).toISOString() }),
      getProtocol: () => 'TLSv1.3',
      destroy: vi.fn(),
      on: vi.fn(),
    };
    setTimeout(cb, 0);
    return socket;
  }),
}));

function makeFakeFetch(score: number) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: {
      get: (h: string) =>
        [
          'strict-transport-security',
          'x-content-type-options',
          'x-frame-options',
          'content-security-policy',
        ].includes(h)
          ? 'present'
          : null,
    },
    json: async () => (score < 80 ? [{ Name: 'BreachA' }] : []),
  });
}

runVendorRiskContract(
  'OwnCrawlerStrategy (mocked I/O)',
  () => new OwnCrawlerStrategy({ fetch: makeFakeFetch(85) }),
);
```

- [ ] **Step 3: Update `libs/vendor-risk-strategies/crawler/src/index.ts`**

Replace generator content with:

```typescript
export * from './lib/own-crawler.strategy';
```

- [ ] **Step 4: Run crawler tests**

```bash
yarn nx test vendor-risk-crawler
```

Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add libs/vendor-risk-strategies/crawler/
git commit -m "feat(vendor-risk): OwnCrawlerStrategy — DNS/email/TLS/web/network/breach/reputation"
```

---

### Task 6: SecurityScorecardStrategy

**Files:**

- Create: `libs/vendor-risk-strategies/scorecard/src/lib/scorecard.strategy.ts`
- Create: `libs/vendor-risk-strategies/scorecard/src/lib/__tests__/scorecard.contract.unit.test.ts`
- Modify: `libs/vendor-risk-strategies/scorecard/src/index.ts`

- [ ] **Step 1: Create `libs/vendor-risk-strategies/scorecard/src/lib/scorecard.strategy.ts`**

```typescript
import type {
  CategoryResult,
  ScanCategory,
  ScanGrade,
  ScanMode,
  VendorRiskStrategy,
  VendorScanResult,
} from '@icore/shared';

function grade(score: number): ScanGrade {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

const SC_TO_CATEGORY: Record<string, ScanCategory> = {
  dns_health: 'dns',
  email_security: 'email',
  ssl: 'tls',
  application_security: 'web',
  network_security: 'network',
  leaked_information: 'breach',
  hacker_forum: 'reputation',
};

export interface SecurityScorecardOptions {
  apiKey: string;
  fetch?: typeof globalThis.fetch;
}

export class SecurityScorecardStrategy implements VendorRiskStrategy {
  private readonly fetch: typeof globalThis.fetch;

  constructor(private readonly opts: SecurityScorecardOptions) {
    this.fetch = opts.fetch ?? globalThis.fetch;
  }

  async scan(domain: string, _mode: ScanMode): Promise<VendorScanResult> {
    const res = await this.fetch(`https://api.securityscorecard.io/companies/${domain}/factors`, {
      headers: { Authorization: `Token ${this.opts.apiKey}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) throw new Error(`SecurityScorecard API ${res.status} for ${domain}`);

    const data = (await res.json()) as {
      score?: number;
      grade?: string;
      entries?: Array<{ key: string; score: number; findings?: unknown[] }>;
    };

    const overallScore = data.score ?? 50;
    const entries = data.entries ?? [];

    const breakdown: Record<ScanCategory, CategoryResult> = {
      dns: { score: 50, grade: 'D', findingCount: 0 },
      email: { score: 50, grade: 'D', findingCount: 0 },
      tls: { score: 50, grade: 'D', findingCount: 0 },
      web: { score: 50, grade: 'D', findingCount: 0 },
      network: { score: 50, grade: 'D', findingCount: 0 },
      breach: { score: 50, grade: 'D', findingCount: 0 },
      reputation: { score: 50, grade: 'D', findingCount: 0 },
    };

    for (const entry of entries) {
      const cat = SC_TO_CATEGORY[entry.key];
      if (cat) {
        breakdown[cat] = {
          score: entry.score,
          grade: grade(entry.score),
          findingCount: entry.findings?.length ?? 0,
        };
      }
    }

    return {
      score: overallScore,
      grade: grade(overallScore),
      breakdown,
      findings: [],
      scorecardData: data,
    };
  }
}
```

- [ ] **Step 2: Create `libs/vendor-risk-strategies/scorecard/src/lib/__tests__/scorecard.contract.unit.test.ts`**

```typescript
import { vi } from 'vitest';
import { runVendorRiskContract } from '@icore/shared/testing';
import { SecurityScorecardStrategy } from '../scorecard.strategy';

const fakeFetch = vi.fn().mockResolvedValue({
  ok: true,
  status: 200,
  json: async () => ({
    score: 82,
    grade: 'B',
    entries: [
      { key: 'dns_health', score: 90, findings: [] },
      { key: 'ssl', score: 85, findings: [] },
      { key: 'email_security', score: 78, findings: [{ id: 1 }] },
      { key: 'application_security', score: 80, findings: [] },
      { key: 'network_security', score: 75, findings: [] },
      { key: 'leaked_information', score: 88, findings: [] },
      { key: 'hacker_forum', score: 92, findings: [] },
    ],
  }),
});

runVendorRiskContract(
  'SecurityScorecardStrategy (mocked API)',
  () => new SecurityScorecardStrategy({ apiKey: 'test-key', fetch: fakeFetch }),
);
```

- [ ] **Step 3: Update `libs/vendor-risk-strategies/scorecard/src/index.ts`**

```typescript
export * from './lib/scorecard.strategy';
```

- [ ] **Step 4: Run scorecard tests**

```bash
yarn nx test vendor-risk-scorecard
```

Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add libs/vendor-risk-strategies/scorecard/
git commit -m "feat(vendor-risk): SecurityScorecardStrategy"
```

---

### Task 7: vendor-risk-client lib

**Files:**

- Create: `libs/vendor-risk-client/src/lib/vendor-risk-client.tokens.ts`
- Create: `libs/vendor-risk-client/src/lib/vendor-risk-client.module.ts`
- Create: `libs/vendor-risk-client/src/lib/vendor-risk-client.service.ts`
- Modify: `libs/vendor-risk-client/src/index.ts`

- [ ] **Step 1: Create tokens file**

`libs/vendor-risk-client/src/lib/vendor-risk-client.tokens.ts`:

```typescript
export const VENDOR_RISK_CLIENT = 'VENDOR_RISK_CLIENT';
```

- [ ] **Step 2: Create module**

`libs/vendor-risk-client/src/lib/vendor-risk-client.module.ts`:

```typescript
import { DynamicModule, Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { buildTransport } from '@icore/shared';
import { VENDOR_RISK_CLIENT } from './vendor-risk-client.tokens';
import { VendorRiskClientService } from './vendor-risk-client.service';

@Module({})
export class VendorRiskClientModule {
  static forRoot(): DynamicModule {
    return {
      module: VendorRiskClientModule,
      imports: [
        ClientsModule.registerAsync([
          {
            name: VENDOR_RISK_CLIENT,
            useFactory: () => buildTransport('VENDOR_RISK'),
          },
        ]),
      ],
      providers: [VendorRiskClientService],
      exports: [VendorRiskClientService],
    };
  }
}
```

- [ ] **Step 3: Create service**

`libs/vendor-risk-client/src/lib/vendor-risk-client.service.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import type { Vendor, VendorInput, VendorScan, VendorAiAnalysis } from '@icore/shared';
import { VENDOR_RISK_CLIENT } from './vendor-risk-client.tokens';

const SCAN_TIMEOUT_MS = 120_000;
const DEFAULT_TIMEOUT_MS = 15_000;

@Injectable()
export class VendorRiskClientService {
  constructor(@Inject(VENDOR_RISK_CLIENT) private readonly client: ClientProxy) {}

  listVendors(orgId: string): Promise<Vendor[]> {
    return firstValueFrom(
      this.client
        .send<Vendor[]>('vendor.list', { orgId })
        .pipe(timeout({ each: DEFAULT_TIMEOUT_MS })),
    );
  }

  getVendor(id: string): Promise<Vendor | null> {
    return firstValueFrom(
      this.client
        .send<Vendor | null>('vendor.get', { id })
        .pipe(timeout({ each: DEFAULT_TIMEOUT_MS })),
    );
  }

  createVendor(orgId: string, input: VendorInput): Promise<Vendor> {
    return firstValueFrom(
      this.client
        .send<Vendor>('vendor.create', { orgId, input })
        .pipe(timeout({ each: SCAN_TIMEOUT_MS })),
    );
  }

  updateVendor(id: string, patch: Partial<VendorInput>): Promise<Vendor> {
    return firstValueFrom(
      this.client
        .send<Vendor>('vendor.update', { id, patch })
        .pipe(timeout({ each: DEFAULT_TIMEOUT_MS })),
    );
  }

  deleteVendor(id: string): Promise<void> {
    return firstValueFrom(
      this.client.send<void>('vendor.delete', { id }).pipe(timeout({ each: DEFAULT_TIMEOUT_MS })),
    );
  }

  triggerScan(id: string, mode: 'baseline' | 'deep'): Promise<VendorScan> {
    return firstValueFrom(
      this.client
        .send<VendorScan>('vendor.scan', { id, mode })
        .pipe(timeout({ each: SCAN_TIMEOUT_MS })),
    );
  }

  listScans(vendorId: string): Promise<VendorScan[]> {
    return firstValueFrom(
      this.client
        .send<VendorScan[]>('vendor.scans.list', { vendorId })
        .pipe(timeout({ each: DEFAULT_TIMEOUT_MS })),
    );
  }

  getScan(scanId: string): Promise<VendorScan & { analysis: VendorAiAnalysis | null }> {
    return firstValueFrom(
      this.client
        .send<VendorScan & { analysis: VendorAiAnalysis | null }>('vendor.scans.get', { scanId })
        .pipe(timeout({ each: DEFAULT_TIMEOUT_MS })),
    );
  }
}
```

- [ ] **Step 4: Update `libs/vendor-risk-client/src/index.ts`**

```typescript
export * from './lib/vendor-risk-client.tokens';
export * from './lib/vendor-risk-client.module';
export * from './lib/vendor-risk-client.service';
```

- [ ] **Step 5: Build vendor-risk-client**

```bash
yarn nx build vendor-risk-client
```

Expected: success

- [ ] **Step 6: Commit**

```bash
git add libs/vendor-risk-client/src/
git commit -m "feat(vendor-risk-client): TCP proxy lib for vendor-risk MS"
```

---

### Task 8: Supabase DB migration

**Files:**

- Create: `supabase/migrations/<timestamp>_vendor_risk.sql`

- [ ] **Step 1: Get timestamp**

```bash
date +%Y%m%d%H%M%S
```

- [ ] **Step 2: Create migration file** (use timestamp from Step 1 as prefix)

`supabase/migrations/<timestamp>_vendor_risk.sql`:

```sql
-- vendors
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

-- vendor_scans
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

-- vendor_ai_analyses
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

-- vendor_alert_events
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

create index on public.vendor_scans (vendor_id, scanned_at desc);
create index on public.vendors (org_id);
```

- [ ] **Step 3: Apply migration via Supabase MCP**

Use `mcp__plugin_supabase_supabase__apply_migration` with the SQL above.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/
git commit -m "feat(db): vendor_risk tables — vendors, vendor_scans, vendor_ai_analyses, vendor_alert_events"
```

---

### Task 9: vendor-risk MS — app module + hybrid strategy + controller

**Files:**

- Modify: `apps/microservices/vendor-risk/src/main.ts`
- Create: `apps/microservices/vendor-risk/src/app/hybrid-vendor-risk.strategy.ts`
- Create: `apps/microservices/vendor-risk/src/app/vendor-risk.service.ts`
- Create: `apps/microservices/vendor-risk/src/app/vendor-risk.controller.ts`
- Create: `apps/microservices/vendor-risk/src/app/app.module.ts`
- Create: `apps/microservices/vendor-risk/.env.example`

- [ ] **Step 1: Replace `apps/microservices/vendor-risk/src/main.ts`**

```typescript
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions } from '@nestjs/microservices';
import { bootstrapMicroservice, buildTransportMS } from '@icore/shared';
import { AppModule } from './app/app.module';

void bootstrapMicroservice(
  'VENDOR_RISK',
  () =>
    NestFactory.createMicroservice<MicroserviceOptions>(AppModule, buildTransportMS('VENDOR_RISK')),
  new Logger('VendorRisk-Bootstrap'),
);
```

- [ ] **Step 2: Create `apps/microservices/vendor-risk/src/app/hybrid-vendor-risk.strategy.ts`**

```typescript
import type { ScanMode, VendorRiskStrategy, VendorScanResult } from '@icore/shared';
import type { OwnCrawlerStrategy } from '@icore/vendor-risk-crawler';
import type { SecurityScorecardStrategy } from '@icore/vendor-risk-scorecard';

export class HybridVendorRiskStrategy implements VendorRiskStrategy {
  constructor(
    private readonly crawler: OwnCrawlerStrategy,
    private readonly scorecard: SecurityScorecardStrategy | null,
  ) {}

  async scan(domain: string, mode: ScanMode): Promise<VendorScanResult> {
    if (mode === 'baseline' || !this.scorecard) {
      return this.crawler.scan(domain, mode);
    }

    const [crawlerResult, scorecardResult] = await Promise.allSettled([
      this.crawler.scan(domain, mode),
      this.scorecard.scan(domain, mode),
    ]);

    const base = crawlerResult.status === 'fulfilled' ? crawlerResult.value : null;
    const sc = scorecardResult.status === 'fulfilled' ? scorecardResult.value : null;

    if (!base && !sc) throw new Error(`Both strategies failed for ${domain}`);
    if (!sc) return base!;
    if (!base) return sc;

    // SC wins on score + breakdown; merge findings from both
    return {
      score: sc.score,
      grade: sc.grade,
      breakdown: sc.breakdown,
      findings: [...base.findings, ...sc.findings],
      scorecardData: sc.scorecardData,
    };
  }
}
```

- [ ] **Step 3: Create `apps/microservices/vendor-risk/src/app/vendor-risk.service.ts`**

```typescript
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import type { AiClientService } from '@icore/ai-client';
import type {
  ScanCategory,
  ScanMode,
  Vendor,
  VendorAiAnalysis,
  VendorInput,
  VendorRiskStrategy,
  VendorScan,
} from '@icore/shared';

@Injectable()
export class VendorRiskService {
  private readonly logger = new Logger(VendorRiskService.name);

  constructor(
    private readonly db: SupabaseClient,
    private readonly strategy: VendorRiskStrategy,
    private readonly ai: AiClientService,
  ) {}

  async listVendors(orgId: string): Promise<Vendor[]> {
    const { data, error } = await this.db
      .from('vendors')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(this.mapVendor);
  }

  async getVendor(id: string): Promise<Vendor | null> {
    const { data, error } = await this.db.from('vendors').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? this.mapVendor(data) : null;
  }

  async createVendor(orgId: string, input: VendorInput): Promise<Vendor> {
    const { data, error } = await this.db
      .from('vendors')
      .insert({
        org_id: orgId,
        name: input.name,
        domain: input.domain,
        tags: input.tags,
        tier: input.tier,
        rescan_interval_days: input.rescanIntervalDays,
        alert_threshold: input.alertThreshold,
      })
      .select('*')
      .single();
    if (error) throw error;
    const vendor = this.mapVendor(data);
    this.runScan(vendor.id, 'baseline').catch((err) =>
      this.logger.error(`Initial scan failed for ${vendor.domain}: ${err}`),
    );
    return vendor;
  }

  async updateVendor(id: string, patch: Partial<VendorInput>): Promise<Vendor> {
    const update: Record<string, unknown> = {};
    if (patch.name !== undefined) update['name'] = patch.name;
    if (patch.domain !== undefined) update['domain'] = patch.domain;
    if (patch.tags !== undefined) update['tags'] = patch.tags;
    if (patch.tier !== undefined) update['tier'] = patch.tier;
    if (patch.rescanIntervalDays !== undefined)
      update['rescan_interval_days'] = patch.rescanIntervalDays;
    if (patch.alertThreshold !== undefined) update['alert_threshold'] = patch.alertThreshold;
    update['updated_at'] = new Date().toISOString();

    const { data, error } = await this.db
      .from('vendors')
      .update(update)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return this.mapVendor(data);
  }

  async deleteVendor(id: string): Promise<void> {
    const { error } = await this.db.from('vendors').delete().eq('id', id);
    if (error) throw error;
  }

  async runScan(vendorId: string, mode: ScanMode): Promise<VendorScan> {
    const vendor = await this.getVendor(vendorId);
    if (!vendor) throw new NotFoundException(`Vendor ${vendorId} not found`);

    this.logger.log(`Scanning ${vendor.domain} [${mode}]`);
    const result = await this.strategy.scan(vendor.domain, mode);

    const triggeredBy = mode === 'deep' ? 'deep' : 'manual';
    const { data: scanRow, error: scanErr } = await this.db
      .from('vendor_scans')
      .insert({
        vendor_id: vendorId,
        triggered_by: triggeredBy,
        score: result.score,
        grade: result.grade,
        breakdown: result.breakdown,
        findings: result.findings,
        scorecard_data: result.scorecardData ?? null,
      })
      .select('*')
      .single();
    if (scanErr) throw scanErr;

    await this.db
      .from('vendors')
      .update({ last_scanned_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', vendorId);

    const scan = this.mapScan(scanRow);

    this.runAnalysis(vendor.domain, scan).catch((err) =>
      this.logger.error(`AI analysis failed for scan ${scan.id}: ${err}`),
    );

    return scan;
  }

  async runScheduledScans(): Promise<void> {
    const cutoff = new Date();
    const { data: vendors } = await this.db
      .from('vendors')
      .select('*')
      .or(`last_scanned_at.is.null,last_scanned_at.lt.${cutoff.toISOString()}`)
      .order('tier', { ascending: false });

    if (!vendors?.length) return;

    const CONCURRENCY = 5;
    for (let i = 0; i < vendors.length; i += CONCURRENCY) {
      const batch = vendors.slice(i, i + CONCURRENCY);
      await Promise.allSettled(
        batch.map(async (v: Record<string, unknown>) => {
          const vendor = this.mapVendor(v);
          const lastScanned = vendor.lastScannedAt ? new Date(vendor.lastScannedAt) : null;
          const intervalMs = vendor.rescanIntervalDays * 86_400_000;
          if (lastScanned && Date.now() - lastScanned.getTime() < intervalMs) return;
          const prevScan = await this.getLatestScan(vendor.id);
          const scan = await this.runScan(vendor.id, 'baseline');
          if (prevScan) await this.checkAndFireAlert(vendor, prevScan.score, scan);
        }),
      );
    }
  }

  async listScans(vendorId: string): Promise<VendorScan[]> {
    const { data, error } = await this.db
      .from('vendor_scans')
      .select('*')
      .eq('vendor_id', vendorId)
      .order('scanned_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(this.mapScan);
  }

  async getScan(scanId: string): Promise<VendorScan & { analysis: VendorAiAnalysis | null }> {
    const { data: scan, error } = await this.db
      .from('vendor_scans')
      .select('*')
      .eq('id', scanId)
      .maybeSingle();
    if (error) throw error;
    if (!scan) throw new NotFoundException(`Scan ${scanId} not found`);

    const { data: analysis } = await this.db
      .from('vendor_ai_analyses')
      .select('*')
      .eq('scan_id', scanId)
      .maybeSingle();

    return { ...this.mapScan(scan), analysis: analysis ? this.mapAnalysis(analysis) : null };
  }

  private async getLatestScan(vendorId: string): Promise<VendorScan | null> {
    const { data } = await this.db
      .from('vendor_scans')
      .select('*')
      .eq('vendor_id', vendorId)
      .order('scanned_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data ? this.mapScan(data) : null;
  }

  private async runAnalysis(domain: string, scan: VendorScan): Promise<void> {
    const result = await this.ai.analyzeVendorPosture({
      domain,
      findings: scan.findings,
      breakdown: scan.breakdown,
    });

    await this.db.from('vendor_ai_analyses').insert({
      scan_id: scan.id,
      vendor_id: scan.vendorId,
      summary: result.summary,
      risk_rating: result.riskRating,
      recommendations: result.recommendations,
      model: 'claude-sonnet-4-6',
      input_tokens: 0,
      output_tokens: 0,
    });
  }

  private async checkAndFireAlert(
    vendor: Vendor,
    scoreBefore: number,
    scan: VendorScan,
  ): Promise<void> {
    const drop = scoreBefore - scan.score;
    if (drop < vendor.alertThreshold) return;

    await this.db.from('vendor_alert_events').insert({
      vendor_id: vendor.id,
      scan_id: scan.id,
      score_before: scoreBefore,
      score_after: scan.score,
      drop,
      channels: ['push'],
    });

    this.logger.warn(
      `Alert: ${vendor.domain} score dropped ${drop} points (${scoreBefore} → ${scan.score})`,
    );
  }

  private mapVendor(row: Record<string, unknown>): Vendor {
    return {
      id: row['id'] as string,
      orgId: row['org_id'] as string,
      name: row['name'] as string,
      domain: row['domain'] as string,
      tags: (row['tags'] as string[]) ?? [],
      tier: row['tier'] as Vendor['tier'],
      rescanIntervalDays: row['rescan_interval_days'] as number,
      alertThreshold: row['alert_threshold'] as number,
      lastScannedAt: (row['last_scanned_at'] as string | null) ?? null,
      createdAt: row['created_at'] as string,
      updatedAt: row['updated_at'] as string,
    };
  }

  private mapScan(row: Record<string, unknown>): VendorScan {
    return {
      id: row['id'] as string,
      vendorId: row['vendor_id'] as string,
      triggeredBy: row['triggered_by'] as VendorScan['triggeredBy'],
      score: row['score'] as number,
      grade: row['grade'] as VendorScan['grade'],
      breakdown: row['breakdown'] as Record<ScanCategory, import('@icore/shared').CategoryResult>,
      findings: (row['findings'] as import('@icore/shared').ScanFinding[]) ?? [],
      scorecardData: row['scorecard_data'] ?? null,
      scannedAt: row['scanned_at'] as string,
    };
  }

  private mapAnalysis(row: Record<string, unknown>): VendorAiAnalysis {
    return {
      id: row['id'] as string,
      scanId: row['scan_id'] as string,
      vendorId: row['vendor_id'] as string,
      summary: row['summary'] as string,
      riskRating: row['risk_rating'] as VendorAiAnalysis['riskRating'],
      recommendations: row['recommendations'] as VendorAiAnalysis['recommendations'],
      model: row['model'] as string,
      inputTokens: row['input_tokens'] as number,
      outputTokens: row['output_tokens'] as number,
      createdAt: row['created_at'] as string,
    };
  }
}
```

- [ ] **Step 4: Create `apps/microservices/vendor-risk/src/app/vendor-risk.controller.ts`**

```typescript
import { Controller, Inject } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import type { Vendor, VendorAiAnalysis, VendorInput, VendorScan } from '@icore/shared';
import { VendorRiskService } from './vendor-risk.service';

@Controller()
export class VendorRiskController {
  constructor(@Inject(VendorRiskService) private readonly svc: VendorRiskService) {}

  @MessagePattern('vendor.list')
  list(@Payload() payload: { orgId: string }): Promise<Vendor[]> {
    return this.svc.listVendors(payload.orgId);
  }

  @MessagePattern('vendor.get')
  get(@Payload() payload: { id: string }): Promise<Vendor | null> {
    return this.svc.getVendor(payload.id);
  }

  @MessagePattern('vendor.create')
  create(@Payload() payload: { orgId: string; input: VendorInput }): Promise<Vendor> {
    return this.svc.createVendor(payload.orgId, payload.input);
  }

  @MessagePattern('vendor.update')
  update(@Payload() payload: { id: string; patch: Partial<VendorInput> }): Promise<Vendor> {
    return this.svc.updateVendor(payload.id, payload.patch);
  }

  @MessagePattern('vendor.delete')
  delete(@Payload() payload: { id: string }): Promise<void> {
    return this.svc.deleteVendor(payload.id);
  }

  @MessagePattern('vendor.scan')
  scan(@Payload() payload: { id: string; mode: 'baseline' | 'deep' }): Promise<VendorScan> {
    return this.svc.runScan(payload.id, payload.mode);
  }

  @MessagePattern('vendor.scans.list')
  listScans(@Payload() payload: { vendorId: string }): Promise<VendorScan[]> {
    return this.svc.listScans(payload.vendorId);
  }

  @MessagePattern('vendor.scans.get')
  getScan(
    @Payload() payload: { scanId: string },
  ): Promise<VendorScan & { analysis: VendorAiAnalysis | null }> {
    return this.svc.getScan(payload.scanId);
  }
}
```

- [ ] **Step 5: Create `apps/microservices/vendor-risk/src/app/vendor-risk-scheduler.service.ts`**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { VendorRiskService } from './vendor-risk.service';

@Injectable()
export class VendorRiskSchedulerService {
  private readonly logger = new Logger(VendorRiskSchedulerService.name);

  constructor(private readonly svc: VendorRiskService) {}

  @Cron(CronExpression.EVERY_6_HOURS)
  async runScheduledScans(): Promise<void> {
    this.logger.log('Scheduled scan run started');
    try {
      await this.svc.runScheduledScans();
      this.logger.log('Scheduled scan run complete');
    } catch (err) {
      this.logger.error(`Scheduled scan run failed: ${err}`);
    }
  }
}
```

- [ ] **Step 6: Create `apps/microservices/vendor-risk/src/app/app.module.ts`**

```typescript
import { join } from 'node:path';
import { Module, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { createClient } from '@supabase/supabase-js';
import { AiClientModule } from '@icore/ai-client';
import { OwnCrawlerStrategy } from '@icore/vendor-risk-crawler';
import { SecurityScorecardStrategy } from '@icore/vendor-risk-scorecard';
import { FakeVendorRiskStrategy, formatEnvBanner, missingEnv } from '@icore/shared';
import type { VendorRiskStrategy } from '@icore/shared';
import { VendorRiskController } from './vendor-risk.controller';
import { VendorRiskService } from './vendor-risk.service';
import { VendorRiskSchedulerService } from './vendor-risk-scheduler.service';
import { HybridVendorRiskStrategy } from './hybrid-vendor-risk.strategy';

const ENV_PATH = 'apps/microservices/vendor-risk/.env';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        join(process.cwd(), 'apps/microservices/vendor-risk/.env'),
        join(process.cwd(), '.env'),
      ],
    }),
    ScheduleModule.forRoot(),
    AiClientModule.forRoot(),
  ],
  controllers: [VendorRiskController],
  providers: [
    {
      provide: 'VendorRiskStrategy',
      useFactory: (cfg: ConfigService): VendorRiskStrategy => {
        const logger = new Logger('VendorRiskStrategy');
        const provider = cfg.get<string>('VENDOR_RISK_PROVIDER')?.trim() ?? 'hybrid';
        const missing = missingEnv(
          (k) => cfg.get<string>(k),
          ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
        );

        if (missing.length > 0) {
          const banner = formatEnvBanner({
            service: 'vendor-risk MS',
            provider,
            missing,
            envPath: ENV_PATH,
          });
          if (process.env['NODE_ENV'] === 'production') throw new Error(banner);
          logger.warn(banner);
          return new FakeVendorRiskStrategy();
        }

        const crawler = new OwnCrawlerStrategy({
          shodanApiKey: cfg.get<string>('SHODAN_API_KEY'),
          hibpApiKey: cfg.get<string>('HIBP_API_KEY'),
          abuseipdbApiKey: cfg.get<string>('ABUSEIPDB_API_KEY'),
        });

        const scorecardKey = cfg.get<string>('SCORECARD_API_KEY');
        const scorecard = scorecardKey
          ? new SecurityScorecardStrategy({ apiKey: scorecardKey })
          : null;

        return new HybridVendorRiskStrategy(crawler, scorecard);
      },
      inject: [ConfigService],
    },
    {
      provide: 'SupabaseClient',
      useFactory: (cfg: ConfigService) =>
        createClient(
          cfg.getOrThrow<string>('SUPABASE_URL'),
          cfg.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY'),
          { auth: { autoRefreshToken: false, persistSession: false } },
        ),
      inject: [ConfigService],
    },
    {
      provide: VendorRiskService,
      useFactory: (
        db: ReturnType<typeof createClient>,
        strategy: VendorRiskStrategy,
        ai: import('@icore/ai-client').AiClientService,
      ) => new VendorRiskService(db, strategy, ai),
      inject: ['SupabaseClient', 'VendorRiskStrategy', import('@icore/ai-client').AiClientService],
    },
    VendorRiskSchedulerService,
  ],
})
export class AppModule {}
```

> **Note:** The `AiClientService` injection in Step 6 needs the class token directly. Replace `import('@icore/ai-client').AiClientService` with the actual imported class `AiClientService` from `@icore/ai-client`.

- [ ] **Step 7: Create `.env.example`**

`apps/microservices/vendor-risk/.env.example`:

```
VENDOR_RISK_PROVIDER=hybrid
VENDOR_RISK_TRANSPORT=tcp
VENDOR_RISK_HOST=127.0.0.1
VENDOR_RISK_PORT=4006
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SHODAN_API_KEY=
HIBP_API_KEY=
ABUSEIPDB_API_KEY=
SCORECARD_API_KEY=
AI_TRANSPORT=tcp
AI_HOST=127.0.0.1
AI_PORT=4005
```

- [ ] **Step 8: Build vendor-risk MS**

```bash
yarn nx build vendor-risk
```

Expected: success

- [ ] **Step 9: Commit**

```bash
git add apps/microservices/vendor-risk/
git commit -m "feat(vendor-risk): MS with HybridStrategy, VendorRiskService, controller, scheduler"
```

---

### Task 10: API Gateway — VendorsModule + VendorsController

**Files:**

- Create: `apps/api/src/app/vendors/vendors.module.ts`
- Create: `apps/api/src/app/vendors/vendors.controller.ts`
- Modify: `apps/api/src/app/app.module.ts`
- Modify: `apps/api/.env` (add VENDOR*RISK*\* vars)

- [ ] **Step 1: Create `apps/api/src/app/vendors/vendors.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { VendorRiskClientModule } from '@icore/vendor-risk-client';
import { VendorsController } from './vendors.controller';

@Module({
  imports: [VendorRiskClientModule.forRoot()],
  controllers: [VendorsController],
})
export class VendorsModule {}
```

- [ ] **Step 2: Create `apps/api/src/app/vendors/vendors.controller.ts`**

```typescript
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { VendorRiskClientService } from '@icore/vendor-risk-client';
import type { VendorInput, VerifiedToken } from '@icore/shared';

@ApiTags('vendors')
@ApiBearerAuth()
@Controller('vendors')
export class VendorsController {
  constructor(private readonly vendorRisk: VendorRiskClientService) {}

  private uid(req: Request & { user?: VerifiedToken }): string {
    const uid = req.user?.uid;
    if (!uid) throw new UnauthorizedException();
    return uid;
  }

  private orgId(req: Request & { user?: VerifiedToken }): string {
    const orgId = req.user?.orgId;
    if (!orgId) throw new UnauthorizedException('No org associated with token');
    return orgId;
  }

  @Get()
  @ApiOperation({ summary: 'List vendors for org' })
  list(@Req() req: Request & { user?: VerifiedToken }) {
    return this.vendorRisk.listVendors(this.orgId(req));
  }

  @Post()
  @ApiOperation({ summary: 'Add vendor (triggers immediate baseline scan)' })
  create(@Body() body: VendorInput, @Req() req: Request & { user?: VerifiedToken }) {
    return this.vendorRisk.createVendor(this.orgId(req), body);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Vendor details + latest scan' })
  async get(@Param('id') id: string) {
    const vendor = await this.vendorRisk.getVendor(id);
    if (!vendor) throw new NotFoundException();
    return vendor;
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update vendor tier / interval / threshold' })
  update(@Param('id') id: string, @Body() body: Partial<VendorInput>) {
    return this.vendorRisk.updateVendor(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove vendor' })
  delete(@Param('id') id: string) {
    return this.vendorRisk.deleteVendor(id);
  }

  @Post(':id/scan')
  @ApiOperation({ summary: 'Manual baseline scan' })
  scan(@Param('id') id: string) {
    return this.vendorRisk.triggerScan(id, 'baseline');
  }

  @Post(':id/scan/deep')
  @ApiOperation({ summary: 'Deep scan (SecurityScorecard API)' })
  deepScan(@Param('id') id: string) {
    return this.vendorRisk.triggerScan(id, 'deep');
  }

  @Get(':id/scans')
  @ApiOperation({ summary: 'Scan history' })
  listScans(@Param('id') id: string) {
    return this.vendorRisk.listScans(id);
  }

  @Get(':id/scans/:scanId')
  @ApiOperation({ summary: 'Scan detail + findings + AI analysis' })
  getScan(@Param('scanId') scanId: string) {
    return this.vendorRisk.getScan(scanId);
  }
}
```

- [ ] **Step 3: Add VendorsModule to `apps/api/src/app/app.module.ts`**

Add import:

```typescript
import { VendorsModule } from './vendors/vendors.module';
```

Add to `imports` array:

```typescript
VendorsModule,
```

- [ ] **Step 4: Add env vars to `apps/api/.env`**

```
VENDOR_RISK_TRANSPORT=tcp
VENDOR_RISK_HOST=127.0.0.1
VENDOR_RISK_PORT=4006
```

- [ ] **Step 5: Build api**

```bash
yarn nx build api
```

Expected: success

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/app/vendors/ apps/api/src/app/app.module.ts apps/api/.env
git commit -m "feat(api): VendorsModule + VendorsController — /api/vendors REST surface"
```

---

### Task 11: Client queries

**Files:**

- Create: `apps/client/src/queries/vendors.ts`

- [ ] **Step 1: Create `apps/client/src/queries/vendors.ts`**

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  Vendor,
  VendorInput,
  VendorScan,
  VendorAiAnalysis,
  CategoryResult,
  ScanCategory,
  ScanFinding,
} from '@icore/shared';

export type {
  Vendor,
  VendorInput,
  VendorScan,
  VendorAiAnalysis,
  CategoryResult,
  ScanCategory,
  ScanFinding,
};

export interface VendorScanDetail extends VendorScan {
  analysis: VendorAiAnalysis | null;
}

export function useVendors() {
  return useQuery<Vendor[]>({
    queryKey: ['vendors'],
    queryFn: () => api<Vendor[]>('/vendors'),
  });
}

export function useVendor(id: string) {
  return useQuery<Vendor>({
    queryKey: ['vendors', id],
    queryFn: () => api<Vendor>(`/vendors/${id}`),
    enabled: !!id,
  });
}

export function useVendorScans(vendorId: string) {
  return useQuery<VendorScan[]>({
    queryKey: ['vendors', vendorId, 'scans'],
    queryFn: () => api<VendorScan[]>(`/vendors/${vendorId}/scans`),
    enabled: !!vendorId,
  });
}

export function useVendorScan(vendorId: string, scanId: string) {
  return useQuery<VendorScanDetail>({
    queryKey: ['vendors', vendorId, 'scans', scanId],
    queryFn: () => api<VendorScanDetail>(`/vendors/${vendorId}/scans/${scanId}`),
    enabled: !!vendorId && !!scanId,
  });
}

export function useCreateVendor() {
  const qc = useQueryClient();
  return useMutation<Vendor, Error, VendorInput>({
    mutationFn: (data) =>
      api<Vendor>('/vendors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vendors'] }),
  });
}

export function useUpdateVendor(id: string) {
  const qc = useQueryClient();
  return useMutation<Vendor, Error, Partial<VendorInput>>({
    mutationFn: (patch) =>
      api<Vendor>(`/vendors/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vendors', id] });
      qc.invalidateQueries({ queryKey: ['vendors'] });
    },
  });
}

export function useDeleteVendor() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => api<void>(`/vendors/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vendors'] }),
  });
}

export function useTriggerScan(vendorId: string) {
  const qc = useQueryClient();
  return useMutation<VendorScan, Error, 'baseline' | 'deep'>({
    mutationFn: (mode) =>
      api<VendorScan>(`/vendors/${vendorId}/scan${mode === 'deep' ? '/deep' : ''}`, {
        method: 'POST',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vendors', vendorId] });
      qc.invalidateQueries({ queryKey: ['vendors', vendorId, 'scans'] });
    },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/client/src/queries/vendors.ts
git commit -m "feat(client): vendor TanStack Query hooks"
```

---

### Task 12: Client /vendors list page

**Files:**

- Create: `apps/client/src/routes/_dashboard/vendors.tsx`

- [ ] **Step 1: Create `apps/client/src/routes/_dashboard/vendors.tsx`**

```typescript
import { useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Globe, Plus, Shield, TrendingDown, TrendingUp, Minus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateVendor, useVendors, type Vendor, type VendorInput } from '@/queries/vendors';

const GRADE_COLOR: Record<string, string> = {
  A: 'text-green-400 border-green-500/30 bg-green-500/10',
  B: 'text-blue-400 border-blue-500/30 bg-blue-500/10',
  C: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  D: 'text-orange-400 border-orange-500/30 bg-orange-500/10',
  F: 'text-red-400 border-red-500/30 bg-red-500/10',
};

const TIER_COLOR: Record<string, string> = {
  critical: 'bg-red-500/10 text-red-400 border-red-500/20',
  high: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  medium: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  low: 'bg-green-500/10 text-green-400 border-green-500/20',
};

function GradeCircle({ grade, score }: { grade: string; score: number }) {
  const colors = GRADE_COLOR[grade] ?? GRADE_COLOR['F'];
  return (
    <div className={`flex flex-col items-center justify-center w-14 h-14 rounded-full border-2 ${colors}`}>
      <span className="text-lg font-bold leading-none">{grade}</span>
      <span className="text-[10px] font-medium opacity-70">{score}</span>
    </div>
  );
}

function VendorCard({ vendor }: { vendor: Vendor }) {
  const { t } = useTranslation();
  const lastScan = vendor.lastScannedAt ? new Date(vendor.lastScannedAt) : null;

  return (
    <Link
      to="/vendors/$id"
      params={{ id: vendor.id }}
      className="group bg-surface border border-border rounded-xl p-5 flex gap-4 hover:border-muted-foreground/40 transition-colors cursor-pointer"
    >
      <GradeCircle grade="?" score={0} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm text-foreground truncate">{vendor.name}</span>
          <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border ${TIER_COLOR[vendor.tier] ?? ''}`}>
            {vendor.tier}
          </span>
        </div>
        <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
          <Globe size={11} />
          <span className="truncate">{vendor.domain}</span>
        </div>
        {lastScan && (
          <p className="text-[10px] text-muted-foreground/60 mt-1">
            {t('vendors.lastScanned', { date: lastScan.toLocaleDateString() })}
          </p>
        )}
        {!lastScan && (
          <p className="text-[10px] text-amber-400/70 mt-1">{t('vendors.neverScanned')}</p>
        )}
      </div>
    </Link>
  );
}

const TIER_OPTIONS: VendorInput['tier'][] = ['critical', 'high', 'medium', 'low'];

function AddVendorDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const create = useCreateVendor();
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [tier, setTier] = useState<VendorInput['tier']>('medium');

  function submit() {
    if (!name.trim() || !domain.trim()) return;
    create.mutate(
      { name: name.trim(), domain: domain.trim(), tier, tags: [], rescanIntervalDays: 7, alertThreshold: 10 },
      { onSuccess: () => { onClose(); setName(''); setDomain(''); } },
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('vendors.addVendor')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <Input placeholder={t('vendors.vendorName')} value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder={t('vendors.domain')} value={domain} onChange={(e) => setDomain(e.target.value)} />
          <Select value={tier} onValueChange={(v) => setTier(v as VendorInput['tier'])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIER_OPTIONS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending && <Loader2 size={14} className="mr-2 animate-spin" />}
            {t('vendors.addVendor')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VendorsPage() {
  const { t } = useTranslation();
  const { data: vendors = [], isPending } = useVendors();
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Shield size={20} className="text-green-500" />
            {t('vendors.title')}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t('vendors.subtitle')}</p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus size={14} className="mr-1.5" />
          {t('vendors.addVendor')}
        </Button>
      </div>

      {isPending ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-surface border border-border rounded-xl p-5 h-24 animate-pulse" />
          ))}
        </div>
      ) : vendors.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Shield size={36} className="text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">{t('vendors.empty')}</p>
          <Button size="sm" variant="outline" className="mt-4" onClick={() => setAddOpen(true)}>
            {t('vendors.addFirst')}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {vendors.map((v) => <VendorCard key={v.id} vendor={v} />)}
        </div>
      )}

      <AddVendorDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}

export const Route = createFileRoute('/_dashboard/vendors')({
  component: VendorsPage,
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/client/src/routes/_dashboard/vendors.tsx
git commit -m "feat(client): /vendors list page"
```

---

### Task 13: Client /vendors/:id detail page

**Files:**

- Create: `apps/client/src/routes/_dashboard/vendors.$id.tsx`

- [ ] **Step 1: Create `apps/client/src/routes/_dashboard/vendors.$id.tsx`**

```typescript
import { useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
  Zap,
  Shield,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  useVendor,
  useVendorScans,
  useTriggerScan,
  type Vendor,
  type VendorScan,
  type ScanFinding,
  type CategoryResult,
  type ScanCategory,
} from '@/queries/vendors';

const GRADE_COLOR: Record<string, string> = {
  A: 'text-green-400',
  B: 'text-blue-400',
  C: 'text-amber-400',
  D: 'text-orange-400',
  F: 'text-red-400',
};

const SEVERITY_COLOR: Record<string, string> = {
  critical: 'bg-red-500/10 text-red-400 border-red-500/20',
  high: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  medium: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  low: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  info: 'bg-muted text-muted-foreground border-border',
};

const CATEGORIES: ScanCategory[] = ['dns', 'email', 'tls', 'web', 'network', 'breach', 'reputation'];

function ScoreGauge({ score, grade }: { score: number; grade: string }) {
  const color = GRADE_COLOR[grade] ?? 'text-muted-foreground';
  return (
    <div className="flex flex-col items-center justify-center bg-surface border border-border rounded-xl p-6 gap-1">
      <span className={`text-6xl font-black ${color}`}>{grade}</span>
      <span className="text-2xl font-bold text-foreground">{score}</span>
      <span className="text-xs text-muted-foreground">/ 100</span>
    </div>
  );
}

function BreakdownTable({ breakdown }: { breakdown: Record<ScanCategory, CategoryResult> }) {
  const { t } = useTranslation();
  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{t('vendors.category')}</th>
            <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">{t('vendors.score')}</th>
            <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">{t('vendors.grade')}</th>
            <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">{t('vendors.findings')}</th>
          </tr>
        </thead>
        <tbody>
          {CATEGORIES.map((cat) => {
            const r = breakdown[cat];
            if (!r) return null;
            const color = GRADE_COLOR[r.grade] ?? 'text-muted-foreground';
            return (
              <tr key={cat} className="border-b border-border/50 last:border-0">
                <td className="px-4 py-2 font-medium capitalize">{cat}</td>
                <td className="px-4 py-2 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-green-500/60 rounded-full" style={{ width: `${r.score}%` }} />
                    </div>
                    <span className="text-xs text-muted-foreground w-6 text-right">{r.score}</span>
                  </div>
                </td>
                <td className={`px-4 py-2 text-right font-bold ${color}`}>{r.grade}</td>
                <td className="px-4 py-2 text-right text-muted-foreground">{r.findingCount}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FindingItem({ f }: { f: ScanFinding }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
      >
        <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border shrink-0 ${SEVERITY_COLOR[f.severity] ?? ''}`}>
          {f.severity}
        </span>
        <span className="flex-1 text-sm font-medium text-foreground truncate">{f.title}</span>
        <span className="text-[10px] text-muted-foreground/50 capitalize shrink-0">{f.category}</span>
        {open ? <ChevronDown size={14} className="shrink-0" /> : <ChevronRight size={14} className="shrink-0" />}
      </button>
      {open && (
        <div className="px-4 pb-3 space-y-2 border-t border-border/50">
          <p className="text-xs text-muted-foreground">{f.detail}</p>
          <div className="flex items-start gap-1.5 text-xs text-green-400">
            <CheckCircle2 size={12} className="mt-0.5 shrink-0" />
            <span>{f.remediation}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function ScanHistoryRow({ scan }: { scan: VendorScan }) {
  const [open, setOpen] = useState(false);
  const color = GRADE_COLOR[scan.grade] ?? 'text-muted-foreground';
  return (
    <div className="border-b border-border/50 last:border-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-4 px-4 py-2.5 hover:bg-muted/20 text-left"
      >
        <span className={`font-bold text-sm w-6 ${color}`}>{scan.grade}</span>
        <span className="text-sm text-foreground">{scan.score}</span>
        <span className="text-xs text-muted-foreground flex-1">{new Date(scan.scannedAt).toLocaleString()}</span>
        <span className="text-[10px] text-muted-foreground/60 capitalize">{scan.triggeredBy}</span>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {open && scan.findings.length > 0 && (
        <div className="px-4 pb-3 space-y-2">
          {scan.findings.map((f, i) => <FindingItem key={i} f={f} />)}
        </div>
      )}
    </div>
  );
}

function VendorDetailPage() {
  const { t } = useTranslation();
  const { id } = Route.useParams();
  const { data: vendor, isPending: vendorLoading } = useVendor(id);
  const { data: scans = [] } = useVendorScans(id);
  const triggerScan = useTriggerScan(id);

  const latestScan = scans[0];

  if (vendorLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!vendor) {
    return <div className="p-6 text-sm text-muted-foreground">{t('common.notFound')}</div>;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link to="/vendors" className="mt-1 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-foreground">{vendor.name}</h1>
          <p className="text-sm text-muted-foreground">{vendor.domain}</p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => triggerScan.mutate('baseline')}
            disabled={triggerScan.isPending}
          >
            {triggerScan.isPending ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <RefreshCw size={14} className="mr-1.5" />}
            {t('vendors.runScan')}
          </Button>
          <Button
            size="sm"
            onClick={() => triggerScan.mutate('deep')}
            disabled={triggerScan.isPending}
          >
            <Zap size={14} className="mr-1.5" />
            {t('vendors.deepScan')}
          </Button>
        </div>
      </div>

      {latestScan ? (
        <>
          {/* Score + breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-4">
            <ScoreGauge score={latestScan.score} grade={latestScan.grade} />
            <BreakdownTable breakdown={latestScan.breakdown} />
          </div>

          {/* Findings */}
          {latestScan.findings.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <AlertTriangle size={14} className="text-amber-400" />
                {t('vendors.findings')} ({latestScan.findings.length})
              </h2>
              <div className="space-y-2">
                {latestScan.findings
                  .sort((a, b) => {
                    const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
                    return (order[a.severity] ?? 5) - (order[b.severity] ?? 5);
                  })
                  .map((f, i) => <FindingItem key={i} f={f} />)}
              </div>
            </section>
          )}

          {/* Scan history */}
          {scans.length > 1 && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-foreground">{t('vendors.scanHistory')}</h2>
              <div className="bg-surface border border-border rounded-xl overflow-hidden">
                {scans.map((s) => <ScanHistoryRow key={s.id} scan={s} />)}
              </div>
            </section>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Shield size={32} className="text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">{t('vendors.noScansYet')}</p>
          <Button
            size="sm"
            variant="outline"
            className="mt-4"
            onClick={() => triggerScan.mutate('baseline')}
            disabled={triggerScan.isPending}
          >
            {t('vendors.runFirstScan')}
          </Button>
        </div>
      )}
    </div>
  );
}

export const Route = createFileRoute('/_dashboard/vendors/$id')({
  component: VendorDetailPage,
});
```

- [ ] **Step 2: Commit**

```bash
git add "apps/client/src/routes/_dashboard/vendors.\$id.tsx"
git commit -m "feat(client): /vendors/:id detail page — score gauge, breakdown, findings, scan history"
```

---

### Task 14: Navigation + i18n

**Files:**

- Modify: `apps/client/src/components/layout/LayoutSider.tsx`
- Modify: `apps/client/src/components/layout/LayoutHeader.tsx`
- Modify: `libs/template-shared/src/lib/i18n/locales/en.ts`
- Modify: `libs/template-shared/src/lib/i18n/locales/es.ts`
- Modify: `libs/template-shared/src/lib/i18n/locales/he.ts`
- Modify: `libs/template-shared/src/lib/i18n/locales/ru.ts`

- [ ] **Step 1: Update `LayoutSider.tsx` — add NavKey + nav item**

In the `NavKey` type union, add:

```typescript
| 'nav.vendors'
| 'nav.sectionRisk'
```

In the `NAV` array, after `sectionCompliance`, add a new section:

```typescript
{
  titleKey: 'nav.sectionRisk',
  items: [
    { labelKey: 'nav.vendors', to: '/vendors', icon: Shield },
  ],
},
```

Also add `Shield` to the existing lucide import if not already there.

- [ ] **Step 2: Update `LayoutHeader.tsx`**

In the active-route prefix array, add:

```typescript
{ prefix: '/vendors', key: 'nav.vendors' },
```

- [ ] **Step 3: Add i18n keys to `en.ts`**

In the `nav` object, add:

```typescript
vendors: 'Vendor Risk',
sectionRisk: 'Risk',
```

Add a top-level `vendors` key:

```typescript
vendors: {
  title: 'Vendor Risk',
  subtitle: 'Monitor third-party security posture',
  addVendor: 'Add Vendor',
  addFirst: 'Add your first vendor',
  empty: 'No vendors tracked yet',
  vendorName: 'Vendor name',
  domain: 'Domain (e.g. acme.com)',
  lastScanned: 'Last scanned {{date}}',
  neverScanned: 'Never scanned',
  noScansYet: 'No scans yet — run a baseline scan to start',
  runFirstScan: 'Run first scan',
  runScan: 'Run Scan',
  deepScan: 'Deep Scan',
  findings: 'Findings',
  scanHistory: 'Scan History',
  category: 'Category',
  score: 'Score',
  grade: 'Grade',
},
```

- [ ] **Step 4: Add i18n keys to `es.ts`**

```typescript
// In nav:
vendors: 'Riesgo de Proveedor',
sectionRisk: 'Riesgo',

// Top-level vendors:
vendors: {
  title: 'Riesgo de Proveedor',
  subtitle: 'Monitorear la postura de seguridad de terceros',
  addVendor: 'Agregar Proveedor',
  addFirst: 'Agregar tu primer proveedor',
  empty: 'No hay proveedores registrados',
  vendorName: 'Nombre del proveedor',
  domain: 'Dominio (ej. acme.com)',
  lastScanned: 'Último escaneo {{date}}',
  neverScanned: 'Nunca escaneado',
  noScansYet: 'Sin escaneos — ejecuta un escaneo básico para empezar',
  runFirstScan: 'Ejecutar primer escaneo',
  runScan: 'Escanear',
  deepScan: 'Escaneo Profundo',
  findings: 'Hallazgos',
  scanHistory: 'Historial de Escaneos',
  category: 'Categoría',
  score: 'Puntuación',
  grade: 'Calificación',
},
```

- [ ] **Step 5: Add i18n keys to `he.ts`**

```typescript
// In nav:
vendors: 'סיכון ספקים',
sectionRisk: 'סיכון',

// Top-level vendors:
vendors: {
  title: 'סיכון ספקים',
  subtitle: 'ניטור עמדת אבטחה של ספקי צד שלישי',
  addVendor: 'הוסף ספק',
  addFirst: 'הוסף את הספק הראשון שלך',
  empty: 'אין ספקים במעקב',
  vendorName: 'שם הספק',
  domain: 'דומיין (למשל acme.com)',
  lastScanned: 'סרוק לאחרונה {{date}}',
  neverScanned: 'לא נסרק מעולם',
  noScansYet: 'אין סריקות — הפעל סריקה בסיסית כדי להתחיל',
  runFirstScan: 'הפעל סריקה ראשונה',
  runScan: 'הפעל סריקה',
  deepScan: 'סריקה עמוקה',
  findings: 'ממצאים',
  scanHistory: 'היסטוריית סריקות',
  category: 'קטגוריה',
  score: 'ציון',
  grade: 'דירוג',
},
```

- [ ] **Step 6: Add i18n keys to `ru.ts`**

```typescript
// In nav:
vendors: 'Риск поставщиков',
sectionRisk: 'Риск',

// Top-level vendors:
vendors: {
  title: 'Риск поставщиков',
  subtitle: 'Мониторинг безопасности сторонних поставщиков',
  addVendor: 'Добавить поставщика',
  addFirst: 'Добавьте первого поставщика',
  empty: 'Нет отслеживаемых поставщиков',
  vendorName: 'Название поставщика',
  domain: 'Домен (например acme.com)',
  lastScanned: 'Последнее сканирование {{date}}',
  neverScanned: 'Никогда не сканировался',
  noScansYet: 'Сканирований нет — запустите базовое сканирование',
  runFirstScan: 'Запустить первое сканирование',
  runScan: 'Сканировать',
  deepScan: 'Глубокое сканирование',
  findings: 'Находки',
  scanHistory: 'История сканирований',
  category: 'Категория',
  score: 'Оценка',
  grade: 'Класс',
},
```

- [ ] **Step 7: Build client**

```bash
yarn nx build client
```

Expected: success

- [ ] **Step 8: Commit**

```bash
git add apps/client/src/components/layout/ libs/template-shared/src/lib/i18n/locales/
git commit -m "feat(client): add vendors nav item + i18n keys (en/es/he/ru)"
```

---

### Task 15: Final lint + build + CI verification

- [ ] **Step 1: Lint all changed projects**

```bash
yarn nx run-many -t lint -p shared ai ai-client vendor-risk-client vendor-risk-crawler vendor-risk-scorecard vendor-risk api client template-shared
```

Fix any lint errors before proceeding.

- [ ] **Step 2: Build all projects**

```bash
yarn nx run-many -t build -p shared ai-client vendor-risk-client vendor-risk-crawler vendor-risk-scorecard vendor-risk api client
```

Expected: all succeed.

- [ ] **Step 3: Run all tests**

```bash
yarn nx run-many -t test -p shared vendor-risk-crawler vendor-risk-scorecard ai-strategies-anthropic
```

Expected: all pass.

- [ ] **Step 4: Format all changed files**

```bash
npx prettier --write \
  libs/shared/src/strategies/vendor-risk.ts \
  libs/shared/src/strategies/ai.ts \
  libs/shared/src/strategies/fakes/fake-vendor-risk.ts \
  libs/shared/src/strategies/fakes/fake-ai.ts \
  libs/shared/src/strategies/index.ts \
  libs/shared/src/testing.ts \
  libs/vendor-risk-client/src/ \
  libs/vendor-risk-strategies/ \
  libs/ai-client/src/lib/ai-client.service.ts \
  libs/ai-strategies/anthropic/src/lib/anthropic-ai.strategy.ts \
  apps/microservices/ai/src/app/ai.controller.ts \
  apps/microservices/vendor-risk/src/ \
  apps/api/src/app/vendors/ \
  apps/api/src/app/app.module.ts \
  apps/client/src/queries/vendors.ts \
  "apps/client/src/routes/_dashboard/vendors.tsx" \
  "apps/client/src/routes/_dashboard/vendors.\$id.tsx" \
  apps/client/src/components/layout/ \
  libs/template-shared/src/lib/i18n/locales/
```

- [ ] **Step 5: Final commit**

```bash
git add -u
git commit -m "style: format vendor-risk implementation files"
```

- [ ] **Step 6: Push + open PR**

```bash
git push -u origin feature/vendor-risk
gh pr create --title "feat: vendor risk module — registry, scans, AI analysis, alerts" --body "$(cat <<'EOF'
## Summary
- New `vendor-risk` MS (port 4006) with OwnCrawlerStrategy + SecurityScorecardStrategy + HybridVendorRiskStrategy
- 4 new DB tables: vendors, vendor_scans, vendor_ai_analyses, vendor_alert_events
- Scheduled rescans every 6h with score-drop alerts
- AI MS extended with `vendor.posture.analyze` (claude-sonnet-4-6)
- REST surface: `GET/POST /api/vendors`, `/api/vendors/:id/scan`, `/api/vendors/:id/scan/deep`
- Client: `/vendors` list + `/vendors/:id` detail (score gauge, category breakdown, findings, scan history)
- i18n: en/es/he/ru

## Test plan
- [ ] `yarn nx run-many -t test -p shared vendor-risk-crawler vendor-risk-scorecard` passes
- [ ] `yarn nx run-many -t build -p vendor-risk api client` passes
- [ ] POST /api/vendors creates a vendor and triggers baseline scan
- [ ] GET /api/vendors/:id/scans returns scan history
- [ ] /vendors list page shows vendor cards
- [ ] /vendors/:id shows score gauge + breakdown + findings

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

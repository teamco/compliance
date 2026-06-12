# Generate Standards Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the AI output type from `GeneratedControl` → `GeneratedStandard` and stored type `StandardControl` → `DocumentStandard` across the full stack, update the AI prompt to generate proper Standards-level language, and rename all UI labels accordingly.

**Architecture:** Work outward from shared types → fakes/tests → AI strategy → backend services → client queries/UI. Each layer compiles cleanly before moving to the next. DB migration renames two JSONB columns (no data shape change in this task — that is a separate concern).

**Tech Stack:** TypeScript, NestJS, React 19, TanStack Query, Vitest, Supabase (JSONB columns), Anthropic SDK

---

## File Map

| File | Change |
|------|--------|
| `supabase/migrations/20260612000001_rename_controls_to_standards.sql` | CREATE — rename JSONB columns |
| `libs/shared/src/strategies/ai.ts` | MODIFY — rename types |
| `libs/shared/src/strategies/notes.ts` | MODIFY — rename types + interfaces |
| `libs/shared/src/strategies/fakes/fake-ai.ts` | MODIFY — use new types |
| `libs/shared/src/strategies/fakes/fake-notes.ts` | MODIFY — use new types |
| `libs/shared/src/strategies/__tests__/ai.contract.unit.test.ts` | MODIFY — use new field names |
| `libs/shared/src/strategies/__tests__/notes.contract.unit.test.ts` | MODIFY — use new types + field names |
| `libs/ai-strategies/anthropic/src/lib/anthropic-ai.strategy.ts` | MODIFY — new prompt + return type |
| `libs/ai-strategies/anthropic/src/lib/__tests__/anthropic-ai.contract.unit.test.ts` | MODIFY — mock new shape |
| `libs/ai-client/src/lib/ai-client.service.ts` | MODIFY — rename param |
| `apps/api/src/app/notes/standards-queue.service.ts` | MODIFY — update mapping |
| `apps/api/src/app/notes/notes.controller.ts` | MODIFY — rename method + endpoint |
| `apps/microservices/notes/src/app/supabase-notes.strategy.ts` | MODIFY — rename DB column refs |
| `apps/client/src/queries/notes.ts` | MODIFY — rename types + mutation |
| `apps/client/src/routes/_dashboard/standards.tsx` | MODIFY — update UI labels |
| `apps/client/src/routes/_dashboard/standards.$id.tsx` | MODIFY — update card rendering |
| `apps/client/src/lib/export/pdf.tsx` | MODIFY — update field refs |
| `libs/template-shared/src/lib/i18n/locales/en.ts` | MODIFY — rename keys |
| `libs/template-shared/src/lib/i18n/locales/he.ts` | MODIFY — rename keys |
| `libs/template-shared/src/lib/i18n/locales/ru.ts` | MODIFY — rename keys |
| `libs/template-shared/src/lib/i18n/locales/es.ts` | MODIFY — rename keys |

---

## Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/20260612000001_rename_controls_to_standards.sql`

- [ ] **Step 1: Create migration file**

```sql
-- rename controls → standards in both tables (jsonb column, no data type change)
alter table public.generated_standards  rename column controls to standards;
alter table public.standards_snapshots  rename column controls to standards;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260612000001_rename_controls_to_standards.sql
git commit -m "feat(db): rename controls → standards column in generated_standards and snapshots"
```

---

## Task 2: Shared AI Types

**Files:**
- Modify: `libs/shared/src/strategies/ai.ts`

- [ ] **Step 1: Replace `GeneratedControl` with `GeneratedStandard`, update `StandardsResult`, update `analyzeGap` signature**

Replace the entire file content:

```typescript
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatContext {
  orgId?: string;
  frameworkId?: string;
  pageContext?: string;
}

export interface ChatResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export interface OrgProfile {
  id: string;
  name: string;
  industry: string;
  size: string;
  regions: string[];
}

export interface GeneratedStandard {
  id: string;
  title: string;
  objective: string;
  scope: string;
  requirements: string[];
}

export interface StandardsResult {
  frameworkId: string;
  standards: GeneratedStandard[];
}

export interface ControlFinding {
  controlId: string;
  status: 'compliant' | 'partial' | 'non-compliant';
  evidence?: string;
}

export type GapSeverity = 'critical' | 'high' | 'medium' | 'low';
export type RecommendationEffort = 'low' | 'medium' | 'high';

export interface GapItem {
  controlId: string;
  severity: GapSeverity;
  description: string;
}

export interface Recommendation {
  priority: number;
  action: string;
  effort: RecommendationEffort;
}

// A standard finding enriched with its title, persisted alongside the AI result
// so the saved report can show a per-standard compliance breakdown.
export interface GapFinding {
  controlId: string;
  title: string;
  status: 'compliant' | 'partial' | 'non-compliant';
  evidence?: string;
}

export interface GapAnalysisResult {
  summary: string;
  criticalGaps: GapItem[];
  recommendations: Recommendation[];
  riskScore: number;
  // Optional — attached client-side at save time; not produced by the model.
  findings?: GapFinding[];
}

export interface AiStrategy {
  chat(messages: ChatMessage[], context: ChatContext): Promise<ChatResult>;
  generateStandards(orgProfile: OrgProfile, frameworkIds: string[]): Promise<StandardsResult[]>;
  analyzeGap(standards: GeneratedStandard[], findings: ControlFinding[]): Promise<GapAnalysisResult>;
}
```

- [ ] **Step 2: Commit**

```bash
git add libs/shared/src/strategies/ai.ts
git commit -m "feat(shared): replace GeneratedControl with GeneratedStandard type"
```

---

## Task 3: Shared Notes Types

**Files:**
- Modify: `libs/shared/src/strategies/notes.ts`

- [ ] **Step 1: Replace `StandardControl` + `StandardControlPriority` with `DocumentStandard`, update `StandardsDocument`, `StandardsSnapshot`, `ControlPatch` → `StandardPatch`, method signatures**

Make these targeted changes:

**Remove** line 4: `export type StandardControlPriority = 'critical' | 'high' | 'medium' | 'low';`

**Replace** `StandardControl` interface (lines 42–52):
```typescript
// An AI-generated compliance standard stored as part of a StandardsDocument.
export interface DocumentStandard {
  code: string;
  title: string;
  objective: string;
  scope: string;
  requirements: string[];
  frameworkMappings: { frameworkId: string; standardCode: string }[];
}
```

**In `StandardsDocument`**, replace `controls: StandardControl[]` with:
```typescript
  standards: DocumentStandard[];
```

**Replace `ControlPatch`** with:
```typescript
export interface StandardPatch {
  objective?: string;
  scope?: string;
}
```

**In `StandardsSnapshot`**, replace `controls: StandardControl[]` with:
```typescript
  standards: DocumentStandard[];
```

**In `NotesStrategy`**, update method signatures:
```typescript
  saveStandardsDocument(id: string, standards: DocumentStandard[]): Promise<void>;
  // ...
  updateStandard(docId: string, code: string, patch: StandardPatch): Promise<DocumentStandard>;
```
(rename `updateControl` → `updateStandard`, `ControlPatch` → `StandardPatch`)

- [ ] **Step 2: Update exports at bottom of file** — replace `ControlPatch` with `StandardPatch`, replace `StandardControl` / `StandardControlPriority` with `DocumentStandard` in any re-export lines.

- [ ] **Step 3: Commit**

```bash
git add libs/shared/src/strategies/notes.ts
git commit -m "feat(shared): replace StandardControl with DocumentStandard type"
```

---

## Task 4: AI Contract Test

**Files:**
- Modify: `libs/shared/src/strategies/__tests__/ai.contract.unit.test.ts`

- [ ] **Step 1: Update `generateStandards` assertion to check `standards` array**

Replace the `generateStandards` test body:
```typescript
it('generateStandards returns one result per frameworkId', async () => {
  const results = await strategy.generateStandards(
    { id: 'org-1', name: 'Acme', industry: 'tech', size: 'small', regions: ['US'] },
    ['NIST-CSF', 'ISO-27001'],
  );
  expect(results).toHaveLength(2);
  expect(results[0]?.frameworkId).toBe('NIST-CSF');
  expect(results[1]?.frameworkId).toBe('ISO-27001');
  for (const r of results) {
    expect(Array.isArray(r.standards)).toBe(true);
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add libs/shared/src/strategies/__tests__/ai.contract.unit.test.ts
git commit -m "test(shared): update AI contract test for GeneratedStandard shape"
```

---

## Task 5: Fake AI Strategy

**Files:**
- Modify: `libs/shared/src/strategies/fakes/fake-ai.ts`

- [ ] **Step 1: Replace `GeneratedControl` import with `GeneratedStandard`, update `generateStandards` return, update `analyzeGap` param**

Replace the entire file:

```typescript
import type {
  AiStrategy,
  ChatContext,
  ChatMessage,
  ChatResult,
  ControlFinding,
  GapAnalysisResult,
  GeneratedStandard,
  OrgProfile,
  StandardsResult,
} from '../ai';

export class FakeAiStrategy implements AiStrategy {
  async chat(messages: ChatMessage[], _context: ChatContext): Promise<ChatResult> {
    const echo = messages.map((m) => `[${m.role}] ${m.content}`).join(' | ');
    return { text: `FAKE: ${echo}`, inputTokens: messages.length * 10, outputTokens: 20 };
  }

  async generateStandards(
    _orgProfile: OrgProfile,
    frameworkIds: string[],
  ): Promise<StandardsResult[]> {
    return frameworkIds.map((frameworkId) => ({
      frameworkId,
      standards: [
        {
          id: `${frameworkId}-FAKE-STD-001`,
          title: 'Fake Standard',
          objective: 'Generated by FakeAiStrategy for testing.',
          scope: 'All systems.',
          requirements: ['Requirement 1 — no-op placeholder.'],
        },
      ],
    }));
  }

  async analyzeGap(
    _standards: GeneratedStandard[],
    _findings: ControlFinding[],
  ): Promise<GapAnalysisResult> {
    return {
      summary: 'Fake gap analysis — no real assessment performed.',
      criticalGaps: [],
      recommendations: [],
      riskScore: 0,
    };
  }
}
```

- [ ] **Step 2: Run tests**

```bash
yarn nx test shared --testPathPattern="ai.contract"
```

Expected: all tests in `ai.contract.unit.test.ts` PASS.

- [ ] **Step 3: Commit**

```bash
git add libs/shared/src/strategies/fakes/fake-ai.ts
git commit -m "feat(shared): update FakeAiStrategy for GeneratedStandard shape"
```

---

## Task 6: Notes Contract Tests

**Files:**
- Modify: `libs/shared/src/strategies/__tests__/notes.contract.unit.test.ts`

- [ ] **Step 1: Update `saveStandardsDocument` test — use `DocumentStandard` shape**

Find the `saveStandardsDocument persists controls` test and replace:

```typescript
it('saveStandardsDocument persists standards and sets status completed', async () => {
  const { id } = await strategy.createStandardsDocument('user-1', 'org-1', ['fw-1']);
  const standards = [
    {
      code: 'STD-001',
      title: 'Access Control Standard',
      objective: 'Ensure controlled access to systems',
      scope: 'All systems and applications',
      requirements: ['Users must authenticate before accessing systems'],
      frameworkMappings: [],
    },
  ];
  await strategy.saveStandardsDocument(id, standards);
  const doc = await strategy.getStandardsDocument(id);
  expect(doc?.status).toBe('completed');
  expect(doc?.standards).toHaveLength(1);
  expect(doc?.standards[0]?.code).toBe('STD-001');
});
```

- [ ] **Step 2: Update `updateControl` → `updateStandard` tests**

Replace all four `updateControl` tests:

```typescript
// ── updateStandard ──────────────────────────────────────────────────────────

it('updateStandard patches objective on an existing standard', async () => {
  const { id } = await strategy.createStandardsDocument('user-1', 'org-1', []);
  await strategy.saveStandardsDocument(id, [
    {
      code: 'STD-001',
      title: 'Access Control Standard',
      objective: 'original objective',
      scope: 'all systems',
      requirements: [],
      frameworkMappings: [],
    },
  ]);
  const updated = await strategy.updateStandard(id, 'STD-001', { objective: 'updated objective' });
  expect(updated.objective).toBe('updated objective');
  const doc = await strategy.getStandardsDocument(id);
  expect(doc?.standards[0]?.objective).toBe('updated objective');
});

it('updateStandard patches scope text', async () => {
  const { id } = await strategy.createStandardsDocument('user-1', 'org-1', []);
  await strategy.saveStandardsDocument(id, [
    {
      code: 'STD-002',
      title: 'Encryption Standard',
      objective: 'Protect data at rest',
      scope: 'old scope',
      requirements: [],
      frameworkMappings: [],
    },
  ]);
  const updated = await strategy.updateStandard(id, 'STD-002', { scope: 'new scope' });
  expect(updated.scope).toBe('new scope');
});

it('updateStandard throws for unknown document', async () => {
  await expect(
    strategy.updateStandard('nonexistent-doc', 'STD-001', { objective: 'x' }),
  ).rejects.toThrow();
});

it('updateStandard throws for unknown standard code', async () => {
  const { id } = await strategy.createStandardsDocument('user-1', 'org-1', []);
  await strategy.saveStandardsDocument(id, []);
  await expect(
    strategy.updateStandard(id, 'NO-SUCH-CODE', { objective: 'x' }),
  ).rejects.toThrow();
});
```

- [ ] **Step 3: Commit**

```bash
git add libs/shared/src/strategies/__tests__/notes.contract.unit.test.ts
git commit -m "test(shared): update notes contract tests for DocumentStandard shape"
```

---

## Task 7: Fake Notes Strategy

**Files:**
- Modify: `libs/shared/src/strategies/fakes/fake-notes.ts`

- [ ] **Step 1: Update imports — replace `ControlPatch`, `StandardControl` with `DocumentStandard`, `StandardPatch`**

At top of file, in the import list replace:
```typescript
  ControlPatch,
  // ...
  StandardControl,
```
with:
```typescript
  DocumentStandard,
  StandardPatch,
```

- [ ] **Step 2: Update `createStandardsDocument` initial value**

```typescript
this.docs.set(id, {
  id,
  userId,
  orgId,
  frameworkIds,
  standards: [],      // was: controls: []
  status: 'pending',
  workflowStatus: 'draft',
  createdAt: new Date().toISOString(),
});
```

- [ ] **Step 3: Update `saveStandardsDocument`**

```typescript
async saveStandardsDocument(id: string, standards: DocumentStandard[]): Promise<void> {
  const existing = this.docs.get(id);
  if (!existing) throw new Error(`doc_not_found: ${id}`);
  this.docs.set(id, { ...existing, standards, status: 'completed' });
}
```

- [ ] **Step 4: Update `resetStandardsDocument`**

```typescript
this.docs.set(id, { ...existing, status: 'pending', standards: [] });
```

- [ ] **Step 5: Rename `updateControl` → `updateStandard`, update field refs**

```typescript
async updateStandard(docId: string, code: string, patch: StandardPatch): Promise<DocumentStandard> {
  const doc = this.docs.get(docId);
  if (!doc) throw new Error(`doc_not_found: ${docId}`);
  const idx = doc.standards.findIndex((s) => s.code === code);
  if (idx === -1) throw new Error(`standard_not_found: ${code}`);
  const updated = { ...doc.standards[idx], ...patch } as DocumentStandard;
  const standards = [...doc.standards];
  standards[idx] = updated;
  this.docs.set(docId, { ...doc, standards });
  return updated;
}
```

- [ ] **Step 6: Update `transitionWorkflow` snapshot creation**

```typescript
this.snapshots.push({
  id: globalThis.crypto.randomUUID(),
  documentId: id,
  version,
  workflowStatus: to,
  standards: [...doc.standards],   // was: controls: [...doc.controls]
  createdAt: new Date().toISOString(),
});
```

- [ ] **Step 7: Run tests**

```bash
yarn nx test shared --testPathPattern="notes.contract|fake-notes"
```

Expected: all passing.

- [ ] **Step 8: Commit**

```bash
git add libs/shared/src/strategies/fakes/fake-notes.ts
git commit -m "feat(shared): update FakeNotesStrategy for DocumentStandard shape"
```

---

## Task 8: Anthropic AI Strategy

**Files:**
- Modify: `libs/ai-strategies/anthropic/src/lib/anthropic-ai.strategy.ts`
- Modify: `libs/ai-strategies/anthropic/src/lib/__tests__/anthropic-ai.contract.unit.test.ts`

- [ ] **Step 1: Update imports — replace `GeneratedControl` with `GeneratedStandard`**

In `anthropic-ai.strategy.ts` top imports:
```typescript
import type {
  AiStrategy,
  ChatContext,
  ChatMessage,
  ChatResult,
  ControlFinding,
  GapAnalysisResult,
  GeneratedStandard,
  OrgProfile,
  StandardsResult,
} from '@icore/shared';
```

- [ ] **Step 2: Replace `generateStandards` system prompt and return type**

```typescript
async generateStandards(
  orgProfile: OrgProfile,
  frameworkIds: string[],
): Promise<StandardsResult[]> {
  const system = [
    'You are a compliance standards expert. Generate formal security standards for the given frameworks.',
    'Standards define WHAT must be done (the mandatory requirement), not HOW to implement it.',
    'Example of correct Standards language: "All user accounts must be protected by multi-factor authentication."',
    'Example of wrong Controls language (do not use): "Configure Okta MFA policy with TOTP as primary factor."',
    'Return ONLY a valid JSON array matching this TypeScript type:',
    'Array<{',
    '  frameworkId: string;',
    '  standards: Array<{',
    '    id: string;',
    '    title: string;',
    '    objective: string;',
    '    scope: string;',
    '    requirements: string[]',
    '  }>',
    '}>',
    'No markdown, no explanation — raw JSON only.',
  ].join('\n');

  const userPrompt = [
    `Organization profile:`,
    `  Name: ${orgProfile.name}`,
    `  Industry: ${orgProfile.industry}`,
    `  Size: ${orgProfile.size}`,
    `  Regions: ${orgProfile.regions.join(', ')}`,
    ``,
    `Generate tailored formal security standards for these frameworks: ${frameworkIds.join(', ')}`,
    `Each standard should have 3-8 specific requirements as mandatory statements.`,
  ].join('\n');

  const response = await this.client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 16000,
    system,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const raw = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('');

  return JSON.parse(stripJsonFences(raw)) as StandardsResult[];
}
```

- [ ] **Step 3: Update `analyzeGap` signature and system prompt**

```typescript
async analyzeGap(
  standards: GeneratedStandard[],
  findings: ControlFinding[],
): Promise<GapAnalysisResult> {
  const system = [
    'You are a compliance gap analysis expert.',
    'Return ONLY a valid JSON object matching this TypeScript type:',
    '{ summary: string; criticalGaps: Array<{ controlId: string; severity: "critical"|"high"|"medium"|"low"; description: string }>; recommendations: Array<{ priority: number; action: string; effort: "low"|"medium"|"high" }>; riskScore: number }',
    'riskScore is 0–100. No markdown, no explanation — raw JSON only.',
  ].join('\n');

  const userPrompt = [
    `Standards (${standards.length} total):`,
    JSON.stringify(standards.slice(0, 50)),
    ``,
    `Findings (${findings.length} total):`,
    JSON.stringify(findings),
  ].join('\n');

  const response = await this.client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    thinking: { type: 'adaptive' } as any,
    system,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const raw = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('');

  return JSON.parse(stripJsonFences(raw)) as GapAnalysisResult;
}
```

- [ ] **Step 4: Update the contract test mock to return new shape**

In `anthropic-ai.contract.unit.test.ts`, find the mock that returns `controls: [...]` blocks and replace both with:

```typescript
{
  frameworkId: 'NIST-CSF',
  standards: [
    {
      id: 'NIST-CSF-STD-001',
      title: 'Asset Management Standard',
      objective: 'Ensure all assets are identified and managed.',
      scope: 'All IT assets and systems.',
      requirements: [
        'All assets must be inventoried within 30 days of acquisition.',
        'Asset ownership must be assigned and documented.',
      ],
    },
  ],
},
{
  frameworkId: 'ISO-27001',
  standards: [
    {
      id: 'ISO-27001-STD-001',
      title: 'Information Security Policy Standard',
      objective: 'Define and maintain information security policies.',
      scope: 'All employees and contractors.',
      requirements: [
        'An information security policy must be approved by management.',
        'Policies must be reviewed at least annually.',
      ],
    },
  ],
},
```

- [ ] **Step 5: Run tests**

```bash
yarn nx test ai-anthropic
```

Expected: all passing.

- [ ] **Step 6: Commit**

```bash
git add libs/ai-strategies/anthropic/src/lib/anthropic-ai.strategy.ts \
        libs/ai-strategies/anthropic/src/lib/__tests__/anthropic-ai.contract.unit.test.ts
git commit -m "feat(ai): update generateStandards prompt and types for GeneratedStandard shape"
```

---

## Task 9: AI Client Service

**Files:**
- Modify: `libs/ai-client/src/lib/ai-client.service.ts`

- [ ] **Step 1: Replace `GeneratedControl` import with `GeneratedStandard`, update `analyzeGap` param**

```typescript
import type {
  ChatContext,
  ChatMessage,
  ChatResult,
  ControlFinding,
  GapAnalysisResult,
  GeneratedStandard,
  OrgProfile,
  StandardsResult,
} from '@icore/shared';
```

Update method signature:
```typescript
analyzeGap(standards: GeneratedStandard[], findings: ControlFinding[]): Promise<GapAnalysisResult> {
  return firstValueFrom(
    this.client
      .send<GapAnalysisResult>('ai.gap.analyze', { standards, findings })
      .pipe(timeout({ each: BATCH_TIMEOUT_MS })),
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add libs/ai-client/src/lib/ai-client.service.ts
git commit -m "feat(ai-client): rename controls → standards in analyzeGap"
```

---

## Task 10: Standards Queue Service

**Files:**
- Modify: `apps/api/src/app/notes/standards-queue.service.ts`

- [ ] **Step 1: Update imports and mapping from `GeneratedStandard` → `DocumentStandard`**

Update top imports:
```typescript
import type { DocumentStandard, OrgProfile, StandardsResult } from '@icore/shared';
```

Update the `process` method mapping:
```typescript
const aiResults: StandardsResult[] = await this.ai.generateStandards(
  orgProfile,
  frameworkIds,
);

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

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/app/notes/standards-queue.service.ts
git commit -m "feat(api): update standards-queue mapping for DocumentStandard shape"
```

---

## Task 11: Notes Controller

**Files:**
- Modify: `apps/api/src/app/notes/notes.controller.ts`

- [ ] **Step 1: Update import, rename endpoint and method**

In imports, replace `ControlPatch` with `StandardPatch`.

Replace the `updateControl` endpoint:
```typescript
@Patch('standards/:id/standards/:code')
@ApiOperation({ summary: 'Update a single generated standard (objective, scope)' })
@ApiBody({ schema: { type: 'object' } })
updateStandard(@Param('id') id: string, @Param('code') code: string, @Body() patch: StandardPatch) {
  return this.notes.updateStandard(id, code, patch);
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/app/notes/notes.controller.ts
git commit -m "feat(api): rename updateControl → updateStandard endpoint"
```

---

## Task 12: Supabase Notes Strategy

**Files:**
- Modify: `apps/microservices/notes/src/app/supabase-notes.strategy.ts`

- [ ] **Step 1: Update imports — replace `StandardControl`, `ControlPatch` with `DocumentStandard`, `StandardPatch`**

- [ ] **Step 2: Update `createStandardsDocument` — insert `standards: []`**

```typescript
.insert({
  user_id: userId,
  org_profile_id: orgId,
  framework_ids: frameworkIds,
  standards: [],       // was: controls: []
  status: 'pending',
  workflow_status: 'draft',
})
```

- [ ] **Step 3: Update `saveStandardsDocument`**

```typescript
async saveStandardsDocument(id: string, standards: DocumentStandard[]): Promise<void> {
  const { error } = await this.db
    .from('generated_standards')
    .update({ standards, status: 'completed' })
    .eq('id', id);
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 4: Update `resetStandardsDocument`**

```typescript
.update({ status: 'pending', standards: [] })
```

- [ ] **Step 5: Update `transitionWorkflow` — snapshot insert uses `standards`**

```typescript
const { error: snapErr } = await this.db.from('standards_snapshots').insert({
  document_id: id,
  version,
  workflow_status: to,
  standards: doc.standards,    // was: controls: doc.controls
});
```

- [ ] **Step 6: Rename `updateControl` → `updateStandard`**

```typescript
async updateStandard(docId: string, code: string, patch: StandardPatch): Promise<DocumentStandard> {
  const doc = await this.getStandardsDocument(docId);
  if (!doc) throw new Error('doc_not_found');
  const idx = doc.standards.findIndex((s) => s.code === code);
  if (idx === -1) throw new Error('standard_not_found');
  const updated = { ...doc.standards[idx], ...patch } as DocumentStandard;
  const standards = [...doc.standards];
  standards[idx] = updated;
  const { error } = await this.db
    .from('generated_standards')
    .update({ standards })
    .eq('id', docId);
  if (error) throw new Error(error.message);
  return updated;
}
```

- [ ] **Step 7: Update `mapDoc` and `mapSnapshot` helper methods**

Find the private `mapDoc` helper — it likely maps DB row fields to the TypeScript type. Replace `controls` field mapping:
```typescript
// in mapDoc:
standards: (row.standards ?? []) as DocumentStandard[],

// in mapSnapshot:
standards: (row.standards ?? []) as DocumentStandard[],
```

- [ ] **Step 8: Commit**

```bash
git add apps/microservices/notes/src/app/supabase-notes.strategy.ts
git commit -m "feat(notes-ms): rename controls → standards in Supabase DB strategy"
```

---

## Task 13: Client Queries

**Files:**
- Modify: `apps/client/src/queries/notes.ts`

- [ ] **Step 1: Replace `StandardControl`, `ControlPatch`, `StandardControlPriority` with `DocumentStandard`, `StandardPatch`**

Replace the type block (lines 26–67 approx):

```typescript
export interface DocumentStandard {
  code: string;
  title: string;
  objective: string;
  scope: string;
  requirements: string[];
  frameworkMappings: { frameworkId: string; standardCode: string }[];
}

export interface StandardPatch {
  objective?: string;
  scope?: string;
}

export type StandardsStatus = 'pending' | 'completed' | 'failed';
export type WorkflowStatus = 'draft' | 'in_review' | 'approved' | 'published';
export type WorkflowTransition = 'submit' | 'approve' | 'reject' | 'publish';

export interface StandardsDocument {
  id: string;
  userId: string;
  orgId: string;
  frameworkIds: string[];
  standards: DocumentStandard[];
  status: StandardsStatus;
  workflowStatus: WorkflowStatus;
  createdAt: string;
}

export interface StandardsSnapshot {
  id: string;
  documentId: string;
  version: number;
  workflowStatus: WorkflowStatus;
  standards: DocumentStandard[];
  createdAt: string;
  createdBy?: string;
}
```

- [ ] **Step 2: Rename `useUpdateControl` → `useUpdateStandard`, update URL and types**

```typescript
export function useUpdateStandard(docId: string) {
  const qc = useQueryClient();
  return useMutation<DocumentStandard, Error, { code: string; patch: StandardPatch }>({
    mutationFn: ({ code, patch }) =>
      api<DocumentStandard>(`/notes/standards/${docId}/standards/${code}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes', 'standards', docId] }),
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/queries/notes.ts
git commit -m "feat(client): update queries for DocumentStandard shape"
```

---

## Task 14: Client `standards.tsx`

**Files:**
- Modify: `apps/client/src/routes/_dashboard/standards.tsx`

- [ ] **Step 1: Update document card to show `standards.length` instead of `controls.length`**

In `DocumentCard`, find the footer section inside `<div className="flex items-center justify-between ...">`. Update the count display:

```tsx
<div className="flex items-center justify-between pt-1 border-t border-border">
  <span className="text-xs text-muted-foreground">
    {t('standards.count', { count: doc.standards.length })}
  </span>
  <ChevronRight
    size={14}
    className="text-muted-foreground/40 group-hover:text-muted-foreground transition-colors"
  />
</div>
```

Note: `DocumentCard` receives a `doc: StandardsDocument` prop — update prop type if needed.

- [ ] **Step 2: Commit**

```bash
git add apps/client/src/routes/_dashboard/standards.tsx
git commit -m "feat(client): update standards list view for DocumentStandard shape"
```

---

## Task 15: Client `standards.$id.tsx`

**Files:**
- Modify: `apps/client/src/routes/_dashboard/standards.$id.tsx`

This file has the most UI changes — priority editing is removed, implementation editing becomes objective editing.

- [ ] **Step 1: Update imports from queries**

Replace:
```typescript
import {
  // ...
  useUpdateControl,
  type ControlPatch,
  type StandardControlPriority,
  type StandardsSnapshot,
  // ...
} from '@/queries/notes';
```
with:
```typescript
import {
  // ...
  useUpdateStandard,
  type StandardPatch,
  type StandardsSnapshot,
  // ...
} from '@/queries/notes';
```

Remove `StandardControlPriority` and `ControlPatch` from imports. Remove `ShieldCheck` from lucide imports (no longer needed for priority icon — keep it if used elsewhere, otherwise remove).

- [ ] **Step 2: Remove `PRIORITY_COLOR`, `PRIORITIES` constants and `EditState` priority field**

Replace:
```typescript
const PRIORITY_COLOR: Record<StandardControlPriority, string> = {
  critical: 'bg-red-500/10 text-red-400 border-red-500/20',
  high: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  medium: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  low: 'bg-muted text-muted-foreground border-border',
};

const PRIORITIES: StandardControlPriority[] = ['critical', 'high', 'medium', 'low'];

interface EditState {
  code: string;
  field: 'priority' | 'impl';
  value: string;
}
```
with:
```typescript
interface EditState {
  code: string;
  field: 'objective' | 'scope';
  value: string;
}
```

- [ ] **Step 3: Update `StandardsDetailPage` — replace `useUpdateControl` with `useUpdateStandard`**

```typescript
const updateStandard = useUpdateStandard(id);
```

Update `saveEdit`:
```typescript
function saveEdit(overridePatch?: StandardPatch) {
  if (!editing) return;
  const patch: StandardPatch =
    overridePatch ??
    (editing.field === 'objective'
      ? { objective: editing.value }
      : { scope: editing.value });
  updateStandard.mutate(
    { code: editing.code, patch },
    { onSuccess: () => setEditing(null), onError: () => setEditing(null) },
  );
}
```

- [ ] **Step 4: Update the header count line**

```tsx
<p className="text-xs text-muted-foreground mt-0.5">
  {t('standards.count', { count: doc.standards.length })} · {t('standards.generatedOn')}{' '}
  {new Date(doc.createdAt).toLocaleDateString()}
</p>
```

- [ ] **Step 5: Update `doc.controls.map(...)` → `doc.standards.map(...)`**

The entire standard card render block (`doc.controls.map((ctrl) => ...)`) needs updating. Replace `doc.controls.map` with `doc.standards.map` and update the card internals:

- Remove the entire priority badge section (both `isEditingPriority` block and the non-editing priority pill)
- Replace `ctrl.description` with `ctrl.objective`
- Replace the "Implementation" section with "Objective" (click-to-edit) and add a static "Requirements" list:

```tsx
{doc.standards.map((std) => {
  const isEditingObjective = editing?.code === std.code && editing.field === 'objective';
  const isSaving = updateStandard.isPending && updateStandard.variables?.code === std.code;

  return (
    <div
      key={std.code}
      className="bg-surface border border-border rounded-xl p-5 space-y-3 hover:border-muted-foreground/30 transition-colors"
    >
      {/* Header */}
      <div className="flex items-start gap-3 min-w-0">
        <div className="flex items-center justify-center w-7 h-7 rounded-md bg-green-500/10 border border-green-500/20 shrink-0">
          <ShieldCheck size={13} className="text-green-500" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-mono text-muted-foreground">{std.code}</p>
          <p className="text-sm font-medium text-foreground leading-snug">{std.title}</p>
          {std.scope && (
            <p className="text-[10px] text-muted-foreground/60 mt-0.5">
              {t('standards.scope')}: {std.scope}
            </p>
          )}
        </div>
      </div>

      {/* Objective — click-to-edit */}
      <div className="pl-10 space-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
          {t('standards.objective')}
        </p>
        {isEditingObjective ? (
          <div className="space-y-2">
            <Textarea
              autoFocus
              rows={3}
              value={editing.value}
              onChange={(e) =>
                setEditing((prev) => (prev ? { ...prev, value: e.target.value } : null))
              }
              className="text-xs resize-none"
              onKeyDown={(e) => {
                if (e.key === 'Escape') cancelEdit();
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveEdit();
              }}
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={cancelEdit}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {t('common.cancel')}
              </button>
              <Button size="sm" onClick={() => saveEdit()} disabled={isSaving} className="h-6 text-xs px-2 gap-1">
                <Check size={11} />
                {t('common.save')}
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            disabled={isSaving}
            onClick={() => startEdit(std.code, 'objective', std.objective ?? '')}
            className="group w-full text-left text-xs text-foreground/80 leading-relaxed hover:text-foreground transition-colors cursor-text"
          >
            {std.objective ? (
              <span className="flex items-start gap-1.5">
                <span className="flex-1">{std.objective}</span>
                <Pencil size={11} className="opacity-0 group-hover:opacity-40 transition-opacity mt-0.5 shrink-0" />
              </span>
            ) : (
              <span className="text-muted-foreground/40 italic">
                {t('standards.addObjective')}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Requirements list */}
      {std.requirements.length > 0 && (
        <div className="pl-10 space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            {t('standards.requirements')}
          </p>
          <ul className="space-y-1">
            {std.requirements.map((req, i) => (
              <li key={i} className="text-xs text-foreground/80 leading-relaxed flex gap-2">
                <span className="text-muted-foreground/40 shrink-0">{i + 1}.</span>
                <span>{req}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
})}
```

- [ ] **Step 6: Update `SnapshotRow` — replace `snap.controls` with `snap.standards`, remove priority badge**

```tsx
const standards = full?.standards ?? snap.standards;
// ...
{standards.map((std) => (
  <div key={std.code} className="px-4 py-3 flex items-start gap-3">
    <span className="text-xs font-mono text-muted-foreground shrink-0 w-20 truncate">
      {std.code}
    </span>
    <span className="text-xs text-foreground flex-1">{std.title}</span>
    <span className="text-xs text-muted-foreground/60 shrink-0">
      {std.requirements.length} {t('standards.requirementsCount', { count: std.requirements.length })}
    </span>
  </div>
))}
```

Also update the count line in `SnapshotRow`:
```tsx
<span className="text-xs text-muted-foreground/60">
  {t('standards.count', { count: snap.standards.length })}
</span>
```

- [ ] **Step 7: Commit**

```bash
git add apps/client/src/routes/_dashboard/standards.\$id.tsx
git commit -m "feat(client): update standards detail view for DocumentStandard shape"
```

---

## Task 16: PDF Export

**Files:**
- Modify: `apps/client/src/lib/export/pdf.tsx`

- [ ] **Step 1: Update `doc.controls` refs and table columns**

Replace the summary count line:
```tsx
{doc.standards.length} standard(s) · status: {doc.status} · workflow:{' '}
{doc.workflowStatus}
```

Replace the table header section:
```tsx
<Text style={styles.sectionTitle}>Standards</Text>
<View style={styles.tHead}>
  <Text style={[styles.th, { width: '13%' }]}>Code</Text>
  <Text style={[styles.th, { width: '30%' }]}>Title</Text>
  <Text style={[styles.th, { width: '57%' }]}>Objective</Text>
</View>
{doc.standards.map((s, i) => (
  <View style={styles.tRow} key={i} wrap={false}>
    <Text style={[styles.td, { width: '13%' }]}>{s.code}</Text>
    <Text style={[styles.td, { width: '30%' }]}>{s.title}</Text>
    <Text style={[styles.td, { width: '57%' }]}>{s.objective}</Text>
  </View>
))}
```

- [ ] **Step 2: Commit**

```bash
git add apps/client/src/lib/export/pdf.tsx
git commit -m "feat(client): update PDF export for DocumentStandard shape"
```

---

## Task 17: i18n Updates

**Files:**
- Modify: `libs/template-shared/src/lib/i18n/locales/en.ts`
- Modify: `libs/template-shared/src/lib/i18n/locales/he.ts`
- Modify: `libs/template-shared/src/lib/i18n/locales/ru.ts`
- Modify: `libs/template-shared/src/lib/i18n/locales/es.ts`

- [ ] **Step 1: Update `en.ts` — standards section**

In `standards: { ... }`, make these changes:

```typescript
standards: {
  title: 'Generated Standards',
  subtitle: 'AI-generated compliance standards tailored to your organization',
  generate: 'Generate Standards',
  generating: 'Generating…',
  selectFrameworks: 'Select Frameworks',
  generateBtn: 'Generate',
  noStandards: 'No standards generated yet',
  generateHint: 'Select frameworks above and click Generate',
  count: '{{count}} standards',              // was: controls: '{{count}} controls'
  viewStandards: 'View Standards',           // was: viewControls: 'View Controls'
  generatedOn: 'Generated',
  retry: 'Retry',
  delete: 'Delete',
  deleted: 'Document deleted',
  retried: 'Document re-queued',
  objective: 'Objective',                    // NEW
  scope: 'Scope',                            // NEW
  requirements: 'Requirements',              // NEW
  requirementsCount: '{{count}} requirements', // NEW
  addObjective: 'Click to add objective…',   // replaces addImplementation
  // remove: implementation, editPriority, priority block
  versionHistory: 'Version History',
  workflow: { /* unchanged */ },
  status: { /* unchanged */ },
},
```

- [ ] **Step 2: Update `en.ts` — gapAnalysis section**

```typescript
gapAnalysis: {
  // ...
  assessmentTitle: 'Standards Assessment',        // was: controlsTitle: 'Control Assessment'
  assessmentSubtitle: 'Set status for each standard based on your current implementation',
  // was: controlsSubtitle: 'Set status for each control...'
  analyzingHint: 'AI is reviewing your standards and findings',
  // was: 'AI is reviewing your controls and findings'
  // ... rest unchanged
},
```

- [ ] **Step 3: Update `en.ts` — controls section**

```typescript
controls: {
  noDocuments: 'No completed documents',
  frameworks: 'frameworks',
  showGapsOnly: 'Show gaps only',
  standardsMapped: 'standards mapped',          // was: controlsMapped: 'controls mapped'
  generateFirst: 'Generate a standards document first to view compliance mapping.',
  selectDocument: 'Select a document above to view the compliance matrix.',
  colCode: 'Code',
  colTitle: 'Title',
  colPriority: 'Priority',
  colCategory: 'Category',
  selectFramework: 'Select at least one framework to view mappings.',
  noGaps: 'No gaps — all standards are fully mapped.',
  noControls: 'No controls to display.',
  viewMapping: 'View Mapping →',
},
```

- [ ] **Step 4: Update `he.ts`, `ru.ts`, `es.ts`** with equivalent key renames (same structural changes, preserving translated values, just renaming the keys to match `en.ts`).

- [ ] **Step 5: Commit**

```bash
git add libs/template-shared/src/lib/i18n/locales/
git commit -m "feat(i18n): update keys for DocumentStandard (controls → standards labels)"
```

---

## Task 18: Final Verification

- [ ] **Step 1: Run all affected tests**

```bash
yarn nx run-many -t test -p shared ai-anthropic ai-client client template-shared --passWithNoTests
```

Expected: all green.

- [ ] **Step 2: Lint**

```bash
yarn nx run-many -t lint -p shared ai-anthropic ai-client client template-shared api notes
```

Expected: 0 errors (warnings OK).

- [ ] **Step 3: Build**

```bash
yarn nx run-many -t build -p api client notes
```

Expected: all succeed.

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -p   # stage only what's needed
git commit -m "fix: address lint/type errors from standards rename"
```

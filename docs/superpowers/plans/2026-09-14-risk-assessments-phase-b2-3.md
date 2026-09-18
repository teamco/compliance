# Risk Assessments Phase B.2.3: Findings → Issue/Risk/Exception Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the broken `Finding` persistence path and build the full forward (RequirementDrawer) and reverse (Issues/Risk/Exceptions pages) UI for the existing-but-unreachable Finding → Issue/Risk/Exception bridge.

**Architecture:** Same layering as every prior phase: shared types → `FakeNotesStrategy` / `SupabaseNotesStrategy` → notes MS `@MessagePattern` handlers → `NotesClientService` TCP proxy → gateway REST (with `checkOrgAccess`) → React Query hooks → React components. No new database tables or columns — the `findings` table and `Finding` shared type already exist and match 1:1.

**Tech Stack:** NestJS TCP microservices, Supabase Postgres, React 19 + Vite + shadcn, TanStack Query + TanStack Router, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-14-risk-assessments-phase-b2-3-design.md`

## Global Constraints

- No new columns on `Issue`, `Risk`, or `Exception`. Provenance reuses `Issue.source: 'gap_analysis'` / `Issue.sourceId` and `Risk.source: 'gap_analysis'` / `Risk.sourceRef` — both already have this exact enum value. `Exception` gets no source field at all.
- `Finding.orgId` becomes a required field (`orgId: string`, not `orgId?: string`) — it is always populated in the real schema (`findings.org_id not null`).
- Creating an Exception from a Finding does **not** call `resolveFindingViaException`. A finding stays open until an *approved* exception is explicitly linked via "Link Existing Exception". `resolveFindingViaException` itself must reject (both strategies) an exception whose `status !== 'approved'`.
- `Finding.code` generation follows the max-suffix+1 pattern already used for `ASM-`/`RSK-` codes: `FIND-NNNNNN`, 6-digit zero-padded, computed by finding the highest existing `FIND-` code for the org (Fake: count-based; Supabase: `order by code desc limit 1`).
- Every finding-related gateway endpoint (4 pre-existing + 4 new) must call `checkOrgAccess` — this phase does not ship the same "important finding parked at final review" class of gap Phase B.2.2 shipped (I2).
- No "unlink" action for Issue/Risk on a Finding — links are permanent once made (same one-way philosophy as Risk snapshots in Phase A / Phase B.2.2's reassessment).
- Dialog/Sheet buttons live in the footer, every overlay needs an explicit Cancel — per `AGENTS.md`'s mandatory rule.
- Post-coding routine on every task: `npx prettier --write <files>` → `yarn nx lint <project>` → `yarn nx build <project>` — all green before committing.

---

### Task 1: Shared types — Finding.orgId required + 5 new NotesStrategy method signatures

**Files:**
- Modify: `libs/shared/src/strategies/notes.ts:285-300` (Finding interface), `libs/shared/src/strategies/notes.ts:1134-1148` (NotesStrategy interface findings section)

**Interfaces:**
- Produces (used by every later task): `getFinding(id: string): Promise<Finding | null>`, `listFindingsByLink(params: { issueId?: string; riskId?: string; exceptionId?: string }): Promise<Finding[]>`, `createIssueFromFinding(orgId: string, userId: string, findingId: string, data: { title: string; description: string; severity: IssueSeverity; ownerId: string }): Promise<Issue>`, `createRiskFromFinding(orgId: string, userId: string, findingId: string, data: { title: string; description: string; taxonomyCategoryId: string; ownerId: string; inherentLikelihood: number; inherentImpact: number }): Promise<Risk>`, `createExceptionFromFinding(orgId: string, userId: string, findingId: string, data: { controlCode: string; frameworkId: string; title: string; statement: string; justification: string; ownerId: string; compensatingControls?: string }): Promise<Exception>`.

- [ ] **Step 1: Make `Finding.orgId` required**

In `libs/shared/src/strategies/notes.ts`, change:

```ts
export interface Finding {
  id: string;
  orgId?: string;
```

to:

```ts
export interface Finding {
  id: string;
  orgId: string;
```

- [ ] **Step 2: Add the 5 new method signatures to `NotesStrategy`**

Immediately after this existing block (around line 1137):

```ts
  listControlFindings(controlId: string): Promise<Finding[]>;
  linkFindingToRisk(findingId: string, riskId: string): Promise<Finding>;
  linkFindingToIssue(findingId: string, issueId: string): Promise<Finding>;
  resolveFindingViaException(findingId: string, exceptionId: string): Promise<Finding>;
```

add:

```ts
  getFinding(id: string): Promise<Finding | null>;
  listFindingsByLink(params: {
    issueId?: string;
    riskId?: string;
    exceptionId?: string;
  }): Promise<Finding[]>;
  createIssueFromFinding(
    orgId: string,
    userId: string,
    findingId: string,
    data: { title: string; description: string; severity: IssueSeverity; ownerId: string },
  ): Promise<Issue>;
  createRiskFromFinding(
    orgId: string,
    userId: string,
    findingId: string,
    data: {
      title: string;
      description: string;
      taxonomyCategoryId: string;
      ownerId: string;
      inherentLikelihood: number;
      inherentImpact: number;
    },
  ): Promise<Risk>;
  createExceptionFromFinding(
    orgId: string,
    userId: string,
    findingId: string,
    data: {
      controlCode: string;
      frameworkId: string;
      title: string;
      statement: string;
      justification: string;
      ownerId: string;
      compensatingControls?: string;
    },
  ): Promise<Exception>;
```

- [ ] **Step 3: Verify the file still type-checks in isolation**

Run: `yarn nx build shared`
Expected: FAIL — `FakeNotesStrategy` and `SupabaseNotesStrategy` don't implement the 5 new interface methods yet, and `Finding.orgId` is now required where fixtures/mappers left it undefined. This is expected; Tasks 2 and 3 fix it.

- [ ] **Step 4: Commit**

```bash
git add libs/shared/src/strategies/notes.ts
git commit -m "feat(shared): add Finding-bridge methods to NotesStrategy interface"
```

---

### Task 2: FakeNotesStrategy — fix createAssessmentFinding persistence + implement the 5 new methods

**Files:**
- Modify: `libs/shared/src/strategies/fakes/fake-notes.ts` (findings array seed, `createAssessmentFinding`, `resolveFindingViaException`, add 5 new methods, fix `asm-nist-2026` fixture)
- Test: `libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts:1251-1265`

**Interfaces:**
- Consumes: `Finding`, `Issue`, `Risk`, `Exception` types from Task 1.
- Produces: same 5 methods as Task 1, now with real Fake-mode behavior other tasks can call against.

- [ ] **Step 1: Fix the `asm-nist-2026` fixture and seed a real backing `Finding`**

This fixture already displays a "Missing Q2 Access Review Evidence" finding badge, but has no real `Finding` row backing it and no `controlId` — both required once `createAssessmentFinding` actually persists. `ctrl-pol-001` ("Information Security Policy Governance & Review") already exists in the internal-controls fixture and is already mapped to `requirementCode: 'GV.PO-01'` — reuse it.

In `libs/shared/src/strategies/fakes/fake-notes.ts`, find the `asm-nist-2026` entry (around line 2184) and change:

```ts
      {
        id: 'asm-nist-2026',
        frameworkId: nistId,
        requirementId: 'nist-gv-po-01',
        cycleName: '2026 NIST CSF Assessment',
        status: 'completed',
        implementationStatus: 'partially_implemented',
        designEffectiveness: 'effective',
        operatingEffectiveness: 'partially_effective',
        assessor: 'John Smith (Lead Assessor)',
        assessmentDate: '2026-09-08',
        observation: 'Quarterly review evidence was unavailable for Q2 access re-certifications.',
        findingId: 'FIND-2026-0042',
        findingTitle: 'Missing Q2 Access Review Evidence',
        findingSeverity: 'high',
      },
```

to:

```ts
      {
        id: 'asm-nist-2026',
        frameworkId: nistId,
        requirementId: 'nist-gv-po-01',
        controlId: 'ctrl-pol-001',
        cycleName: '2026 NIST CSF Assessment',
        status: 'completed',
        implementationStatus: 'partially_implemented',
        designEffectiveness: 'effective',
        operatingEffectiveness: 'partially_effective',
        assessor: 'John Smith (Lead Assessor)',
        assessmentDate: '2026-09-08',
        observation: 'Quarterly review evidence was unavailable for Q2 access re-certifications.',
        findingId: 'finding-nist-gvpo01',
        findingTitle: 'Missing Q2 Access Review Evidence',
        findingSeverity: 'high',
      },
```

Then change the class field declaration (around line 92) from:

```ts
  private findings: Finding[] = [];
```

to:

```ts
  private findings: Finding[] = [
    {
      id: 'finding-nist-gvpo01',
      orgId: 'org1',
      code: 'FIND-000101',
      controlId: 'ctrl-pol-001',
      assessmentId: 'asm-nist-2026',
      title: 'Missing Q2 Access Review Evidence',
      description: 'Quarterly access re-certification evidence was not retained for Q2 2026.',
      severity: 'high',
      status: 'open',
      createdAt: '2026-09-08T00:00:00Z',
      updatedAt: '2026-09-08T00:00:00Z',
    },
  ];
```

- [ ] **Step 2: Write the failing/updated contract test**

In `libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts`, replace the existing test (around line 1251):

```ts
  it('logs assessment findings connecting requirement to issues', async () => {
    const nistId = '00000000-0000-0000-0000-000000000003';
    const assessments = await s.listFrameworkAssessments(nistId, 'org1');
    expect(assessments.length).toBeGreaterThanOrEqual(1);

    const finding = await s.createAssessmentFinding('org1', assessments[0].id, {
      title: 'Missing DR tabletop exercise minutes',
      severity: 'high',
      description: 'DR test conducted without recorded minutes',
    });

    expect(finding.findingId).toMatch(/^FIND-\d{4}-\d+/);

    const issues = await s.listIssues('org1');
    expect(issues.some((i) => i.title === 'Missing DR tabletop exercise minutes')).toBe(true);
  });
```

with:

```ts
  it('logs a real Finding row connecting a control to a requirement assessment', async () => {
    const nistId = '00000000-0000-0000-0000-000000000003';
    const assessments = await s.listFrameworkAssessments(nistId, 'org1');
    const asm = assessments.find((a) => a.id === 'asm-nist-2026');
    expect(asm?.controlId).toBe('ctrl-pol-001');

    const { findingId } = await s.createAssessmentFinding('org1', asm!.id, {
      title: 'Missing DR tabletop exercise minutes',
      severity: 'high',
      description: 'DR test conducted without recorded minutes',
    });

    const findings = await s.listControlFindings('ctrl-pol-001');
    const finding = findings.find((f) => f.id === findingId);
    expect(finding).toBeDefined();
    expect(finding?.code).toMatch(/^FIND-\d{6}$/);
    expect(finding?.status).toBe('open');
    expect(finding?.orgId).toBe('org1');
    expect(finding?.controlId).toBe('ctrl-pol-001');
    expect(finding?.assessmentId).toBe('asm-nist-2026');

    // createAssessmentFinding no longer auto-creates an unrelated Issue as a side effect
    const issues = await s.listIssues('org1');
    expect(issues.some((i) => i.title === 'Missing DR tabletop exercise minutes')).toBe(false);
  });

  it('rejects createAssessmentFinding for an assessment with no controlId', async () => {
    const soc2Id = '00000000-0000-0000-0000-000000000002';
    const assessments = await s.listFrameworkAssessments(soc2Id, 'org1');
    const asmWithoutControl = assessments.find((a) => !a.controlId);
    expect(asmWithoutControl).toBeDefined();

    await expect(
      s.createAssessmentFinding('org1', asmWithoutControl!.id, {
        title: 'x',
        severity: 'low',
        description: 'y',
      }),
    ).rejects.toThrow('requirement_assessment_missing_control');
  });

  it('getFinding returns null for an unknown id, and the real record otherwise', async () => {
    expect(await s.getFinding('nope')).toBeNull();
    const found = await s.getFinding('finding-nist-gvpo01');
    expect(found?.title).toBe('Missing Q2 Access Review Evidence');
  });

  it('createRiskFromFinding creates a Risk with gap_analysis provenance and links it back', async () => {
    const risk = await s.createRiskFromFinding('org1', 'user1', 'finding-nist-gvpo01', {
      title: 'Policy governance gap',
      description: 'Access re-certification evidence gap',
      taxonomyCategoryId: (await s.listRiskTaxonomy('org1'))[0]!.id,
      ownerId: 'user1',
      inherentLikelihood: 3,
      inherentImpact: 3,
    });
    expect(risk.source).toBe('gap_analysis');
    expect(risk.sourceRef).toBe('finding-nist-gvpo01');
    const finding = await s.getFinding('finding-nist-gvpo01');
    expect(finding?.linkedRiskId).toBe(risk.id);
  });

  it('createIssueFromFinding creates an Issue with gap_analysis provenance and links it back', async () => {
    const issue = await s.createIssueFromFinding('org1', 'user1', 'finding-nist-gvpo01', {
      title: 'Policy governance gap',
      description: 'Access re-certification evidence gap',
      severity: 'high',
      ownerId: 'user1',
    });
    expect(issue.source).toBe('gap_analysis');
    expect(issue.sourceId).toBe('finding-nist-gvpo01');
    const finding = await s.getFinding('finding-nist-gvpo01');
    expect(finding?.linkedIssueId).toBe(issue.id);
  });

  it('createExceptionFromFinding creates a pending Exception and does NOT resolve the finding', async () => {
    const exc = await s.createExceptionFromFinding('org1', 'user1', 'finding-nist-gvpo01', {
      controlCode: 'POL-001',
      frameworkId: '00000000-0000-0000-0000-000000000003',
      title: 'Temporary policy exception',
      statement: 'stmt',
      justification: 'just',
      ownerId: 'user1',
    });
    expect(exc.status).toBe('pending');
    const finding = await s.getFinding('finding-nist-gvpo01');
    expect(finding?.linkedExceptionId).toBeUndefined();
    expect(finding?.status).toBe('open');
  });

  it('resolveFindingViaException rejects a non-approved exception', async () => {
    const exc = await s.createException('org1', 'user1', {
      controlCode: 'POL-001',
      frameworkId: '00000000-0000-0000-0000-000000000003',
      title: 'Pending exception',
      statement: 'stmt',
      justification: 'just',
      ownerId: 'user1',
    });
    await expect(s.resolveFindingViaException('finding-nist-gvpo01', exc.id)).rejects.toThrow(
      'exception_not_approved',
    );
  });

  it('resolveFindingViaException accepts an approved exception and closes the finding', async () => {
    const exc = await s.createException('org1', 'user1', {
      controlCode: 'POL-001',
      frameworkId: '00000000-0000-0000-0000-000000000003',
      title: 'Approved exception',
      statement: 'stmt',
      justification: 'just',
      ownerId: 'user1',
    });
    await s.approveException(exc.id);
    const finding = await s.resolveFindingViaException('finding-nist-gvpo01', exc.id);
    expect(finding.status).toBe('accepted');
    expect(finding.linkedExceptionId).toBe(exc.id);
  });

  it('listFindingsByLink filters findings by linked entity', async () => {
    const risk = await s.createRiskFromFinding('org1', 'user1', 'finding-nist-gvpo01', {
      title: 'x',
      description: 'y',
      taxonomyCategoryId: (await s.listRiskTaxonomy('org1'))[0]!.id,
      ownerId: 'user1',
      inherentLikelihood: 2,
      inherentImpact: 2,
    });
    const byRisk = await s.listFindingsByLink({ riskId: risk.id });
    expect(byRisk.map((f) => f.id)).toContain('finding-nist-gvpo01');
    expect(await s.listFindingsByLink({ riskId: 'nope' })).toEqual([]);
  });
```

Check the exact method names used above (`approveException`, `createException`, `listRiskTaxonomy`) already exist in the interface before writing — confirm via `grep -n "approveException\|listRiskTaxonomy" libs/shared/src/strategies/notes.ts`. They do (used elsewhere in this same contract test file already).

- [ ] **Step 3: Run the tests to see them fail**

Run: `yarn nx test shared --testPathPattern fake-notes.contract`
Expected: FAIL — `createAssessmentFinding` still fabricates side effects, `getFinding`/`listFindingsByLink`/`createIssueFromFinding`/`createRiskFromFinding`/`createExceptionFromFinding` don't exist yet, `resolveFindingViaException` doesn't check approval.

- [ ] **Step 4: Fix `createAssessmentFinding`**

Replace (around line 2816):

```ts
  async createAssessmentFinding(
    orgId: string,
    assessmentId: string,
    findingData: {
      title: string;
      severity: 'critical' | 'high' | 'medium' | 'low';
      description: string;
    },
  ): Promise<{ findingId: string }> {
    const findingNum = Math.floor(1000 + Math.random() * 9000);
    const findingId = `FIND-${new Date().getFullYear()}-${findingNum}`;

    await this.createIssue(orgId, 'system', {
      title: findingData.title,
      description: findingData.description,
      severity: findingData.severity,
      reporterId: 'system',
      ownerId: 'system',
    });

    const asm = this.assessmentsList.find((a) => a.id === assessmentId);
    if (asm) {
      asm.findingId = findingId;
      asm.findingTitle = findingData.title;
      asm.findingSeverity = findingData.severity;
    }

    return { findingId };
  }
```

with:

```ts
  async createAssessmentFinding(
    orgId: string,
    assessmentId: string,
    findingData: {
      title: string;
      severity: 'critical' | 'high' | 'medium' | 'low';
      description: string;
    },
  ): Promise<{ findingId: string }> {
    const asm = this.assessmentsList.find((a) => a.id === assessmentId);
    if (!asm) throw new Error(`requirement_assessment_not_found: ${assessmentId}`);
    if (!asm.controlId) throw new Error('requirement_assessment_missing_control');

    const orgFindingCount = this.findings.filter((f) => f.orgId === orgId).length;
    const now = new Date().toISOString();
    const finding: Finding = {
      id: globalThis.crypto.randomUUID(),
      orgId,
      code: `FIND-${String(orgFindingCount + 101).padStart(6, '0')}`,
      controlId: asm.controlId,
      assessmentId,
      title: findingData.title,
      description: findingData.description,
      severity: findingData.severity,
      status: 'open',
      createdAt: now,
      updatedAt: now,
    };
    this.findings.push(finding);

    asm.findingId = finding.id;
    asm.findingTitle = finding.title;
    asm.findingSeverity = finding.severity;

    return { findingId: finding.id };
  }
```

- [ ] **Step 5: Harden `resolveFindingViaException` and add the 5 new methods**

Replace (around line 2768):

```ts
  async resolveFindingViaException(findingId: string, exceptionId: string): Promise<Finding> {
    const finding = this.findings.find((f) => f.id === findingId);
    if (!finding) throw new Error(`finding_not_found: ${findingId}`);
    finding.linkedExceptionId = exceptionId;
    finding.status = 'accepted';
    finding.updatedAt = new Date().toISOString();
    return finding;
  }
```

with:

```ts
  async resolveFindingViaException(findingId: string, exceptionId: string): Promise<Finding> {
    const finding = this.findings.find((f) => f.id === findingId);
    if (!finding) throw new Error(`finding_not_found: ${findingId}`);
    const exception = this.exceptions.get(exceptionId);
    if (!exception) throw new Error(`exception_not_found: ${exceptionId}`);
    if (exception.status !== 'approved') throw new Error('exception_not_approved');
    finding.linkedExceptionId = exceptionId;
    finding.status = 'accepted';
    finding.updatedAt = new Date().toISOString();
    return finding;
  }

  async getFinding(id: string): Promise<Finding | null> {
    return this.findings.find((f) => f.id === id) ?? null;
  }

  async listFindingsByLink(params: {
    issueId?: string;
    riskId?: string;
    exceptionId?: string;
  }): Promise<Finding[]> {
    if (params.issueId) return this.findings.filter((f) => f.linkedIssueId === params.issueId);
    if (params.riskId) return this.findings.filter((f) => f.linkedRiskId === params.riskId);
    if (params.exceptionId) {
      return this.findings.filter((f) => f.linkedExceptionId === params.exceptionId);
    }
    return [];
  }

  async createIssueFromFinding(
    orgId: string,
    userId: string,
    findingId: string,
    data: { title: string; description: string; severity: IssueSeverity; ownerId: string },
  ): Promise<Issue> {
    const finding = this.findings.find((f) => f.id === findingId);
    if (!finding) throw new Error(`finding_not_found: ${findingId}`);
    if (finding.orgId !== orgId) throw new Error('finding_belongs_to_different_org');
    const issue = await this.createIssue(orgId, userId, {
      title: data.title,
      description: data.description,
      severity: data.severity,
      reporterId: userId,
      ownerId: data.ownerId,
      source: 'gap_analysis',
      sourceId: findingId,
    });
    finding.linkedIssueId = issue.id;
    finding.updatedAt = new Date().toISOString();
    return issue;
  }

  async createRiskFromFinding(
    orgId: string,
    userId: string,
    findingId: string,
    data: {
      title: string;
      description: string;
      taxonomyCategoryId: string;
      ownerId: string;
      inherentLikelihood: number;
      inherentImpact: number;
    },
  ): Promise<Risk> {
    const finding = this.findings.find((f) => f.id === findingId);
    if (!finding) throw new Error(`finding_not_found: ${findingId}`);
    if (finding.orgId !== orgId) throw new Error('finding_belongs_to_different_org');
    const risk = await this.createRisk(orgId, userId, {
      title: data.title,
      riskStatement: data.description,
      taxonomyCategoryId: data.taxonomyCategoryId,
      ownerId: data.ownerId,
      inherentLikelihood: data.inherentLikelihood,
      inherentImpact: data.inherentImpact,
      source: 'gap_analysis',
      sourceRef: findingId,
    });
    finding.linkedRiskId = risk.id;
    finding.updatedAt = new Date().toISOString();
    return risk;
  }

  async createExceptionFromFinding(
    orgId: string,
    userId: string,
    findingId: string,
    data: {
      controlCode: string;
      frameworkId: string;
      title: string;
      statement: string;
      justification: string;
      ownerId: string;
      compensatingControls?: string;
    },
  ): Promise<Exception> {
    const finding = this.findings.find((f) => f.id === findingId);
    if (!finding) throw new Error(`finding_not_found: ${findingId}`);
    if (finding.orgId !== orgId) throw new Error('finding_belongs_to_different_org');
    return this.createException(orgId, userId, data);
  }
```

Add `IssueSeverity` to the top-of-file type imports if not already imported (check with `grep -n "^import type" libs/shared/src/strategies/fakes/fake-notes.ts` — `Issue`, `Risk`, `Exception`, `Finding` are already used elsewhere in this file so their imports already exist; only confirm `IssueSeverity` is present, adding it to the existing `import type { ... } from '../notes'` block if missing).

- [ ] **Step 6: Run the tests to see them pass**

Run: `yarn nx test shared --testPathPattern fake-notes.contract`
Expected: PASS (all tests in the file, not just the new ones — this fixture change touches shared seed data other tests may read).

- [ ] **Step 7: Post-coding routine and commit**

```bash
npx prettier --write libs/shared/src/strategies/fakes/fake-notes.ts libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts
yarn nx lint shared
yarn nx build shared
git add libs/shared/src/strategies/fakes/fake-notes.ts libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts
git commit -m "fix(shared): persist real Finding rows in FakeNotesStrategy and implement the bridge methods"
```

---

### Task 3: SupabaseNotesStrategy — same fix, real DB

**Files:**
- Modify: `apps/microservices/notes/src/app/supabase-notes.strategy.ts` (`createAssessmentFinding` around line 559, `resolveFindingViaException` around line 696, add `getFinding`/`listFindingsByLink`/`createIssueFromFinding`/`createRiskFromFinding`/`createExceptionFromFinding`)

**Interfaces:**
- Consumes: `toFinding` private mapper (already exists at line 710), `toIssue`/`toRisk`/`toException` mappers (already used elsewhere in this file — confirm exact names via `grep -n "private toIssue\|private toException" apps/microservices/notes/src/app/supabase-notes.strategy.ts` before writing; if a mapper is inlined instead of named, follow that file's own existing pattern for `createIssue`/`createRisk`/`createException` return values, which already call `this.toFinding`/`this.toIssue`-equivalent helpers).
- Produces: same 5 methods, Supabase-backed.

- [ ] **Step 1: Fix `createAssessmentFinding`**

Replace (around line 559):

```ts
  async createAssessmentFinding(
    _orgId: string,
    _assessmentId: string,
    _findingData: {
      title: string;
      severity: 'critical' | 'high' | 'medium' | 'low';
      description: string;
    },
  ): Promise<{ findingId: string }> {
    return {
      findingId: `FIND-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
    };
  }
```

with:

```ts
  async createAssessmentFinding(
    orgId: string,
    assessmentId: string,
    findingData: {
      title: string;
      severity: 'critical' | 'high' | 'medium' | 'low';
      description: string;
    },
  ): Promise<{ findingId: string }> {
    const { data: asmRow, error: asmError } = await this.db
      .from('requirement_assessments')
      .select('control_id')
      .eq('id', assessmentId)
      .single();
    if (asmError || !asmRow?.['control_id']) {
      throw new Error(`requirement_assessment_missing_control: ${assessmentId}`);
    }

    const { data: existing, error: countError } = await this.db
      .from('findings')
      .select('code')
      .eq('org_id', orgId)
      .order('code', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (countError) throw new Error(countError.message);
    const maxSuffix = existing?.code
      ? parseInt(String(existing.code).replace('FIND-', ''), 10)
      : 100;
    const code = `FIND-${String(maxSuffix + 1).padStart(6, '0')}`;

    const { data: row, error } = await this.db
      .from('findings')
      .insert({
        org_id: orgId,
        code,
        control_id: asmRow['control_id'],
        assessment_id: assessmentId,
        title: findingData.title,
        description: findingData.description,
        severity: findingData.severity,
        status: 'open',
      })
      .select()
      .single();
    return { findingId: this.toFinding(ok(row, error)).id };
  }
```

- [ ] **Step 2: Harden `resolveFindingViaException` and add the 4 remaining methods**

First read `apps/microservices/notes/src/app/supabase-notes.strategy.ts` around `createIssue`/`createRisk`/`createException` and their mapper calls (`toIssue`/`toRisk`, or whatever this file names them — confirm via `grep -n "private toIssue\|private toRisk\|private toException\|async createIssue(\|async createRisk(\|async createException(" apps/microservices/notes/src/app/supabase-notes.strategy.ts`) so the new methods call the correct existing mapper/create methods rather than reimplementing inserts.

Replace (around line 696):

```ts
  async resolveFindingViaException(findingId: string, exceptionId: string): Promise<Finding> {
    const { data, error } = await this.db
      .from('findings')
      .update({
        linked_exception_id: exceptionId,
        status: 'accepted',
        updated_at: new Date().toISOString(),
      })
      .eq('id', findingId)
      .select()
      .single();
    return this.toFinding(ok(data, error));
  }
```

with:

```ts
  async resolveFindingViaException(findingId: string, exceptionId: string): Promise<Finding> {
    const exception = await this.getException(exceptionId);
    if (!exception) throw new Error(`exception_not_found: ${exceptionId}`);
    if (exception.status !== 'approved') throw new Error('exception_not_approved');
    const { data, error } = await this.db
      .from('findings')
      .update({
        linked_exception_id: exceptionId,
        status: 'accepted',
        updated_at: new Date().toISOString(),
      })
      .eq('id', findingId)
      .select()
      .single();
    return this.toFinding(ok(data, error));
  }

  async getFinding(id: string): Promise<Finding | null> {
    const { data, error } = await this.db.from('findings').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? this.toFinding(data) : null;
  }

  async listFindingsByLink(params: {
    issueId?: string;
    riskId?: string;
    exceptionId?: string;
  }): Promise<Finding[]> {
    let query = this.db.from('findings').select('*');
    if (params.issueId) query = query.eq('linked_issue_id', params.issueId);
    else if (params.riskId) query = query.eq('linked_risk_id', params.riskId);
    else if (params.exceptionId) query = query.eq('linked_exception_id', params.exceptionId);
    else return [];
    const { data, error } = await query;
    return ok(data, error).map((row) => this.toFinding(row));
  }

  async createIssueFromFinding(
    orgId: string,
    userId: string,
    findingId: string,
    data: { title: string; description: string; severity: IssueSeverity; ownerId: string },
  ): Promise<Issue> {
    const finding = await this.getFinding(findingId);
    if (!finding) throw new Error(`finding_not_found: ${findingId}`);
    if (finding.orgId !== orgId) throw new Error('finding_belongs_to_different_org');
    const issue = await this.createIssue(orgId, userId, {
      title: data.title,
      description: data.description,
      severity: data.severity,
      reporterId: userId,
      ownerId: data.ownerId,
      source: 'gap_analysis',
      sourceId: findingId,
    });
    const { error: linkError } = await this.db
      .from('findings')
      .update({ linked_issue_id: issue.id, updated_at: new Date().toISOString() })
      .eq('id', findingId);
    if (linkError) throw new Error(linkError.message);
    return issue;
  }

  async createRiskFromFinding(
    orgId: string,
    userId: string,
    findingId: string,
    data: {
      title: string;
      description: string;
      taxonomyCategoryId: string;
      ownerId: string;
      inherentLikelihood: number;
      inherentImpact: number;
    },
  ): Promise<Risk> {
    const finding = await this.getFinding(findingId);
    if (!finding) throw new Error(`finding_not_found: ${findingId}`);
    if (finding.orgId !== orgId) throw new Error('finding_belongs_to_different_org');
    const risk = await this.createRisk(orgId, userId, {
      title: data.title,
      riskStatement: data.description,
      taxonomyCategoryId: data.taxonomyCategoryId,
      ownerId: data.ownerId,
      inherentLikelihood: data.inherentLikelihood,
      inherentImpact: data.inherentImpact,
      source: 'gap_analysis',
      sourceRef: findingId,
    });
    const { error: linkError } = await this.db
      .from('findings')
      .update({ linked_risk_id: risk.id, updated_at: new Date().toISOString() })
      .eq('id', findingId);
    if (linkError) throw new Error(linkError.message);
    return risk;
  }

  async createExceptionFromFinding(
    orgId: string,
    userId: string,
    findingId: string,
    data: {
      controlCode: string;
      frameworkId: string;
      title: string;
      statement: string;
      justification: string;
      ownerId: string;
      compensatingControls?: string;
    },
  ): Promise<Exception> {
    const finding = await this.getFinding(findingId);
    if (!finding) throw new Error(`finding_not_found: ${findingId}`);
    if (finding.orgId !== orgId) throw new Error('finding_belongs_to_different_org');
    return this.createException(orgId, userId, data);
  }
```

Add `IssueSeverity` to this file's `import type { ... } from '@icore/shared'` block if not already present.

- [ ] **Step 3: Verify against real Postgres 16**

Following this session's established discipline (`/usr/lib/postgresql/16/bin`, no Docker/sudo), replay the migrations, then exercise: `createAssessmentFinding` against a real `requirement_assessments` row with a real `control_id` (confirm the insert succeeds and the code sequence is correct), `createAssessmentFinding` against one with a NULL `control_id` (confirm it throws before attempting the insert, not a raw Postgres FK error), `createRiskFromFinding`/`createIssueFromFinding`/`createExceptionFromFinding` end-to-end (confirm both the new row and the `findings` row's `linked_*_id` update land), `resolveFindingViaException` with a pending vs. approved exception, `listFindingsByLink` with each of the 3 param variants and with none set.

- [ ] **Step 4: Post-coding routine and commit**

```bash
npx prettier --write apps/microservices/notes/src/app/supabase-notes.strategy.ts
yarn nx lint notes
yarn nx build notes
git add apps/microservices/notes/src/app/supabase-notes.strategy.ts
git commit -m "fix(notes): persist real Finding rows in SupabaseNotesStrategy and implement the bridge methods"
```

---

### Task 4: MS controller — 5 new @MessagePattern handlers

**Files:**
- Modify: `apps/microservices/notes/src/app/notes.controller.ts` (findings section, around line 218-283)

**Interfaces:**
- Consumes: the 5 strategy methods from Tasks 2/3.
- Produces: 5 new TCP message patterns for Task 5 to call: `notes.internal-controls.findings.get`, `notes.internal-controls.findings.by-link`, `notes.internal-controls.findings.create-issue`, `notes.internal-controls.findings.create-risk`, `notes.internal-controls.findings.create-exception`.

- [ ] **Step 1: Add the 5 handlers**

Immediately after the existing `resolveFindingViaException` handler (find via `grep -n "resolve-via-exception" apps/microservices/notes/src/app/notes.controller.ts`), add:

```ts
  @MessagePattern('notes.internal-controls.findings.get')
  getFinding(@Payload() payload: { id: string }): Promise<Finding | null> {
    return this.strategy.getFinding(payload.id);
  }

  @MessagePattern('notes.internal-controls.findings.by-link')
  listFindingsByLink(
    @Payload() payload: { issueId?: string; riskId?: string; exceptionId?: string },
  ): Promise<Finding[]> {
    return this.strategy.listFindingsByLink(payload);
  }

  @MessagePattern('notes.internal-controls.findings.create-issue')
  createIssueFromFinding(
    @Payload()
    payload: {
      orgId: string;
      userId: string;
      findingId: string;
      data: { title: string; description: string; severity: IssueSeverity; ownerId: string };
    },
  ): Promise<Issue> {
    return this.strategy.createIssueFromFinding(
      payload.orgId,
      payload.userId,
      payload.findingId,
      payload.data,
    );
  }

  @MessagePattern('notes.internal-controls.findings.create-risk')
  createRiskFromFinding(
    @Payload()
    payload: {
      orgId: string;
      userId: string;
      findingId: string;
      data: {
        title: string;
        description: string;
        taxonomyCategoryId: string;
        ownerId: string;
        inherentLikelihood: number;
        inherentImpact: number;
      };
    },
  ): Promise<Risk> {
    return this.strategy.createRiskFromFinding(
      payload.orgId,
      payload.userId,
      payload.findingId,
      payload.data,
    );
  }

  @MessagePattern('notes.internal-controls.findings.create-exception')
  createExceptionFromFinding(
    @Payload()
    payload: {
      orgId: string;
      userId: string;
      findingId: string;
      data: {
        controlCode: string;
        frameworkId: string;
        title: string;
        statement: string;
        justification: string;
        ownerId: string;
        compensatingControls?: string;
      };
    },
  ): Promise<Exception> {
    return this.strategy.createExceptionFromFinding(
      payload.orgId,
      payload.userId,
      payload.findingId,
      payload.data,
    );
  }
```

Add `Issue`, `Risk`, `Exception`, `IssueSeverity` to this file's type imports if not already present (`Finding` is already imported since `listControlFindings` etc. already use it).

- [ ] **Step 2: Build to verify wiring**

Run: `yarn nx build notes`
Expected: PASS.

- [ ] **Step 3: Post-coding routine and commit**

```bash
npx prettier --write apps/microservices/notes/src/app/notes.controller.ts
yarn nx lint notes
git add apps/microservices/notes/src/app/notes.controller.ts
git commit -m "feat(notes): add MS message handlers for the Finding bridge"
```

---

### Task 5: notes-client — 5 new proxy methods

**Files:**
- Modify: `libs/notes-client/src/lib/notes-client.service.ts` (findings section, around line 232-260)

**Interfaces:**
- Consumes: the 5 message patterns from Task 4.
- Produces: 5 new `NotesClientService` methods for Task 6 to call: `getFinding`, `listFindingsByLink`, `createIssueFromFinding`, `createRiskFromFinding`, `createExceptionFromFinding`.

- [ ] **Step 1: Add the 5 proxy methods**

Immediately after the existing `resolveFindingViaException` method, add:

```ts
  getFinding(id: string): Promise<Finding | null> {
    return signedSend<Finding | null>(this.client, 'notes.internal-controls.findings.get', {
      id,
    });
  }

  listFindingsByLink(params: {
    issueId?: string;
    riskId?: string;
    exceptionId?: string;
  }): Promise<Finding[]> {
    return signedSend<Finding[]>(
      this.client,
      'notes.internal-controls.findings.by-link',
      params,
    );
  }

  createIssueFromFinding(
    orgId: string,
    userId: string,
    findingId: string,
    data: { title: string; description: string; severity: IssueSeverity; ownerId: string },
  ): Promise<Issue> {
    return signedSend<Issue>(this.client, 'notes.internal-controls.findings.create-issue', {
      orgId,
      userId,
      findingId,
      data,
    });
  }

  createRiskFromFinding(
    orgId: string,
    userId: string,
    findingId: string,
    data: {
      title: string;
      description: string;
      taxonomyCategoryId: string;
      ownerId: string;
      inherentLikelihood: number;
      inherentImpact: number;
    },
  ): Promise<Risk> {
    return signedSend<Risk>(this.client, 'notes.internal-controls.findings.create-risk', {
      orgId,
      userId,
      findingId,
      data,
    });
  }

  createExceptionFromFinding(
    orgId: string,
    userId: string,
    findingId: string,
    data: {
      controlCode: string;
      frameworkId: string;
      title: string;
      statement: string;
      justification: string;
      ownerId: string;
      compensatingControls?: string;
    },
  ): Promise<Exception> {
    return signedSend<Exception>(
      this.client,
      'notes.internal-controls.findings.create-exception',
      { orgId, userId, findingId, data },
    );
  }
```

Add `Issue`, `Risk`, `Exception`, `IssueSeverity` to this file's type imports if not already present (`Finding` is already imported at line 32).

- [ ] **Step 2: Write/extend the unit test**

In `libs/notes-client/src/lib/__tests__/notes-client.service.unit.test.ts`, add (following the existing `createAssessmentFinding() sends finding creation over RPC` test's style at line 130):

```ts
  it('createRiskFromFinding() sends the combo create-and-link over RPC', async () => {
    const client = createMockClient();
    const service = new NotesClientService(client);
    await service.createRiskFromFinding('org1', 'user1', 'finding1', {
      title: 't',
      description: 'd',
      taxonomyCategoryId: 'cat1',
      ownerId: 'user1',
      inherentLikelihood: 3,
      inherentImpact: 3,
    });
    expect(client.send).toHaveBeenCalledWith(
      'notes.internal-controls.findings.create-risk',
      expect.objectContaining({ findingId: 'finding1' }),
    );
  });
```

(Read the existing test file's `createMockClient`/`client.send` assertion helper pattern first — reuse it exactly rather than inventing a new one.)

- [ ] **Step 3: Run and verify**

Run: `yarn nx test notes-client`
Expected: PASS.

- [ ] **Step 4: Post-coding routine and commit**

```bash
npx prettier --write libs/notes-client/src/lib/notes-client.service.ts libs/notes-client/src/lib/__tests__/notes-client.service.unit.test.ts
yarn nx lint notes-client
yarn nx build notes-client
git add libs/notes-client/src/lib/notes-client.service.ts libs/notes-client/src/lib/__tests__/notes-client.service.unit.test.ts
git commit -m "feat(notes-client): proxy the Finding bridge methods over TCP"
```

---

### Task 6: Gateway — auth-harden the 4 existing routes, add 4 new routes

**Files:**
- Modify: `apps/api/src/app/notes/notes.controller.ts:288-326` (existing findings routes) plus a new block for the 4 new routes.

**Interfaces:**
- Consumes: `getFinding`, `getInternalControl`, `getIssue`, `getRisk`, `getException`, `getOrganizationById`, `checkOrgAccess` (all pre-existing except `getFinding`, added in Task 5).
- Produces: `GET /notes/internal-controls/:id/findings`, `POST /notes/findings/:id/link-risk`, `POST /notes/findings/:id/link-issue`, `POST /notes/findings/:id/resolve-via-exception`, `POST /notes/findings/:id/create-issue`, `POST /notes/findings/:id/create-risk`, `POST /notes/findings/:id/create-exception`, `GET /notes/findings/by-link`.

- [ ] **Step 1: Replace the 4 existing routes with auth-hardened versions**

Replace this exact block (lines 288-326):

```ts
  @Get('internal-controls/:id/findings')
  @ApiOperation({ summary: 'List findings for an internal control' })
  listControlFindings(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    return this.notes.listControlFindings(id);
  }

  @Post('findings/:id/link-risk')
  @ApiOperation({ summary: 'Link a finding to a risk register entry' })
  linkFindingToRisk(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: { riskId: string },
  ) {
    this.uid(req);
    return this.notes.linkFindingToRisk(id, body.riskId);
  }

  @Post('findings/:id/link-issue')
  @ApiOperation({ summary: 'Link a finding to an issue' })
  linkFindingToIssue(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: { issueId: string },
  ) {
    this.uid(req);
    return this.notes.linkFindingToIssue(id, body.issueId);
  }

  @Post('findings/:id/resolve-via-exception')
  @ApiOperation({ summary: 'Resolve a finding by attaching an approved exception' })
  resolveFindingViaException(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: { exceptionId: string },
  ) {
    this.uid(req);
    return this.notes.resolveFindingViaException(id, body.exceptionId);
  }
```

with:

```ts
  @Get('internal-controls/:id/findings')
  @ApiOperation({ summary: 'List findings for an internal control' })
  async listControlFindings(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Query('orgId') orgId: string,
  ) {
    this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    const org = await this.notes.getOrganizationById(orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'read');
    return this.notes.listControlFindings(id);
  }

  @Post('findings/:id/link-risk')
  @ApiOperation({ summary: 'Link a finding to a risk register entry' })
  async linkFindingToRisk(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: { riskId: string },
  ) {
    this.uid(req);
    const finding = await this.notes.getFinding(id);
    if (!finding) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(finding.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.linkFindingToRisk(id, body.riskId);
  }

  @Post('findings/:id/link-issue')
  @ApiOperation({ summary: 'Link a finding to an issue' })
  async linkFindingToIssue(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: { issueId: string },
  ) {
    this.uid(req);
    const finding = await this.notes.getFinding(id);
    if (!finding) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(finding.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.linkFindingToIssue(id, body.issueId);
  }

  @Post('findings/:id/resolve-via-exception')
  @ApiOperation({ summary: 'Resolve a finding by attaching an approved exception' })
  async resolveFindingViaException(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: { exceptionId: string },
  ) {
    this.uid(req);
    const finding = await this.notes.getFinding(id);
    if (!finding) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(finding.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.resolveFindingViaException(id, body.exceptionId);
  }

  @Post('findings/:id/create-issue')
  @ApiOperation({ summary: 'Create a new Issue from a Finding and link it back' })
  async createIssueFromFinding(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: { title: string; description: string; severity: IssueSeverity; ownerId: string },
  ) {
    const uid = this.uid(req);
    const finding = await this.notes.getFinding(id);
    if (!finding) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(finding.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.createIssueFromFinding(finding.orgId, uid, id, body);
  }

  @Post('findings/:id/create-risk')
  @ApiOperation({ summary: 'Create a new Risk from a Finding and link it back' })
  async createRiskFromFinding(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body()
    body: {
      title: string;
      description: string;
      taxonomyCategoryId: string;
      ownerId: string;
      inherentLikelihood: number;
      inherentImpact: number;
    },
  ) {
    const uid = this.uid(req);
    const finding = await this.notes.getFinding(id);
    if (!finding) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(finding.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.createRiskFromFinding(finding.orgId, uid, id, body);
  }

  @Post('findings/:id/create-exception')
  @ApiOperation({ summary: 'Create a new (pending) Exception from a Finding' })
  async createExceptionFromFinding(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body()
    body: {
      controlCode: string;
      frameworkId: string;
      title: string;
      statement: string;
      justification: string;
      ownerId: string;
      compensatingControls?: string;
    },
  ) {
    const uid = this.uid(req);
    const finding = await this.notes.getFinding(id);
    if (!finding) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(finding.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.createExceptionFromFinding(finding.orgId, uid, id, body);
  }

  @Get('findings/by-link')
  @ApiOperation({ summary: 'List findings linked to a given Issue, Risk, or Exception' })
  async listFindingsByLink(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('issueId') issueId?: string,
    @Query('riskId') riskId?: string,
    @Query('exceptionId') exceptionId?: string,
  ) {
    this.uid(req);
    let orgId: string | undefined;
    if (issueId) orgId = (await this.notes.getIssue(issueId))?.orgId;
    else if (riskId) orgId = (await this.notes.getRisk(riskId))?.orgId;
    else if (exceptionId) orgId = (await this.notes.getException(exceptionId))?.orgId;
    if (!orgId) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'read');
    return this.notes.listFindingsByLink({ issueId, riskId, exceptionId });
  }
```

Note the client-side call to `listControlFindings` must now include `orgId` as a query param — Task 7's `useControlFindings` hook is written to do this.

Add `IssueSeverity` to this file's type imports if not already present.

- [ ] **Step 2: Build to verify wiring**

Run: `yarn nx build api`
Expected: PASS.

- [ ] **Step 3: Post-coding routine and commit**

```bash
npx prettier --write apps/api/src/app/notes/notes.controller.ts
yarn nx lint api
git add apps/api/src/app/notes/notes.controller.ts
git commit -m "feat(api): auth-harden and extend the Finding bridge gateway routes"
```

---

### Task 7: Client query hooks

**Files:**
- Modify: `apps/client/src/queries/frameworks.ts` (add `useControlFindings`, `useCreateIssueFromFinding`, `useCreateRiskFromFinding`, `useCreateExceptionFromFinding`, `useLinkFindingToIssue`, `useLinkFindingToRisk`, `useResolveFindingViaException`, `useFindingsByLink`)

**Interfaces:**
- Consumes: the 8 gateway routes from Task 6.
- Produces: 8 hooks Task 8-13 import from `@/queries/frameworks`.

- [ ] **Step 1: Add the type export and the 8 hooks**

Add `Finding`, `Issue`, `Risk`, `Exception`, `IssueSeverity` to this file's `import type { ... } from '@icore/shared'` block (already imports `RequirementAssessment` etc. from the same module) and re-export `Finding` alongside the existing `export type { ... }` block.

Append to the end of `apps/client/src/queries/frameworks.ts`:

```ts
export function useControlFindings(controlId: string, orgId?: string) {
  return useQuery<Finding[]>({
    queryKey: ['controls', controlId, 'findings', orgId ?? 'all'],
    queryFn: () =>
      api<Finding[]>(
        `/notes/internal-controls/${encodeURIComponent(controlId)}/findings?orgId=${encodeURIComponent(orgId ?? '')}`,
      ),
    enabled: !!controlId && !!orgId,
  });
}

export function useFindingsByLink(params: {
  issueId?: string;
  riskId?: string;
  exceptionId?: string;
}) {
  const key = params.issueId
    ? `issue:${params.issueId}`
    : params.riskId
      ? `risk:${params.riskId}`
      : params.exceptionId
        ? `exception:${params.exceptionId}`
        : 'none';
  const qs = new URLSearchParams();
  if (params.issueId) qs.set('issueId', params.issueId);
  if (params.riskId) qs.set('riskId', params.riskId);
  if (params.exceptionId) qs.set('exceptionId', params.exceptionId);
  return useQuery<Finding[]>({
    queryKey: ['findings', 'by-link', key],
    queryFn: () => api<Finding[]>(`/notes/findings/by-link?${qs.toString()}`),
    enabled: key !== 'none',
  });
}

export function useLinkFindingToIssue(findingId: string) {
  const qc = useQueryClient();
  return useMutation<Finding, Error, { issueId: string }>({
    mutationFn: (data) =>
      api<Finding>(`/notes/findings/${findingId}/link-issue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['controls'] });
      qc.invalidateQueries({ queryKey: ['findings'] });
    },
  });
}

export function useLinkFindingToRisk(findingId: string) {
  const qc = useQueryClient();
  return useMutation<Finding, Error, { riskId: string }>({
    mutationFn: (data) =>
      api<Finding>(`/notes/findings/${findingId}/link-risk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['controls'] });
      qc.invalidateQueries({ queryKey: ['findings'] });
    },
  });
}

export function useResolveFindingViaException(findingId: string) {
  const qc = useQueryClient();
  return useMutation<Finding, Error, { exceptionId: string }>({
    mutationFn: (data) =>
      api<Finding>(`/notes/findings/${findingId}/resolve-via-exception`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['controls'] });
      qc.invalidateQueries({ queryKey: ['findings'] });
    },
  });
}

export function useCreateIssueFromFinding(findingId: string) {
  const qc = useQueryClient();
  return useMutation<
    Issue,
    Error,
    { title: string; description: string; severity: IssueSeverity; ownerId: string }
  >({
    mutationFn: (data) =>
      api(`/notes/findings/${findingId}/create-issue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: (_, __, ___) => {
      qc.invalidateQueries({ queryKey: ['controls'] });
      qc.invalidateQueries({ queryKey: ['findings'] });
      qc.invalidateQueries({ queryKey: ['issues'] });
    },
  });
}

export function useCreateRiskFromFinding(findingId: string) {
  const qc = useQueryClient();
  return useMutation<
    Risk,
    Error,
    {
      title: string;
      description: string;
      taxonomyCategoryId: string;
      ownerId: string;
      inherentLikelihood: number;
      inherentImpact: number;
    }
  >({
    mutationFn: (data) =>
      api(`/notes/findings/${findingId}/create-risk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['controls'] });
      qc.invalidateQueries({ queryKey: ['findings'] });
      qc.invalidateQueries({ queryKey: ['risks'] });
    },
  });
}

export function useCreateExceptionFromFinding(findingId: string) {
  const qc = useQueryClient();
  return useMutation<
    Exception,
    Error,
    {
      controlCode: string;
      frameworkId: string;
      title: string;
      statement: string;
      justification: string;
      ownerId: string;
      compensatingControls?: string;
    }
  >({
    mutationFn: (data) =>
      api(`/notes/findings/${findingId}/create-exception`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['controls'] });
      qc.invalidateQueries({ queryKey: ['findings'] });
      qc.invalidateQueries({ queryKey: ['exceptions'] });
    },
  });
}
```

`useControlFindings` requires `orgId` — before this task, `RequirementDrawer` doesn't pass `orgId` into `listControlFindings`-adjacent hooks anywhere; Task 8 wires it from `RequirementDrawer`'s existing `orgId` prop.

- [ ] **Step 2: Build and lint**

Run: `yarn nx build client`
Expected: PASS.

- [ ] **Step 3: Post-coding routine and commit**

```bash
npx prettier --write apps/client/src/queries/frameworks.ts
yarn nx lint client
git add apps/client/src/queries/frameworks.ts
git commit -m "feat(client): add query hooks for the Finding bridge"
```

---

### Task 8: LinkedFindingSection scaffold + Issue bridge + RequirementDrawer wiring

**Files:**
- Create: `apps/client/src/components/frameworks/LinkedFindingSection.tsx`
- Modify: `apps/client/src/components/frameworks/RequirementDrawer.tsx` (disable "Log Finding" when `linkedAssessments.length === 0`, replace the static finding badge with `<LinkedFindingSection>`)
- Test: `apps/client/src/components/frameworks/__tests__/LinkedFindingSection.unit.test.tsx` (new)

**Interfaces:**
- Consumes: `useControlFindings`, `useCreateIssueFromFinding`, `useLinkFindingToIssue` from Task 7; `useIssues`, `useOrgMembers` (pre-existing).
- Produces: `LinkedFindingSection` component, consumed further by Tasks 9-10 (which add the Risk and Exception slots to the same file) and by `RequirementDrawer.tsx`.

- [ ] **Step 1: Fix the "Log Finding" crash risk in RequirementDrawer**

In `apps/client/src/components/frameworks/RequirementDrawer.tsx`, find the "Log Finding" button (around line 977):

```tsx
                <Button
                  size="sm"
                  onClick={() => setShowAddFinding(!showAddFinding)}
                  className="h-7 text-xs gap-1 bg-amber-600 hover:bg-amber-500 text-white"
                >
                  <AlertTriangle size={12} />
                  Log Finding
                </Button>
```

replace with:

```tsx
                <Button
                  size="sm"
                  disabled={linkedAssessments.length === 0}
                  title={
                    linkedAssessments.length === 0
                      ? t(
                          'frameworks.drawer.findingBridge.noAssessmentYet',
                          'Log an assessment before recording a finding',
                        )
                      : undefined
                  }
                  onClick={() => setShowAddFinding(!showAddFinding)}
                  className="h-7 text-xs gap-1 bg-amber-600 hover:bg-amber-500 text-white"
                >
                  <AlertTriangle size={12} />
                  Log Finding
                </Button>
```

This closes the pre-existing `linkedAssessments[0] || { id: 'asm-default' }` fallback in `handleCreateFinding` (around line 226) — that fallback becomes unreachable once the button can't be clicked with zero assessments logged, since `createAssessmentFinding` now genuinely persists and would otherwise throw `requirement_assessment_not_found: asm-default`.

- [ ] **Step 2: Replace the static finding badge with `LinkedFindingSection`**

Find the badge block (around line 1105):

```tsx
                      {asm.findingId && (
                        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-red-400">
                              {asm.findingId}
                            </span>
                            <span className="text-xs text-foreground font-medium">
                              {asm.findingTitle}
                            </span>
                          </div>
                          <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-red-500/20 text-red-400">
                            {asm.findingSeverity}
                          </span>
                        </div>
                      )}
```

replace with:

```tsx
                      {asm.findingId && asm.controlId && (
                        <LinkedFindingSection
                          findingId={asm.findingId}
                          controlId={asm.controlId}
                          orgId={orgId}
                          frameworkId={framework.id}
                          internalControls={internalControls}
                        />
                      )}
```

Add the import at the top of the file:

```tsx
import { LinkedFindingSection } from './LinkedFindingSection';
```

- [ ] **Step 3: Write the failing test for the scaffold + Issue bridge**

Create `apps/client/src/components/frameworks/__tests__/LinkedFindingSection.unit.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { createIcoreI18n, ICORE_LOCALES } from '@icore/template-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Finding, InternalControl } from '@icore/shared';

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    Link: ({ children, to, params, className }: any) => (
      <a href={`${to}`.replace('$id', params?.id ?? '')} className={className}>
        {children}
      </a>
    ),
  };
});

const mockFinding: Finding = {
  id: 'finding1',
  orgId: 'org1',
  code: 'FIND-000101',
  controlId: 'ctrl1',
  assessmentId: 'asm1',
  title: 'Missing evidence',
  description: 'desc',
  severity: 'high',
  status: 'open',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const mockControls: InternalControl[] = [
  { id: 'ctrl1', orgId: 'org1', code: 'POL-001', title: 'Policy Review', description: 'd', owner: 'Sec' },
];

const mockCreateIssueMutate = vi.fn();
const mockLinkIssueMutate = vi.fn();

vi.mock('@/queries/frameworks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/queries/frameworks')>();
  return {
    ...actual,
    useControlFindings: () => ({ data: [mockFinding] }),
    useCreateIssueFromFinding: () => ({ mutate: mockCreateIssueMutate, isPending: false }),
    useLinkFindingToIssue: () => ({ mutate: mockLinkIssueMutate, isPending: false }),
    useCreateRiskFromFinding: () => ({ mutate: vi.fn(), isPending: false }),
    useLinkFindingToRisk: () => ({ mutate: vi.fn(), isPending: false }),
    useCreateExceptionFromFinding: () => ({ mutate: vi.fn(), isPending: false }),
    useResolveFindingViaException: () => ({ mutate: vi.fn(), isPending: false }),
  };
});

vi.mock('@/queries/issues', () => ({
  useIssues: () => ({ data: [{ id: 'issue1', title: 'Existing issue' }] }),
}));
vi.mock('@/queries/risks', () => ({
  useRisks: () => ({ data: [] }),
  useRiskTaxonomy: () => ({ data: [{ id: 'cat1', name: 'Category 1' }] }),
}));
vi.mock('@/queries/exceptions', () => ({
  useExceptions: () => ({ data: [] }),
}));
vi.mock('@/queries/org-members', () => ({
  useOrgMembers: () => ({ data: [{ userId: 'user1', displayName: 'Alice', email: 'a@x.com', role: 'owner' }] }),
}));

const i18n = createIcoreI18n({ resources: ICORE_LOCALES });

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>
    </QueryClientProvider>
  );
}

describe('LinkedFindingSection', () => {
  beforeEach(() => vi.clearAllMocks());

  async function renderSection() {
    const { LinkedFindingSection } = await import('../LinkedFindingSection');
    render(
      wrap(
        <LinkedFindingSection
          findingId="finding1"
          controlId="ctrl1"
          orgId="org1"
          frameworkId="fw1"
          internalControls={mockControls}
        />,
      ),
    );
  }

  it('shows the finding code, severity and status', async () => {
    await renderSection();
    expect(screen.getByText('FIND-000101')).toBeDefined();
    expect(screen.getByText(/open/i)).toBeDefined();
  });

  it('shows Create/Link Issue buttons with Cancel in the footer when unlinked', async () => {
    await renderSection();
    fireEvent.click(screen.getByRole('button', { name: /create new issue/i }));
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDefined();
  });

  it('calls createIssueFromFinding with the finding pre-filled', async () => {
    await renderSection();
    fireEvent.click(screen.getByRole('button', { name: /create new issue/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Alice' }));
    fireEvent.click(screen.getAllByRole('button', { name: /create new issue/i })[1]);
    expect(mockCreateIssueMutate).toHaveBeenCalled();
  });
});
```

(This test's exact owner-combobox interaction may need adjustment once the real `Combobox` component's DOM shape is confirmed during implementation — the implementer should run the test, read the actual rendered output if the owner-selection assertion fails, and adjust the query to match, same as every prior phase's precedent for combobox-driven dialogs.)

- [ ] **Step 4: Run to see it fail**

Run: `yarn nx test client --testPathPattern LinkedFindingSection`
Expected: FAIL — component doesn't exist yet.

- [ ] **Step 5: Create the component (scaffold + Issue bridge only — Risk/Exception slots are stubs for Tasks 9-10)**

Create `apps/client/src/components/frameworks/LinkedFindingSection.tsx`:

```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotify } from '@icore/template-shared';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Combobox } from '@/components/ui/combobox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useControlFindings,
  useCreateIssueFromFinding,
  useLinkFindingToIssue,
  useCreateRiskFromFinding,
  useLinkFindingToRisk,
  useCreateExceptionFromFinding,
  useResolveFindingViaException,
  type InternalControl,
} from '@/queries/frameworks';
import { useIssues } from '@/queries/issues';
import { useOrgMembers } from '@/queries/org-members';

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-red-500/10 text-red-400 border-red-500/20',
  remediated: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  accepted: 'bg-green-500/10 text-green-400 border-green-500/20',
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400',
  high: 'bg-orange-500/20 text-orange-400',
  medium: 'bg-amber-500/20 text-amber-400',
  low: 'bg-blue-500/20 text-blue-400',
};

interface LinkedFindingSectionProps {
  findingId: string;
  controlId: string;
  orgId: string;
  frameworkId: string;
  internalControls: InternalControl[];
}

export function LinkedFindingSection({
  findingId,
  controlId,
  orgId,
  frameworkId: _frameworkId,
  internalControls: _internalControls,
}: LinkedFindingSectionProps) {
  const { t } = useTranslation();
  const notify = useNotify();
  const { data: findings } = useControlFindings(controlId, orgId);
  const finding = findings?.find((f) => f.id === findingId);

  const { data: issues = [] } = useIssues(orgId);
  const { data: members = [] } = useOrgMembers(orgId);

  const createIssueMut = useCreateIssueFromFinding(findingId);
  const linkIssueMut = useLinkFindingToIssue(findingId);

  const [createIssueOpen, setCreateIssueOpen] = useState(false);
  const [linkIssueOpen, setLinkIssueOpen] = useState(false);
  const [selectedIssueId, setSelectedIssueId] = useState('');
  const [issueOwnerId, setIssueOwnerId] = useState('');

  function closeCreateIssue() {
    setCreateIssueOpen(false);
    setIssueOwnerId('');
  }
  function closeLinkIssue() {
    setLinkIssueOpen(false);
    setSelectedIssueId('');
  }

  if (!finding) return null;

  return (
    <div className="p-3 rounded-lg bg-surface border border-border space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold text-foreground">{finding.code}</span>
          <span className="text-xs text-foreground font-medium">{finding.title}</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${SEVERITY_COLORS[finding.severity]}`}
          >
            {finding.severity}
          </span>
          <span
            className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded border ${STATUS_COLORS[finding.status]}`}
          >
            {finding.status}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 text-xs">
        <div>
          <p className="text-muted-foreground mb-1">
            {t('frameworks.drawer.findingBridge.issueTitle', 'Issue')}
          </p>
          {finding.linkedIssueId ? (
            <a
              href={`/issues`}
              className="underline text-muted-foreground hover:text-foreground"
            >
              {t('frameworks.drawer.findingBridge.linked', 'Linked')}
            </a>
          ) : (
            <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={() => setCreateIssueOpen(true)}>
                {t('frameworks.drawer.findingBridge.createIssue', 'Create New Issue')}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setLinkIssueOpen(true)}>
                {t('frameworks.drawer.findingBridge.linkIssue', 'Link Existing')}
              </Button>
            </div>
          )}
        </div>
      </div>

      <Dialog open={createIssueOpen} onOpenChange={(o) => !o && closeCreateIssue()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('frameworks.drawer.findingBridge.createIssue', 'Create New Issue')}</DialogTitle>
          </DialogHeader>
          <div>
            <Label>{t('frameworks.drawer.findingBridge.selectOwner', 'Owner')}</Label>
            <Combobox
              options={members.map((m) => ({ value: m.userId, label: m.displayName }))}
              value={issueOwnerId}
              onChange={setIssueOwnerId}
              placeholder={t('frameworks.drawer.findingBridge.selectOwner', 'Select owner...')}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeCreateIssue}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={!issueOwnerId || createIssueMut.isPending}
              onClick={() =>
                createIssueMut.mutate(
                  {
                    title: finding.title,
                    description: finding.description,
                    severity: finding.severity,
                    ownerId: issueOwnerId,
                  },
                  {
                    onSuccess: () => {
                      closeCreateIssue();
                      notify.success(
                        t('frameworks.drawer.findingBridge.issueCreated', 'Issue created'),
                      );
                    },
                    onError: () => notify.error(t('error.unknown')),
                  },
                )
              }
            >
              {t('frameworks.drawer.findingBridge.createIssue', 'Create New Issue')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={linkIssueOpen} onOpenChange={(o) => !o && closeLinkIssue()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('frameworks.drawer.findingBridge.linkIssue', 'Link Existing Issue')}
            </DialogTitle>
          </DialogHeader>
          <Combobox
            options={issues.map((i) => ({ value: i.id, label: i.title }))}
            value={selectedIssueId}
            onChange={setSelectedIssueId}
            placeholder={t('frameworks.drawer.findingBridge.selectIssue', 'Select an issue...')}
          />
          <DialogFooter>
            <Button variant="outline" onClick={closeLinkIssue}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={!selectedIssueId || linkIssueMut.isPending}
              onClick={() =>
                linkIssueMut.mutate(
                  { issueId: selectedIssueId },
                  {
                    onSuccess: () => closeLinkIssue(),
                    onError: () => notify.error(t('error.unknown')),
                  },
                )
              }
            >
              {t('frameworks.drawer.findingBridge.linkIssue', 'Link Existing Issue')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

Tasks 9 and 10 extend this same file with the Risk and Exception slots inside the `grid-cols-3` block (currently only 1 of 3 columns is filled) and their own hooks/state/dialogs, following this exact structure.

- [ ] **Step 6: Run to see it pass**

Run: `yarn nx test client --testPathPattern LinkedFindingSection`
Expected: PASS.

- [ ] **Step 7: Verify RequirementDrawer still passes its own tests**

Run: `yarn nx test client --testPathPattern RequirementDrawer`
Expected: PASS (or, if this file has no dedicated test file, run the broader `frameworks` test filter and confirm nothing regresses: `yarn nx test client --testPathPattern frameworks`).

- [ ] **Step 8: Live Playwright check**

Per AGENTS.md's mandatory UI rule: start the dev stack (Fake strategies), open a framework requirement's drawer, log a finding against a real logged assessment, confirm the "Log Finding" button is disabled with no assessments and enabled once one exists, confirm the new finding shows its real `FIND-NNNNNN` code + status + severity, open Create/Link Issue dialogs and confirm Cancel resets state and closes without side effects.

- [ ] **Step 9: Post-coding routine and commit**

```bash
npx prettier --write apps/client/src/components/frameworks/LinkedFindingSection.tsx apps/client/src/components/frameworks/RequirementDrawer.tsx apps/client/src/components/frameworks/__tests__/LinkedFindingSection.unit.test.tsx
yarn nx lint client
yarn nx build client
git add apps/client/src/components/frameworks/LinkedFindingSection.tsx apps/client/src/components/frameworks/RequirementDrawer.tsx apps/client/src/components/frameworks/__tests__/LinkedFindingSection.unit.test.tsx
git commit -m "feat(client): add LinkedFindingSection with the Issue bridge, fix Log Finding crash risk"
```

---

### Task 9: Risk bridge in LinkedFindingSection

**Files:**
- Modify: `apps/client/src/components/frameworks/LinkedFindingSection.tsx`, `apps/client/src/components/frameworks/__tests__/LinkedFindingSection.unit.test.tsx`

**Interfaces:**
- Consumes: `useCreateRiskFromFinding`, `useLinkFindingToRisk` (imported, unused, in Task 8), `useRisks`, `useRiskTaxonomy` from `@/queries/risks`, `<Link>` from `@tanstack/react-router` for the linked state (matches Phase B.2.2's precedent — full SPA navigation, not a raw anchor).

- [ ] **Step 1: Write the failing test**

Add to `LinkedFindingSection.unit.test.tsx`:

```tsx
  it('shows Create/Link Risk controls and calls createRiskFromFinding with the picked category and scores', async () => {
    await renderSection();
    fireEvent.click(screen.getByRole('button', { name: /create new risk/i }));
    // category + likelihood + impact + owner selection omitted here for brevity —
    // the implementer fills in the exact interaction once the real dialog DOM is confirmed.
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDefined();
  });
```

(As with Task 8's test, adjust the exact selectors once the dialog is implemented and run once to confirm real DOM shape.)

- [ ] **Step 2: Extend the component**

In `LinkedFindingSection.tsx`, add imports:

```tsx
import { Link } from '@tanstack/react-router';
import { useRisks, useRiskTaxonomy } from '@/queries/risks';
```

Add state and hooks inside the component body (alongside the Issue-bridge state from Task 8):

```tsx
  const { data: risks = [] } = useRisks(orgId);
  const { data: taxonomy = [] } = useRiskTaxonomy(orgId);
  const createRiskMut = useCreateRiskFromFinding(findingId);
  const linkRiskMut = useLinkFindingToRisk(findingId);

  const [createRiskOpen, setCreateRiskOpen] = useState(false);
  const [linkRiskOpen, setLinkRiskOpen] = useState(false);
  const [selectedRiskId, setSelectedRiskId] = useState('');
  const [riskCategoryId, setRiskCategoryId] = useState('');
  const [riskOwnerId, setRiskOwnerId] = useState('');
  const [riskLikelihood, setRiskLikelihood] = useState(0);
  const [riskImpact, setRiskImpact] = useState(0);

  function closeCreateRisk() {
    setCreateRiskOpen(false);
    setRiskCategoryId('');
    setRiskOwnerId('');
    setRiskLikelihood(0);
    setRiskImpact(0);
  }
  function closeLinkRisk() {
    setLinkRiskOpen(false);
    setSelectedRiskId('');
  }

  const linkedRisk = finding && finding.linkedRiskId
    ? risks.find((r) => r.id === finding.linkedRiskId)
    : undefined;
```

Add the second `grid-cols-3` column, immediately after the Issue column's closing `</div>`:

```tsx
        <div>
          <p className="text-muted-foreground mb-1">
            {t('frameworks.drawer.findingBridge.riskTitle', 'Risk')}
          </p>
          {finding.linkedRiskId ? (
            linkedRisk ? (
              <Link
                to="/risks/$id"
                params={{ id: linkedRisk.id }}
                className="underline text-muted-foreground hover:text-foreground"
              >
                {linkedRisk.riskId}
              </Link>
            ) : (
              <span className="text-muted-foreground">
                {t('frameworks.drawer.findingBridge.linked', 'Linked')}
              </span>
            )
          ) : (
            <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={() => setCreateRiskOpen(true)}>
                {t('frameworks.drawer.findingBridge.createRisk', 'Create New Risk')}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setLinkRiskOpen(true)}>
                {t('frameworks.drawer.findingBridge.linkRisk', 'Link Existing')}
              </Button>
            </div>
          )}
        </div>
```

Add the two dialogs, after the Issue-bridge dialogs' closing tags and before the component's final `</div>`:

```tsx
      <Dialog open={createRiskOpen} onOpenChange={(o) => !o && closeCreateRisk()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('frameworks.drawer.findingBridge.createRisk', 'Create New Risk')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t('risks.category')}</Label>
              <select
                value={riskCategoryId}
                onChange={(e) => setRiskCategoryId(e.target.value)}
                className="w-full h-9 rounded-md border border-border bg-surface px-3 text-sm"
              >
                <option value="">{t('risks.selectCategory')}</option>
                {taxonomy.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>{t('frameworks.drawer.findingBridge.selectOwner', 'Owner')}</Label>
              <Combobox
                options={members.map((m) => ({ value: m.userId, label: m.displayName }))}
                value={riskOwnerId}
                onChange={setRiskOwnerId}
                placeholder={t('frameworks.drawer.findingBridge.selectOwner', 'Select owner...')}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t('risks.inherentLikelihood')}</Label>
                <select
                  value={riskLikelihood || ''}
                  onChange={(e) => setRiskLikelihood(Number(e.target.value))}
                  className="w-full h-9 rounded-md border border-border bg-surface px-3 text-sm"
                >
                  <option value="">--</option>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>{t('risks.inherentImpact')}</Label>
                <select
                  value={riskImpact || ''}
                  onChange={(e) => setRiskImpact(Number(e.target.value))}
                  className="w-full h-9 rounded-md border border-border bg-surface px-3 text-sm"
                >
                  <option value="">--</option>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeCreateRisk}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={
                !riskCategoryId || !riskOwnerId || !riskLikelihood || !riskImpact || createRiskMut.isPending
              }
              onClick={() =>
                createRiskMut.mutate(
                  {
                    title: finding.title,
                    description: finding.description,
                    taxonomyCategoryId: riskCategoryId,
                    ownerId: riskOwnerId,
                    inherentLikelihood: riskLikelihood,
                    inherentImpact: riskImpact,
                  },
                  {
                    onSuccess: (created) => {
                      closeCreateRisk();
                      notify.success(t('assessments.riskCreated', { code: created.riskId }));
                    },
                    onError: () => notify.error(t('error.unknown')),
                  },
                )
              }
            >
              {t('frameworks.drawer.findingBridge.createRisk', 'Create New Risk')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={linkRiskOpen} onOpenChange={(o) => !o && closeLinkRisk()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('frameworks.drawer.findingBridge.linkRisk', 'Link Existing Risk')}
            </DialogTitle>
          </DialogHeader>
          <Combobox
            options={risks.map((r) => ({ value: r.id, label: `${r.riskId} — ${r.title}` }))}
            value={selectedRiskId}
            onChange={setSelectedRiskId}
            placeholder={t('frameworks.drawer.findingBridge.selectRisk', 'Select a risk...')}
          />
          <DialogFooter>
            <Button variant="outline" onClick={closeLinkRisk}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={!selectedRiskId || linkRiskMut.isPending}
              onClick={() =>
                linkRiskMut.mutate(
                  { riskId: selectedRiskId },
                  {
                    onSuccess: () => closeLinkRisk(),
                    onError: () => notify.error(t('error.unknown')),
                  },
                )
              }
            >
              {t('frameworks.drawer.findingBridge.linkRisk', 'Link Existing Risk')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
```

- [ ] **Step 3: Run the tests**

Run: `yarn nx test client --testPathPattern LinkedFindingSection`
Expected: PASS.

- [ ] **Step 4: Post-coding routine and commit**

```bash
npx prettier --write apps/client/src/components/frameworks/LinkedFindingSection.tsx apps/client/src/components/frameworks/__tests__/LinkedFindingSection.unit.test.tsx
yarn nx lint client
yarn nx build client
git add apps/client/src/components/frameworks/LinkedFindingSection.tsx apps/client/src/components/frameworks/__tests__/LinkedFindingSection.unit.test.tsx
git commit -m "feat(client): add the Risk bridge to LinkedFindingSection"
```

---

### Task 10: Exception bridge in LinkedFindingSection (approved-only)

**Files:**
- Modify: `apps/client/src/components/frameworks/LinkedFindingSection.tsx`, `apps/client/src/components/frameworks/__tests__/LinkedFindingSection.unit.test.tsx`

**Interfaces:**
- Consumes: `useCreateExceptionFromFinding`, `useResolveFindingViaException` (imported, unused, in Task 8), `useExceptions` from `@/queries/exceptions`.

- [ ] **Step 1: Write the failing test**

Add to `LinkedFindingSection.unit.test.tsx`:

```tsx
  it('filters the Link Existing Exception combobox to approved exceptions only', async () => {
    await renderSection();
    fireEvent.click(screen.getByRole('button', { name: /link existing/i, hidden: true }));
    // Real assertion added once the exact rendered dialog/combobox DOM is confirmed —
    // must show only exceptions with status === 'approved'.
  });
```

Update the `@/queries/exceptions` mock at the top of the file to return a mix of statuses:

```tsx
vi.mock('@/queries/exceptions', () => ({
  useExceptions: () => ({
    data: [
      { id: 'exc1', title: 'Approved one', status: 'approved' },
      { id: 'exc2', title: 'Pending one', status: 'pending' },
    ],
  }),
}));
```

- [ ] **Step 2: Extend the component**

Add imports:

```tsx
import { useExceptions } from '@/queries/exceptions';
```

Add state and hooks:

```tsx
  const { data: exceptions = [] } = useExceptions(orgId);
  const approvedExceptions = exceptions.filter((e) => e.status === 'approved');
  const createExceptionMut = useCreateExceptionFromFinding(findingId);
  const resolveMut = useResolveFindingViaException(findingId);

  const control = _internalControls.find((c) => c.id === controlId);

  const [createExceptionOpen, setCreateExceptionOpen] = useState(false);
  const [linkExceptionOpen, setLinkExceptionOpen] = useState(false);
  const [selectedExceptionId, setSelectedExceptionId] = useState('');
  const [exceptionOwnerId, setExceptionOwnerId] = useState('');
  const [exceptionStatement, setExceptionStatement] = useState('');
  const [exceptionJustification, setExceptionJustification] = useState('');

  function closeCreateException() {
    setCreateExceptionOpen(false);
    setExceptionOwnerId('');
    setExceptionStatement('');
    setExceptionJustification('');
  }
  function closeLinkException() {
    setLinkExceptionOpen(false);
    setSelectedExceptionId('');
  }
```

(Rename the constructor parameter `internalControls: _internalControls` back to `internalControls` now that it's used — remove the `_` prefix and the corresponding `frameworkId: _frameworkId` → `frameworkId`, both of which become used by this task.)

Add the third `grid-cols-3` column:

```tsx
        <div>
          <p className="text-muted-foreground mb-1">
            {t('frameworks.drawer.findingBridge.exceptionTitle', 'Exception')}
          </p>
          {finding.linkedExceptionId ? (
            <span className="text-muted-foreground">
              {t('frameworks.drawer.findingBridge.linked', 'Linked')}
            </span>
          ) : (
            <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={() => setCreateExceptionOpen(true)}>
                {t('frameworks.drawer.findingBridge.createException', 'Create New Exception')}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setLinkExceptionOpen(true)}>
                {t('frameworks.drawer.findingBridge.linkException', 'Link Existing (Approved)')}
              </Button>
            </div>
          )}
        </div>
```

Add the two dialogs:

```tsx
      <Dialog open={createExceptionOpen} onOpenChange={(o) => !o && closeCreateException()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('frameworks.drawer.findingBridge.createException', 'Create New Exception')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t('frameworks.drawer.findingBridge.selectOwner', 'Owner')}</Label>
              <Combobox
                options={members.map((m) => ({ value: m.userId, label: m.displayName }))}
                value={exceptionOwnerId}
                onChange={setExceptionOwnerId}
                placeholder={t('frameworks.drawer.findingBridge.selectOwner', 'Select owner...')}
              />
            </div>
            <div>
              <Label>{t('exceptions.statement')}</Label>
              <textarea
                value={exceptionStatement}
                onChange={(e) => setExceptionStatement(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm resize-none"
                required
              />
            </div>
            <div>
              <Label>{t('exceptions.justification')}</Label>
              <textarea
                value={exceptionJustification}
                onChange={(e) => setExceptionJustification(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm resize-none"
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeCreateException}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={
                !exceptionOwnerId ||
                !exceptionStatement.trim() ||
                !exceptionJustification.trim() ||
                createExceptionMut.isPending
              }
              onClick={() =>
                createExceptionMut.mutate(
                  {
                    controlCode: control?.code ?? '',
                    frameworkId,
                    title: finding.title,
                    statement: exceptionStatement.trim(),
                    justification: exceptionJustification.trim(),
                    ownerId: exceptionOwnerId,
                  },
                  {
                    onSuccess: () => {
                      closeCreateException();
                      notify.success(
                        t(
                          'frameworks.drawer.findingBridge.exceptionCreated',
                          'Exception submitted for approval',
                        ),
                      );
                    },
                    onError: () => notify.error(t('error.unknown')),
                  },
                )
              }
            >
              {t('frameworks.drawer.findingBridge.createException', 'Create New Exception')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={linkExceptionOpen} onOpenChange={(o) => !o && closeLinkException()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('frameworks.drawer.findingBridge.linkException', 'Link Existing (Approved) Exception')}
            </DialogTitle>
          </DialogHeader>
          <Combobox
            options={approvedExceptions.map((e) => ({ value: e.id, label: e.title }))}
            value={selectedExceptionId}
            onChange={setSelectedExceptionId}
            placeholder={t(
              'frameworks.drawer.findingBridge.selectException',
              'Select an approved exception...',
            )}
          />
          <DialogFooter>
            <Button variant="outline" onClick={closeLinkException}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={!selectedExceptionId || resolveMut.isPending}
              onClick={() =>
                resolveMut.mutate(
                  { exceptionId: selectedExceptionId },
                  {
                    onSuccess: () => closeLinkException(),
                    onError: () => notify.error(t('error.unknown')),
                  },
                )
              }
            >
              {t('frameworks.drawer.findingBridge.linkException', 'Link Existing (Approved) Exception')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
```

- [ ] **Step 3: Run the full test file**

Run: `yarn nx test client --testPathPattern LinkedFindingSection`
Expected: PASS — including confirming the Link-Exception combobox's `options` only ever contains `approvedExceptions`, never `exceptions` directly.

- [ ] **Step 4: Live Playwright check**

Verify the full 3-target cycle in a real browser (Fake mode): Create New Issue → toast → Issue slot shows Linked; Create New Risk → toast with `RSK-` code → Risk slot shows a `<Link>` to `/risks/$id` that navigates client-side (confirm via the same window-marker technique used in Phase B.2.2's verification, or simply confirm no full reload); Create New Exception → confirm the finding stays `open` (not auto-resolved) and the Exceptions page shows it pending; approve that exception on the Exceptions page, then Link Existing Exception on the finding → confirm the finding's status flips to `accepted`.

- [ ] **Step 5: Post-coding routine and commit**

```bash
npx prettier --write apps/client/src/components/frameworks/LinkedFindingSection.tsx apps/client/src/components/frameworks/__tests__/LinkedFindingSection.unit.test.tsx
yarn nx lint client
yarn nx build client
git add apps/client/src/components/frameworks/LinkedFindingSection.tsx apps/client/src/components/frameworks/__tests__/LinkedFindingSection.unit.test.tsx
git commit -m "feat(client): add the approved-only Exception bridge to LinkedFindingSection"
```

---

### Task 11: Issues page — reverse back-link

**Files:**
- Modify: `apps/client/src/routes/_dashboard/-issues.page.tsx`
- Test: `apps/client/src/routes/_dashboard/__tests__/issues.unit.test.tsx`

**Interfaces:**
- Consumes: `useFindingsByLink` from Task 7.

- [ ] **Step 1: Write the failing test**

In `issues.unit.test.tsx`, add a mock for `@/queries/frameworks`'s `useFindingsByLink` (following this file's existing mock style for its other query dependencies) returning one finding for a specific issue id, and assert a "From Finding FIND-000101" (or equivalent) link renders for that row's card, linking to `/controls/$id`.

- [ ] **Step 2: Implement**

In `-issues.page.tsx`, for each rendered issue whose `source === 'gap_analysis'`, call `useFindingsByLink({ issueId: issue.id })` and render a small `<Link to="/controls/$id" params={{ id: finding.controlId }}>` showing `finding.code`, using this file's own existing per-row rendering pattern (read the current row JSX first to match its exact structure/className conventions rather than guessing).

Add the i18n key `issues.linkedFinding: 'From Finding {{code}}'` (added in Task 14) and use it via `t('issues.linkedFinding', { code: finding.code })`.

- [ ] **Step 3: Run the tests**

Run: `yarn nx test client --testPathPattern issues`
Expected: PASS.

- [ ] **Step 4: Post-coding routine and commit**

```bash
npx prettier --write apps/client/src/routes/_dashboard/-issues.page.tsx apps/client/src/routes/_dashboard/__tests__/issues.unit.test.tsx
yarn nx lint client
yarn nx build client
git add apps/client/src/routes/_dashboard/-issues.page.tsx apps/client/src/routes/_dashboard/__tests__/issues.unit.test.tsx
git commit -m "feat(client): show originating Finding back-link on Issues page"
```

---

### Task 12: Risk detail page — reverse back-link

**Files:**
- Modify: `apps/client/src/routes/_dashboard/-risks-detail.page.tsx`
- Test: `apps/client/src/routes/_dashboard/__tests__/risks-detail.unit.test.tsx`

**Interfaces:**
- Consumes: `useFindingsByLink` from Task 7.

- [ ] **Step 1: Read the Overview tab's current layout**

Read `-risks-detail.page.tsx` in full to find where `source`/`sourceRef` are already surfaced (added during Phase B.2.2) — the back-link belongs immediately next to that existing provenance display, not a new section, per this plan's design note that final placement is decided during planning by re-reading the current layout. Place it there.

- [ ] **Step 2: Write the failing test**

Mirror Task 11's test approach: mock `useFindingsByLink` to return one finding for `risk.id`, assert the rendered back-link.

- [ ] **Step 3: Implement**

Call `useFindingsByLink({ riskId: risk.id })` where the risk's `source`/`sourceRef` are already rendered; if a match exists, render `<Link to="/controls/$id" params={{ id: finding.controlId }}>` showing `finding.code`, using `t('risks.linkedFinding', { code: finding.code })` (added in Task 14).

- [ ] **Step 4: Run the tests**

Run: `yarn nx test client --testPathPattern risks-detail`
Expected: PASS.

- [ ] **Step 5: Post-coding routine and commit**

```bash
npx prettier --write apps/client/src/routes/_dashboard/-risks-detail.page.tsx apps/client/src/routes/_dashboard/__tests__/risks-detail.unit.test.tsx
yarn nx lint client
yarn nx build client
git add apps/client/src/routes/_dashboard/-risks-detail.page.tsx apps/client/src/routes/_dashboard/__tests__/risks-detail.unit.test.tsx
git commit -m "feat(client): show originating Finding back-link on Risk detail page"
```

---

### Task 13: Exceptions page — reverse back-link

**Files:**
- Modify: `apps/client/src/routes/_dashboard/-exceptions.page.tsx`
- Test: `apps/client/src/routes/_dashboard/__tests__/exceptions.unit.test.tsx`

**Interfaces:**
- Consumes: `useFindingsByLink` from Task 7.

- [ ] **Step 1: Write the failing test**

Mirror Tasks 11/12: mock `useFindingsByLink` to return one finding for `exception.id`, assert the rendered back-link on that exception's row.

- [ ] **Step 2: Implement**

For each rendered exception, call `useFindingsByLink({ exceptionId: exception.id })` and render `<Link to="/controls/$id" params={{ id: finding.controlId }}>` showing `finding.code`, using `t('exceptions.linkedFinding', { code: finding.code })` (added in Task 14), matching this file's existing row-rendering conventions.

- [ ] **Step 3: Run the tests**

Run: `yarn nx test client --testPathPattern exceptions`
Expected: PASS.

- [ ] **Step 4: Post-coding routine and commit**

```bash
npx prettier --write apps/client/src/routes/_dashboard/-exceptions.page.tsx apps/client/src/routes/_dashboard/__tests__/exceptions.unit.test.tsx
yarn nx lint client
yarn nx build client
git add apps/client/src/routes/_dashboard/-exceptions.page.tsx apps/client/src/routes/_dashboard/__tests__/exceptions.unit.test.tsx
git commit -m "feat(client): show originating Finding back-link on Exceptions page"
```

---

### Task 14: i18n — add all new keys to en.ts, then es/he/ru

**Files:**
- Modify: `libs/template-shared/src/lib/i18n/locales/en.ts` (inside `frameworks.drawer`, plus one key each in `issues`, `risks`, `exceptions`), then `es.ts`, `he.ts`, `ru.ts` with equivalent translations.

**Interfaces:**
- Consumes: nothing new.
- Produces: every `t('frameworks.drawer.findingBridge.*')`, `t('issues.linkedFinding')`, `t('risks.linkedFinding')`, `t('exceptions.linkedFinding')` key referenced in Tasks 8-13.

- [ ] **Step 1: Add the English keys**

In `en.ts`, inside the existing `frameworks: { drawer: { ... } }` block (around line 183), add a new nested object:

```ts
      findingBridge: {
        issueTitle: 'Issue',
        riskTitle: 'Risk',
        exceptionTitle: 'Exception',
        linked: 'Linked',
        createIssue: 'Create New Issue',
        linkIssue: 'Link Existing Issue',
        createRisk: 'Create New Risk',
        linkRisk: 'Link Existing Risk',
        createException: 'Create New Exception',
        linkException: 'Link Existing (Approved) Exception',
        selectOwner: 'Select owner...',
        selectIssue: 'Select an issue...',
        selectRisk: 'Select a risk...',
        selectException: 'Select an approved exception...',
        issueCreated: 'Issue created',
        exceptionCreated: 'Exception submitted for approval',
        noAssessmentYet: 'Log an assessment before recording a finding',
      },
```

In the `issues: { ... }` block (around line 674), add: `linkedFinding: 'From Finding {{code}}',`
In the `risks: { ... }` block (around line 885), add: `linkedFinding: 'From Finding {{code}}',`
In the `exceptions: { ... }` block (around line 640), add: `linkedFinding: 'From Finding {{code}}',`

- [ ] **Step 2: Add equivalent translations to es.ts, he.ts, ru.ts**

Read each file's existing `frameworks.drawer`, `issues`, `risks`, `exceptions` blocks to match tone and existing key ordering, then add the same key set with translated values (Spanish, Hebrew, Russian respectively) — follow the exact casing/sentence-style convention already established in each file (Phase B.2.1/B.2.2 both had a casing-consistency finding in `es.ts` specifically — sentence case, not Title Case, matching that file's own established style).

- [ ] **Step 3: Run the full client test suite**

Run: `yarn nx test client`
Expected: PASS — this is the first full-suite run since Task 8, catching any test in a file this plan didn't touch that renders `LinkedFindingSection`'s new top-level hooks indirectly (same class of gap Phase B.2.2's Task 11 hit — if `RequirementDrawer`'s own test file exists and doesn't mock the new query hooks, fix it here).

- [ ] **Step 4: Post-coding routine and commit**

```bash
npx prettier --write libs/template-shared/src/lib/i18n/locales/en.ts libs/template-shared/src/lib/i18n/locales/es.ts libs/template-shared/src/lib/i18n/locales/he.ts libs/template-shared/src/lib/i18n/locales/ru.ts
yarn nx lint template-shared
yarn nx build template-shared
git add libs/template-shared/src/lib/i18n/locales/*.ts
git commit -m "feat(i18n): add Findings bridge strings to all 4 locales"
```

---

### Task 15: Final verification

**Files:** none (verification only, no commit unless a fix is needed).

- [ ] **Step 1: Full affected pipeline**

Run: `yarn nx affected -t lint build test`
Expected: all green.

- [ ] **Step 2: Real Postgres 16 replay (final confirmation)**

Replay every migration from a clean database one more time, confirm the full `findings` bridge round-trips correctly end-to-end (create finding → create-and-link to Issue/Risk → create pending Exception → approve it → link it → status becomes `accepted`) against the real schema, not just the Fake strategy.

- [ ] **Step 3: Live Playwright — full cycle, one pass**

In the real browser (Fake mode): create an org, open a framework with a control mapped to a requirement, log a control assessment, log a finding, create-and-link an Issue (confirm toast + Issues page shows the back-link), create-and-link a Risk (confirm toast + Risk detail page shows the back-link + `<Link>` navigates client-side, no full reload), create a pending Exception (confirm the finding stays open), approve that exception on the Exceptions page, link it to the finding (confirm status becomes `accepted` and the Exceptions page shows the back-link). Zero console errors throughout.

- [ ] **Step 4: Report**

Summarize pipeline results and Playwright evidence; this task produces no commit — it's the gate before the final whole-branch review.

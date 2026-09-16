# Notes Gateway Org-Scoping Hardening — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `checkOrgAccess` org-scoping to 57 of the 68 gateway routes covering Risk, RiskAssessment+AssessmentItem, Issue, and Exception (9 already correct, 2 hand-rolled-correct left alone), plus fix a missing self-approval guard on `approveAssessment`/`requestChanges`.

**Architecture:** Every route resolves org from the resource itself (never a client-supplied query param for access control) using the established inline pattern: `const resource = await this.notes.getX(id); if (!resource) throw new NotFoundException(); const org = await this.notes.getOrganizationById(resource.orgId); if (!org) throw new NotFoundException(); this.checkOrgAccess(req, org, action);`. Four resources (`RiskAcceptance`, `RiskTaxonomyCategory`, `AssessmentType`, `AssessmentItemControlMapping`) have no get-by-id method anywhere in the stack — added across all 5 layers (interface, Fake, Supabase, MS `@MessagePattern` handler, notes-client) before any gateway route can use them. `approveAssessment`/`requestChanges` get a self-approval guard (`ownerId === userId` rejected) mirroring `reviewRiskAcceptance`'s PR #57 restructuring.

**Tech Stack:** NestJS TCP microservices, Supabase (Postgres), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-16-notes-gateway-hardening-phase1-design.md`

## Global Constraints

- Org is always resolved from the resource's own `orgId` field, never trusted from a client-supplied query param for access-control purposes. Exception: list/create routes with no existing resource (`listRisks`, `createRisk`, etc.) keep using `?orgId=` — this is the pre-existing, already-reviewed pattern and is out of scope to change.
- `checkOrgAccess` action mapping: `'read'` for GET/list, `'update'` for POST/PATCH (including creates), `'delete'` for DELETE.
- No new abstraction for the repeated inline org-resolution block — follow the existing style used by the 9 already-correct routes in this file.
- New get-by-id methods return `T | null`, never throw on not-found (matches `getRisk`, `getException`, `getAssessment`).
- `removeRiskControlMapping`'s route already has `:riskId` in its path, unused — add the `@Param` and call the existing `getRisk(riskId)`, no new strategy method.
- `listExceptionRenewals`, `listIssueValidations` are genuinely out of scope — already correct via hand-rolled inline checks, not touched.
- `requestExceptionRenewal`, `submitIssueForValidation` are NOT touched — their existing owner-only check is already complete, resource-specific authorization; `checkOrgAccess` adds no real value today and would wrongly block a future non-creator org member acting on their own resource.
- `reviewIssueValidation` gaining `checkOrgAccess('update')` will make it reachable only by the org creator/admin (org-membership doesn't really exist on this platform) — same accepted tradeoff as every other review workflow this session. Not a new problem.
- This phase touches zero migrations and zero client/UI code — no Playwright verification required.

---

### Task 1: New capability methods — `getRiskAcceptance`, `getRiskTaxonomyCategory`, `getAssessmentType`, `getAssessmentItemControlMapping`

**Files:**
- Modify: `libs/shared/src/strategies/notes.ts` (interface)
- Modify: `libs/shared/src/strategies/fakes/fake-notes.ts` (Fake strategy)
- Modify: `apps/microservices/notes/src/app/supabase-notes.strategy.ts` (Supabase strategy)
- Modify: `apps/microservices/notes/src/app/notes.controller.ts` (MS `@MessagePattern` handlers)
- Modify: `libs/notes-client/src/lib/notes-client.service.ts` (gateway → MS client)
- Modify: `libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts` (new contract tests)

**Interfaces:**
- Produces: `getRiskAcceptance(id): Promise<RiskAcceptance | null>`, `getRiskTaxonomyCategory(id): Promise<RiskTaxonomyCategory | null>`, `getAssessmentType(id): Promise<AssessmentType | null>`, `getAssessmentItemControlMapping(id): Promise<AssessmentItemControlMapping | null>` on `DBStrategy`, both strategies, `NotesClientService`.
- Consumes: nothing from other tasks (this is a foundation task, needed before Tasks 5-6 can wire the routes that use these methods).

- [ ] **Step 1: Add the 4 methods to the `DBStrategy` interface**

In `libs/shared/src/strategies/notes.ts`, in the `// Risk Acceptance` block, add directly after `getActiveRiskAcceptance(riskId: string): Promise<RiskAcceptance | null>;`:

```ts
  getRiskAcceptance(id: string): Promise<RiskAcceptance | null>;
```

In the `// Risk Taxonomy` block, add directly after `listRiskTaxonomy(orgId: string): Promise<RiskTaxonomyCategory[]>;`:

```ts
  getRiskTaxonomyCategory(id: string): Promise<RiskTaxonomyCategory | null>;
```

In the `// Assessment Types` block, add directly after `listAssessmentTypes(orgId: string): Promise<AssessmentType[]>;`:

```ts
  getAssessmentType(id: string): Promise<AssessmentType | null>;
```

In the `// Item <-> control mapping` block, add directly after `listAssessmentItemControlMappings(itemId: string): Promise<AssessmentItemControlMapping[]>;`:

```ts
  getAssessmentItemControlMapping(id: string): Promise<AssessmentItemControlMapping | null>;
```

- [ ] **Step 2: Implement the 4 methods in `FakeNotesStrategy`**

In `libs/shared/src/strategies/fakes/fake-notes.ts`, add directly after `getActiveRiskAcceptance`:

```ts
  async getRiskAcceptance(id: string): Promise<RiskAcceptance | null> {
    return this.riskAcceptances.find((a) => a.id === id) ?? null;
  }
```

Add directly after `listRiskTaxonomy` (before `createRiskTaxonomyCategory`):

```ts
  async getRiskTaxonomyCategory(id: string): Promise<RiskTaxonomyCategory | null> {
    return this.riskTaxonomy.find((c) => c.id === id) ?? null;
  }
```

Add directly after `removeAssessmentItemControlMapping`:

```ts
  async getAssessmentItemControlMapping(id: string): Promise<AssessmentItemControlMapping | null> {
    return this.assessmentItemControlMappings.find((m) => m.id === id) ?? null;
  }
```

Add directly after `listAssessmentTypes` (before `createAssessmentType`):

```ts
  async getAssessmentType(id: string): Promise<AssessmentType | null> {
    return this.assessmentTypes.find((t) => t.id === id) ?? null;
  }
```

- [ ] **Step 3: Implement the 4 methods in `SupabaseNotesStrategy`**

In `apps/microservices/notes/src/app/supabase-notes.strategy.ts`, add directly after the existing `getRiskAcceptanceOrThrow` private method (do not touch or refactor that method — it stays as-is for internal use by `approveRiskAcceptance`/`rejectRiskAcceptance`/`reviewRiskAcceptance`):

```ts
  async getRiskAcceptance(id: string): Promise<RiskAcceptance | null> {
    const { data, error } = await this.db
      .from('risk_acceptances')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? this.toRiskAcceptance(data) : null;
  }
```

(Confirm the table name and `toRiskAcceptance` row-mapper name by checking `getRiskAcceptanceOrThrow`'s own `.from(...)` call and mapper — reuse them exactly, don't guess.)

Add directly after `archiveRiskTaxonomyCategory`:

```ts
  async getRiskTaxonomyCategory(id: string): Promise<RiskTaxonomyCategory | null> {
    const { data, error } = await this.db
      .from('risk_taxonomy_categories')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? this.toRiskTaxonomyCategory(data) : null;
  }
```

Add directly after `archiveAssessmentType`:

```ts
  async getAssessmentType(id: string): Promise<AssessmentType | null> {
    const { data, error } = await this.db
      .from('assessment_types')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? this.toAssessmentType(data) : null;
  }
```

Add directly after `removeAssessmentItemControlMapping`:

```ts
  async getAssessmentItemControlMapping(id: string): Promise<AssessmentItemControlMapping | null> {
    const { data, error } = await this.db
      .from('assessment_item_control_mappings')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? this.toAssessmentItemControlMapping(data) : null;
  }
```

- [ ] **Step 4: Add MS `@MessagePattern` handlers**

In `apps/microservices/notes/src/app/notes.controller.ts`, add directly after the `notes.risks.acceptance.active` handler:

```ts
  @MessagePattern('notes.risks.acceptance.get')
  getRiskAcceptance(@Payload() payload: { id: string }): Promise<RiskAcceptance | null> {
    return this.strategy.getRiskAcceptance(payload.id);
  }
```

Add directly after the `notes.risks.taxonomy.list` handler (before `notes.risks.taxonomy.create`):

```ts
  @MessagePattern('notes.risks.taxonomy.get')
  getRiskTaxonomyCategory(
    @Payload() payload: { id: string },
  ): Promise<RiskTaxonomyCategory | null> {
    return this.strategy.getRiskTaxonomyCategory(payload.id);
  }
```

Add directly after the `notes.assessment-types.list` handler (before `notes.assessment-types.create`):

```ts
  @MessagePattern('notes.assessment-types.get')
  getAssessmentType(@Payload() payload: { id: string }): Promise<AssessmentType | null> {
    return this.strategy.getAssessmentType(payload.id);
  }
```

Add directly after the `notes.assessments.items.mappings.list` handler (before `notes.assessments.items.mappings.add`):

```ts
  @MessagePattern('notes.assessments.items.mappings.get')
  getAssessmentItemControlMapping(
    @Payload() payload: { id: string },
  ): Promise<AssessmentItemControlMapping | null> {
    return this.strategy.getAssessmentItemControlMapping(payload.id);
  }
```

- [ ] **Step 5: Add matching `notes-client` methods**

In `libs/notes-client/src/lib/notes-client.service.ts`, add directly after `getActiveRiskAcceptance`:

```ts
  getRiskAcceptance(id: string): Promise<RiskAcceptance | null> {
    return signedSend<RiskAcceptance | null>(this.client, 'notes.risks.acceptance.get', { id });
  }
```

Add directly after `listRiskTaxonomy` (find it near the taxonomy methods, before `createRiskTaxonomyCategory`):

```ts
  getRiskTaxonomyCategory(id: string): Promise<RiskTaxonomyCategory | null> {
    return signedSend<RiskTaxonomyCategory | null>(this.client, 'notes.risks.taxonomy.get', {
      id,
    });
  }
```

Add directly after `listAssessmentTypes` (before `createAssessmentType`):

```ts
  getAssessmentType(id: string): Promise<AssessmentType | null> {
    return signedSend<AssessmentType | null>(this.client, 'notes.assessment-types.get', { id });
  }
```

Add directly after `listAssessmentItemControlMappings` (before `addAssessmentItemControlMapping`):

```ts
  getAssessmentItemControlMapping(id: string): Promise<AssessmentItemControlMapping | null> {
    return signedSend<AssessmentItemControlMapping | null>(
      this.client,
      'notes.assessments.items.mappings.get',
      { id },
    );
  }
```

- [ ] **Step 6: Write Fake-strategy contract tests**

In `libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts`, add to the `describe('Risk Register lifecycle', ...)` block, directly after the existing `'rejects reviewing a risk acceptance that has already been decided'` test:

```ts
  it('getRiskAcceptance returns the acceptance by id, or null when not found', async () => {
    const strategy = new FakeNotesStrategy();
    const taxonomy = await strategy.listRiskTaxonomy('org-1');
    const risk = await strategy.createRisk('org-1', 'user-1', {
      title: 'Risk',
      riskStatement: 'Statement',
      taxonomyCategoryId: taxonomy[0]!.id,
      ownerId: 'user-1',
      inherentLikelihood: 3,
      inherentImpact: 3,
    });
    const acceptance = await strategy.createRiskAcceptance('org-1', risk.id, 'user-1', {
      justification: 'Business need outweighs residual exposure',
      compensatingControls: 'Manual monthly review',
      expiresAt: new Date(Date.now() + 86400_000).toISOString(),
      approverId: 'ciso-1',
    });

    await expect(strategy.getRiskAcceptance(acceptance.id)).resolves.toEqual(acceptance);
    await expect(strategy.getRiskAcceptance('missing')).resolves.toBeNull();
  });

  it('getRiskTaxonomyCategory returns the category by id, or null when not found', async () => {
    const strategy = new FakeNotesStrategy();
    const taxonomy = await strategy.listRiskTaxonomy('org-1');

    await expect(strategy.getRiskTaxonomyCategory(taxonomy[0]!.id)).resolves.toEqual(taxonomy[0]);
    await expect(strategy.getRiskTaxonomyCategory('missing')).resolves.toBeNull();
  });
```

Add to the `describe('Assessment lifecycle (Phase B.1)', ...)` block, directly after `'seeds two default assessment types on first access'`:

```ts
  it('getAssessmentType returns the type by id, or null when not found', async () => {
    const strategy = new FakeNotesStrategy();
    const types = await strategy.listAssessmentTypes('org-1');

    await expect(strategy.getAssessmentType(types[0]!.id)).resolves.toEqual(types[0]);
    await expect(strategy.getAssessmentType('missing')).resolves.toBeNull();
  });

  it('getAssessmentItemControlMapping returns the mapping by id, or null when not found', async () => {
    const strategy = new FakeNotesStrategy();
    const types = await strategy.listAssessmentTypes('org-1');
    const assessment = await strategy.createAssessment('org-1', 'user-1', {
      title: 'Assessment',
      assessmentTypeId: types[0]!.id,
      ownerId: 'user-1',
    });
    const item = await strategy.createAssessmentItem(assessment.id, {
      subject: 'Subject',
      description: 'Description',
      inherentLikelihood: 4,
      inherentImpact: 4,
    });
    const mapping = await strategy.addAssessmentItemControlMapping(item.id, {
      controlId: 'ctrl-1',
      controlCode: 'VULN-001',
      controlTitle: 'Patch Management',
    });

    await expect(strategy.getAssessmentItemControlMapping(mapping.id)).resolves.toEqual(mapping);
    await expect(strategy.getAssessmentItemControlMapping('missing')).resolves.toBeNull();
  });
```

- [ ] **Step 7: Run tests, lint, build, commit**

```bash
yarn nx test shared
yarn nx test notes-client
npx prettier --write libs/shared/src/strategies/notes.ts libs/shared/src/strategies/fakes/fake-notes.ts apps/microservices/notes/src/app/supabase-notes.strategy.ts apps/microservices/notes/src/app/notes.controller.ts libs/notes-client/src/lib/notes-client.service.ts libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts
yarn nx lint shared
yarn nx lint notes
yarn nx lint notes-client
yarn nx build shared
yarn nx build notes
yarn nx build notes-client
```

Commit: `feat(notes): add get-by-id methods for RiskAcceptance, RiskTaxonomyCategory, AssessmentType, AssessmentItemControlMapping`

---

### Task 2: Self-approval guard — `approveAssessment` / `requestChanges`

**Files:**
- Modify: `libs/shared/src/strategies/fakes/fake-notes.ts`
- Modify: `apps/microservices/notes/src/app/supabase-notes.strategy.ts`
- Modify: `libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts`

**Interfaces:**
- Consumes: nothing new (uses existing `Assessment.ownerId`/`approverId`, no signature change).

- [ ] **Step 1: Add the guard in `FakeNotesStrategy`**

Replace `approveAssessment` in `libs/shared/src/strategies/fakes/fake-notes.ts`:

```ts
  async approveAssessment(id: string, userId: string): Promise<Assessment> {
    const a = this.assessments.find((x) => x.id === id);
    if (!a) throw new Error(`assessment_not_found: ${id}`);
    if (a.status !== 'pending_review') throw new Error(`invalid_transition_from_${a.status}`);
    if (a.ownerId === userId) throw new Error('assessment_self_approval_forbidden');
    if (a.approverId !== userId) throw new Error('not_authorized_approver');
    a.status = 'approved';
    a.updatedAt = new Date().toISOString();
    return a;
  }
```

Replace `requestChanges`:

```ts
  async requestChanges(id: string, userId: string, note: string): Promise<Assessment> {
    if (!note || note.trim() === '') throw new Error('note_required');
    const a = this.assessments.find((x) => x.id === id);
    if (!a) throw new Error(`assessment_not_found: ${id}`);
    if (a.status !== 'pending_review') throw new Error(`invalid_transition_from_${a.status}`);
    if (a.ownerId === userId) throw new Error('assessment_self_approval_forbidden');
    if (a.approverId !== userId) throw new Error('not_authorized_approver');
    a.status = 'changes_requested';
    a.lastReviewNote = note;
    a.updatedAt = new Date().toISOString();
    return a;
  }
```

- [ ] **Step 2: Restructure `SupabaseNotesStrategy` to load-then-check-then-write**

First add a private helper directly above `approveAssessment` in `apps/microservices/notes/src/app/supabase-notes.strategy.ts`, mirroring `getRiskAcceptanceOrThrow`'s shape (check that method's exact `.from(...)`/error-message shape and copy it, substituting the assessments table and `toAssessment` mapper):

```ts
  private async getAssessmentOrThrow(id: string): Promise<Assessment> {
    const { data, error } = await this.db
      .from('risk_assessments')
      .select('*')
      .eq('id', id)
      .single();
    return this.toAssessment(ok(data, error));
  }
```

Replace `approveAssessment`:

```ts
  async approveAssessment(id: string, userId: string): Promise<Assessment> {
    const current = await this.getAssessmentOrThrow(id);
    if (current.status !== 'pending_review') {
      throw new Error(`invalid_transition_from_${current.status}`);
    }
    if (current.ownerId === userId) {
      throw new Error('assessment_self_approval_forbidden');
    }
    if (current.approverId !== userId) {
      throw new Error('not_authorized_approver');
    }
    const { data, error } = await this.db
      .from('risk_assessments')
      .update({ status: 'approved', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    return this.toAssessment(ok(data, error));
  }
```

Replace `requestChanges` (check its current body for the exact update payload/note-persistence column and preserve it unchanged — only the guard ordering and load-then-check-then-write restructuring changes):

```ts
  async requestChanges(id: string, userId: string, note: string): Promise<Assessment> {
    if (!note || note.trim() === '') throw new Error('note_required');
    const current = await this.getAssessmentOrThrow(id);
    if (current.status !== 'pending_review') {
      throw new Error(`invalid_transition_from_${current.status}`);
    }
    if (current.ownerId === userId) {
      throw new Error('assessment_self_approval_forbidden');
    }
    if (current.approverId !== userId) {
      throw new Error('not_authorized_approver');
    }
    const { data, error } = await this.db
      .from('risk_assessments')
      .update({
        status: 'changes_requested',
        last_review_note: note,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    return this.toAssessment(ok(data, error));
  }
```

(Before applying, read the current `requestChanges` implementation to confirm the exact update payload column name for the review note — reuse it verbatim rather than guessing `last_review_note`.)

- [ ] **Step 3: Write Fake-strategy contract tests**

Add to the `describe('Assessment write-path hardening', ...)` block in `libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts`:

```ts
  it('rejects an assessment owner approving their own assessment even when named as approver', async () => {
    const strategy = new FakeNotesStrategy();
    const types = await strategy.listAssessmentTypes('org-1');
    const assessment = await strategy.createAssessment('org-1', 'owner-1', {
      title: 'Self-approval attempt',
      assessmentTypeId: types[0]!.id,
      ownerId: 'owner-1',
      approverId: 'owner-1',
    });
    await strategy.createAssessmentItem(assessment.id, {
      subject: 'Subject',
      description: 'Description',
      inherentLikelihood: 3,
      inherentImpact: 3,
    });
    await strategy.startAssessment(assessment.id, 'owner-1');
    await strategy.submitForReview(assessment.id, 'owner-1');

    await expect(strategy.approveAssessment(assessment.id, 'owner-1')).rejects.toThrow(
      'assessment_self_approval_forbidden',
    );
  });

  it('rejects an assessment owner requesting changes on their own assessment even when named as approver', async () => {
    const strategy = new FakeNotesStrategy();
    const types = await strategy.listAssessmentTypes('org-1');
    const assessment = await strategy.createAssessment('org-1', 'owner-1', {
      title: 'Self-review attempt',
      assessmentTypeId: types[0]!.id,
      ownerId: 'owner-1',
      approverId: 'owner-1',
    });
    await strategy.createAssessmentItem(assessment.id, {
      subject: 'Subject',
      description: 'Description',
      inherentLikelihood: 3,
      inherentImpact: 3,
    });
    await strategy.startAssessment(assessment.id, 'owner-1');
    await strategy.submitForReview(assessment.id, 'owner-1');

    await expect(
      strategy.requestChanges(assessment.id, 'owner-1', 'Needs more evidence'),
    ).rejects.toThrow('assessment_self_approval_forbidden');
  });

  it('still allows the legitimate, distinct approver to approve', async () => {
    const strategy = new FakeNotesStrategy();
    const types = await strategy.listAssessmentTypes('org-1');
    const assessment = await strategy.createAssessment('org-1', 'owner-1', {
      title: 'Legitimate approval',
      assessmentTypeId: types[0]!.id,
      ownerId: 'owner-1',
      approverId: 'approver-1',
    });
    await strategy.createAssessmentItem(assessment.id, {
      subject: 'Subject',
      description: 'Description',
      inherentLikelihood: 3,
      inherentImpact: 3,
    });
    await strategy.startAssessment(assessment.id, 'owner-1');
    await strategy.submitForReview(assessment.id, 'owner-1');

    const approved = await strategy.approveAssessment(assessment.id, 'approver-1');
    expect(approved.status).toBe('approved');
  });
```

(Confirm `AssessmentInput`/`createAssessment` accepts `approverId` at creation time by checking the type/Fake implementation before relying on it — if it doesn't, set it via `updateAssessment(assessment.id, { approverId: 'owner-1' })` before `startAssessment` instead.)

- [ ] **Step 4: Run tests, lint, build, commit**

```bash
yarn nx test shared
npx prettier --write libs/shared/src/strategies/fakes/fake-notes.ts apps/microservices/notes/src/app/supabase-notes.strategy.ts libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts
yarn nx lint shared
yarn nx lint notes
yarn nx build shared
yarn nx build notes
```

Commit: `fix(assessments): enforce self-approval guard on approveAssessment/requestChanges`

---

### Task 3: Gateway routes — Exceptions (5 of 11 routes)

**Files:**
- Modify: `apps/api/src/app/notes/notes.controller.ts`
- Modify: `apps/api/src/app/notes/__tests__/exceptions.controller.unit.test.ts`

**Interfaces:** Consumes nothing new — `getException`, `getOrganizationById`, `checkOrgAccess` all already exist and are already used elsewhere in this file.

- [ ] **Step 1: `listExceptions` / `createException`**

Replace both handlers:

```ts
  @Get('exceptions')
  @ApiOperation({ summary: 'List exceptions for org' })
  async listExceptions(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
  ) {
    this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    const org = await this.notes.getOrganizationById(orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'read');
    return this.notes.listExceptions(orgId);
  }

  @Post('exceptions')
  @ApiOperation({ summary: 'Create exception' })
  async createException(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
    @Body() body: ExceptionInput,
  ) {
    const userId = this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    const org = await this.notes.getOrganizationById(orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.createException(orgId, userId, body);
  }
```

- [ ] **Step 2: `getException` / `updateException` / `deleteException`**

Replace all three:

```ts
  @Get('exceptions/:id')
  @ApiOperation({ summary: 'Get exception' })
  async getException(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    const exc = await this.notes.getException(id);
    if (!exc) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(exc.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'read');
    return exc;
  }

  @Patch('exceptions/:id')
  @ApiOperation({ summary: 'Update exception' })
  async updateException(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() patch: ExceptionPatch,
  ) {
    this.uid(req);
    const exc = await this.notes.getException(id);
    if (!exc) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(exc.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.updateException(id, patch);
  }
```

```ts
  @Delete('exceptions/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete exception' })
  async deleteException(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    const exc = await this.notes.getException(id);
    if (!exc) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(exc.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'delete');
    return this.notes.deleteException(id);
  }
```

- [ ] **Step 3: `requestExceptionRenewal` — no change (corrected during Task 3's review)**

**Ruling (superseding an earlier draft of this plan and the spec's Global Constraints):** `requestExceptionRenewal` is NOT touched. Its existing owner-only check (`if (exception.ownerId !== userId) throw new ForbiddenException();`) is already complete authorization on its own — `ownerId` is a resource-specific field set at creation, not client-controlled at request time, so no cross-org caller can pass it by any means. Layering `checkOrgAccess('update')` on top (which for a non-admin caller requires being the *org's creator*, not just a member) doesn't close any real gap today, and actively breaks the intended future semantics once real multi-member orgs exist: a legitimate org member who owns their own exception but isn't the org's original creator would be wrongly blocked from requesting a renewal for their own record. Leave this route exactly as it is.

`listExceptionRenewals`, `approveException`, `rejectException`, `reviewExceptionRenewal`, `listPendingExceptionRenewals` are already correct — do not touch, per the original plan.

- [ ] **Step 4: Write/extend gateway controller unit tests**

In `apps/api/src/app/notes/__tests__/exceptions.controller.unit.test.ts`, add a new `describe` block following the exact `reqAs`/`reqAsAdmin`/`makeController`/`makeNotes` pattern already in the file. Extend `makeNotes`'s defaults with `listExceptions: vi.fn().mockResolvedValue([])`, `createException: vi.fn().mockResolvedValue(EXCEPTION)`, `updateException: vi.fn().mockResolvedValue(EXCEPTION)`, `deleteException: vi.fn().mockResolvedValue(undefined)` if not already present, then add:

```ts
describe('exceptions org scoping (Phase 1 hardening)', () => {
  describe('listExceptions / createException', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).listExceptions(reqAs('outsider'), 'org-1'),
      ).rejects.toThrow(ForbiddenException);
      expect(notes.listExceptions).not.toHaveBeenCalled();
    });

    it('allows the org creator to list', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).listExceptions(reqAs('org-creator'), 'org-1'),
      ).resolves.toBeDefined();
    });

    it('allows an admin to create', async () => {
      const notes = makeNotes();
      await makeController(notes).createException(reqAsAdmin('platform-admin'), 'org-1', {
        title: 'New exception',
      } as ExceptionInput);
      expect(notes.createException).toHaveBeenCalledWith(
        'org-1',
        'platform-admin',
        expect.anything(),
      );
    });

    it('throws NotFound when the org does not exist', async () => {
      const notes = makeNotes({ getOrganizationById: vi.fn().mockResolvedValue(null) });
      await expect(
        makeController(notes).listExceptions(reqAs('org-creator'), 'missing'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getException / updateException / deleteException', () => {
    it('rejects a caller outside the org on get', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).getException(reqAs('outsider'), 'exception-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows the org creator on get/update/delete', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).getException(reqAs('org-creator'), 'exception-1'),
      ).resolves.toEqual(EXCEPTION);
      await expect(
        makeController(notes).updateException(reqAs('org-creator'), 'exception-1', {}),
      ).resolves.toBeDefined();
      await expect(
        makeController(notes).deleteException(reqAs('org-creator'), 'exception-1'),
      ).resolves.toBeUndefined();
    });

    it('throws NotFound when the exception does not exist', async () => {
      const notes = makeNotes({ getException: vi.fn().mockResolvedValue(null) });
      await expect(
        makeController(notes).getException(reqAs('org-creator'), 'missing'),
      ).rejects.toThrow(NotFoundException);
    });
  });

});
```

Import `ExceptionInput` at the top of the test file if not already imported.

- [ ] **Step 5: Run tests, lint, build**

```bash
yarn nx test api
npx prettier --write apps/api/src/app/notes/notes.controller.ts apps/api/src/app/notes/__tests__/exceptions.controller.unit.test.ts
yarn nx lint api
yarn nx build api
```

- [ ] **Step 6: Commit**

`fix(exceptions): add org-scoping to list/create/get/update/delete/renewal-request routes`

---

### Task 4: Gateway routes — Issues (7 of 9 routes)

**Files:**
- Modify: `apps/api/src/app/notes/notes.controller.ts`
- Modify: `apps/api/src/app/notes/__tests__/notes.controller.unit.test.ts`

- [ ] **Step 1: `listIssues` / `createIssue`**

```ts
  @Get('issues')
  @ApiOperation({ summary: 'List issues for org' })
  async listIssues(@Req() req: Request & { user?: VerifiedToken }, @Query('orgId') orgId: string) {
    this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    const org = await this.notes.getOrganizationById(orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'read');
    return this.notes.listIssues(orgId);
  }

  @Post('issues')
  @ApiOperation({ summary: 'Create issue' })
  async createIssue(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
    @Body() body: IssueInput,
  ) {
    const userId = this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    const org = await this.notes.getOrganizationById(orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.createIssue(orgId, userId, body);
  }
```

- [ ] **Step 2: `getIssue` / `updateIssue` / `deleteIssue`**

```ts
  @Get('issues/:id')
  @ApiOperation({ summary: 'Get issue' })
  async getIssue(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    const issue = await this.notes.getIssue(id);
    if (!issue) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(issue.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'read');
    return issue;
  }

  @Patch('issues/:id')
  @ApiOperation({ summary: 'Update issue status / severity' })
  async updateIssue(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() patch: IssuePatch,
  ) {
    this.uid(req);
    const issue = await this.notes.getIssue(id);
    if (!issue) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(issue.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.updateIssue(id, patch);
  }

  @Delete('issues/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete issue' })
  async deleteIssue(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    const issue = await this.notes.getIssue(id);
    if (!issue) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(issue.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'delete');
    return this.notes.deleteIssue(id);
  }
```

- [ ] **Step 3: `submitIssueForValidation` — no change**

Same ruling as `requestExceptionRenewal` in Task 3 (see that task's ledger entry): the existing owner-only check (`if (issue.ownerId !== userId) throw new ForbiddenException();`) is already complete, resource-specific authorization — `ownerId` is DB-stored, not attacker-controlled. Do NOT add `checkOrgAccess` here. Leave the route exactly as it is today.

- [ ] **Step 4: `reviewIssueValidation`**

This route has zero resource fetch today — needs the full inline block built from scratch:

```ts
  @Post('issue-validations/:id/review')
  @ApiOperation({ summary: 'Validator approves or rejects a pending issue validation' })
  async reviewIssueValidation(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: { decision: 'approved' | 'rejected'; reviewNotes?: string },
  ) {
    const userId = this.uid(req);
    const validation = await this.notes.getIssueValidation(id);
    if (!validation) throw new NotFoundException();
    const issue = await this.notes.getIssue(validation.issueId);
    if (!issue) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(issue.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.reviewIssueValidation(id, userId, body.decision, body.reviewNotes);
  }
```

(Confirm `IssueValidation`'s field name for the parent issue reference — `issueId` — by checking its interface in `libs/shared/src/strategies/notes.ts` before applying; use whatever the real field name is if different.)

`listIssueValidations` (hand-rolled correct) and `listPendingIssueValidations` (already correct) are not touched.

- [ ] **Step 5: Write/extend gateway controller unit tests**

In `apps/api/src/app/notes/__tests__/notes.controller.unit.test.ts`, following the same `reqAs`/`reqAsAdmin`/`makeController`/`makeNotes` pattern (check this file's existing `makeNotes`/`makeController`/fixtures and reuse them; add `getIssue`, `getIssueValidation`, `getOrganizationById` mocks to `makeNotes`'s defaults if not already present), add:

```ts
describe('issues org scoping (Phase 1 hardening)', () => {
  const ISSUE = { id: 'issue-1', orgId: 'org-1', ownerId: 'owner-1' } as unknown as Issue;
  const VALIDATION = {
    id: 'validation-1',
    issueId: 'issue-1',
    requestedBy: 'owner-1',
    status: 'pending',
  } as unknown as IssueValidation;

  describe('listIssues / createIssue', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes({ getOrganizationById: vi.fn().mockResolvedValue(ORG) });
      await expect(
        makeController(notes).listIssues(reqAs('outsider'), 'org-1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getIssue / updateIssue / deleteIssue', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes({
        getIssue: vi.fn().mockResolvedValue(ISSUE),
        getOrganizationById: vi.fn().mockResolvedValue(ORG),
      });
      await expect(
        makeController(notes).getIssue(reqAs('outsider'), 'issue-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows the org creator', async () => {
      const notes = makeNotes({
        getIssue: vi.fn().mockResolvedValue(ISSUE),
        getOrganizationById: vi.fn().mockResolvedValue(ORG),
      });
      await expect(
        makeController(notes).getIssue(reqAs('org-creator'), 'issue-1'),
      ).resolves.toEqual(ISSUE);
    });

    it('throws NotFound when the issue does not exist', async () => {
      const notes = makeNotes({ getIssue: vi.fn().mockResolvedValue(null) });
      await expect(
        makeController(notes).getIssue(reqAs('org-creator'), 'missing'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('submitIssueForValidation', () => {
    it('rejects a non-owner even if they belong to the org', async () => {
      const notes = makeNotes({
        getIssue: vi.fn().mockResolvedValue(ISSUE),
        getOrganizationById: vi.fn().mockResolvedValue(ORG),
      });
      await expect(
        makeController(notes).submitIssueForValidation(reqAs('org-creator'), 'issue-1', {} as never),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('reviewIssueValidation', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes({
        getIssueValidation: vi.fn().mockResolvedValue(VALIDATION),
        getIssue: vi.fn().mockResolvedValue(ISSUE),
        getOrganizationById: vi.fn().mockResolvedValue(ORG),
      });
      await expect(
        makeController(notes).reviewIssueValidation(reqAs('outsider'), 'validation-1', {
          decision: 'approved',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('resolves org through validation -> issue, not a client-supplied id', async () => {
      const notes = makeNotes({
        getIssueValidation: vi.fn().mockResolvedValue(VALIDATION),
        getIssue: vi.fn().mockResolvedValue(ISSUE),
        getOrganizationById: vi.fn().mockResolvedValue(ORG),
      });
      await makeController(notes).reviewIssueValidation(reqAs('org-creator'), 'validation-1', {
        decision: 'approved',
      });
      expect(notes.getIssueValidation).toHaveBeenCalledWith('validation-1');
      expect(notes.getIssue).toHaveBeenCalledWith('issue-1');
      expect(notes.getOrganizationById).toHaveBeenCalledWith('org-1');
    });

    it('throws NotFound when the validation does not exist', async () => {
      const notes = makeNotes({ getIssueValidation: vi.fn().mockResolvedValue(null) });
      await expect(
        makeController(notes).reviewIssueValidation(reqAs('org-creator'), 'missing', {
          decision: 'approved',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
```

Add `ORG` fixture (`{ id: 'org-1', userId: 'org-creator', name: 'Acme' } as unknown as Organization`) if this test file doesn't already define one — check first. Import `Issue`, `IssueValidation` types if not already imported.

- [ ] **Step 6: Run tests, lint, build**

```bash
yarn nx test api
npx prettier --write apps/api/src/app/notes/notes.controller.ts apps/api/src/app/notes/__tests__/notes.controller.unit.test.ts
yarn nx lint api
yarn nx build api
```

- [ ] **Step 7: Commit**

`fix(issues): add org-scoping to list/create/get/update/delete/submit/review routes`

---

### Task 5: Gateway routes — Risk (22 of 22 routes)

**Files:**
- Modify: `apps/api/src/app/notes/notes.controller.ts`
- Create: `apps/api/src/app/notes/__tests__/risks.controller.unit.test.ts`

**Interfaces:** Consumes `getRiskAcceptance`, `getRiskTaxonomyCategory` from Task 1.

- [ ] **Step 1: `listRisks` / `createRisk` / `getRiskMethodology` / `listRiskTaxonomy`**

```ts
  @Get('risks')
  @ApiOperation({ summary: 'List risks for org (sorted by risk score desc)' })
  async listRisks(@Req() req: Request & { user?: VerifiedToken }, @Query('orgId') orgId: string) {
    this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    const org = await this.notes.getOrganizationById(orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'read');
    return this.notes.listRisks(orgId);
  }

  @Post('risks')
  @ApiOperation({ summary: 'Create risk entry' })
  async createRisk(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
    @Body() body: RiskInput,
  ) {
    const userId = this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    const org = await this.notes.getOrganizationById(orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.createRisk(orgId, userId, body);
  }

  @Get('risks/methodology')
  @ApiOperation({ summary: 'Get the org active risk methodology' })
  async getRiskMethodology(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
  ) {
    this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    const org = await this.notes.getOrganizationById(orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'read');
    return this.notes.getRiskMethodology(orgId);
  }

  @Get('risks/taxonomy')
  @ApiOperation({ summary: 'List the org risk taxonomy categories' })
  async listRiskTaxonomy(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
  ) {
    this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    const org = await this.notes.getOrganizationById(orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'read');
    return this.notes.listRiskTaxonomy(orgId);
  }
```

- [ ] **Step 2: `getRisk` / `updateRisk` / `deleteRisk`**

```ts
  @Get('risks/:id')
  @ApiOperation({ summary: 'Get risk' })
  async getRisk(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    const risk = await this.notes.getRisk(id);
    if (!risk) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(risk.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'read');
    return risk;
  }

  @Patch('risks/:id')
  @ApiOperation({ summary: 'Update risk (writes a history snapshot first)' })
  async updateRisk(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: RiskPatch & { reason?: string },
  ) {
    const userId = this.uid(req);
    const risk = await this.notes.getRisk(id);
    if (!risk) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(risk.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    const { reason, ...patch } = body;
    return this.notes.updateRisk(id, patch, userId, reason);
  }

  @Delete('risks/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete risk' })
  async deleteRisk(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    const risk = await this.notes.getRisk(id);
    if (!risk) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(risk.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'delete');
    return this.notes.deleteRisk(id);
  }
```

- [ ] **Step 3: `upsertRiskMethodology` / `createRiskTaxonomyCategory` / `archiveRiskTaxonomyCategory`**

```ts
  @Post('risks/methodology')
  @ApiOperation({ summary: 'Update the org risk methodology (creates a new version)' })
  async upsertRiskMethodology(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
    @Body() body: RiskMethodologyInput,
  ) {
    this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    const org = await this.notes.getOrganizationById(orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.upsertRiskMethodology(orgId, body);
  }

  @Post('risks/taxonomy')
  @ApiOperation({ summary: 'Add a risk taxonomy category' })
  async createRiskTaxonomyCategory(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
    @Body() body: RiskTaxonomyCategoryInput,
  ) {
    this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    const org = await this.notes.getOrganizationById(orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.createRiskTaxonomyCategory(orgId, body);
  }

  @Patch('risks/taxonomy/:id/archive')
  @ApiOperation({ summary: 'Archive a risk taxonomy category' })
  async archiveRiskTaxonomyCategory(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
  ) {
    this.uid(req);
    const category = await this.notes.getRiskTaxonomyCategory(id);
    if (!category) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(category.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.archiveRiskTaxonomyCategory(id);
  }
```

- [ ] **Step 4: `listRiskControlMappings` / `addRiskControlMapping` / `removeRiskControlMapping`**

```ts
  @Get('risks/:id/mappings')
  @ApiOperation({ summary: 'List controls mapped to a risk' })
  async listRiskControlMappings(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
  ) {
    this.uid(req);
    const risk = await this.notes.getRisk(id);
    if (!risk) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(risk.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'read');
    return this.notes.listRiskControlMappings(id);
  }

  @Post('risks/:id/mappings')
  @ApiOperation({ summary: 'Map a control to a risk' })
  async addRiskControlMapping(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: RiskControlMappingInput,
  ) {
    this.uid(req);
    const risk = await this.notes.getRisk(id);
    if (!risk) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(risk.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.addRiskControlMapping(id, body);
  }

  @Delete('risks/:riskId/mappings/:mappingId')
  @ApiOperation({ summary: 'Remove a risk-control mapping' })
  async removeRiskControlMapping(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('riskId') riskId: string,
    @Param('mappingId') mappingId: string,
  ) {
    this.uid(req);
    const risk = await this.notes.getRisk(riskId);
    if (!risk) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(risk.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'delete');
    return this.notes.removeRiskControlMapping(mappingId);
  }
```

- [ ] **Step 5: `createRiskAcceptance` / `getActiveRiskAcceptance` / `reviewRiskAcceptance` / `approveRiskAcceptance` / `rejectRiskAcceptance`**

```ts
  @Post('risks/:id/acceptance')
  @ApiOperation({ summary: 'Request risk acceptance' })
  async createRiskAcceptance(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: RiskAcceptanceInput,
  ) {
    const userId = this.uid(req);
    const risk = await this.notes.getRisk(id);
    if (!risk) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(risk.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.createRiskAcceptance(risk.orgId, id, userId, body);
  }

  @Get('risks/:id/acceptance/active')
  @ApiOperation({ summary: 'Get the active risk acceptance, if any' })
  async getActiveRiskAcceptance(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
  ) {
    this.uid(req);
    const risk = await this.notes.getRisk(id);
    if (!risk) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(risk.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'read');
    return this.notes.getActiveRiskAcceptance(id);
  }

  @Post('risk-acceptances/:id/review')
  @ApiOperation({ summary: 'Review a risk acceptance request' })
  async reviewRiskAcceptance(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: { reviewNotes?: string },
  ) {
    const userId = this.uid(req);
    const acceptance = await this.notes.getRiskAcceptance(id);
    if (!acceptance) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(acceptance.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.reviewRiskAcceptance(id, userId, body.reviewNotes);
  }

  @Post('risk-acceptances/:id/approve')
  @ApiOperation({ summary: 'Approve a risk acceptance request' })
  async approveRiskAcceptance(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
  ) {
    const userId = this.uid(req);
    const acceptance = await this.notes.getRiskAcceptance(id);
    if (!acceptance) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(acceptance.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.approveRiskAcceptance(id, userId);
  }

  @Post('risk-acceptances/:id/reject')
  @ApiOperation({ summary: 'Reject a risk acceptance request' })
  async rejectRiskAcceptance(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
  ) {
    const userId = this.uid(req);
    const acceptance = await this.notes.getRiskAcceptance(id);
    if (!acceptance) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(acceptance.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.rejectRiskAcceptance(id, userId);
  }
```

(`createRiskAcceptance` drops its `@Query('orgId')` param entirely — org now derives from `risk.orgId`, per the spec's instruction to stop trusting the separate query param here. Remove the unused import/param cleanly; check no other caller relies on the query param being read here — the client already sends the risk id in the path, so this is a body/behavior no-op for legitimate callers.)

- [ ] **Step 6: `listRiskSnapshots` / `listRiskEvidence` / `createRiskEvidence` / `listAssessmentItemsForRisk`**

```ts
  @Get('risks/:id/snapshots')
  @ApiOperation({ summary: 'List risk history snapshots' })
  async listRiskSnapshots(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    const risk = await this.notes.getRisk(id);
    if (!risk) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(risk.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'read');
    return this.notes.listRiskSnapshots(id);
  }

  @Get('risks/:id/evidence')
  @ApiOperation({ summary: 'List evidence attached to a risk' })
  async listRiskEvidence(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    const risk = await this.notes.getRisk(id);
    if (!risk) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(risk.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'read');
    return this.notes.listRiskEvidence(id);
  }

  @Post('risks/:id/evidence')
  @ApiOperation({ summary: 'Attach evidence to a risk' })
  async createRiskEvidence(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body()
    body: Omit<
      RequirementEvidence,
      'id' | 'riskId' | 'createdBy' | 'verificationStatus' | 'verifiedBy' | 'verifiedAt'
    >,
  ) {
    const userId = this.uid(req);
    const risk = await this.notes.getRisk(id);
    if (!risk) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(risk.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.createRiskEvidence(risk.orgId, id, {
      ...body,
      createdBy: userId,
      verificationStatus: 'pending_review',
      verifiedBy: null,
      verifiedAt: null,
    });
  }

  @Get('risks/:id/assessment-items')
  @ApiOperation({ summary: 'List assessment items linked to a risk' })
  async listAssessmentItemsForRisk(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
  ) {
    this.uid(req);
    const risk = await this.notes.getRisk(id);
    if (!risk) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(risk.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'read');
    return this.notes.listAssessmentItemsForRisk(id);
  }
```

(`createRiskEvidence` drops its `@Query('orgId')` param — org now derives from `risk.orgId`, matching the acceptance fix above.)

- [ ] **Step 7: Write gateway controller unit tests**

Create `apps/api/src/app/notes/__tests__/risks.controller.unit.test.ts` following the exact structure of `exceptions.controller.unit.test.ts` (same imports, `reqAs`/`reqAsAdmin`/`makeController`/`makeNotes` helpers, `ORG` fixture). Cover, for a representative sample across the 22 routes (not exhaustively every route — one happy-path + one rejected-outsider + one 404 per distinct fix pattern is enough):

```ts
import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import type { AiClientService } from '@icore/ai-client';
import type { NotesClientService } from '@icore/notes-client';
import type { Organization, Risk, RiskAcceptance, VerifiedToken } from '@icore/shared';
import { NotesController } from '../notes.controller';
import { AbilityFactory } from '../../abilities/ability.factory';
import type { StandardsQueueService } from '../standards-queue.service';

const ORG: Organization = {
  id: 'org-1',
  userId: 'org-creator',
  name: 'Acme',
} as unknown as Organization;

const RISK: Risk = { id: 'risk-1', orgId: 'org-1' } as unknown as Risk;

const ACCEPTANCE: RiskAcceptance = {
  id: 'acceptance-1',
  riskId: 'risk-1',
  orgId: 'org-1',
  requestedBy: 'owner-1',
  approverId: 'ciso-1',
  status: 'requested',
} as unknown as RiskAcceptance;

function makeNotes(overrides: Partial<NotesClientService> = {}): NotesClientService {
  return {
    getOrganizationById: vi.fn().mockResolvedValue(ORG),
    getRisk: vi.fn().mockResolvedValue(RISK),
    listRisks: vi.fn().mockResolvedValue([RISK]),
    createRisk: vi.fn().mockResolvedValue(RISK),
    updateRisk: vi.fn().mockResolvedValue(RISK),
    deleteRisk: vi.fn().mockResolvedValue(undefined),
    getRiskAcceptance: vi.fn().mockResolvedValue(ACCEPTANCE),
    reviewRiskAcceptance: vi.fn().mockResolvedValue({ ...ACCEPTANCE, status: 'reviewed' }),
    approveRiskAcceptance: vi.fn().mockResolvedValue({ ...ACCEPTANCE, status: 'approved' }),
    rejectRiskAcceptance: vi.fn().mockResolvedValue({ ...ACCEPTANCE, status: 'rejected' }),
    ...overrides,
  } as unknown as NotesClientService;
}

function makeController(notes: NotesClientService): NotesController {
  return new NotesController(
    notes,
    {} as unknown as AiClientService,
    new AbilityFactory(),
    {} as unknown as StandardsQueueService,
  );
}

function reqAs(uid: string): Request & { user?: VerifiedToken } {
  return { user: { uid } as VerifiedToken } as Request & { user?: VerifiedToken };
}

function reqAsAdmin(uid: string): Request & { user?: VerifiedToken } {
  return { user: { uid, role: 'admin' } as VerifiedToken } as Request & { user?: VerifiedToken };
}

describe('NotesController — risk org scoping (Phase 1 hardening)', () => {
  describe('getRisk / updateRisk / deleteRisk', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(makeController(notes).getRisk(reqAs('outsider'), 'risk-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('allows the org creator', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).getRisk(reqAs('org-creator'), 'risk-1'),
      ).resolves.toEqual(RISK);
    });

    it('allows an admin', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).getRisk(reqAsAdmin('platform-admin'), 'risk-1'),
      ).resolves.toEqual(RISK);
    });

    it('throws NotFound when the risk does not exist', async () => {
      const notes = makeNotes({ getRisk: vi.fn().mockResolvedValue(null) });
      await expect(
        makeController(notes).getRisk(reqAs('org-creator'), 'missing'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeRiskControlMapping', () => {
    it('resolves org through the riskId path param, not the mappingId', async () => {
      const notes = makeNotes();
      await makeController(notes).removeRiskControlMapping(
        reqAs('org-creator'),
        'risk-1',
        'mapping-1',
      );
      expect(notes.getRisk).toHaveBeenCalledWith('risk-1');
      expect(notes.removeRiskControlMapping).toHaveBeenCalledWith('mapping-1');
    });

    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).removeRiskControlMapping(reqAs('outsider'), 'risk-1', 'mapping-1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('risk-acceptances review/approve/reject', () => {
    it('resolves org through the acceptance, rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).approveRiskAcceptance(reqAs('outsider'), 'acceptance-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows the org creator to approve', async () => {
      const notes = makeNotes();
      await makeController(notes).approveRiskAcceptance(reqAs('org-creator'), 'acceptance-1');
      expect(notes.getRiskAcceptance).toHaveBeenCalledWith('acceptance-1');
      expect(notes.approveRiskAcceptance).toHaveBeenCalledWith('acceptance-1', 'org-creator');
    });

    it('throws NotFound when the acceptance does not exist', async () => {
      const notes = makeNotes({ getRiskAcceptance: vi.fn().mockResolvedValue(null) });
      await expect(
        makeController(notes).reviewRiskAcceptance(reqAs('org-creator'), 'missing', {}),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('createRiskAcceptance / createRiskEvidence org derivation', () => {
    it('derives org from the risk, not a client-supplied query param', async () => {
      const notes = makeNotes();
      await makeController(notes).createRiskAcceptance(reqAs('org-creator'), 'risk-1', {
        justification: 'Business need',
        compensatingControls: 'Monthly review',
        expiresAt: '2026-12-01T00:00:00Z',
        approverId: 'ciso-1',
      });
      expect(notes.getRisk).toHaveBeenCalledWith('risk-1');
    });
  });
});
```

(Import `RiskAcceptanceInput` if needed for the last test's body typing, or cast loosely with `as never`/`as RiskAcceptanceInput` matching the file's existing conventions.)

- [ ] **Step 8: Run tests, lint, build**

```bash
yarn nx test api
npx prettier --write apps/api/src/app/notes/notes.controller.ts apps/api/src/app/notes/__tests__/risks.controller.unit.test.ts
yarn nx lint api
yarn nx build api
```

- [ ] **Step 9: Commit**

`fix(risks): add org-scoping across all risk, risk-acceptance, and risk-control-mapping routes`

---

### Task 6: Gateway routes — RiskAssessment + AssessmentItem (22 of 26 routes)

**Files:**
- Modify: `apps/api/src/app/notes/notes.controller.ts`
- Create: `apps/api/src/app/notes/__tests__/assessments.controller.unit.test.ts`

**Interfaces:** Consumes `getAssessmentType`, `getAssessmentItemControlMapping` from Task 1; consumes the restructured `approveAssessment`/`requestChanges` guard from Task 2 (no gateway-visible change from that — just don't regress it).

- [ ] **Step 1: `listAssessments` / `createAssessment` / `listAssessmentTypes` / `createAssessmentType`**

```ts
  @Get('assessments')
  @ApiOperation({ summary: 'List risk assessments for org' })
  async listAssessments(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
  ) {
    this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    const org = await this.notes.getOrganizationById(orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'read');
    return this.notes.listAssessments(orgId);
  }

  @Post('assessments')
  @ApiOperation({ summary: 'Create risk assessment' })
  async createAssessment(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
    @Body() body: AssessmentInput,
  ) {
    const userId = this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    const org = await this.notes.getOrganizationById(orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.createAssessment(orgId, userId, body);
  }

  @Get('assessment-types')
  @ApiOperation({ summary: 'List assessment types for org' })
  async listAssessmentTypes(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
  ) {
    this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    const org = await this.notes.getOrganizationById(orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'read');
    return this.notes.listAssessmentTypes(orgId);
  }

  @Post('assessment-types')
  @ApiOperation({ summary: 'Create an assessment type' })
  async createAssessmentType(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
    @Body() body: AssessmentTypeInput,
  ) {
    this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    const org = await this.notes.getOrganizationById(orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.createAssessmentType(orgId, body);
  }
```

- [ ] **Step 2: `getAssessment` / `updateAssessment` / `deleteAssessment` / `archiveAssessmentType`**

```ts
  @Get('assessments/:id')
  @ApiOperation({ summary: 'Get risk assessment' })
  async getAssessment(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    const a = await this.notes.getAssessment(id);
    if (!a) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(a.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'read');
    return a;
  }

  @Patch('assessments/:id')
  @ApiOperation({ summary: 'Update risk assessment' })
  async updateAssessment(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() patch: AssessmentPatch,
  ) {
    this.uid(req);
    const a = await this.notes.getAssessment(id);
    if (!a) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(a.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.updateAssessment(id, patch);
  }

  @Delete('assessments/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete risk assessment' })
  async deleteAssessment(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    const userId = this.uid(req);
    const a = await this.notes.getAssessment(id);
    if (!a) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(a.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'delete');
    return this.notes.deleteAssessment(id, userId);
  }

  @Patch('assessment-types/:id/archive')
  @ApiOperation({ summary: 'Archive an assessment type' })
  async archiveAssessmentType(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
  ) {
    this.uid(req);
    const type = await this.notes.getAssessmentType(id);
    if (!type) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(type.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.archiveAssessmentType(id);
  }
```

- [ ] **Step 3: `listAssessmentItems` / `createAssessmentItem`**

```ts
  @Get('assessments/:id/items')
  @ApiOperation({ summary: 'List items for a risk assessment' })
  async listAssessmentItems(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
  ) {
    this.uid(req);
    const a = await this.notes.getAssessment(id);
    if (!a) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(a.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'read');
    return this.notes.listAssessmentItems(id);
  }

  @Post('assessments/:id/items')
  @ApiOperation({ summary: 'Add item to risk assessment' })
  async createAssessmentItem(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') assessmentId: string,
    @Body() body: AssessmentItemInput,
  ) {
    this.uid(req);
    const a = await this.notes.getAssessment(assessmentId);
    if (!a) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(a.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.createAssessmentItem(assessmentId, body);
  }
```

- [ ] **Step 4: Assessment lifecycle routes — `start` / `submit-for-review` / `approve` / `request-changes` / `complete` / `archive`**

```ts
  @Post('assessments/:id/start')
  @ApiOperation({ summary: 'Start an assessment (draft -> in_progress)' })
  async startAssessment(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    const userId = this.uid(req);
    const a = await this.notes.getAssessment(id);
    if (!a) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(a.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.startAssessment(id, userId);
  }

  @Post('assessments/:id/submit-for-review')
  @ApiOperation({ summary: 'Submit an assessment for review' })
  async submitForReview(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    const userId = this.uid(req);
    const a = await this.notes.getAssessment(id);
    if (!a) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(a.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.submitForReview(id, userId);
  }

  @Post('assessments/:id/approve')
  @ApiOperation({ summary: 'Approve an assessment' })
  async approveAssessment(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
  ) {
    const userId = this.uid(req);
    const a = await this.notes.getAssessment(id);
    if (!a) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(a.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.approveAssessment(id, userId);
  }

  @Post('assessments/:id/request-changes')
  @ApiOperation({ summary: 'Request changes on an assessment' })
  async requestChanges(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: { note: string },
  ) {
    const userId = this.uid(req);
    const a = await this.notes.getAssessment(id);
    if (!a) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(a.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.requestChanges(id, userId, body.note);
  }

  @Post('assessments/:id/complete')
  @ApiOperation({ summary: 'Complete an approved assessment' })
  async completeAssessment(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
  ) {
    const userId = this.uid(req);
    const a = await this.notes.getAssessment(id);
    if (!a) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(a.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.completeAssessment(id, userId);
  }

  @Post('assessments/:id/archive')
  @ApiOperation({ summary: 'Archive an assessment' })
  async archiveAssessment(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
  ) {
    const userId = this.uid(req);
    const a = await this.notes.getAssessment(id);
    if (!a) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(a.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.archiveAssessment(id, userId);
  }
```

- [ ] **Step 5: `listAssessmentItemControlMappings` / `addAssessmentItemControlMapping` / `removeAssessmentItemControlMapping`**

```ts
  @Get('assessments/items/:itemId/mappings')
  @ApiOperation({ summary: 'List controls mapped to an assessment item' })
  async listAssessmentItemControlMappings(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('itemId') itemId: string,
  ) {
    this.uid(req);
    const item = await this.notes.getAssessmentItem(itemId);
    if (!item) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(item.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'read');
    return this.notes.listAssessmentItemControlMappings(itemId);
  }

  @Post('assessments/items/:itemId/mappings')
  @ApiOperation({ summary: 'Map a control to an assessment item' })
  async addAssessmentItemControlMapping(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('itemId') itemId: string,
    @Body() body: AssessmentItemControlMappingInput,
  ) {
    this.uid(req);
    const item = await this.notes.getAssessmentItem(itemId);
    if (!item) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(item.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.addAssessmentItemControlMapping(itemId, body);
  }

  @Delete('assessments/items/mappings/:mappingId')
  @ApiOperation({ summary: 'Remove an assessment item-control mapping' })
  async removeAssessmentItemControlMapping(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('mappingId') mappingId: string,
  ) {
    this.uid(req);
    const mapping = await this.notes.getAssessmentItemControlMapping(mappingId);
    if (!mapping) throw new NotFoundException();
    const item = await this.notes.getAssessmentItem(mapping.itemId);
    if (!item) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(item.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'delete');
    return this.notes.removeAssessmentItemControlMapping(mappingId);
  }
```

- [ ] **Step 6: `listAssessmentItemEvidence` / `updateAssessmentItem` / `deleteAssessmentItem`**

```ts
  @Get('assessments/items/:itemId/evidence')
  @ApiOperation({ summary: 'List evidence attached to an assessment item' })
  async listAssessmentItemEvidence(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('itemId') itemId: string,
  ) {
    this.uid(req);
    const item = await this.notes.getAssessmentItem(itemId);
    if (!item) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(item.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'read');
    return this.notes.listAssessmentItemEvidence(itemId);
  }

  @Patch('assessments/items/:itemId')
  @ApiOperation({ summary: 'Update risk assessment item' })
  async updateAssessmentItem(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('itemId') itemId: string,
    @Body() patch: AssessmentItemPatch,
  ) {
    this.uid(req);
    const item = await this.notes.getAssessmentItem(itemId);
    if (!item) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(item.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.updateAssessmentItem(itemId, patch);
  }

  @Delete('assessments/items/:itemId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete risk assessment item' })
  async deleteAssessmentItem(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('itemId') itemId: string,
  ) {
    this.uid(req);
    const item = await this.notes.getAssessmentItem(itemId);
    if (!item) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(item.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'delete');
    return this.notes.deleteAssessmentItem(itemId);
  }
```

Not touched (already correct, verified in this session's audit): `createAssessmentItemEvidence`, `createRiskFromAssessmentItem`, `linkAssessmentItemToRisk`, `unlinkAssessmentItemFromRisk`.

- [ ] **Step 7: Write gateway controller unit tests**

Create `apps/api/src/app/notes/__tests__/assessments.controller.unit.test.ts` following the same structure as `risks.controller.unit.test.ts` in Task 5. Cover one happy-path + one rejected-outsider + one 404 per distinct fix pattern:

```ts
import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import type { AiClientService } from '@icore/ai-client';
import type { NotesClientService } from '@icore/notes-client';
import type {
  Assessment,
  AssessmentItem,
  AssessmentItemControlMapping,
  AssessmentType,
  Organization,
  VerifiedToken,
} from '@icore/shared';
import { NotesController } from '../notes.controller';
import { AbilityFactory } from '../../abilities/ability.factory';
import type { StandardsQueueService } from '../standards-queue.service';

const ORG: Organization = {
  id: 'org-1',
  userId: 'org-creator',
  name: 'Acme',
} as unknown as Organization;

const ASSESSMENT: Assessment = {
  id: 'assessment-1',
  orgId: 'org-1',
  ownerId: 'owner-1',
  approverId: 'approver-1',
  status: 'pending_review',
} as unknown as Assessment;

const ITEM: AssessmentItem = {
  id: 'item-1',
  assessmentId: 'assessment-1',
  orgId: 'org-1',
} as unknown as AssessmentItem;

const MAPPING: AssessmentItemControlMapping = {
  id: 'mapping-1',
  itemId: 'item-1',
} as unknown as AssessmentItemControlMapping;

const TYPE: AssessmentType = { id: 'type-1', orgId: 'org-1' } as unknown as AssessmentType;

function makeNotes(overrides: Partial<NotesClientService> = {}): NotesClientService {
  return {
    getOrganizationById: vi.fn().mockResolvedValue(ORG),
    getAssessment: vi.fn().mockResolvedValue(ASSESSMENT),
    getAssessmentItem: vi.fn().mockResolvedValue(ITEM),
    getAssessmentItemControlMapping: vi.fn().mockResolvedValue(MAPPING),
    getAssessmentType: vi.fn().mockResolvedValue(TYPE),
    approveAssessment: vi.fn().mockResolvedValue({ ...ASSESSMENT, status: 'approved' }),
    removeAssessmentItemControlMapping: vi.fn().mockResolvedValue(undefined),
    archiveAssessmentType: vi.fn().mockResolvedValue({ ...TYPE, archived: true }),
    ...overrides,
  } as unknown as NotesClientService;
}

function makeController(notes: NotesClientService): NotesController {
  return new NotesController(
    notes,
    {} as unknown as AiClientService,
    new AbilityFactory(),
    {} as unknown as StandardsQueueService,
  );
}

function reqAs(uid: string): Request & { user?: VerifiedToken } {
  return { user: { uid } as VerifiedToken } as Request & { user?: VerifiedToken };
}

function reqAsAdmin(uid: string): Request & { user?: VerifiedToken } {
  return { user: { uid, role: 'admin' } as VerifiedToken } as Request & { user?: VerifiedToken };
}

describe('NotesController — assessment org scoping (Phase 1 hardening)', () => {
  describe('getAssessment / approveAssessment', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).getAssessment(reqAs('outsider'), 'assessment-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows the org creator to approve', async () => {
      const notes = makeNotes();
      await makeController(notes).approveAssessment(reqAs('org-creator'), 'assessment-1');
      expect(notes.approveAssessment).toHaveBeenCalledWith('assessment-1', 'org-creator');
    });

    it('allows an admin', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).getAssessment(reqAsAdmin('platform-admin'), 'assessment-1'),
      ).resolves.toEqual(ASSESSMENT);
    });

    it('throws NotFound when the assessment does not exist', async () => {
      const notes = makeNotes({ getAssessment: vi.fn().mockResolvedValue(null) });
      await expect(
        makeController(notes).getAssessment(reqAs('org-creator'), 'missing'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('archiveAssessmentType', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).archiveAssessmentType(reqAs('outsider'), 'type-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFound when the type does not exist', async () => {
      const notes = makeNotes({ getAssessmentType: vi.fn().mockResolvedValue(null) });
      await expect(
        makeController(notes).archiveAssessmentType(reqAs('org-creator'), 'missing'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeAssessmentItemControlMapping', () => {
    it('resolves org through mapping -> item, rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).removeAssessmentItemControlMapping(reqAs('outsider'), 'mapping-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows the org creator', async () => {
      const notes = makeNotes();
      await makeController(notes).removeAssessmentItemControlMapping(
        reqAs('org-creator'),
        'mapping-1',
      );
      expect(notes.getAssessmentItemControlMapping).toHaveBeenCalledWith('mapping-1');
      expect(notes.getAssessmentItem).toHaveBeenCalledWith('item-1');
      expect(notes.removeAssessmentItemControlMapping).toHaveBeenCalledWith('mapping-1');
    });

    it('throws NotFound when the mapping does not exist', async () => {
      const notes = makeNotes({ getAssessmentItemControlMapping: vi.fn().mockResolvedValue(null) });
      await expect(
        makeController(notes).removeAssessmentItemControlMapping(reqAs('org-creator'), 'missing'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateAssessmentItem / deleteAssessmentItem', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).updateAssessmentItem(reqAs('outsider'), 'item-1', {}),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows the org creator', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).deleteAssessmentItem(reqAs('org-creator'), 'item-1'),
      ).resolves.toBeUndefined();
    });
  });
});
```

- [ ] **Step 8: Run tests, lint, build**

```bash
yarn nx test api
npx prettier --write apps/api/src/app/notes/notes.controller.ts apps/api/src/app/notes/__tests__/assessments.controller.unit.test.ts
yarn nx lint api
yarn nx build api
```

- [ ] **Step 9: Full workspace test run**

```bash
yarn nx run-many -t test --projects=shared,notes,notes-client,api
```

- [ ] **Step 10: Commit**

`fix(assessments): add org-scoping across all assessment, assessment-type, and item-mapping routes`

---

## Notes for the implementer

- Every `this.uid(req)` call stays where it already is (authentication is not the gap — org membership is). Don't remove or move existing `uid`/`userId` capture; just add the org-resolution block around it.
- Watch for routes where `this.uid(req)` result (`userId`) is needed later in the method body (e.g. `updateRisk`, `createRiskAcceptance`) — keep capturing it even though the new code also calls `this.uid(req)` implicitly via existing lines; don't call it twice.
- `checkOrgAccess` throws `ForbiddenException` internally — don't wrap it or catch it.
- After Tasks 5-6, do a final `grep -c "checkOrgAccess" apps/api/src/app/notes/notes.controller.ts` sanity check — should read 30 (pre-existing) + 57 (this phase) = 87.

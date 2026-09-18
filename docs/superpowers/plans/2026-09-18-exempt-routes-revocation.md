# EXEMPT_ROUTES Revocation Gap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Block the 8 write routes in `notes.controller.ts` that key off a pinned identity field (`ownerId`/`validatorId`/`approverId`) from succeeding when that pinned person has been deactivated/removed from the org, so a revoked member can no longer act on records assigned to them before someone reassigns them.

**Architecture:** One new private helper, `assertActiveAssignee(org, assigneeId)`, added to `notes.controller.ts` next to the existing `checkOrgManage`. It reuses `this.auth.listOrgMembers` (already active-only by default) and throws the same `BadRequestException('assignee_not_active_member')` that PR #76's reassignment routes already throw. Each of the 8 target routes is changed to load its resource and org (most don't today), call the helper against the pinned field, then fall through into its existing (unmodified) identity/strategy check. Purely additive — no other route, no strategy layer, no client code is touched.

**Tech Stack:** NestJS gateway controller, Vitest, Nx monorepo (single project: `api`).

**Spec:** `docs/superpowers/specs/2026-09-18-exempt-routes-revocation-design.md`

## Global Constraints

- All 8 routes get the same call order: load resource (`NotFoundException` if missing) → load org via `getOrganizationById(resource.orgId)` (`NotFoundException` if missing) → `await this.assertActiveAssignee(org, <pinnedId>)` → existing identity check / strategy call, unchanged.
- Reuse the exact existing `BadRequestException('assignee_not_active_member')` string — no new error code.
- In scope, exactly these 8 routes: `requestExceptionRenewal`, `submitIssueForValidation`, `reviewIssueValidation`, `reviewRiskAcceptance`, `approveRiskAcceptance`, `rejectRiskAcceptance`, `approveAssessment`, `requestChanges`. Do not touch the 2 GET routes, `RiskAcceptance.requestedBy`, or the 5 PR #76 reassignment routes (their inline active-member checks are equivalent but out of scope — do not refactor them to use the new helper).
- `notes.controller.ts` injects `AuthClientService` as `this.auth` (not `this.authClient` — that name is only used in `auth.controller.ts`).
- New/changed gateway tests go into the existing per-domain test file for that route (`notes.controller.unit.test.ts` for issue/issue-validation routes, `exceptions.controller.unit.test.ts`, `risks.controller.unit.test.ts`, `assessments.controller.unit.test.ts`), matching each file's existing `makeNotes`/`makeController`/fixture style exactly.
- `route-coverage.unit.test.ts`'s `EXEMPT_ROUTES` allowlist governs a different, unrelated check (`checkOrgAccess` presence) — do not touch it.
- Post-coding routine before every commit: `npx prettier --write <files>` → `yarn nx lint api` → `yarn nx build api`.

---

### Task 1: `assertActiveAssignee` helper + exception renewal gate

**Files:**
- Modify: `apps/api/src/app/notes/notes.controller.ts` (add helper near `checkOrgManage`; modify `requestExceptionRenewal`)
- Test: `apps/api/src/app/notes/__tests__/exceptions.controller.unit.test.ts`

**Interfaces:**
- Produces: `NotesController.assertActiveAssignee(org: Organization, assigneeId: string): Promise<void>` (private) — reused by Tasks 2-5.

- [ ] **Step 1: Write the failing test**

In `apps/api/src/app/notes/__tests__/exceptions.controller.unit.test.ts`, inside the existing `describe('requestExceptionRenewal', ...)` block, add this test directly after the `'lets the exception owner request a renewal even when they are not the org creator'` test:

```ts
    it('rejects when the exception owner is not an active org member', async () => {
      const notes = makeNotes();
      const auth = { listOrgMembers: vi.fn().mockResolvedValue([]) };
      await expect(
        makeController(notes, auth).requestExceptionRenewal(reqAs('owner-1'), 'exception-1', {
          ...RENEWAL_INPUT,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(notes.requestExceptionRenewal).not.toHaveBeenCalled();
    });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn nx test api -t "requestExceptionRenewal"`
Expected: FAIL — the new test throws `ForbiddenException` (current code), not `BadRequestException`.

- [ ] **Step 3: Add the `assertActiveAssignee` helper**

In `apps/api/src/app/notes/notes.controller.ts`, find `private async checkOrgManage(` and add this method directly after its closing `}` (i.e. immediately before the class's final closing `}`):

```ts
  private async assertActiveAssignee(org: Organization, assigneeId: string): Promise<void> {
    const members = await this.auth.listOrgMembers(org.id, org.userId);
    if (!members.some((m) => m.userId === assigneeId)) {
      throw new BadRequestException('assignee_not_active_member');
    }
  }
```

- [ ] **Step 4: Wire the helper into `requestExceptionRenewal`**

Find `async requestExceptionRenewal(` and replace its body:

```ts
  async requestExceptionRenewal(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: ExceptionRenewalRequestInput,
  ) {
    const userId = this.uid(req);
    const exception = await this.notes.getException(id);
    if (!exception) throw new NotFoundException();
    if (exception.ownerId !== userId) throw new ForbiddenException();
    return this.notes.requestExceptionRenewal(id, userId, body);
  }
```

becomes:

```ts
  async requestExceptionRenewal(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: ExceptionRenewalRequestInput,
  ) {
    const userId = this.uid(req);
    const exception = await this.notes.getException(id);
    if (!exception) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(exception.orgId);
    if (!org) throw new NotFoundException();
    await this.assertActiveAssignee(org, exception.ownerId);
    if (exception.ownerId !== userId) throw new ForbiddenException();
    return this.notes.requestExceptionRenewal(id, userId, body);
  }
```

- [ ] **Step 5: Fix the now-broken existing tests by updating the default auth mock**

The two existing tests `'rejects a caller who is not the exception owner'` and `'lets the exception owner request a renewal even when they are not the org creator'` call `makeController(notes)` with no `auth` override, which defaults to an empty member list — `assertActiveAssignee` would now reject `exception.ownerId` (`'owner-1'`) as inactive before either test reaches its original assertion. Fix by giving `owner-1` active membership by default.

In the same file, find:

```ts
function makeController(
  notes: NotesClientService,
  auth: { listOrgMembers: ReturnType<typeof vi.fn> } = {
    listOrgMembers: vi.fn().mockResolvedValue([]),
  },
): NotesController {
```

Replace with:

```ts
function makeController(
  notes: NotesClientService,
  auth: { listOrgMembers: ReturnType<typeof vi.fn> } = {
    listOrgMembers: vi.fn().mockResolvedValue([{ userId: 'owner-1', role: 'viewer' }]),
  },
): NotesController {
```

- [ ] **Step 6: Run the full file's tests to verify everything passes**

Run: `yarn nx test api -t "exception"`
Expected: PASS — all tests in `exceptions.controller.unit.test.ts`, including the new one.

- [ ] **Step 7: Format, lint, build**

```bash
npx prettier --write apps/api/src/app/notes/notes.controller.ts apps/api/src/app/notes/__tests__/exceptions.controller.unit.test.ts
yarn nx lint api
yarn nx build api
```

Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/app/notes/notes.controller.ts apps/api/src/app/notes/__tests__/exceptions.controller.unit.test.ts
git commit -m "feat(notes): gate exception renewal on owner's active org membership"
```

---

### Task 2: Issue submission gate

**Files:**
- Modify: `apps/api/src/app/notes/notes.controller.ts` (modify `submitIssueForValidation`)
- Test: `apps/api/src/app/notes/__tests__/notes.controller.unit.test.ts`

**Interfaces:**
- Consumes: `NotesController.assertActiveAssignee` (Task 1).

- [ ] **Step 1: Write the failing test**

In `apps/api/src/app/notes/__tests__/notes.controller.unit.test.ts`, inside `describe('submitIssueForValidation', ...)` (the one under `describe('NotesController — issue validation authorization', ...)`), add directly after the `'lets the issue owner submit even when they are not the org creator'` test:

```ts
    it('rejects when the issue owner is not an active org member', async () => {
      const notes = makeNotes();
      const auth = { listOrgMembers: vi.fn().mockResolvedValue([]) };
      await expect(
        makeController(notes, auth).submitIssueForValidation(reqAs('owner-1'), 'issue-1', {
          ...SUBMIT_INPUT,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(notes.submitIssueForValidation).not.toHaveBeenCalled();
    });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn nx test api -t "submitIssueForValidation"`
Expected: FAIL — the new test throws `ForbiddenException` (current code), not `BadRequestException`.

- [ ] **Step 3: Wire the helper into `submitIssueForValidation`**

Find `async submitIssueForValidation(` and replace its body:

```ts
  async submitIssueForValidation(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: IssueValidationSubmitInput,
  ) {
    const userId = this.uid(req);
    const issue = await this.notes.getIssue(id);
    if (!issue) throw new NotFoundException();
    if (issue.ownerId !== userId) throw new ForbiddenException();
    return this.notes.submitIssueForValidation(id, userId, body);
  }
```

becomes:

```ts
  async submitIssueForValidation(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: IssueValidationSubmitInput,
  ) {
    const userId = this.uid(req);
    const issue = await this.notes.getIssue(id);
    if (!issue) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(issue.orgId);
    if (!org) throw new NotFoundException();
    await this.assertActiveAssignee(org, issue.ownerId);
    if (issue.ownerId !== userId) throw new ForbiddenException();
    return this.notes.submitIssueForValidation(id, userId, body);
  }
```

- [ ] **Step 4: Fix the now-broken existing tests by updating the default auth mock**

Three existing tests call `submitIssueForValidation` via `makeController(notes)` with no `auth` override (empty member list by default): `'rejects a caller who is not the issue owner'`, `'lets the issue owner submit even when they are not the org creator'`, and (in the later `describe('issues org scoping (Phase 1 hardening)')` block) `'rejects a non-owner even if they belong to the org'`. All three need `issue.ownerId` (`'owner-1'`) to be an active member for the test to reach its original assertion instead of hitting the new `BadRequestException` first.

Find:

```ts
function makeController(
  notes: NotesClientService,
  auth: { listOrgMembers: ReturnType<typeof vi.fn> } = {
    listOrgMembers: vi.fn().mockResolvedValue([]),
  },
): NotesController {
```

Replace with:

```ts
function makeController(
  notes: NotesClientService,
  auth: { listOrgMembers: ReturnType<typeof vi.fn> } = {
    listOrgMembers: vi.fn().mockResolvedValue([{ userId: 'owner-1', role: 'viewer' }]),
  },
): NotesController {
```

- [ ] **Step 5: Run the full test file to verify everything passes**

Run: `yarn nx test api -t "NotesController|issues org scoping"`
Expected: PASS — all tests in `notes.controller.unit.test.ts`.

- [ ] **Step 6: Format, lint, build**

```bash
npx prettier --write apps/api/src/app/notes/notes.controller.ts apps/api/src/app/notes/__tests__/notes.controller.unit.test.ts
yarn nx lint api
yarn nx build api
```

Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/app/notes/notes.controller.ts apps/api/src/app/notes/__tests__/notes.controller.unit.test.ts
git commit -m "feat(notes): gate issue submit-for-validation on owner's active org membership"
```

---

### Task 3: Issue validation review gate

**Files:**
- Modify: `apps/api/src/app/notes/notes.controller.ts` (modify `reviewIssueValidation`)
- Test: `apps/api/src/app/notes/__tests__/notes.controller.unit.test.ts`

**Interfaces:**
- Consumes: `NotesController.assertActiveAssignee` (Task 1).

- [ ] **Step 1: Write the failing tests**

In `apps/api/src/app/notes/__tests__/notes.controller.unit.test.ts`, inside `describe('reviewIssueValidation', ...)`, add directly after the `'propagates the strategy-level validator check for a non-assigned caller'` test:

```ts
    it('rejects when the validator is not an active org member', async () => {
      const notes = makeNotes();
      const auth = { listOrgMembers: vi.fn().mockResolvedValue([]) };
      await expect(
        makeController(notes, auth).reviewIssueValidation(reqAs('validator-1'), 'val-1', {
          decision: 'approved',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(notes.reviewIssueValidation).not.toHaveBeenCalled();
    });

    it('throws NotFound when the validation does not exist', async () => {
      const notes = makeNotes({ getIssueValidation: vi.fn().mockResolvedValue(null) });
      await expect(
        makeController(notes).reviewIssueValidation(reqAs('validator-1'), 'missing', {
          decision: 'approved',
        }),
      ).rejects.toThrow(NotFoundException);
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `yarn nx test api -t "reviewIssueValidation"`
Expected: FAIL — `reviewIssueValidation` currently does no org lookup, so the `BadRequestException` test gets a resolved value instead of a rejection, and the `NotFoundException` test also gets a resolved value.

- [ ] **Step 3: Wire the helper into `reviewIssueValidation`**

Find `async reviewIssueValidation(` and replace its body:

```ts
  async reviewIssueValidation(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: { decision: 'approved' | 'rejected'; reviewNotes?: string },
  ) {
    const userId = this.uid(req);
    return this.notes.reviewIssueValidation(id, userId, body.decision, body.reviewNotes);
  }
```

becomes:

```ts
  async reviewIssueValidation(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: { decision: 'approved' | 'rejected'; reviewNotes?: string },
  ) {
    const userId = this.uid(req);
    const validation = await this.notes.getIssueValidation(id);
    if (!validation) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(validation.orgId);
    if (!org) throw new NotFoundException();
    await this.assertActiveAssignee(org, validation.validatorId);
    return this.notes.reviewIssueValidation(id, userId, body.decision, body.reviewNotes);
  }
```

- [ ] **Step 4: Fix the now-broken existing tests by extending the default auth mock**

`'lets the assigned validator review without org-creator rights'` and `'propagates the strategy-level validator check for a non-assigned caller'` both call `makeController(notes)` with no `auth` override. They need `validator-1` (the `PENDING_VALIDATION.validatorId`) to be an active member, in addition to `owner-1` added in Task 2.

Find:

```ts
function makeController(
  notes: NotesClientService,
  auth: { listOrgMembers: ReturnType<typeof vi.fn> } = {
    listOrgMembers: vi.fn().mockResolvedValue([{ userId: 'owner-1', role: 'viewer' }]),
  },
): NotesController {
```

Replace with:

```ts
function makeController(
  notes: NotesClientService,
  auth: { listOrgMembers: ReturnType<typeof vi.fn> } = {
    listOrgMembers: vi.fn().mockResolvedValue([
      { userId: 'owner-1', role: 'viewer' },
      { userId: 'validator-1', role: 'viewer' },
    ]),
  },
): NotesController {
```

- [ ] **Step 5: Run the full test file to verify everything passes**

Run: `yarn nx test api -t "NotesController|issues org scoping"`
Expected: PASS — all tests in `notes.controller.unit.test.ts`.

- [ ] **Step 6: Format, lint, build**

```bash
npx prettier --write apps/api/src/app/notes/notes.controller.ts apps/api/src/app/notes/__tests__/notes.controller.unit.test.ts
yarn nx lint api
yarn nx build api
```

Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/app/notes/notes.controller.ts apps/api/src/app/notes/__tests__/notes.controller.unit.test.ts
git commit -m "feat(notes): gate issue validation review on validator's active org membership"
```

---

### Task 4: Risk acceptance decision gates (review/approve/reject)

**Files:**
- Modify: `apps/api/src/app/notes/notes.controller.ts` (modify `reviewRiskAcceptance`, `approveRiskAcceptance`, `rejectRiskAcceptance`)
- Test: `apps/api/src/app/notes/__tests__/risks.controller.unit.test.ts`

**Interfaces:**
- Consumes: `NotesController.assertActiveAssignee` (Task 1).

- [ ] **Step 1: Add the missing strategy mocks and write the failing tests**

In `apps/api/src/app/notes/__tests__/risks.controller.unit.test.ts`, find the `makeNotes` factory's returned object and add these three lines directly after `reassignRiskAcceptanceApprover: vi.fn().mockResolvedValue({...}),`:

```ts
    reviewRiskAcceptance: vi.fn().mockResolvedValue(ACCEPTANCE),
    approveRiskAcceptance: vi.fn().mockResolvedValue({ ...ACCEPTANCE, status: 'approved' }),
    rejectRiskAcceptance: vi.fn().mockResolvedValue({ ...ACCEPTANCE, status: 'rejected' }),
```

Then add this new `describe` block at the end of the file, directly after the closing `});` of `describe('NotesController — reassignRiskAcceptanceApprover', ...)`:

```ts
describe('NotesController — risk acceptance decision revocation gate', () => {
  describe('reviewRiskAcceptance', () => {
    it('rejects when the approver is not an active org member', async () => {
      const notes = makeNotes();
      const auth = { listOrgMembers: vi.fn().mockResolvedValue([]) };
      await expect(
        makeController(notes, auth).reviewRiskAcceptance(reqAs('ciso-1'), 'acceptance-1', {}),
      ).rejects.toThrow(BadRequestException);
      expect(notes.reviewRiskAcceptance).not.toHaveBeenCalled();
    });

    it('proceeds when the approver is an active org member', async () => {
      const notes = makeNotes();
      const auth = {
        listOrgMembers: vi.fn().mockResolvedValue([{ userId: 'ciso-1', role: 'viewer' }]),
      };
      await makeController(notes, auth).reviewRiskAcceptance(reqAs('ciso-1'), 'acceptance-1', {
        reviewNotes: 'Looks fine',
      });
      expect(notes.reviewRiskAcceptance).toHaveBeenCalledWith(
        'acceptance-1',
        'ciso-1',
        'Looks fine',
      );
    });

    it('throws NotFound when the acceptance does not exist', async () => {
      const notes = makeNotes({ getRiskAcceptance: vi.fn().mockResolvedValue(null) });
      await expect(
        makeController(notes).reviewRiskAcceptance(reqAs('ciso-1'), 'missing', {}),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('approveRiskAcceptance', () => {
    it('rejects when the approver is not an active org member', async () => {
      const notes = makeNotes();
      const auth = { listOrgMembers: vi.fn().mockResolvedValue([]) };
      await expect(
        makeController(notes, auth).approveRiskAcceptance(reqAs('ciso-1'), 'acceptance-1'),
      ).rejects.toThrow(BadRequestException);
      expect(notes.approveRiskAcceptance).not.toHaveBeenCalled();
    });

    it('proceeds when the approver is an active org member', async () => {
      const notes = makeNotes();
      const auth = {
        listOrgMembers: vi.fn().mockResolvedValue([{ userId: 'ciso-1', role: 'viewer' }]),
      };
      await makeController(notes, auth).approveRiskAcceptance(reqAs('ciso-1'), 'acceptance-1');
      expect(notes.approveRiskAcceptance).toHaveBeenCalledWith('acceptance-1', 'ciso-1');
    });
  });

  describe('rejectRiskAcceptance', () => {
    it('rejects when the approver is not an active org member', async () => {
      const notes = makeNotes();
      const auth = { listOrgMembers: vi.fn().mockResolvedValue([]) };
      await expect(
        makeController(notes, auth).rejectRiskAcceptance(reqAs('ciso-1'), 'acceptance-1'),
      ).rejects.toThrow(BadRequestException);
      expect(notes.rejectRiskAcceptance).not.toHaveBeenCalled();
    });

    it('proceeds when the approver is an active org member', async () => {
      const notes = makeNotes();
      const auth = {
        listOrgMembers: vi.fn().mockResolvedValue([{ userId: 'ciso-1', role: 'viewer' }]),
      };
      await makeController(notes, auth).rejectRiskAcceptance(reqAs('ciso-1'), 'acceptance-1');
      expect(notes.rejectRiskAcceptance).toHaveBeenCalledWith('acceptance-1', 'ciso-1');
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `yarn nx test api -t "risk acceptance decision revocation gate"`
Expected: FAIL — none of the three routes currently look up the acceptance/org or call `assertActiveAssignee`, so the `BadRequestException`/`NotFoundException` expectations aren't met (calls resolve instead of rejecting).

- [ ] **Step 3: Wire the helper into all three routes**

Find:

```ts
  @Post('risk-acceptances/:id/review')
  @ApiOperation({ summary: 'Review a risk acceptance request' })
  reviewRiskAcceptance(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: { reviewNotes?: string },
  ) {
    const userId = this.uid(req);
    return this.notes.reviewRiskAcceptance(id, userId, body.reviewNotes);
  }

  @Post('risk-acceptances/:id/approve')
  @ApiOperation({ summary: 'Approve a risk acceptance request' })
  approveRiskAcceptance(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    const userId = this.uid(req);
    return this.notes.approveRiskAcceptance(id, userId);
  }

  @Post('risk-acceptances/:id/reject')
  @ApiOperation({ summary: 'Reject a risk acceptance request' })
  rejectRiskAcceptance(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    const userId = this.uid(req);
    return this.notes.rejectRiskAcceptance(id, userId);
  }
```

Replace with:

```ts
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
    await this.assertActiveAssignee(org, acceptance.approverId);
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
    await this.assertActiveAssignee(org, acceptance.approverId);
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
    await this.assertActiveAssignee(org, acceptance.approverId);
    return this.notes.rejectRiskAcceptance(id, userId);
  }
```

- [ ] **Step 4: Run the full test file to verify everything passes**

Run: `yarn nx test api -t "NotesController — risk"`
Expected: PASS — all tests in `risks.controller.unit.test.ts`.

- [ ] **Step 5: Format, lint, build**

```bash
npx prettier --write apps/api/src/app/notes/notes.controller.ts apps/api/src/app/notes/__tests__/risks.controller.unit.test.ts
yarn nx lint api
yarn nx build api
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/app/notes/notes.controller.ts apps/api/src/app/notes/__tests__/risks.controller.unit.test.ts
git commit -m "feat(notes): gate risk acceptance decisions on approver's active org membership"
```

---

### Task 5: Assessment decision gates (approve/request-changes)

**Files:**
- Modify: `apps/api/src/app/notes/notes.controller.ts` (modify `approveAssessment`, `requestChanges`)
- Test: `apps/api/src/app/notes/__tests__/assessments.controller.unit.test.ts`

**Interfaces:**
- Consumes: `NotesController.assertActiveAssignee` (Task 1).

- [ ] **Step 1: Add the missing strategy mock and write the failing tests**

In `apps/api/src/app/notes/__tests__/assessments.controller.unit.test.ts`, find the `makeNotes` factory's returned object and add this line directly after `approveAssessment: vi.fn().mockResolvedValue({...}),`:

```ts
    requestChanges: vi.fn().mockResolvedValue({ ...ASSESSMENT, status: 'changes_requested' }),
```

Then add this new `describe` block at the end of the file, directly after the closing `});` of `describe('NotesController — reassignAssessmentApprover', ...)`:

```ts
describe('NotesController — assessment decision revocation gate', () => {
  describe('approveAssessment', () => {
    it('rejects when the approver is not an active org member', async () => {
      const notes = makeNotes();
      const auth = { listOrgMembers: vi.fn().mockResolvedValue([]) };
      await expect(
        makeController(notes, auth).approveAssessment(reqAs('approver-1'), 'assessment-1'),
      ).rejects.toThrow(BadRequestException);
      expect(notes.approveAssessment).not.toHaveBeenCalled();
    });

    it('proceeds when the approver is an active org member', async () => {
      const notes = makeNotes();
      const auth = {
        listOrgMembers: vi.fn().mockResolvedValue([{ userId: 'approver-1', role: 'viewer' }]),
      };
      await makeController(notes, auth).approveAssessment(reqAs('approver-1'), 'assessment-1');
      expect(notes.approveAssessment).toHaveBeenCalledWith('assessment-1', 'approver-1');
    });

    it('throws NotFound when the assessment does not exist', async () => {
      const notes = makeNotes({ getAssessment: vi.fn().mockResolvedValue(null) });
      await expect(
        makeController(notes).approveAssessment(reqAs('approver-1'), 'missing'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('requestChanges', () => {
    it('rejects when the approver is not an active org member', async () => {
      const notes = makeNotes();
      const auth = { listOrgMembers: vi.fn().mockResolvedValue([]) };
      await expect(
        makeController(notes, auth).requestChanges(reqAs('approver-1'), 'assessment-1', {
          note: 'Needs more evidence',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(notes.requestChanges).not.toHaveBeenCalled();
    });

    it('proceeds when the approver is an active org member', async () => {
      const notes = makeNotes();
      const auth = {
        listOrgMembers: vi.fn().mockResolvedValue([{ userId: 'approver-1', role: 'viewer' }]),
      };
      await makeController(notes, auth).requestChanges(reqAs('approver-1'), 'assessment-1', {
        note: 'Needs more evidence',
      });
      expect(notes.requestChanges).toHaveBeenCalledWith(
        'assessment-1',
        'approver-1',
        'Needs more evidence',
      );
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `yarn nx test api -t "assessment decision revocation gate"`
Expected: FAIL — neither route currently looks up the assessment/org or calls `assertActiveAssignee`.

- [ ] **Step 3: Wire the helper into both routes**

Find:

```ts
  @Post('assessments/:id/approve')
  @ApiOperation({ summary: 'Approve an assessment' })
  approveAssessment(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    const userId = this.uid(req);
    return this.notes.approveAssessment(id, userId);
  }
```

Replace with:

```ts
  @Post('assessments/:id/approve')
  @ApiOperation({ summary: 'Approve an assessment' })
  async approveAssessment(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    const userId = this.uid(req);
    const assessment = await this.notes.getAssessment(id);
    if (!assessment) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(assessment.orgId);
    if (!org) throw new NotFoundException();
    await this.assertActiveAssignee(org, assessment.approverId);
    return this.notes.approveAssessment(id, userId);
  }
```

Then find:

```ts
  @Post('assessments/:id/request-changes')
  @ApiOperation({ summary: 'Request changes on an assessment' })
  requestChanges(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: { note: string },
  ) {
    const userId = this.uid(req);
    return this.notes.requestChanges(id, userId, body.note);
  }
```

Replace with:

```ts
  @Post('assessments/:id/request-changes')
  @ApiOperation({ summary: 'Request changes on an assessment' })
  async requestChanges(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: { note: string },
  ) {
    const userId = this.uid(req);
    const assessment = await this.notes.getAssessment(id);
    if (!assessment) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(assessment.orgId);
    if (!org) throw new NotFoundException();
    await this.assertActiveAssignee(org, assessment.approverId);
    return this.notes.requestChanges(id, userId, body.note);
  }
```

- [ ] **Step 4: Run the full test file to verify everything passes**

Run: `yarn nx test api -t "NotesController — assessment"`
Expected: PASS — all tests in `assessments.controller.unit.test.ts`.

- [ ] **Step 5: Format, lint, build**

```bash
npx prettier --write apps/api/src/app/notes/notes.controller.ts apps/api/src/app/notes/__tests__/assessments.controller.unit.test.ts
yarn nx lint api
yarn nx build api
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/app/notes/notes.controller.ts apps/api/src/app/notes/__tests__/assessments.controller.unit.test.ts
git commit -m "feat(notes): gate assessment decisions on approver's active org membership"
```

---

### Task 6: Full regression pass

**Files:** none (verification only)

- [ ] **Step 1: Run the entire `api` test suite**

Run: `yarn nx test api`
Expected: PASS — every test in the project, including `route-coverage.unit.test.ts` (unaffected, confirms the `EXEMPT_ROUTES` allowlist wasn't touched) and all 5 files edited across Tasks 1-5.

- [ ] **Step 2: Full lint + build**

```bash
yarn nx lint api
yarn nx build api
```

Expected: all green.

No commit for this task — it's a verification pass over work already committed in Tasks 1-5.

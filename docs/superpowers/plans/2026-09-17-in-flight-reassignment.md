# In-Flight Assignee Reassignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an org owner/admin reassign a stuck pinned-actor field (`Issue.ownerId`, the pending `IssueValidation.validatorId`, `Assessment.approverId`, `RiskAcceptance.approverId`, `Exception.ownerId`) to a different active org member, so a record isn't permanently stuck when its assignee leaves or is deactivated.

**Architecture:** Five explicit, typed reassignment operations (not a generic dispatcher), each threaded through the existing per-domain layers: strategy interface → `FakeNotesStrategy` + `SupabaseNotesStrategy` → microservice `@MessagePattern` handler → `NotesClientService` → gateway route in `apps/api/src/app/notes/notes.controller.ts`. All 5 gateway routes are gated by a new `checkOrgManage` helper (this controller doesn't have one today — only `checkOrgAccess`/`checkOrgOwner`) and validate the new assignee is an active org member via `this.auth.listOrgMembers(orgId, org.userId)`. Client: one mutation hook per operation, one shared `ReassignDialog` component, wired into 4 existing detail views (2 of which — Issue owner, RiskAcceptance approver — currently display no name for that field at all and need one added).

**Tech Stack:** NestJS (gateway + microservices), TCP transport, Vitest, React 19 + TanStack Query + shadcn/ui, Nx monorepo.

**Spec:** `docs/superpowers/specs/2026-09-17-in-flight-reassignment-design.md`

## Global Constraints

- All 5 reassignment routes are POST + verb-phrase path (this codebase's convention for state-changing actions — `submit-for-validation`, `review`, `approve` — never PATCH for actions).
- All 5 are gated by `checkOrgManage` (org owner/admin only) — the same tier as `deactivateOrgMember`.
- All 5 validate the new assignee is an **active** member (`isActive !== false`) of the resource's org before calling the strategy.
- None of the 5 status-gate the resource itself (reassignment is general-purpose, always available), **except** `reassignIssueValidator`, which requires the target `IssueValidation.status === 'pending'` (a decided validation has nothing to reassign).
- Same-person invariants reuse the exact existing error strings from this codebase, not new ones: `issue_validation_self_validation_forbidden` (Issue/IssueValidation), `assessment_self_approval_forbidden` (Assessment), `risk_acceptance_self_approval_forbidden` (RiskAcceptance). `Exception.ownerId` reassignment has no same-person invariant (see spec).
- `notes.controller.ts` injects `AuthClientService` as `this.auth` (not `this.authClient` — that name is only used in `auth.controller.ts`). Do not mix these up.
- New gateway route tests go into the existing per-domain test file for that route (`notes.controller.unit.test.ts` for Issue routes, `assessments.controller.unit.test.ts`, `risks.controller.unit.test.ts`, `exceptions.controller.unit.test.ts`), matching each file's existing `makeNotes`/`makeController`/fixture style exactly.
- Post-coding routine before every commit: `npx prettier --write <files>` → `yarn nx lint <project>` → `yarn nx build <project>`.
- Any UI change requires a live Playwright verification pass before being reported done (`AGENTS.md`'s non-negotiable rule).

---

### Task 1: `checkOrgManage` helper + Issue owner reassignment (backend)

**Files:**
- Modify: `apps/api/src/app/notes/notes.controller.ts` (add `checkOrgManage` private helper near `checkOrgOwner`; add `reassignIssueOwner` route near `submitIssueForValidation`)
- Modify: `libs/shared/src/strategies/notes.ts` (add `reassignIssueOwner` to the `NotesStrategy` interface, near `submitIssueForValidation`)
- Modify: `libs/shared/src/strategies/fakes/fake-notes.ts` (implement `reassignIssueOwner`, near `submitIssueForValidation`)
- Modify: `apps/microservices/notes/src/app/supabase-notes.strategy.ts` (implement `reassignIssueOwner`, near `updateIssue`)
- Modify: `apps/microservices/notes/src/app/notes.controller.ts` (add `@MessagePattern('notes.issues.reassign-owner')` handler, near `submitIssueForValidation`)
- Modify: `libs/notes-client/src/lib/notes-client.service.ts` (add `reassignIssueOwner` client method, near `submitIssueForValidation`)
- Test: `apps/api/src/app/notes/__tests__/notes.controller.unit.test.ts` (extend `makeController` to accept an optional auth mock; add tests)
- Test: `libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts` (add tests near the existing issue-validation `describe`/`it` blocks)

**Interfaces:**
- Produces: `NotesStrategy.reassignIssueOwner(id: string, newOwnerId: string): Promise<Issue>` — implemented in both strategies. Throws `issue_not_found: <id>` if missing; throws `issue_validation_self_validation_forbidden` if there is a `pending` `IssueValidation` for this issue and `newOwnerId === thatValidation.validatorId`.
- Produces: `NotesController.checkOrgManage(req, org): Promise<void>` (private) — reusable by Tasks 2-5.
- Consumes (from existing code, verified this session): `this.auth.listOrgMembers(orgId, ownerId?)` returns `OrgMember[]` with `{userId, role, isActive?}`, active-only by default.

- [ ] **Step 1: Add the `checkOrgManage` helper to `notes.controller.ts`**

Add this private method directly after `checkOrgOwner` (find it via `private async checkOrgOwner(`):

```ts
  private async checkOrgManage(
    req: Request & { user?: VerifiedToken },
    org: Organization,
  ): Promise<void> {
    if (req.user?.role === 'admin') return;
    if (org.userId === req.user?.uid) return;
    const members = await this.auth.listOrgMembers(org.id, org.userId);
    const membership = members.find((m) => m.userId === req.user?.uid);
    if (!membership || membership.role !== 'admin') throw new ForbiddenException();
  }
```

This is a verbatim copy of `auth.controller.ts`'s existing `checkOrgManage`, except `this.authClient` → `this.auth` (the property name this controller actually uses).

- [ ] **Step 2: Write the failing strategy test (Fake)**

In `libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts`, find the existing `it('closes an issue through the validation workflow and sets resolvedAt', ...)` test (search for that exact string) and add these two tests directly after it, inside the same `describe` block:

```ts
  it('reassigns an issue owner', async () => {
    const issue = await s.createIssue('org1', 'u1', {
      title: 'T',
      description: 'D',
      severity: 'low',
      reporterId: 'reporter-1',
      ownerId: 'owner-1',
    });
    const reassigned = await s.reassignIssueOwner(issue.id, 'owner-2');
    expect(reassigned.ownerId).toBe('owner-2');
  });

  it('forbids reassigning the issue owner to the pending validation\'s validator', async () => {
    const issue = await s.createIssue('org1', 'u1', {
      title: 'T',
      description: 'D',
      severity: 'low',
      reporterId: 'reporter-1',
      ownerId: 'owner-1',
    });
    await s.submitIssueForValidation(issue.id, 'owner-1', {
      rootCause: 'Change control was skipped',
      rootCauseCategory: 'process_gap',
      validatorId: 'validator-1',
    });
    await expect(s.reassignIssueOwner(issue.id, 'validator-1')).rejects.toThrow(
      'issue_validation_self_validation_forbidden',
    );
  });
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `yarn nx test shared -t "reassigns an issue owner"`
Expected: FAIL with `strategy.reassignIssueOwner is not a function` (or a TypeScript error if run via `tsc` — Vitest will report the call as undefined).

- [ ] **Step 4: Add `reassignIssueOwner` to the `NotesStrategy` interface**

In `libs/shared/src/strategies/notes.ts`, find `submitIssueForValidation(` in the interface and add directly after its signature line:

```ts
  reassignIssueOwner(id: string, newOwnerId: string): Promise<Issue>;
```

- [ ] **Step 5: Implement `reassignIssueOwner` in `FakeNotesStrategy`**

In `libs/shared/src/strategies/fakes/fake-notes.ts`, find `async submitIssueForValidation(` and add this method directly after it (after its closing `}`):

```ts
  async reassignIssueOwner(id: string, newOwnerId: string): Promise<Issue> {
    const issue = this.issues.get(id);
    if (!issue) throw new Error(`issue_not_found: ${id}`);
    const activePending = this.issueValidations.find(
      (v) => v.issueId === id && v.status === 'pending',
    );
    if (activePending && activePending.validatorId === newOwnerId) {
      throw new Error('issue_validation_self_validation_forbidden');
    }
    const updated: Issue = { ...issue, ownerId: newOwnerId, updatedAt: new Date().toISOString() };
    this.issues.set(id, updated);
    return updated;
  }
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `yarn nx test shared -t "reassigns an issue owner|reassigning the issue owner"`
Expected: PASS (both tests).

- [ ] **Step 7: Implement `reassignIssueOwner` in `SupabaseNotesStrategy`**

In `apps/microservices/notes/src/app/supabase-notes.strategy.ts`, find `async updateIssue(` and add this method directly after its closing `}`:

```ts
  async reassignIssueOwner(id: string, newOwnerId: string): Promise<Issue> {
    const issue = await this.getIssue(id);
    if (!issue) throw new Error(`issue_not_found: ${id}`);
    const activePending = await this.getActiveIssueValidation(id);
    if (activePending && activePending.validatorId === newOwnerId) {
      throw new Error('issue_validation_self_validation_forbidden');
    }
    const { data, error } = await this.db
      .from('issues')
      .update({ owner_id: newOwnerId, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    return this.toIssue(ok(data, error));
  }
```

This is not covered by a unit test (this repo has no dedicated Supabase-strategy unit test file — Supabase strategies are implemented and live-verified, matching the convention used for every backend feature shipped this session).

- [ ] **Step 8: Add the microservice message handler**

In `apps/microservices/notes/src/app/notes.controller.ts`, find `@MessagePattern('notes.issues.submit-for-validation')` and add directly after that handler's closing `}`:

```ts
  @MessagePattern('notes.issues.reassign-owner')
  reassignIssueOwner(@Payload() payload: { id: string; newOwnerId: string }): Promise<Issue> {
    return this.strategy.reassignIssueOwner(payload.id, payload.newOwnerId);
  }
```

- [ ] **Step 9: Add the `NotesClientService` method**

In `libs/notes-client/src/lib/notes-client.service.ts`, find `submitIssueForValidation(` and add directly after its closing `}`:

```ts
  reassignIssueOwner(id: string, newOwnerId: string): Promise<Issue> {
    return signedSend<Issue>(this.client, 'notes.issues.reassign-owner', { id, newOwnerId });
  }
```

- [ ] **Step 10: Write the failing gateway controller test**

In `apps/api/src/app/notes/__tests__/notes.controller.unit.test.ts`, first widen `makeController` to accept an optional `auth` override (find the existing `function makeController(notes: NotesClientService): NotesController {` and replace the whole function with):

```ts
function makeController(
  notes: NotesClientService,
  auth: { listOrgMembers: ReturnType<typeof vi.fn> } = {
    listOrgMembers: vi.fn().mockResolvedValue([]),
  },
): NotesController {
  return new NotesController(
    notes,
    {} as unknown as AiClientService,
    new AbilityFactory(),
    {} as unknown as StandardsQueueService,
    auth as unknown as AuthClientService,
  );
}
```

This is backward-compatible — every existing call site that passes only `notes` keeps working. Then add `reassignIssueOwner: vi.fn().mockResolvedValue(ISSUE),` to the `makeNotes` factory's returned object (find `submitIssueForValidation: vi.fn().mockResolvedValue(ISSUE),` inside `makeNotes` and add the new line directly after it). Then add this new `describe` block at the end of the file, before the final closing of the top-level `describe`:

```ts
describe('NotesController — reassignIssueOwner', () => {
  it('rejects a non-manager caller', async () => {
    const notes = makeNotes();
    const auth = { listOrgMembers: vi.fn().mockResolvedValue([{ userId: 'viewer-1', role: 'viewer' }]) };
    await expect(
      makeController(notes, auth).reassignIssueOwner(reqAs('viewer-1'), 'issue-1', {
        newOwnerId: 'owner-2',
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(notes.reassignIssueOwner).not.toHaveBeenCalled();
  });

  it('rejects a new owner who is not an active org member', async () => {
    const notes = makeNotes();
    const auth = { listOrgMembers: vi.fn().mockResolvedValue([]) };
    await expect(
      makeController(notes, auth).reassignIssueOwner(reqAs('org-creator'), 'issue-1', {
        newOwnerId: 'not-a-member',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(notes.reassignIssueOwner).not.toHaveBeenCalled();
  });

  it('allows the org owner to reassign, validating the new owner is an active member', async () => {
    const notes = makeNotes();
    const auth = {
      listOrgMembers: vi.fn().mockResolvedValue([{ userId: 'owner-2', role: 'viewer' }]),
    };
    await makeController(notes, auth).reassignIssueOwner(reqAs('org-creator'), 'issue-1', {
      newOwnerId: 'owner-2',
    });
    expect(notes.reassignIssueOwner).toHaveBeenCalledWith('issue-1', 'owner-2');
  });

  it('allows an org-admin member to reassign', async () => {
    const notes = makeNotes();
    const auth = {
      listOrgMembers: vi.fn().mockResolvedValue([
        { userId: 'admin-1', role: 'admin' },
        { userId: 'owner-2', role: 'viewer' },
      ]),
    };
    await makeController(notes, auth).reassignIssueOwner(reqAs('admin-1'), 'issue-1', {
      newOwnerId: 'owner-2',
    });
    expect(notes.reassignIssueOwner).toHaveBeenCalledWith('issue-1', 'owner-2');
  });

  it('throws NotFound when the issue does not exist', async () => {
    const notes = makeNotes({ getIssue: vi.fn().mockResolvedValue(null) });
    await expect(
      makeController(notes).reassignIssueOwner(reqAsAdmin('platform-admin'), 'missing', {
        newOwnerId: 'owner-2',
      }),
    ).rejects.toThrow(NotFoundException);
  });
});
```

Note: `ISSUE`, `reqAs`, `reqAsAdmin`, `BadRequestException`, `NotFoundException`, `ForbiddenException` already exist in this file's top-level fixtures/imports — do not redeclare them. If `BadRequestException` is not already imported at the top of the file, add it to the existing `import { ForbiddenException, NotFoundException } from '@nestjs/common';` line.

- [ ] **Step 11: Run the test to verify it fails**

Run: `yarn nx test api -t "reassignIssueOwner"`
Expected: FAIL — `notesController.reassignIssueOwner is not a function`.

- [ ] **Step 12: Add the gateway route**

In `apps/api/src/app/notes/notes.controller.ts`, find `@Post('issues/:id/submit-for-validation')` and add this new route directly after that method's closing `}`:

```ts
  @Post('issues/:id/reassign-owner')
  @ApiOperation({ summary: 'Reassign the owner of an issue' })
  async reassignIssueOwner(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: { newOwnerId: string },
  ) {
    this.uid(req);
    const issue = await this.notes.getIssue(id);
    if (!issue) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(issue.orgId);
    if (!org) throw new NotFoundException();
    await this.checkOrgManage(req, org);
    const members = await this.auth.listOrgMembers(org.id, org.userId);
    if (!members.some((m) => m.userId === body.newOwnerId)) {
      throw new BadRequestException('assignee_not_active_member');
    }
    return this.notes.reassignIssueOwner(id, body.newOwnerId);
  }
```

- [ ] **Step 13: Run the test to verify it passes**

Run: `yarn nx test api -t "reassignIssueOwner"`
Expected: PASS (all 5 tests).

- [ ] **Step 14: Format, lint, build**

```bash
npx prettier --write apps/api/src/app/notes/notes.controller.ts apps/api/src/app/notes/__tests__/notes.controller.unit.test.ts libs/shared/src/strategies/notes.ts libs/shared/src/strategies/fakes/fake-notes.ts libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts apps/microservices/notes/src/app/supabase-notes.strategy.ts apps/microservices/notes/src/app/notes.controller.ts libs/notes-client/src/lib/notes-client.service.ts
yarn nx lint api && yarn nx lint shared && yarn nx lint notes && yarn nx lint notes-client
yarn nx build api && yarn nx build shared && yarn nx build notes && yarn nx build notes-client
```

Expected: all green.

- [ ] **Step 15: Commit**

```bash
git add apps/api/src/app/notes/notes.controller.ts apps/api/src/app/notes/__tests__/notes.controller.unit.test.ts libs/shared/src/strategies/notes.ts libs/shared/src/strategies/fakes/fake-notes.ts libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts apps/microservices/notes/src/app/supabase-notes.strategy.ts apps/microservices/notes/src/app/notes.controller.ts libs/notes-client/src/lib/notes-client.service.ts
git commit -m "feat(notes): add checkOrgManage helper and issue owner reassignment"
```

---

### Task 2: Issue validator reassignment (backend)

**Files:**
- Modify: `apps/api/src/app/notes/notes.controller.ts` (add `reassignIssueValidator` route near `reviewIssueValidation`)
- Modify: `libs/shared/src/strategies/notes.ts` (add interface method)
- Modify: `libs/shared/src/strategies/fakes/fake-notes.ts` (implement)
- Modify: `apps/microservices/notes/src/app/supabase-notes.strategy.ts` (implement)
- Modify: `apps/microservices/notes/src/app/notes.controller.ts` (message handler)
- Modify: `libs/notes-client/src/lib/notes-client.service.ts` (client method)
- Test: `apps/api/src/app/notes/__tests__/notes.controller.unit.test.ts`
- Test: `libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts`

**Interfaces:**
- Consumes: `NotesController.checkOrgManage` (Task 1).
- Produces: `NotesStrategy.reassignIssueValidator(validationId: string, newValidatorId: string): Promise<IssueValidation>`. Throws `issue_validation_not_found: <id>` if missing; throws `issue_validation_already_decided: <id>` if `status !== 'pending'`; throws `issue_validation_self_validation_forbidden` if `newValidatorId === issue.ownerId` (the parent issue's owner).

- [ ] **Step 1: Write the failing strategy tests (Fake)**

In `libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts`, add directly after the two tests from Task 1 Step 2:

```ts
  it('reassigns a pending validation to a new validator', async () => {
    const issue = await s.createIssue('org1', 'u1', {
      title: 'T',
      description: 'D',
      severity: 'low',
      reporterId: 'reporter-1',
      ownerId: 'owner-1',
    });
    await s.submitIssueForValidation(issue.id, 'owner-1', {
      rootCause: 'Change control was skipped',
      rootCauseCategory: 'process_gap',
      validatorId: 'validator-1',
    });
    const validation = await s.getActiveIssueValidation(issue.id);
    const reassigned = await s.reassignIssueValidator(validation!.id, 'validator-2');
    expect(reassigned.validatorId).toBe('validator-2');
  });

  it('forbids reassigning a validator to the issue owner', async () => {
    const issue = await s.createIssue('org1', 'u1', {
      title: 'T',
      description: 'D',
      severity: 'low',
      reporterId: 'reporter-1',
      ownerId: 'owner-1',
    });
    await s.submitIssueForValidation(issue.id, 'owner-1', {
      rootCause: 'Change control was skipped',
      rootCauseCategory: 'process_gap',
      validatorId: 'validator-1',
    });
    const validation = await s.getActiveIssueValidation(issue.id);
    await expect(s.reassignIssueValidator(validation!.id, 'owner-1')).rejects.toThrow(
      'issue_validation_self_validation_forbidden',
    );
  });

  it('refuses to reassign an already-decided validation', async () => {
    const issue = await s.createIssue('org1', 'u1', {
      title: 'T',
      description: 'D',
      severity: 'low',
      reporterId: 'reporter-1',
      ownerId: 'owner-1',
    });
    await s.submitIssueForValidation(issue.id, 'owner-1', {
      rootCause: 'Change control was skipped',
      rootCauseCategory: 'process_gap',
      validatorId: 'validator-1',
    });
    const validation = await s.getActiveIssueValidation(issue.id);
    await s.reviewIssueValidation(validation!.id, 'validator-1', 'approved');
    await expect(s.reassignIssueValidator(validation!.id, 'validator-2')).rejects.toThrow(
      `issue_validation_already_decided: ${validation!.id}`,
    );
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `yarn nx test shared -t "reassigns a pending validation|reassigning a validator|already-decided validation"`
Expected: FAIL — method not defined.

- [ ] **Step 3: Add to `NotesStrategy` interface**

In `libs/shared/src/strategies/notes.ts`, find `reviewIssueValidation(` and add directly after its signature:

```ts
  reassignIssueValidator(validationId: string, newValidatorId: string): Promise<IssueValidation>;
```

- [ ] **Step 4: Implement in `FakeNotesStrategy`**

In `libs/shared/src/strategies/fakes/fake-notes.ts`, find `async reviewIssueValidation(` and add directly after that method's closing `}`:

```ts
  async reassignIssueValidator(
    validationId: string,
    newValidatorId: string,
  ): Promise<IssueValidation> {
    const validation = this.issueValidations.find((v) => v.id === validationId);
    if (!validation) throw new Error(`issue_validation_not_found: ${validationId}`);
    if (validation.status !== 'pending') {
      throw new Error(`issue_validation_already_decided: ${validationId}`);
    }
    const issue = this.issues.get(validation.issueId);
    if (issue && issue.ownerId === newValidatorId) {
      throw new Error('issue_validation_self_validation_forbidden');
    }
    validation.validatorId = newValidatorId;
    return validation;
  }
```

- [ ] **Step 5: Run to verify pass**

Run: `yarn nx test shared -t "reassigns a pending validation|reassigning a validator|already-decided validation"`
Expected: PASS (all 3 tests).

- [ ] **Step 6: Implement in `SupabaseNotesStrategy`**

In `apps/microservices/notes/src/app/supabase-notes.strategy.ts`, find `async reviewIssueValidation(` and add directly after that method's closing `}`:

```ts
  async reassignIssueValidator(
    validationId: string,
    newValidatorId: string,
  ): Promise<IssueValidation> {
    const current = await this.getIssueValidationOrThrow(validationId);
    if (current.status !== 'pending') {
      throw new Error(`issue_validation_already_decided: ${validationId}`);
    }
    const issue = await this.getIssue(current.issueId);
    if (issue && issue.ownerId === newValidatorId) {
      throw new Error('issue_validation_self_validation_forbidden');
    }
    const { data, error } = await this.db
      .from('issue_validations')
      .update({ validator_id: newValidatorId })
      .eq('id', validationId)
      .select()
      .single();
    return this.toIssueValidation(ok(data, error));
  }
```

- [ ] **Step 7: Add the microservice message handler**

In `apps/microservices/notes/src/app/notes.controller.ts`, find `@MessagePattern('notes.issues.review-validation')` and add directly after that handler's closing `}`:

```ts
  @MessagePattern('notes.issues.reassign-validator')
  reassignIssueValidator(
    @Payload() payload: { id: string; newValidatorId: string },
  ): Promise<IssueValidation> {
    return this.strategy.reassignIssueValidator(payload.id, payload.newValidatorId);
  }
```

- [ ] **Step 8: Add the `NotesClientService` method**

In `libs/notes-client/src/lib/notes-client.service.ts`, find `reviewIssueValidation(` and add directly after its closing `}`:

```ts
  reassignIssueValidator(id: string, newValidatorId: string): Promise<IssueValidation> {
    return signedSend<IssueValidation>(this.client, 'notes.issues.reassign-validator', {
      id,
      newValidatorId,
    });
  }
```

- [ ] **Step 9: Write the failing gateway controller test**

In `apps/api/src/app/notes/__tests__/notes.controller.unit.test.ts`, add `reassignIssueValidator: vi.fn().mockResolvedValue(PENDING_VALIDATION),` to `makeNotes`'s returned object (directly after the `reassignIssueOwner` line added in Task 1). Then add this `describe` block after the `reassignIssueOwner` one added in Task 1:

```ts
describe('NotesController — reassignIssueValidator', () => {
  it('rejects a non-manager caller', async () => {
    const notes = makeNotes();
    const auth = { listOrgMembers: vi.fn().mockResolvedValue([{ userId: 'viewer-1', role: 'viewer' }]) };
    await expect(
      makeController(notes, auth).reassignIssueValidator(reqAs('viewer-1'), 'val-1', {
        newValidatorId: 'validator-2',
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(notes.reassignIssueValidator).not.toHaveBeenCalled();
  });

  it('rejects a new validator who is not an active org member', async () => {
    const notes = makeNotes();
    const auth = { listOrgMembers: vi.fn().mockResolvedValue([]) };
    await expect(
      makeController(notes, auth).reassignIssueValidator(reqAs('org-creator'), 'val-1', {
        newValidatorId: 'not-a-member',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('allows the org owner to reassign a pending validation', async () => {
    const notes = makeNotes();
    const auth = {
      listOrgMembers: vi.fn().mockResolvedValue([{ userId: 'validator-2', role: 'viewer' }]),
    };
    await makeController(notes, auth).reassignIssueValidator(reqAs('org-creator'), 'val-1', {
      newValidatorId: 'validator-2',
    });
    expect(notes.reassignIssueValidator).toHaveBeenCalledWith('val-1', 'validator-2');
  });

  it('throws NotFound when the validation does not exist', async () => {
    const notes = makeNotes({ getIssueValidation: vi.fn().mockResolvedValue(null) });
    await expect(
      makeController(notes).reassignIssueValidator(reqAsAdmin('platform-admin'), 'missing', {
        newValidatorId: 'validator-2',
      }),
    ).rejects.toThrow(NotFoundException);
  });
});
```

Note: `getIssueValidation` must already be a mocked method in this file's `makeNotes` (it is — this file already tests issue validations); if it returns `PENDING_VALIDATION` by default, this test's override to `null` for the not-found case follows the existing override pattern used throughout the file.

- [ ] **Step 10: Run to verify failure**

Run: `yarn nx test api -t "reassignIssueValidator"`
Expected: FAIL.

- [ ] **Step 11: Add the gateway route**

In `apps/api/src/app/notes/notes.controller.ts`, find `@Post('issue-validations/:id/review')` and add this new route directly after that method's closing `}`:

```ts
  @Post('issue-validations/:id/reassign-validator')
  @ApiOperation({ summary: 'Reassign the validator of a pending issue validation' })
  async reassignIssueValidator(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: { newValidatorId: string },
  ) {
    this.uid(req);
    const validation = await this.notes.getIssueValidation(id);
    if (!validation) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(validation.orgId);
    if (!org) throw new NotFoundException();
    await this.checkOrgManage(req, org);
    const members = await this.auth.listOrgMembers(org.id, org.userId);
    if (!members.some((m) => m.userId === body.newValidatorId)) {
      throw new BadRequestException('assignee_not_active_member');
    }
    return this.notes.reassignIssueValidator(id, body.newValidatorId);
  }
```

- [ ] **Step 12: Run to verify pass**

Run: `yarn nx test api -t "reassignIssueValidator"`
Expected: PASS (all 4 tests).

- [ ] **Step 13: Format, lint, build**

```bash
npx prettier --write apps/api/src/app/notes/notes.controller.ts apps/api/src/app/notes/__tests__/notes.controller.unit.test.ts libs/shared/src/strategies/notes.ts libs/shared/src/strategies/fakes/fake-notes.ts libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts apps/microservices/notes/src/app/supabase-notes.strategy.ts apps/microservices/notes/src/app/notes.controller.ts libs/notes-client/src/lib/notes-client.service.ts
yarn nx lint api && yarn nx lint shared && yarn nx lint notes && yarn nx lint notes-client
yarn nx build api && yarn nx build shared && yarn nx build notes && yarn nx build notes-client
```

- [ ] **Step 14: Commit**

```bash
git add apps/api/src/app/notes/notes.controller.ts apps/api/src/app/notes/__tests__/notes.controller.unit.test.ts libs/shared/src/strategies/notes.ts libs/shared/src/strategies/fakes/fake-notes.ts libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts apps/microservices/notes/src/app/supabase-notes.strategy.ts apps/microservices/notes/src/app/notes.controller.ts libs/notes-client/src/lib/notes-client.service.ts
git commit -m "feat(notes): add issue validator reassignment"
```

---

### Task 3: Assessment approver reassignment (backend)

**Files:**
- Modify: `apps/api/src/app/notes/notes.controller.ts` (add `reassignAssessmentApprover` route near `approveAssessment`)
- Modify: `libs/shared/src/strategies/notes.ts`
- Modify: `libs/shared/src/strategies/fakes/fake-notes.ts`
- Modify: `apps/microservices/notes/src/app/supabase-notes.strategy.ts`
- Modify: `apps/microservices/notes/src/app/notes.controller.ts`
- Modify: `libs/notes-client/src/lib/notes-client.service.ts`
- Test: `apps/api/src/app/notes/__tests__/assessments.controller.unit.test.ts`
- Test: `libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts`

**Interfaces:**
- Consumes: `NotesController.checkOrgManage` (Task 1).
- Produces: `NotesStrategy.reassignAssessmentApprover(id: string, newApproverId: string): Promise<Assessment>`. Throws `assessment_not_found: <id>` if missing; throws `assessment_self_approval_forbidden` if `newApproverId === assessment.ownerId`.

- [ ] **Step 1: Write the failing strategy test (Fake)**

In `libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts`, find `it('enforces the full lifecycle with owner/approver gating', ...)` and add directly after it:

```ts
  it('reassigns an assessment approver', async () => {
    const strategy = new FakeNotesStrategy();
    const types = await strategy.listAssessmentTypes('org-1');
    const assessment = await strategy.createAssessment('org-1', 'owner-1', {
      title: 'Assessment',
      assessmentTypeId: types[0]!.id,
      ownerId: 'owner-1',
      approverId: 'approver-1',
    });
    const reassigned = await strategy.reassignAssessmentApprover(assessment.id, 'approver-2');
    expect(reassigned.approverId).toBe('approver-2');
  });

  it('forbids reassigning the approver to the assessment owner', async () => {
    const strategy = new FakeNotesStrategy();
    const types = await strategy.listAssessmentTypes('org-1');
    const assessment = await strategy.createAssessment('org-1', 'owner-1', {
      title: 'Assessment',
      assessmentTypeId: types[0]!.id,
      ownerId: 'owner-1',
      approverId: 'approver-1',
    });
    await expect(
      strategy.reassignAssessmentApprover(assessment.id, 'owner-1'),
    ).rejects.toThrow('assessment_self_approval_forbidden');
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `yarn nx test shared -t "reassigns an assessment approver|reassigning the approver to the assessment owner"`
Expected: FAIL.

- [ ] **Step 3: Add to `NotesStrategy` interface**

In `libs/shared/src/strategies/notes.ts`, find `approveAssessment(id: string, userId: string): Promise<Assessment>;` and add directly after it:

```ts
  reassignAssessmentApprover(id: string, newApproverId: string): Promise<Assessment>;
```

- [ ] **Step 4: Implement in `FakeNotesStrategy`**

In `libs/shared/src/strategies/fakes/fake-notes.ts`, find `async approveAssessment(` and add directly after that method's closing `}`:

```ts
  async reassignAssessmentApprover(id: string, newApproverId: string): Promise<Assessment> {
    const a = this.assessments.find((x) => x.id === id);
    if (!a) throw new Error(`assessment_not_found: ${id}`);
    if (a.ownerId === newApproverId) throw new Error('assessment_self_approval_forbidden');
    a.approverId = newApproverId;
    a.updatedAt = new Date().toISOString();
    return a;
  }
```

- [ ] **Step 5: Run to verify pass**

Run: `yarn nx test shared -t "reassigns an assessment approver|reassigning the approver to the assessment owner"`
Expected: PASS.

- [ ] **Step 6: Implement in `SupabaseNotesStrategy`**

In `apps/microservices/notes/src/app/supabase-notes.strategy.ts`, find `async approveAssessment(` and add directly after that method's closing `}`:

```ts
  async reassignAssessmentApprover(id: string, newApproverId: string): Promise<Assessment> {
    const current = await this.getAssessmentOrThrow(id);
    if (current.ownerId === newApproverId) {
      throw new Error('assessment_self_approval_forbidden');
    }
    const { data, error } = await this.db
      .from('risk_assessments')
      .update({ approver_id: newApproverId, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    return this.toAssessment(ok(data, error));
  }
```

- [ ] **Step 7: Add the microservice message handler**

In `apps/microservices/notes/src/app/notes.controller.ts`, find `@MessagePattern('notes.assessments.approve')` and add directly after that handler's closing `}`:

```ts
  @MessagePattern('notes.assessments.reassign-approver')
  reassignAssessmentApprover(
    @Payload() payload: { id: string; newApproverId: string },
  ): Promise<Assessment> {
    return this.strategy.reassignAssessmentApprover(payload.id, payload.newApproverId);
  }
```

- [ ] **Step 8: Add the `NotesClientService` method**

In `libs/notes-client/src/lib/notes-client.service.ts`, find the existing `approveAssessment` client method (search `notes.assessments.approve`) and add directly after its closing `}`:

```ts
  reassignAssessmentApprover(id: string, newApproverId: string): Promise<Assessment> {
    return signedSend<Assessment>(this.client, 'notes.assessments.reassign-approver', {
      id,
      newApproverId,
    });
  }
```

- [ ] **Step 9: Write the failing gateway controller test**

In `apps/api/src/app/notes/__tests__/assessments.controller.unit.test.ts`, widen `makeController` the same way as Task 1 Step 10 (accept an optional `auth` override, defaulting to `{ listOrgMembers: vi.fn().mockResolvedValue([]) }`). Add `reassignAssessmentApprover: vi.fn().mockResolvedValue({ ...ASSESSMENT, approverId: 'approver-2' }),` to `makeNotes`'s returned object. Then add:

```ts
describe('NotesController — reassignAssessmentApprover', () => {
  it('rejects a non-manager caller', async () => {
    const notes = makeNotes();
    const auth = { listOrgMembers: vi.fn().mockResolvedValue([{ userId: 'viewer-1', role: 'viewer' }]) };
    await expect(
      makeController(notes, auth).reassignAssessmentApprover(reqAs('viewer-1'), 'assessment-1', {
        newApproverId: 'approver-2',
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(notes.reassignAssessmentApprover).not.toHaveBeenCalled();
  });

  it('rejects a new approver who is not an active org member', async () => {
    const notes = makeNotes();
    const auth = { listOrgMembers: vi.fn().mockResolvedValue([]) };
    await expect(
      makeController(notes, auth).reassignAssessmentApprover(
        reqAs('org-creator'),
        'assessment-1',
        { newApproverId: 'not-a-member' },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('allows the org owner to reassign', async () => {
    const notes = makeNotes();
    const auth = {
      listOrgMembers: vi.fn().mockResolvedValue([{ userId: 'approver-2', role: 'viewer' }]),
    };
    await makeController(notes, auth).reassignAssessmentApprover(
      reqAs('org-creator'),
      'assessment-1',
      { newApproverId: 'approver-2' },
    );
    expect(notes.reassignAssessmentApprover).toHaveBeenCalledWith('assessment-1', 'approver-2');
  });

  it('throws NotFound when the assessment does not exist', async () => {
    const notes = makeNotes({ getAssessment: vi.fn().mockResolvedValue(null) });
    await expect(
      makeController(notes).reassignAssessmentApprover(reqAsAdmin('platform-admin'), 'missing', {
        newApproverId: 'approver-2',
      }),
    ).rejects.toThrow(NotFoundException);
  });
});
```

- [ ] **Step 10: Run to verify failure**

Run: `yarn nx test api -t "reassignAssessmentApprover"`
Expected: FAIL.

- [ ] **Step 11: Add the gateway route**

In `apps/api/src/app/notes/notes.controller.ts`, find the `approveAssessment` route (search `@Post('assessments/:id/approve')`) and add this new route directly after that method's closing `}`:

```ts
  @Post('assessments/:id/reassign-approver')
  @ApiOperation({ summary: 'Reassign the approver of an assessment' })
  async reassignAssessmentApprover(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: { newApproverId: string },
  ) {
    this.uid(req);
    const assessment = await this.notes.getAssessment(id);
    if (!assessment) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(assessment.orgId);
    if (!org) throw new NotFoundException();
    await this.checkOrgManage(req, org);
    const members = await this.auth.listOrgMembers(org.id, org.userId);
    if (!members.some((m) => m.userId === body.newApproverId)) {
      throw new BadRequestException('assignee_not_active_member');
    }
    return this.notes.reassignAssessmentApprover(id, body.newApproverId);
  }
```

Note: `Assessment.orgId` is optional in the type (`orgId?: string`) — this mirrors how every other assessment route in this file already handles it (they all call `getOrganizationById(assessment.orgId)` without a null-check on `orgId` itself, trusting a persisted assessment always has one). Follow that existing pattern rather than adding new handling.

- [ ] **Step 12: Run to verify pass**

Run: `yarn nx test api -t "reassignAssessmentApprover"`
Expected: PASS.

- [ ] **Step 13: Format, lint, build**

```bash
npx prettier --write apps/api/src/app/notes/notes.controller.ts apps/api/src/app/notes/__tests__/assessments.controller.unit.test.ts libs/shared/src/strategies/notes.ts libs/shared/src/strategies/fakes/fake-notes.ts libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts apps/microservices/notes/src/app/supabase-notes.strategy.ts apps/microservices/notes/src/app/notes.controller.ts libs/notes-client/src/lib/notes-client.service.ts
yarn nx lint api && yarn nx lint shared && yarn nx lint notes && yarn nx lint notes-client
yarn nx build api && yarn nx build shared && yarn nx build notes && yarn nx build notes-client
```

- [ ] **Step 14: Commit**

```bash
git add apps/api/src/app/notes/notes.controller.ts apps/api/src/app/notes/__tests__/assessments.controller.unit.test.ts libs/shared/src/strategies/notes.ts libs/shared/src/strategies/fakes/fake-notes.ts libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts apps/microservices/notes/src/app/supabase-notes.strategy.ts apps/microservices/notes/src/app/notes.controller.ts libs/notes-client/src/lib/notes-client.service.ts
git commit -m "feat(notes): add assessment approver reassignment"
```

---

### Task 4: RiskAcceptance approver reassignment (backend)

**Files:**
- Modify: `apps/api/src/app/notes/notes.controller.ts` (add `reassignRiskAcceptanceApprover` route near `reviewRiskAcceptance`)
- Modify: `libs/shared/src/strategies/notes.ts`
- Modify: `libs/shared/src/strategies/fakes/fake-notes.ts`
- Modify: `apps/microservices/notes/src/app/supabase-notes.strategy.ts`
- Modify: `apps/microservices/notes/src/app/notes.controller.ts`
- Modify: `libs/notes-client/src/lib/notes-client.service.ts`
- Test: `apps/api/src/app/notes/__tests__/risks.controller.unit.test.ts`
- Test: `libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts`

**Interfaces:**
- Consumes: `NotesController.checkOrgManage` (Task 1).
- Produces: `NotesStrategy.reassignRiskAcceptanceApprover(id: string, newApproverId: string): Promise<RiskAcceptance>`. Throws `risk_acceptance_not_found: <id>` if missing; throws `risk_acceptance_self_approval_forbidden` if `newApproverId === acceptance.requestedBy`.

- [ ] **Step 1: Write the failing strategy test (Fake)**

In `libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts`, find `it('runs a risk acceptance through requested -> approved, and supersedes on a new request', ...)` and add directly after it:

```ts
  it('reassigns a risk acceptance approver', async () => {
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
    const future = new Date(Date.now() + 86400_000).toISOString();
    const acceptance = await strategy.createRiskAcceptance('org-1', risk.id, 'user-1', {
      justification: 'Business need outweighs residual exposure',
      compensatingControls: 'Manual monthly review',
      expiresAt: future,
      approverId: 'ciso-1',
    });
    const reassigned = await strategy.reassignRiskAcceptanceApprover(acceptance.id, 'ciso-2');
    expect(reassigned.approverId).toBe('ciso-2');
  });

  it('forbids reassigning the approver to the requester', async () => {
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
    const future = new Date(Date.now() + 86400_000).toISOString();
    const acceptance = await strategy.createRiskAcceptance('org-1', risk.id, 'user-1', {
      justification: 'Business need outweighs residual exposure',
      compensatingControls: 'Manual monthly review',
      expiresAt: future,
      approverId: 'ciso-1',
    });
    await expect(
      strategy.reassignRiskAcceptanceApprover(acceptance.id, 'user-1'),
    ).rejects.toThrow('risk_acceptance_self_approval_forbidden');
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `yarn nx test shared -t "reassigns a risk acceptance approver|reassigning the approver to the requester"`
Expected: FAIL.

- [ ] **Step 3: Add to `NotesStrategy` interface**

In `libs/shared/src/strategies/notes.ts`, find `approveRiskAcceptance(id: string, userId: string): Promise<RiskAcceptance>;` and add directly after it:

```ts
  reassignRiskAcceptanceApprover(id: string, newApproverId: string): Promise<RiskAcceptance>;
```

- [ ] **Step 4: Implement in `FakeNotesStrategy`**

In `libs/shared/src/strategies/fakes/fake-notes.ts`, find `async approveRiskAcceptance(` and add directly after that method's closing `}`:

```ts
  async reassignRiskAcceptanceApprover(
    id: string,
    newApproverId: string,
  ): Promise<RiskAcceptance> {
    const acceptance = this.riskAcceptances.find((a) => a.id === id);
    if (!acceptance) throw new Error(`risk_acceptance_not_found: ${id}`);
    if (acceptance.requestedBy === newApproverId) {
      throw new Error('risk_acceptance_self_approval_forbidden');
    }
    acceptance.approverId = newApproverId;
    acceptance.updatedAt = new Date().toISOString();
    return acceptance;
  }
```

- [ ] **Step 5: Run to verify pass**

Run: `yarn nx test shared -t "reassigns a risk acceptance approver|reassigning the approver to the requester"`
Expected: PASS.

- [ ] **Step 6: Implement in `SupabaseNotesStrategy`**

In `apps/microservices/notes/src/app/supabase-notes.strategy.ts`, find `async approveRiskAcceptance(` and add directly after that method's closing `}`:

```ts
  async reassignRiskAcceptanceApprover(
    id: string,
    newApproverId: string,
  ): Promise<RiskAcceptance> {
    const current = await this.getRiskAcceptanceOrThrow(id);
    if (current.requestedBy === newApproverId) {
      throw new Error('risk_acceptance_self_approval_forbidden');
    }
    const { data, error } = await this.db
      .from('risk_acceptances')
      .update({ approver_id: newApproverId, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    return this.toRiskAcceptance(ok(data, error));
  }
```

- [ ] **Step 7: Add the microservice message handler**

In `apps/microservices/notes/src/app/notes.controller.ts`, find `@MessagePattern('notes.risks.acceptance.approve')` and add directly after that handler's closing `}`:

```ts
  @MessagePattern('notes.risks.acceptance.reassign-approver')
  reassignRiskAcceptanceApprover(
    @Payload() payload: { id: string; newApproverId: string },
  ): Promise<RiskAcceptance> {
    return this.strategy.reassignRiskAcceptanceApprover(payload.id, payload.newApproverId);
  }
```

- [ ] **Step 8: Add the `NotesClientService` method**

In `libs/notes-client/src/lib/notes-client.service.ts`, find the existing `approveRiskAcceptance`-equivalent client method (search `notes.risks.acceptance.approve`) and add directly after its closing `}`:

```ts
  reassignRiskAcceptanceApprover(id: string, newApproverId: string): Promise<RiskAcceptance> {
    return signedSend<RiskAcceptance>(this.client, 'notes.risks.acceptance.reassign-approver', {
      id,
      newApproverId,
    });
  }
```

- [ ] **Step 9: Write the failing gateway controller test**

In `apps/api/src/app/notes/__tests__/risks.controller.unit.test.ts`, widen `makeController` the same way as Task 1 (accept an optional `auth` override). Add `reassignRiskAcceptanceApprover: vi.fn().mockResolvedValue({ ...ACCEPTANCE, approverId: 'ciso-2' }),` to `makeNotes`'s returned object, and add `getRiskAcceptance: vi.fn().mockResolvedValue(ACCEPTANCE),` too if not already present (check first — this file's `makeNotes` may only have `createRiskAcceptance`; the reassign route needs a get-by-id, so confirm `getRiskAcceptance` exists on `NotesClientService` — it does, per prior research: `libs/notes-client/src/lib/notes-client.service.ts:966`). Then add:

```ts
describe('NotesController — reassignRiskAcceptanceApprover', () => {
  it('rejects a non-manager caller', async () => {
    const notes = makeNotes();
    const auth = { listOrgMembers: vi.fn().mockResolvedValue([{ userId: 'viewer-1', role: 'viewer' }]) };
    await expect(
      makeController(notes, auth).reassignRiskAcceptanceApprover(
        reqAs('viewer-1'),
        'acceptance-1',
        { newApproverId: 'ciso-2' },
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(notes.reassignRiskAcceptanceApprover).not.toHaveBeenCalled();
  });

  it('rejects a new approver who is not an active org member', async () => {
    const notes = makeNotes();
    const auth = { listOrgMembers: vi.fn().mockResolvedValue([]) };
    await expect(
      makeController(notes, auth).reassignRiskAcceptanceApprover(
        reqAs('org-creator'),
        'acceptance-1',
        { newApproverId: 'not-a-member' },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('allows the org owner to reassign', async () => {
    const notes = makeNotes();
    const auth = {
      listOrgMembers: vi.fn().mockResolvedValue([{ userId: 'ciso-2', role: 'viewer' }]),
    };
    await makeController(notes, auth).reassignRiskAcceptanceApprover(
      reqAs('org-creator'),
      'acceptance-1',
      { newApproverId: 'ciso-2' },
    );
    expect(notes.reassignRiskAcceptanceApprover).toHaveBeenCalledWith('acceptance-1', 'ciso-2');
  });

  it('throws NotFound when the acceptance does not exist', async () => {
    const notes = makeNotes({ getRiskAcceptance: vi.fn().mockResolvedValue(null) });
    await expect(
      makeController(notes).reassignRiskAcceptanceApprover(
        reqAsAdmin('platform-admin'),
        'missing',
        { newApproverId: 'ciso-2' },
      ),
    ).rejects.toThrow(NotFoundException);
  });
});
```

Check whether `reqAsAdmin` already exists in this file — if not, add it (copy the identical helper from `notes.controller.unit.test.ts`: `function reqAsAdmin(uid: string): Request & { user?: VerifiedToken } { return { user: { uid, role: 'admin' } as VerifiedToken } as Request & { user?: VerifiedToken }; }`).

- [ ] **Step 10: Run to verify failure**

Run: `yarn nx test api -t "reassignRiskAcceptanceApprover"`
Expected: FAIL.

- [ ] **Step 11: Add the gateway route**

In `apps/api/src/app/notes/notes.controller.ts`, find `@Post('risk-acceptances/:id/review')` and add this new route directly before it (grouping the 3 existing risk-acceptance action routes together with the new one):

```ts
  @Post('risk-acceptances/:id/reassign-approver')
  @ApiOperation({ summary: 'Reassign the approver of a risk acceptance' })
  async reassignRiskAcceptanceApprover(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: { newApproverId: string },
  ) {
    this.uid(req);
    const acceptance = await this.notes.getRiskAcceptance(id);
    if (!acceptance) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(acceptance.orgId);
    if (!org) throw new NotFoundException();
    await this.checkOrgManage(req, org);
    const members = await this.auth.listOrgMembers(org.id, org.userId);
    if (!members.some((m) => m.userId === body.newApproverId)) {
      throw new BadRequestException('assignee_not_active_member');
    }
    return this.notes.reassignRiskAcceptanceApprover(id, body.newApproverId);
  }

```

- [ ] **Step 12: Run to verify pass**

Run: `yarn nx test api -t "reassignRiskAcceptanceApprover"`
Expected: PASS.

- [ ] **Step 13: Format, lint, build**

```bash
npx prettier --write apps/api/src/app/notes/notes.controller.ts apps/api/src/app/notes/__tests__/risks.controller.unit.test.ts libs/shared/src/strategies/notes.ts libs/shared/src/strategies/fakes/fake-notes.ts libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts apps/microservices/notes/src/app/supabase-notes.strategy.ts apps/microservices/notes/src/app/notes.controller.ts libs/notes-client/src/lib/notes-client.service.ts
yarn nx lint api && yarn nx lint shared && yarn nx lint notes && yarn nx lint notes-client
yarn nx build api && yarn nx build shared && yarn nx build notes && yarn nx build notes-client
```

- [ ] **Step 14: Commit**

```bash
git add apps/api/src/app/notes/notes.controller.ts apps/api/src/app/notes/__tests__/risks.controller.unit.test.ts libs/shared/src/strategies/notes.ts libs/shared/src/strategies/fakes/fake-notes.ts libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts apps/microservices/notes/src/app/supabase-notes.strategy.ts apps/microservices/notes/src/app/notes.controller.ts libs/notes-client/src/lib/notes-client.service.ts
git commit -m "feat(notes): add risk acceptance approver reassignment"
```

---

### Task 5: Exception owner reassignment (backend)

**Files:**
- Modify: `apps/api/src/app/notes/notes.controller.ts` (add `reassignExceptionOwner` route near `approveException`)
- Modify: `libs/shared/src/strategies/notes.ts`
- Modify: `libs/shared/src/strategies/fakes/fake-notes.ts`
- Modify: `apps/microservices/notes/src/app/supabase-notes.strategy.ts`
- Modify: `apps/microservices/notes/src/app/notes.controller.ts`
- Modify: `libs/notes-client/src/lib/notes-client.service.ts`
- Test: `apps/api/src/app/notes/__tests__/exceptions.controller.unit.test.ts`
- Test: `libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts`

**Interfaces:**
- Consumes: `NotesController.checkOrgManage` (Task 1).
- Produces: `NotesStrategy.reassignExceptionOwner(id: string, newOwnerId: string): Promise<Exception>`. Throws `exception_not_found: <id>` if missing. No same-person invariant (per spec — `ownerId` is the renewal-request initiator, with no fixed paired reviewer identity to protect).

- [ ] **Step 1: Write the failing strategy test (Fake)**

In `libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts`, find `it('approves an exception', ...)` and add directly after it:

```ts
  it('reassigns an exception owner', async () => {
    const exc = await s.createException('org1', 'u1', {
      controlCode: 'AC-1',
      frameworkId: 'fw1',
      title: 'T',
      justification: 'J',
      statement: 'S',
      ownerId: 'owner-1',
    });
    const reassigned = await s.reassignExceptionOwner(exc.id, 'owner-2');
    expect(reassigned.ownerId).toBe('owner-2');
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `yarn nx test shared -t "reassigns an exception owner"`
Expected: FAIL.

- [ ] **Step 3: Add to `NotesStrategy` interface**

In `libs/shared/src/strategies/notes.ts`, find `approveException(id: string, approverId: string): Promise<Exception>;` and add directly after it:

```ts
  reassignExceptionOwner(id: string, newOwnerId: string): Promise<Exception>;
```

- [ ] **Step 4: Implement in `FakeNotesStrategy`**

In `libs/shared/src/strategies/fakes/fake-notes.ts`, find `async rejectException(` and add directly after that method's closing `}`:

```ts
  async reassignExceptionOwner(id: string, newOwnerId: string): Promise<Exception> {
    const existing = this.exceptions.get(id);
    if (!existing) throw new Error(`exception_not_found: ${id}`);
    const updated: Exception = {
      ...existing,
      ownerId: newOwnerId,
      updatedAt: new Date().toISOString(),
    };
    this.exceptions.set(id, updated);
    return updated;
  }
```

- [ ] **Step 5: Run to verify pass**

Run: `yarn nx test shared -t "reassigns an exception owner"`
Expected: PASS.

- [ ] **Step 6: Implement in `SupabaseNotesStrategy`**

In `apps/microservices/notes/src/app/supabase-notes.strategy.ts`, find `async rejectException(` and add directly after that method's closing `}`:

```ts
  async reassignExceptionOwner(id: string, newOwnerId: string): Promise<Exception> {
    await this.getExceptionOrThrow(id);
    const { data, error } = await this.db
      .from('exceptions')
      .update({ owner_id: newOwnerId, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    return this.toException(ok(data, error));
  }
```

- [ ] **Step 7: Add the microservice message handler**

In `apps/microservices/notes/src/app/notes.controller.ts`, find `@MessagePattern('notes.exceptions.reject')` and add directly after that handler's closing `}`:

```ts
  @MessagePattern('notes.exceptions.reassign-owner')
  reassignExceptionOwner(
    @Payload() payload: { id: string; newOwnerId: string },
  ): Promise<Exception> {
    return this.strategy.reassignExceptionOwner(payload.id, payload.newOwnerId);
  }
```

- [ ] **Step 8: Add the `NotesClientService` method**

In `libs/notes-client/src/lib/notes-client.service.ts`, find `rejectException(` and add directly after its closing `}`:

```ts
  reassignExceptionOwner(id: string, newOwnerId: string): Promise<Exception> {
    return signedSend<Exception>(this.client, 'notes.exceptions.reassign-owner', {
      id,
      newOwnerId,
    });
  }
```

- [ ] **Step 9: Write the failing gateway controller test**

In `apps/api/src/app/notes/__tests__/exceptions.controller.unit.test.ts`, widen `makeController` the same way as Task 1 (accept an optional `auth` override). Add `reassignExceptionOwner: vi.fn().mockResolvedValue({ ...EXCEPTION, ownerId: 'owner-2' }),` to `makeNotes`'s returned object. Add `reqAsAdmin` helper if not already present (same as Task 4 Step 9). Then add:

```ts
describe('NotesController — reassignExceptionOwner', () => {
  it('rejects a non-manager caller', async () => {
    const notes = makeNotes();
    const auth = { listOrgMembers: vi.fn().mockResolvedValue([{ userId: 'viewer-1', role: 'viewer' }]) };
    await expect(
      makeController(notes, auth).reassignExceptionOwner(reqAs('viewer-1'), 'exception-1', {
        newOwnerId: 'owner-2',
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(notes.reassignExceptionOwner).not.toHaveBeenCalled();
  });

  it('rejects a new owner who is not an active org member', async () => {
    const notes = makeNotes();
    const auth = { listOrgMembers: vi.fn().mockResolvedValue([]) };
    await expect(
      makeController(notes, auth).reassignExceptionOwner(reqAs('org-creator'), 'exception-1', {
        newOwnerId: 'not-a-member',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('allows the org owner to reassign', async () => {
    const notes = makeNotes();
    const auth = {
      listOrgMembers: vi.fn().mockResolvedValue([{ userId: 'owner-2', role: 'viewer' }]),
    };
    await makeController(notes, auth).reassignExceptionOwner(reqAs('org-creator'), 'exception-1', {
      newOwnerId: 'owner-2',
    });
    expect(notes.reassignExceptionOwner).toHaveBeenCalledWith('exception-1', 'owner-2');
  });

  it('throws NotFound when the exception does not exist', async () => {
    const notes = makeNotes({ getException: vi.fn().mockResolvedValue(null) });
    await expect(
      makeController(notes).reassignExceptionOwner(reqAsAdmin('platform-admin'), 'missing', {
        newOwnerId: 'owner-2',
      }),
    ).rejects.toThrow(NotFoundException);
  });
});
```

- [ ] **Step 10: Run to verify failure**

Run: `yarn nx test api -t "reassignExceptionOwner"`
Expected: FAIL.

- [ ] **Step 11: Add the gateway route**

In `apps/api/src/app/notes/notes.controller.ts`, find `@Post('exceptions/:id/reject')` and add this new route directly after that method's closing `}`:

```ts
  @Post('exceptions/:id/reassign-owner')
  @ApiOperation({ summary: 'Reassign the owner of an exception' })
  async reassignExceptionOwner(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: { newOwnerId: string },
  ) {
    this.uid(req);
    const exception = await this.notes.getException(id);
    if (!exception) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(exception.orgId);
    if (!org) throw new NotFoundException();
    await this.checkOrgManage(req, org);
    const members = await this.auth.listOrgMembers(org.id, org.userId);
    if (!members.some((m) => m.userId === body.newOwnerId)) {
      throw new BadRequestException('assignee_not_active_member');
    }
    return this.notes.reassignExceptionOwner(id, body.newOwnerId);
  }
```

- [ ] **Step 12: Run to verify pass**

Run: `yarn nx test api -t "reassignExceptionOwner"`
Expected: PASS.

- [ ] **Step 13: Format, lint, build**

```bash
npx prettier --write apps/api/src/app/notes/notes.controller.ts apps/api/src/app/notes/__tests__/exceptions.controller.unit.test.ts libs/shared/src/strategies/notes.ts libs/shared/src/strategies/fakes/fake-notes.ts libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts apps/microservices/notes/src/app/supabase-notes.strategy.ts apps/microservices/notes/src/app/notes.controller.ts libs/notes-client/src/lib/notes-client.service.ts
yarn nx lint api && yarn nx lint shared && yarn nx lint notes && yarn nx lint notes-client
yarn nx build api && yarn nx build shared && yarn nx build notes && yarn nx build notes-client
```

- [ ] **Step 14: Full backend regression check**

```bash
yarn nx test api && yarn nx test shared && yarn nx test notes && yarn nx test notes-client
```

Expected: all green — this is the last backend task, confirming Tasks 1-5 all compose correctly.

- [ ] **Step 15: Commit**

```bash
git add apps/api/src/app/notes/notes.controller.ts apps/api/src/app/notes/__tests__/exceptions.controller.unit.test.ts libs/shared/src/strategies/notes.ts libs/shared/src/strategies/fakes/fake-notes.ts libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts apps/microservices/notes/src/app/supabase-notes.strategy.ts apps/microservices/notes/src/app/notes.controller.ts libs/notes-client/src/lib/notes-client.service.ts
git commit -m "feat(notes): add exception owner reassignment"
```

---

### Task 6: Client query hooks

**Files:**
- Modify: `apps/client/src/queries/issues.ts` (add `useReassignIssueOwner`, `useReassignIssueValidator`)
- Modify: `apps/client/src/queries/assessments.ts` (add `useReassignAssessmentApprover`)
- Modify: `apps/client/src/queries/risks.ts` (add `useReassignRiskAcceptanceApprover`)
- Modify: `apps/client/src/queries/exceptions.ts` (add `useReassignExceptionOwner`)

**Interfaces:**
- Produces: 5 mutation hooks, all following this repo's `useMutation` + `api()` + query-invalidation pattern.

- [ ] **Step 1: Add issue hooks**

In `apps/client/src/queries/issues.ts`, find `useReviewIssueValidation` and add directly after its closing `}`:

```ts
export function useReassignIssueOwner(orgId: string) {
  const qc = useQueryClient();
  return useMutation<Issue, Error, { id: string; newOwnerId: string }>({
    mutationFn: ({ id, newOwnerId }) =>
      api<Issue>(`/notes/issues/${id}/reassign-owner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newOwnerId }),
      }),
    onSuccess: (_result, { id }) => {
      qc.invalidateQueries({ queryKey: ['issues', orgId] });
      qc.invalidateQueries({ queryKey: ['issues', id, 'validations'] });
    },
  });
}

export function useReassignIssueValidator(orgId: string) {
  const qc = useQueryClient();
  return useMutation<IssueValidation, Error, { id: string; issueId: string; newValidatorId: string }>({
    mutationFn: ({ id, newValidatorId }) =>
      api<IssueValidation>(`/notes/issue-validations/${id}/reassign-validator`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newValidatorId }),
      }),
    onSuccess: (_result, { issueId }) => {
      qc.invalidateQueries({ queryKey: ['issues', orgId] });
      qc.invalidateQueries({ queryKey: ['issues', issueId, 'validations'] });
    },
  });
}
```

- [ ] **Step 2: Add assessment hook**

In `apps/client/src/queries/assessments.ts`, find `useApproveAssessment` and add directly after its closing `}`:

```ts
export function useReassignAssessmentApprover(orgId: string, id: string) {
  const qc = useQueryClient();
  return useMutation<Assessment, Error, { newApproverId: string }>({
    mutationFn: (body) =>
      api<Assessment>(`/notes/assessments/${id}/reassign-approver`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: () => invalidateAssessment(qc, orgId, id),
  });
}
```

- [ ] **Step 3: Add risk-acceptance hook**

In `apps/client/src/queries/risks.ts`, find `useApproveRiskAcceptance` and add directly after its closing `}`:

```ts
export function useReassignRiskAcceptanceApprover(riskId: string) {
  const qc = useQueryClient();
  return useMutation<RiskAcceptance, Error, { id: string; newApproverId: string }>({
    mutationFn: ({ id, newApproverId }) =>
      api<RiskAcceptance>(`/notes/risk-acceptances/${id}/reassign-approver`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newApproverId }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['risks', riskId, 'acceptance'] }),
  });
}
```

- [ ] **Step 4: Add exception hook**

In `apps/client/src/queries/exceptions.ts`, find `useApproveException` and add directly after its closing `}`:

```ts
export function useReassignExceptionOwner(orgId: string) {
  const qc = useQueryClient();
  return useMutation<Exception, Error, { id: string; newOwnerId: string }>({
    mutationFn: ({ id, newOwnerId }) =>
      api<Exception>(`/notes/exceptions/${id}/reassign-owner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newOwnerId }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exceptions', orgId] }),
  });
}
```

- [ ] **Step 5: Format, lint, build (no tests — these are thin wrappers exercised by the wiring tasks' component tests)**

```bash
npx prettier --write apps/client/src/queries/issues.ts apps/client/src/queries/assessments.ts apps/client/src/queries/risks.ts apps/client/src/queries/exceptions.ts
yarn nx lint client
yarn nx build client
```

- [ ] **Step 6: Commit**

```bash
git add apps/client/src/queries/issues.ts apps/client/src/queries/assessments.ts apps/client/src/queries/risks.ts apps/client/src/queries/exceptions.ts
git commit -m "feat(client): add reassignment mutation hooks"
```

---

### Task 7: `ReassignDialog` shared component + i18n keys

**Files:**
- Create: `apps/client/src/components/shared/ReassignDialog.tsx`
- Test: `apps/client/src/components/shared/__tests__/ReassignDialog.unit.test.tsx`
- Modify: `libs/template-shared/src/lib/i18n/locales/en.ts` (add `reassign` key group)
- Modify: `libs/template-shared/src/lib/i18n/locales/ru.ts`, `he.ts`, `es.ts` (mirror the same keys — this repo ships 4 locales for every UI string, per the org-invite-followups precedent this session already established)

**Interfaces:**
- Produces: `ReassignDialog` component with props `{ open, isPending, title, members, currentAssigneeId, onOpenChange, onConfirm }`. `members` must already be pre-filtered by the caller (active, excluding whatever same-person id the caller wants to exclude) — the dialog itself does no filtering.
- Consumes: `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogFooter` from `@/components/ui/dialog` (already used throughout this codebase per `AGENTS.md`'s overlay pattern — create uses `Dialog`, not `AlertDialog`), `Combobox` from `@/components/ui/combobox`, `Button` from `@/components/ui/button`.

- [ ] **Step 1: Write the failing component test**

Create `apps/client/src/components/shared/__tests__/ReassignDialog.unit.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReassignDialog } from '../ReassignDialog';

// Mock ResizeObserver and scrollIntoView which cmdk (used by Combobox)
// requires -- without these, tests hang. Matches the same boilerplate
// already used in IssueDetailSheet.unit.test.tsx and combobox.unit.test.tsx.
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

const MEMBERS = [
  { userId: 'user-1', displayName: 'Alice', email: 'alice@example.com' },
  { userId: 'user-2', displayName: 'Bob', email: 'bob@example.com' },
];

describe('ReassignDialog', () => {
  it('disables Reassign until a member is picked', () => {
    const onConfirm = vi.fn();
    render(
      <ReassignDialog
        open
        isPending={false}
        title="Reassign Owner"
        members={MEMBERS}
        currentAssigneeId="user-1"
        onOpenChange={() => {}}
        onConfirm={onConfirm}
      />,
    );
    expect(screen.getByRole('button', { name: 'Reassign' })).toHaveProperty('disabled', true);
  });

  it('calls onConfirm with the picked member id', () => {
    const onConfirm = vi.fn();
    render(
      <ReassignDialog
        open
        isPending={false}
        title="Reassign Owner"
        members={MEMBERS}
        currentAssigneeId="user-1"
        onOpenChange={() => {}}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByText('Bob'));
    fireEvent.click(screen.getByRole('button', { name: 'Reassign' }));
    expect(onConfirm).toHaveBeenCalledWith('user-2');
  });
});
```

This interaction pattern (`fireEvent.click(screen.getByRole('combobox'))` then `fireEvent.click(screen.getByText(label))`) is confirmed to match `apps/client/src/components/ui/__tests__/combobox.unit.test.tsx`'s own existing tests exactly.

- [ ] **Step 2: Run to verify failure**

Run: `yarn nx test client -t "ReassignDialog"`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `ReassignDialog`**

Create `apps/client/src/components/shared/ReassignDialog.tsx`:

```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Combobox } from '@/components/ui/combobox';
import { Button } from '@/components/ui/button';

interface ReassignMember {
  userId: string;
  displayName?: string;
  email?: string;
}

interface ReassignDialogProps {
  open: boolean;
  isPending: boolean;
  title: string;
  members: ReassignMember[];
  currentAssigneeId: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (newAssigneeId: string) => void;
}

export function ReassignDialog({
  open,
  isPending,
  title,
  members,
  currentAssigneeId,
  onOpenChange,
  onConfirm,
}: ReassignDialogProps) {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState('');

  const options = members
    .filter((m) => m.userId !== currentAssigneeId)
    .map((m) => ({ value: m.userId, label: m.displayName ?? m.email ?? m.userId }));

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setSelectedId('');
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <Combobox
          options={options}
          value={selectedId}
          onChange={setSelectedId}
          placeholder={t('reassign.selectMember')}
          searchPlaceholder={t('reassign.searchMembers')}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('reassign.cancel')}
          </Button>
          <Button
            disabled={!selectedId || isPending}
            onClick={() => onConfirm(selectedId)}
          >
            {t('reassign.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

`Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogFooter` (all confirmed exported from `apps/client/src/components/ui/dialog.tsx`) and `Combobox`'s `{options, value, onChange, placeholder, searchPlaceholder}` props (confirmed from `apps/client/src/components/ui/combobox.tsx`) match this sketch exactly — no adjustment expected.

- [ ] **Step 4: Run to verify pass**

Run: `yarn nx test client -t "ReassignDialog"`
Expected: PASS (both tests). Fix any prop-name mismatches surfaced against the real `Dialog`/`Combobox` components.

- [ ] **Step 5: Add i18n keys**

In `libs/template-shared/src/lib/i18n/locales/en.ts`, add a new top-level key group (find a natural insertion point, e.g. directly after the `org` key group closes) :

```ts
  reassign: {
    selectMember: 'Select a member…',
    searchMembers: 'Search members…',
    cancel: 'Cancel',
    confirm: 'Reassign',
  },
```

Mirror the same 4 keys (translated) into `ru.ts`, `he.ts`, `es.ts` at the equivalent structural position — match this repo's existing 4-locale-parity precedent from the org-invite-followups work earlier this session (`libs/template-shared/src/lib/i18n/locales/{en,ru,he,es}.ts` all got the same new keys together).

- [ ] **Step 6: Format, lint, build**

```bash
npx prettier --write apps/client/src/components/shared/ReassignDialog.tsx apps/client/src/components/shared/__tests__/ReassignDialog.unit.test.tsx libs/template-shared/src/lib/i18n/locales/en.ts libs/template-shared/src/lib/i18n/locales/ru.ts libs/template-shared/src/lib/i18n/locales/he.ts libs/template-shared/src/lib/i18n/locales/es.ts
yarn nx lint client && yarn nx lint template-shared
yarn nx build client && yarn nx build template-shared
```

- [ ] **Step 7: Commit**

```bash
git add apps/client/src/components/shared/ReassignDialog.tsx apps/client/src/components/shared/__tests__/ReassignDialog.unit.test.tsx libs/template-shared/src/lib/i18n/locales/en.ts libs/template-shared/src/lib/i18n/locales/ru.ts libs/template-shared/src/lib/i18n/locales/he.ts libs/template-shared/src/lib/i18n/locales/es.ts
git commit -m "feat(client): add shared ReassignDialog component"
```

---

### Task 8: Wire `IssueDetailSheet` (owner + validator)

**Files:**
- Modify: `apps/client/src/components/issues/IssueDetailSheet.tsx`
- Modify: `apps/client/src/components/issues/__tests__/IssueDetailSheet.unit.test.tsx`

**Interfaces:**
- Consumes: `ReassignDialog` (Task 7), `useReassignIssueOwner`/`useReassignIssueValidator` (Task 6), `useOrgMembers` (existing, already imported in this file per this session's earlier work).

- [ ] **Step 1: Write the failing test**

In `apps/client/src/components/issues/__tests__/IssueDetailSheet.unit.test.tsx`, add mocks for the two new hooks near the existing `vi.mock('@/queries/issues', ...)` block — extend that mock's returned object to include:

```ts
  useReassignIssueOwner: () => ({ mutate: mockReassignOwner, isPending: false }),
  useReassignIssueValidator: () => ({ mutate: mockReassignValidator, isPending: false }),
```

and declare `const mockReassignOwner = vi.fn();` / `const mockReassignValidator = vi.fn();` alongside the existing `mockSubmit`/`mockReview` declarations. Then add this test at the end of the file, before the closing `});` of the outer `describe`:

```ts
  it('shows an Owner row on the overview tab with a reassign control for a manager', () => {
    renderSheet(baseIssue);
    expect(screen.getByText('Owner One')).toBeDefined();
  });
```

`activeMembers` already contains `{ userId: 'owner-1', displayName: 'Owner One', ... }` from this file's existing fixtures (confirmed in this session's earlier work on this same file) — this test only requires the Overview tab to actually render that name, which it currently does not.

- [ ] **Step 2: Run to verify failure**

Run: `yarn nx test client -t "shows an Owner row"`
Expected: FAIL — "Owner One" not found (Overview tab currently only renders description/severity/status).

- [ ] **Step 3: Add the Owner row to the Overview tab**

In `apps/client/src/components/issues/IssueDetailSheet.tsx`, find the Overview tab block (`{tab === 'overview' && (`) and add a new `<p>` directly after the Status line:

```tsx
              <p className="flex items-center gap-2">
                {t('issues.detail.owner')}: <strong>{resolveMemberName(issue.ownerId ?? '')}</strong>
                {canManage && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => setReassignTarget('owner')}
                  >
                    <UserCog size={13} />
                    <span className="sr-only">{t('issues.detail.reassignOwner')}</span>
                  </Button>
                )}
              </p>
```

- [ ] **Step 4: Add supporting state, `canManage`, and imports**

In the same file, add `UserCog` to the existing `lucide-react` import if this file has one (it currently does not import any lucide icons — add `import { UserCog } from 'lucide-react';` near the top). Add the two new hook imports to the existing `import { useIssueValidations, useSubmitIssueForValidation, useReviewIssueValidation } from '@/queries/issues';` line (widen to include `useReassignIssueOwner, useReassignIssueValidator`). Add `import { ReassignDialog } from '@/components/shared/ReassignDialog';`.

Inside the component function, directly after the existing `const { data: allMembers = [] } = useOrgMembers(orgId, { includeInactive: true });` line, add:

```ts
  const myMembership = members.find((m) => m.userId === currentUserId);
  const canManage = myMembership?.role === 'owner' || myMembership?.role === 'admin';
  const reassignOwnerMut = useReassignIssueOwner(orgId);
  const reassignValidatorMut = useReassignIssueValidator(orgId);
  const [reassignTarget, setReassignTarget] = useState<'owner' | 'validator' | null>(null);
```

Note: `members` here is the active-only list already fetched by this file (`const { data: members = [] } = useOrgMembers(orgId);`) — confirmed present from this session's earlier work. Do not confuse it with `allMembers` (includeInactive), which must NOT be used for the `canManage` computation (a deactivated admin should not retain manage rights).

- [ ] **Step 5: Render the two `ReassignDialog` instances**

Near the end of the component's JSX (alongside wherever this file's other overlay/dialog elements are rendered, if any — otherwise directly before the closing `</Sheet>`), add:

```tsx
      <ReassignDialog
        open={reassignTarget === 'owner'}
        isPending={reassignOwnerMut.isPending}
        title={t('issues.detail.reassignOwner')}
        members={members}
        currentAssigneeId={issue.ownerId ?? ''}
        onOpenChange={(open) => !open && setReassignTarget(null)}
        onConfirm={(newOwnerId) => {
          reassignOwnerMut.mutate(
            { id: issue.id, newOwnerId },
            { onSuccess: () => setReassignTarget(null) },
          );
        }}
      />
      {pendingValidation && (
        <ReassignDialog
          open={reassignTarget === 'validator'}
          isPending={reassignValidatorMut.isPending}
          title={t('issues.detail.reassignValidator')}
          members={members}
          currentAssigneeId={pendingValidation.validatorId}
          onOpenChange={(open) => !open && setReassignTarget(null)}
          onConfirm={(newValidatorId) => {
            reassignValidatorMut.mutate(
              { id: pendingValidation.id, issueId: issue.id, newValidatorId },
              { onSuccess: () => setReassignTarget(null) },
            );
          }}
        />
      )}
```

- [ ] **Step 6: Add the reassign button next to the pending validator's name**

In the Validation tab section, find the `<p>{t('issues.detail.pendingValidationFor', { name: resolveMemberName(...) })}</p>` block (added earlier this session) and add a reassign button directly after it, gated on `canManage`:

```tsx
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => setReassignTarget('validator')}
                    >
                      <UserCog size={13} />
                      <span className="sr-only">{t('issues.detail.reassignValidator')}</span>
                    </Button>
                  )}
```

Read the actual current JSX structure around this line first (it may need wrapping in a flex container to sit the button next to the `<p>` rather than on its own line) — match this file's existing spacing/layout conventions rather than introducing a new one.

- [ ] **Step 7: Add the two new i18n keys**

In `libs/template-shared/src/lib/i18n/locales/en.ts` (and mirrored in `ru.ts`/`he.ts`/`es.ts`), find the `issues: { detail: { ... } }` nesting and add:

```ts
      owner: 'Owner',
      reassignOwner: 'Reassign Owner',
      reassignValidator: 'Reassign Validator',
```

- [ ] **Step 8: Run to verify pass**

Run: `yarn nx test client -t "IssueDetailSheet"`
Expected: PASS — all existing tests plus the new one.

- [ ] **Step 9: Format, lint, build**

```bash
npx prettier --write apps/client/src/components/issues/IssueDetailSheet.tsx apps/client/src/components/issues/__tests__/IssueDetailSheet.unit.test.tsx libs/template-shared/src/lib/i18n/locales/en.ts libs/template-shared/src/lib/i18n/locales/ru.ts libs/template-shared/src/lib/i18n/locales/he.ts libs/template-shared/src/lib/i18n/locales/es.ts
yarn nx lint client && yarn nx lint template-shared
yarn nx build client && yarn nx build template-shared
```

- [ ] **Step 10: Commit**

```bash
git add apps/client/src/components/issues/IssueDetailSheet.tsx apps/client/src/components/issues/__tests__/IssueDetailSheet.unit.test.tsx libs/template-shared/src/lib/i18n/locales/en.ts libs/template-shared/src/lib/i18n/locales/ru.ts libs/template-shared/src/lib/i18n/locales/he.ts libs/template-shared/src/lib/i18n/locales/es.ts
git commit -m "feat(client): wire issue owner and validator reassignment into IssueDetailSheet"
```

---

### Task 9: Wire assessment detail page + risk detail page (approver ×2, batched — same shape)

**Files:**
- Modify: `apps/client/src/routes/_dashboard/-assessment-detail.page.tsx`
- Modify: `apps/client/src/routes/_dashboard/__tests__/assessment-detail.unit.test.tsx`
- Modify: `apps/client/src/routes/_dashboard/-risks-detail.page.tsx`
- Modify: `apps/client/src/routes/_dashboard/__tests__/risks-detail.unit.test.tsx`

**Interfaces:**
- Consumes: `ReassignDialog` (Task 7), `useReassignAssessmentApprover` (Task 6), `useReassignRiskAcceptanceApprover` (Task 6), `useOrgMembers` (existing in assessment-detail page; needs adding in risk-detail page).

- [ ] **Step 1: Write the failing assessment test**

In `apps/client/src/routes/_dashboard/__tests__/assessment-detail.unit.test.tsx`, the render helper is `async function renderDetailPage()` (dynamically imports `AssessmentDetailPage` and renders it inside `wrap(...)`), `mockCurrentUserId` defaults to `'Alice'` in each test's `beforeEach`, and the `useOrgMembers` mock (module-level `vi.mock('@/queries/org-members', ...)`) already returns `[{ userId: 'Alice', displayName: 'Alice', email: 'alice@x.com', role: 'owner' }, { userId: 'Carol', displayName: 'Carol', email: 'carol@x.com', role: 'member' }]` — Alice is already the manager by default, no extra setup needed. `mockAssessment.approverId` is `'Carol'` by default when `status: 'pending_review'` (see existing tests at lines ~249/261). Add this test inside the existing `describe('AssessmentDetailPage', ...)` block:

```ts
  it('shows a reassign control next to the Approver field for a manager', async () => {
    mockAssessment = { ...mockAssessment, status: 'pending_review', approverId: 'Carol' };
    await renderDetailPage();
    expect(screen.getByRole('button', { name: /reassign approver/i })).toBeDefined();
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `yarn nx test client -t "reassign control next to the Approver"`
Expected: FAIL.

- [ ] **Step 3: Add `action` support to the `Field` component**

In `apps/client/src/routes/_dashboard/-assessment-detail.page.tsx`, add `import type { ReactNode } from 'react';` to the existing `import { useState } from 'react';` line (widen it to `import { useState, type ReactNode } from 'react';`). Then find `function Field({ label, value }: { label: string; value: string }) {` and widen it:

```tsx
function Field({
  label,
  value,
  action,
}: {
  label: string;
  value: string;
  action?: ReactNode;
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-foreground flex items-center gap-1">
        {value || '—'}
        {action}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add `canManage`, mutation hook, dialog state, and imports**

Add `import { UserCog } from 'lucide-react';` (or widen an existing lucide import if one exists in this file — check first). Add `import { ReassignDialog } from '@/components/shared/ReassignDialog';` and `import { useReassignAssessmentApprover } from '@/queries/assessments';` (widen the existing `@/queries/assessments` import if one is already present). Directly after the existing `const { data: members = [] } = useOrgMembers(orgId, { includeInactive: true });` line (added in this session's earlier work), add:

```ts
  const activeMembers = members.filter((m) => m.isActive !== false);
  const myMembership = activeMembers.find((m) => m.userId === currentUserId);
  const canManage = myMembership?.role === 'owner' || myMembership?.role === 'admin';
  const reassignApproverMut = useReassignAssessmentApprover(orgId, id);
  const [reassignOpen, setReassignOpen] = useState(false);
```

Note: this page's existing `useOrgMembers(orgId, { includeInactive: true })` call (added in this session's earlier member-display-name fix) returns a list that INCLUDES inactive members — filter to `activeMembers` before computing `canManage` and before passing to `ReassignDialog`'s `members` prop, so a deactivated admin can't retain manage rights and can't be offered as a reassignment target.

- [ ] **Step 5: Wire the Approver `Field`'s action and render the dialog**

Change the existing `<Field label={t('assessments.approver')} value={memberName(assessment.approverId)} />` line to:

```tsx
          <Field
            label={t('assessments.approver')}
            value={memberName(assessment.approverId)}
            action={
              canManage && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => setReassignOpen(true)}
                >
                  <UserCog size={13} />
                  <span className="sr-only">{t('assessments.reassignApprover')}</span>
                </Button>
              )
            }
          />
```

Add the dialog render near this file's other overlay elements (or before the component's closing return):

```tsx
      <ReassignDialog
        open={reassignOpen}
        isPending={reassignApproverMut.isPending}
        title={t('assessments.reassignApprover')}
        members={activeMembers}
        currentAssigneeId={assessment.approverId ?? ''}
        onOpenChange={setReassignOpen}
        onConfirm={(newApproverId) => {
          reassignApproverMut.mutate(
            { newApproverId },
            { onSuccess: () => setReassignOpen(false) },
          );
        }}
      />
```

Check whether `Button` is already imported in this file — add the import if not.

- [ ] **Step 6: Add the i18n key**

In `libs/template-shared/src/lib/i18n/locales/en.ts` (mirrored in `ru.ts`/`he.ts`/`es.ts`), find the `assessments:` key group and add:

```ts
    reassignApprover: 'Reassign Approver',
```

- [ ] **Step 7: Run to verify pass**

Run: `yarn nx test client -t "reassign control next to the Approver"`
Expected: PASS.

- [ ] **Step 8: Repeat the same shape for the risk detail page's RiskAcceptance panel**

The test file is `apps/client/src/routes/_dashboard/__tests__/risks-detail.unit.test.tsx`. Its render helper is `async function renderDetailPage()` (imports `RiskDetailPage` from `../-risks-detail.page`). `useAuthStore` is mocked to always return `{ user: { id: 'Carol', ... } }`. There is currently no `useOrgMembers` mock in this file at all (confirmed by reading it) — add one. The existing `vi.mock('@/queries/risks', () => ({ ... }))` block already lists `useApproveRiskAcceptance`/`useRejectRiskAcceptance` etc. — widen it to add `useReassignRiskAcceptanceApprover`, and declare `const mockReassignApproverMutate = vi.fn();` directly after the existing `const mockApproveAcceptanceMutate = vi.fn();` line. Add this test inside `describe('RiskDetailPage', ...)`, directly after the existing `'renders Approve/Reject buttons for an active acceptance and calls their mutations'` test:

```ts
  it('shows a reassign control next to the Approver in the acceptance panel', async () => {
    mockActiveAcceptance = {
      id: 'acc-1',
      riskId: 'r1',
      orgId: 'org1',
      requestedBy: 'Alice',
      justification: 'Compensating controls in place.',
      compensatingControls: 'EDR + quarterly access review',
      expiresAt: '2026-12-31T00:00:00Z',
      approverId: 'Carol',
      status: 'requested',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    await renderDetailPage();
    fireEvent.click(screen.getByText('Treatment'));
    expect(screen.getByRole('button', { name: /reassign approver/i })).toBeDefined();
  });
```

Then add the new mock and widen the existing one:

```ts
vi.mock('@/queries/org-members', () => ({
  useOrgMembers: () => ({
    data: [
      { userId: 'Carol', displayName: 'Carol', email: 'carol@example.com', role: 'owner' },
      { userId: 'Dave', displayName: 'Dave', email: 'dave@example.com', role: 'member' },
    ],
  }),
}));
```

(add this as its own `vi.mock` call near the existing `vi.mock('@/stores/active-org', ...)` block) and add `useReassignRiskAcceptanceApprover: () => ({ mutate: mockReassignApproverMutate, isPending: false }),` inside the existing `vi.mock('@/queries/risks', () => ({ ... }))` object, directly after the `useRejectRiskAcceptance` line.

Then, in the actual page component, add:

- `import { useOrgMembers } from '@/queries/org-members';`
- `import { useReassignRiskAcceptanceApprover } from '@/queries/risks';`
- `import { ReassignDialog } from '@/components/shared/ReassignDialog';`
- `import { UserCog } from 'lucide-react';` (widen existing lucide import if present)

Inside the component, add:

```ts
  const { data: members = [] } = useOrgMembers(activeOrgId ?? '', { includeInactive: true });
  const activeMembers = members.filter((m) => m.isActive !== false);
  const myMembership = activeMembers.find((m) => m.userId === currentUserId);
  const canManage = myMembership?.role === 'owner' || myMembership?.role === 'admin';
  const reassignApproverMut = useReassignRiskAcceptanceApprover(id);
  const [reassignOpen, setReassignOpen] = useState(false);

  function resolveMemberName(userId: string): string {
    const member = members.find((m) => m.userId === userId);
    return member?.displayName ?? member?.email ?? userId;
  }
```

Check whether `currentUserId` already exists in this file (it's referenced at the existing `currentUserId === activeAcceptance.approverId` check) — reuse it, don't redeclare.

In the RiskAcceptance panel block, find the existing `<p className="text-xs text-muted-foreground">{t('risks.expiresAt')}: {activeAcceptance.expiresAt.slice(0, 10)}</p>` line and add directly after it:

```tsx
                <p className="flex items-center gap-2">
                  {t('risks.approver')}: <strong>{resolveMemberName(activeAcceptance.approverId)}</strong>
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => setReassignOpen(true)}
                    >
                      <UserCog size={13} />
                      <span className="sr-only">{t('risks.reassignApprover')}</span>
                    </Button>
                  )}
                </p>
```

Add the dialog render near the panel's other overlay elements:

```tsx
                <ReassignDialog
                  open={reassignOpen}
                  isPending={reassignApproverMut.isPending}
                  title={t('risks.reassignApprover')}
                  members={activeMembers}
                  currentAssigneeId={activeAcceptance.approverId}
                  onOpenChange={setReassignOpen}
                  onConfirm={(newApproverId) => {
                    reassignApproverMut.mutate(
                      { id: activeAcceptance.id, newApproverId },
                      { onSuccess: () => setReassignOpen(false) },
                    );
                  }}
                />
```

Add i18n keys `risks.approver: 'Approver'` and `risks.reassignApprover: 'Reassign Approver'` to all 4 locale files.

- [ ] **Step 9: Run the risk-detail test to verify pass**

Run: `yarn nx test client -t "reassign control next to the Approver in the acceptance panel"`
Expected: FAIL before the page changes in Step 8's second half are applied, PASS after. Also re-run `yarn nx test client -t "reassign control next to the Approver field"` (the assessment test from Step 1) to confirm it still passes — both tests share the `/reassign approver/i` name pattern but target different files, so run them separately if the filter matches both unexpectedly.

- [ ] **Step 10: Format, lint, build**

```bash
npx prettier --write apps/client/src/routes/_dashboard/-assessment-detail.page.tsx apps/client/src/routes/_dashboard/-risks-detail.page.tsx apps/client/src/routes/_dashboard/__tests__/assessment-detail.unit.test.tsx apps/client/src/routes/_dashboard/__tests__/risks-detail.unit.test.tsx libs/template-shared/src/lib/i18n/locales/en.ts libs/template-shared/src/lib/i18n/locales/ru.ts libs/template-shared/src/lib/i18n/locales/he.ts libs/template-shared/src/lib/i18n/locales/es.ts
yarn nx lint client && yarn nx lint template-shared
yarn nx build client && yarn nx build template-shared
```

- [ ] **Step 11: Commit**

```bash
git add apps/client/src/routes/_dashboard/-assessment-detail.page.tsx apps/client/src/routes/_dashboard/-risks-detail.page.tsx apps/client/src/routes/_dashboard/__tests__/assessment-detail.unit.test.tsx apps/client/src/routes/_dashboard/__tests__/risks-detail.unit.test.tsx libs/template-shared/src/lib/i18n/locales/en.ts libs/template-shared/src/lib/i18n/locales/ru.ts libs/template-shared/src/lib/i18n/locales/he.ts libs/template-shared/src/lib/i18n/locales/es.ts
git commit -m "feat(client): wire assessment and risk-acceptance approver reassignment"
```

---

### Task 10: Wire `ExceptionDetailSheet` (owner) + full live Playwright verification

**Files:**
- Modify: `apps/client/src/components/exceptions/ExceptionDetailSheet.tsx`
- Modify: `apps/client/src/components/exceptions/__tests__/ExceptionDetailSheet.unit.test.tsx`

**Interfaces:**
- Consumes: `ReassignDialog` (Task 7), `useReassignExceptionOwner` (Task 6).

- [ ] **Step 1: Write the failing test**

`apps/client/src/components/exceptions/__tests__/ExceptionDetailSheet.unit.test.tsx` has no `useOrgMembers` mock today — add one. `mockCurrentUserId` defaults to `'owner-1'`, and `baseException.ownerId` is also `'owner-1'` — but `canManage` in this component is computed from org-membership role (not from `exception.ownerId`, which is a different concept), so the new mock must give `'owner-1'` an org role of `'owner'` for the default test setup to already be a manager. Add this `vi.mock` call near the existing `vi.mock('@/queries/risks', ...)` block:

```ts
vi.mock('@/queries/org-members', () => ({
  useOrgMembers: () => ({
    data: [
      { userId: 'owner-1', displayName: 'Org Owner', email: 'org-owner@example.com', role: 'owner' },
      { userId: 'reviewer-1', displayName: 'Reviewer One', email: 'reviewer@example.com', role: 'viewer' },
    ],
  }),
}));
```

Add `useReassignExceptionOwner: () => ({ mutate: vi.fn(), isPending: false }),` to the existing `vi.mock('@/queries/exceptions', () => ({ ... }))` object, directly after `useRejectException`. Then add this test inside the existing `describe('ExceptionDetailSheet', ...)` block, after its other tests:

```ts
  it('shows an Owner row with a reassign control for a manager', () => {
    renderSheet(baseException);
    expect(screen.getByText('Org Owner')).toBeDefined();
    expect(screen.getByRole('button', { name: /reassign owner/i })).toBeDefined();
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `yarn nx test client -t "shows an Owner row with a reassign control"`
Expected: FAIL — no Owner row exists yet in the Overview tab.

- [ ] **Step 3: Add Owner display + reassign wiring**

In `apps/client/src/components/exceptions/ExceptionDetailSheet.tsx`:
- Add `import { useOrgMembers } from '@/queries/org-members';`, `import { useReassignExceptionOwner } from '@/queries/exceptions';`, `import { ReassignDialog } from '@/components/shared/ReassignDialog';`, `import { UserCog } from 'lucide-react';` (widen if a lucide import already exists).
- Add, near the existing `const isOwner = currentUserId === exception.ownerId;` line:

```ts
  const { data: members = [] } = useOrgMembers(orgId, { includeInactive: true });
  const activeMembers = members.filter((m) => m.isActive !== false);
  const myMembership = activeMembers.find((m) => m.userId === currentUserId);
  const canManage = myMembership?.role === 'owner' || myMembership?.role === 'admin';
  const reassignOwnerMut = useReassignExceptionOwner(orgId);
  const [reassignOpen, setReassignOpen] = useState(false);

  function resolveMemberName(userId: string): string {
    const member = members.find((m) => m.userId === userId);
    return member?.displayName ?? member?.email ?? userId;
  }
```

Check whether `useState` is already imported (it is, per this component's existing local state).

- In the Overview tab, find the block rendering `{t('exceptions.detail.linkedRisk')}: ...` and add a new `<p>` directly after it:

```tsx
              <p className="flex items-center gap-2">
                {t('exceptions.detail.owner')}: <strong>{resolveMemberName(exception.ownerId)}</strong>
                {canManage && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => setReassignOpen(true)}
                  >
                    <UserCog size={13} />
                    <span className="sr-only">{t('exceptions.detail.reassignOwner')}</span>
                  </Button>
                )}
              </p>
```

Check whether `Button` is already imported (it is, per the existing Approve/Reject buttons in this file).

- Add the dialog render near this file's other overlay elements:

```tsx
      <ReassignDialog
        open={reassignOpen}
        isPending={reassignOwnerMut.isPending}
        title={t('exceptions.detail.reassignOwner')}
        members={activeMembers}
        currentAssigneeId={exception.ownerId}
        onOpenChange={setReassignOpen}
        onConfirm={(newOwnerId) => {
          reassignOwnerMut.mutate(
            { id: exception.id, newOwnerId },
            { onSuccess: () => setReassignOpen(false) },
          );
        }}
      />
```

- [ ] **Step 4: Add i18n keys**

In `libs/template-shared/src/lib/i18n/locales/en.ts` (mirrored in `ru.ts`/`he.ts`/`es.ts`), find `exceptions: { detail: { ... } }` and add:

```ts
      owner: 'Owner',
      reassignOwner: 'Reassign Owner',
```

- [ ] **Step 5: Run to verify pass**

Run: `yarn nx test client -t "ExceptionDetailSheet"`
Expected: PASS.

- [ ] **Step 6: Format, lint, build, full client regression**

```bash
npx prettier --write apps/client/src/components/exceptions/ExceptionDetailSheet.tsx apps/client/src/components/exceptions/__tests__/ExceptionDetailSheet.unit.test.tsx libs/template-shared/src/lib/i18n/locales/en.ts libs/template-shared/src/lib/i18n/locales/ru.ts libs/template-shared/src/lib/i18n/locales/he.ts libs/template-shared/src/lib/i18n/locales/es.ts
yarn nx lint client && yarn nx lint template-shared
yarn nx build client && yarn nx build template-shared
yarn nx test client
```

Expected: full client suite green — this is the last client task.

- [ ] **Step 7: Commit**

```bash
git add apps/client/src/components/exceptions/ExceptionDetailSheet.tsx apps/client/src/components/exceptions/__tests__/ExceptionDetailSheet.unit.test.tsx libs/template-shared/src/lib/i18n/locales/en.ts libs/template-shared/src/lib/i18n/locales/ru.ts libs/template-shared/src/lib/i18n/locales/he.ts libs/template-shared/src/lib/i18n/locales/es.ts
git commit -m "feat(client): wire exception owner reassignment into ExceptionDetailSheet"
```

- [ ] **Step 8: Mandatory live Playwright verification (required by `AGENTS.md` before this plan can be reported done)**

With the dev stack running (transport-only `.env` files, Fake strategies — same pattern used throughout this session) and 3 real signed-up org members (owner, member A, member B):

1. As owner: create an issue owned by owner, submit it for validation assigning member A as validator.
2. As member A: reject the validation (creates history).
3. As owner: reassign the issue's owner to member A via the new Overview-tab control; confirm the Owner row updates and no console error appears.
4. As owner: create a new issue, submit for validation to member A again, then use the Validation tab's reassign control to reassign the pending validation to member B; confirm member B (not member A) can now approve/reject it, and member A can no longer act on it.
5. Repeat an equivalent reassign-then-act round-trip for at least one of Assessment approver, RiskAcceptance approver, or Exception owner (pick whichever is fastest to set up given current dev-data state) to confirm the pattern generalizes, not just the Issue case.
6. Screenshot or note console/network state at each step per this repo's `AGENTS.md` "no self-report without proof" rule.

Only after this passes should the branch be considered ready for `superpowers:finishing-a-development-branch`.

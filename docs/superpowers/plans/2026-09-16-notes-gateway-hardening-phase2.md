# Notes Gateway Hardening — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `checkOrgAccess` (or equivalent org-resolution + guard) to the 37 remaining unguarded routes across Framework instance-data, InternalControl, Standards, Gap analysis, and Policy in `apps/api/src/app/notes/notes.controller.ts`, closing the cross-org read/write exposure Phase 1 (PR #58) left in scope for a later pass.

**Architecture:** Every route in this file already sits behind a global `AuthGuard` (bearer-token required). The fix pattern, proven across ~40 already-correct routes and reused unchanged here: resolve the resource's owning `Organization` (either directly, via an existing `getX(id)` call, or via a new one-line getter where none exists yet), then call the existing private `checkOrgAccess(req, org, action)` helper before touching the resource. No new abstraction, no decorator, no generic dispatcher — same reasoning as every other phase this session (prove the concrete pattern before generalizing).

**Tech Stack:** NestJS gateway (`apps/api`), Vitest unit tests, existing `AbilityFactory`/CASL-based `checkOrgAccess`.

**Spec:** `docs/superpowers/specs/2026-09-16-notes-gateway-hardening-phase2-design.md`

## Global Constraints

- Every fixed route must copy the exact existing `checkOrgAccess(req, org, action)` pattern already used by ~40 correct routes in this same file — no new helper, no new decorator, no generic cross-resource dispatcher.
- `action` is `'read'` for GET routes, `'update'` for POST/PATCH routes that don't delete, `'delete'` for DELETE routes — matching the convention already used throughout the file.
- Framework catalog routes (`frameworks`, `frameworks/:id`, `frameworks/:id/requirements`, `frameworks/:id/requirements/:reqId`, `frameworks/:id/controls`) and `policy-templates` are confirmed genuinely org-agnostic (platform-wide catalog data, no `orgId` anywhere in their schema) — do not touch them, do not add any guard.
- No self-approval-guard work of any kind — none of these 5 resource types have single-actor approval workflows.
- Standards' `transitionWorkflow` already has a `supersede`-rejection guard inside both strategies (Fake: `fake-notes.ts:3163`, Supabase: `supabase-notes.strategy.ts:1149`) from the Policy Lifecycle fix wave — do not touch that guard; the org-scoping fix in this plan is added at the gateway route level only, wrapping the existing strategy call, not modifying it.
- `listPoliciesForControl` is the one route needing an interface/signature change (add a required `orgId: string` parameter) rather than a pure bolt-on — threaded through all 5 layers (interface, Fake, Supabase, MS handler, notes-client, gateway route). This is a deliberate, approved exception to "gateway-only fix," not scope creep.
- `removePolicyControl` needs one new capability method, `getPolicyControl(id: string): Promise<PolicyControl | null>`, added to both strategies — the same class of gap Phase 1 already normalized fixing (Phase 1 added `getRiskAcceptance`, `getRiskTaxonomyCategory`, `getAssessmentType`, `getAssessmentItemControlMapping` for the identical reason: a delete/mutation route had no way to resolve its owning org without a new getter).
- Post-coding routine before every commit: `npx prettier --write <files>` → `yarn nx lint <project>` → `yarn nx build <project>` — all green.
- New/extended gateway test files follow the established convention exactly (see `apps/api/src/app/notes/__tests__/policies.controller.unit.test.ts`): a `makeNotes(overrides)` factory returning a mocked `NotesClientService`, a `makeController(notes)` factory, a `reqAs(uid)` helper building a fake `Request`, and per-route `describe` blocks with at minimum: outsider-from-another-org rejected, org creator/member allowed, not-found case.
- `listPoliciesForControl`'s test additionally covers the cross-org leak scenario directly: two orgs, overlapping control/framework mapping, confirm no cross-org policy rows leak into the response after the fix.

---

## Task 1: Framework instance-data GET routes

**Files:**
- Modify: `apps/api/src/app/notes/notes.controller.ts:471-537`
- Test: Create `apps/api/src/app/notes/__tests__/framework.controller.unit.test.ts`

**Interfaces:**
- Consumes: existing `this.notes.getOrganizationById(orgId): Promise<Organization | null>`, existing private `this.checkOrgAccess(req, org, action)`, existing `this.notes.listFrameworkEvidence(frameworkId, orgId?)`, `this.notes.listFrameworkAssessments(frameworkId, orgId?)`, `this.notes.listFrameworkActivities(frameworkId, orgId?)` — all three strategy methods are unchanged, `orgId` stays optional at that layer (this is a gateway-only fix).
- Produces: nothing new consumed by later tasks.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/app/notes/__tests__/framework.controller.unit.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import type { AiClientService } from '@icore/ai-client';
import type { NotesClientService } from '@icore/notes-client';
import type { Organization, VerifiedToken } from '@icore/shared';
import { NotesController } from '../notes.controller';
import { AbilityFactory } from '../../abilities/ability.factory';
import type { StandardsQueueService } from '../standards-queue.service';

const ORG: Organization = {
  id: 'org-1',
  userId: 'org-creator',
  name: 'Acme',
} as unknown as Organization;

function makeNotes(overrides: Partial<NotesClientService> = {}): NotesClientService {
  return {
    getOrganizationById: vi.fn().mockResolvedValue(ORG),
    listFrameworkEvidence: vi.fn().mockResolvedValue([]),
    listFrameworkAssessments: vi.fn().mockResolvedValue([]),
    listFrameworkActivities: vi.fn().mockResolvedValue([]),
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

describe('NotesController — framework instance-data org scoping', () => {
  describe('listFrameworkEvidence', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).listFrameworkEvidence(reqAs('outsider'), 'fw-1', 'org-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows the org creator', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).listFrameworkEvidence(reqAs('org-creator'), 'fw-1', 'org-1'),
      ).resolves.toEqual([]);
    });

    it('rejects when orgId is missing', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).listFrameworkEvidence(reqAs('org-creator'), 'fw-1', undefined),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFound when the org does not exist', async () => {
      const notes = makeNotes({ getOrganizationById: vi.fn().mockResolvedValue(null) });
      await expect(
        makeController(notes).listFrameworkEvidence(reqAs('org-creator'), 'fw-1', 'missing-org'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('listFrameworkAssessments', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).listFrameworkAssessments(reqAs('outsider'), 'fw-1', 'org-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows the org creator', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).listFrameworkAssessments(reqAs('org-creator'), 'fw-1', 'org-1'),
      ).resolves.toEqual([]);
    });
  });

  describe('listFrameworkActivities', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).listFrameworkActivities(reqAs('outsider'), 'fw-1', 'org-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows the org creator', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).listFrameworkActivities(reqAs('org-creator'), 'fw-1', 'org-1'),
      ).resolves.toEqual([]);
    });
  });
});
```

- [ ] **Step 2: Run tests, confirm they fail**

Run: `yarn nx test api -- framework.controller.unit.test.ts`
Expected: FAIL — the outsider-rejection tests fail because the current handlers never call `checkOrgAccess`, so no `ForbiddenException` is thrown.

- [ ] **Step 3: Implement the fix**

In `apps/api/src/app/notes/notes.controller.ts`, replace lines 471-537 (the 3 target GET handlers plus the 2 already-correct POST siblings stay unchanged — only replace the 3 GETs) with:

```ts
  @Get('frameworks/:id/evidence')
  @ApiOperation({ summary: 'List evidence for a framework' })
  async listFrameworkEvidence(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Query('orgId') orgId?: string,
  ) {
    if (!orgId) throw new BadRequestException('orgId required');
    const org = await this.notes.getOrganizationById(orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'read');
    return this.notes.listFrameworkEvidence(id, orgId);
  }

  @Post('frameworks/:id/evidence')
  @ApiOperation({ summary: 'Add evidence for a framework' })
  async createFrameworkEvidence(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Query('orgId') orgId: string,
    @Body()
    body: Omit<
      RequirementEvidence,
      'id' | 'createdBy' | 'verificationStatus' | 'verifiedBy' | 'verifiedAt' | 'reviewNotes'
    >,
  ) {
    if (!orgId) throw new BadRequestException('orgId required');
    const org = await this.notes.getOrganizationById(orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    const userId = this.uid(req);
    return this.notes.createFrameworkEvidence(orgId, {
      ...body,
      frameworkId: id,
      createdBy: userId,
      verificationStatus: 'pending_review',
      verifiedBy: null,
      verifiedAt: null,
      reviewNotes: null,
    });
  }

  @Get('frameworks/:id/assessments')
  @ApiOperation({ summary: 'List assessment history for a framework' })
  async listFrameworkAssessments(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Query('orgId') orgId?: string,
  ) {
    if (!orgId) throw new BadRequestException('orgId required');
    const org = await this.notes.getOrganizationById(orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'read');
    return this.notes.listFrameworkAssessments(id, orgId);
  }

  @Post('frameworks/:id/assessments/:assessmentId/findings')
  @ApiOperation({ summary: 'Create finding from assessment' })
  async createAssessmentFinding(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') _id: string,
    @Param('assessmentId') assessmentId: string,
    @Body()
    body: {
      title: string;
      severity: 'critical' | 'high' | 'medium' | 'low';
      description: string;
    },
  ) {
    this.uid(req);
    const assessment = await this.notes.getRequirementAssessment(assessmentId);
    if (!assessment || !assessment.orgId) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(assessment.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.createAssessmentFinding(assessment.orgId, assessmentId, body);
  }

  @Get('frameworks/:id/activities')
  @ApiOperation({ summary: 'List activities for a framework' })
  async listFrameworkActivities(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Query('orgId') orgId?: string,
  ) {
    if (!orgId) throw new BadRequestException('orgId required');
    const org = await this.notes.getOrganizationById(orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'read');
    return this.notes.listFrameworkActivities(id, orgId);
  }

  @Get('frameworks/:id/controls')
  @ApiOperation({ summary: 'List controls for a framework' })
  listControls(@Param('id') id: string) {
    return this.notes.listControlsByFramework(id);
  }
```

(`createFrameworkEvidence`, `createAssessmentFinding`, and `listControls` are shown for context/anchoring only — they are byte-for-byte unchanged from the current file. Only the 3 GET handlers above them actually change.)

No new imports needed — `BadRequestException`, `NotFoundException`, `Query`, `Req` are already imported at the top of the file.

- [ ] **Step 4: Run tests, confirm they pass**

Run: `yarn nx test api -- framework.controller.unit.test.ts`
Expected: PASS, all 8 tests.

- [ ] **Step 5: Post-coding routine**

```bash
npx prettier --write apps/api/src/app/notes/notes.controller.ts apps/api/src/app/notes/__tests__/framework.controller.unit.test.ts
yarn nx lint api
yarn nx build api
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/app/notes/notes.controller.ts apps/api/src/app/notes/__tests__/framework.controller.unit.test.ts
git commit -m "fix(notes-gateway): add checkOrgAccess to framework instance-data GET routes"
```

---

## Task 2: InternalControl routes

**Files:**
- Modify: `apps/api/src/app/notes/notes.controller.ts:174-467` (11 handlers, non-contiguous within this range)
- Test: Create `apps/api/src/app/notes/__tests__/internal-controls.controller.unit.test.ts`

**Interfaces:**
- Consumes: existing `this.notes.getInternalControl(id): Promise<InternalControl | null>` (has `.orgId`), existing `this.notes.getOrganizationById(orgId)`, existing `this.checkOrgAccess`. No lower-layer changes.
- Produces: nothing new consumed by later tasks.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/app/notes/__tests__/internal-controls.controller.unit.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import type { AiClientService } from '@icore/ai-client';
import type { NotesClientService } from '@icore/notes-client';
import type { InternalControl, Organization, VerifiedToken } from '@icore/shared';
import { NotesController } from '../notes.controller';
import { AbilityFactory } from '../../abilities/ability.factory';
import type { StandardsQueueService } from '../standards-queue.service';

const ORG: Organization = {
  id: 'org-1',
  userId: 'org-creator',
  name: 'Acme',
} as unknown as Organization;

const CONTROL: InternalControl = {
  id: 'control-1',
  orgId: 'org-1',
  code: 'AC-01',
  title: 'Access Control',
  description: 'D',
  owner: 'org-creator',
} as unknown as InternalControl;

function makeNotes(overrides: Partial<NotesClientService> = {}): NotesClientService {
  return {
    getOrganizationById: vi.fn().mockResolvedValue(ORG),
    getInternalControl: vi.fn().mockResolvedValue(CONTROL),
    listInternalControls: vi.fn().mockResolvedValue([]),
    updateInternalControl: vi.fn().mockResolvedValue(CONTROL),
    deleteInternalControl: vi.fn().mockResolvedValue(undefined),
    addControlFrameworkMapping: vi.fn().mockResolvedValue(CONTROL),
    removeControlFrameworkMapping: vi.fn().mockResolvedValue(CONTROL),
    listControlEvidence: vi.fn().mockResolvedValue([]),
    createControlEvidence: vi.fn().mockResolvedValue({}),
    listControlAssessments: vi.fn().mockResolvedValue([]),
    createControlAssessment: vi.fn().mockResolvedValue({}),
    listControlActivity: vi.fn().mockResolvedValue([]),
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

describe('NotesController — internal control org scoping', () => {
  describe('listInternalControls', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).listInternalControls(reqAs('outsider'), 'org-1'),
      ).rejects.toThrow(ForbiddenException);
    });
    it('allows the org creator', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).listInternalControls(reqAs('org-creator'), 'org-1'),
      ).resolves.toEqual([]);
    });
  });

  describe('getInternalControl', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).getInternalControl(reqAs('outsider'), 'control-1'),
      ).rejects.toThrow(ForbiddenException);
    });
    it('allows the org creator', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).getInternalControl(reqAs('org-creator'), 'control-1'),
      ).resolves.toEqual(CONTROL);
    });
    it('throws NotFound when the control does not exist', async () => {
      const notes = makeNotes({ getInternalControl: vi.fn().mockResolvedValue(null) });
      await expect(
        makeController(notes).getInternalControl(reqAs('org-creator'), 'missing'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateInternalControl', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).updateInternalControl(reqAs('outsider'), 'control-1', {}),
      ).rejects.toThrow(ForbiddenException);
    });
    it('allows the org creator', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).updateInternalControl(reqAs('org-creator'), 'control-1', {}),
      ).resolves.toEqual(CONTROL);
    });
  });

  describe('deleteInternalControl', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).deleteInternalControl(reqAs('outsider'), 'control-1'),
      ).rejects.toThrow(ForbiddenException);
    });
    it('allows the org creator', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).deleteInternalControl(reqAs('org-creator'), 'control-1'),
      ).resolves.toBeUndefined();
    });
  });

  describe('addControlFrameworkMapping', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).addControlFrameworkMapping(reqAs('outsider'), 'control-1', {} as never),
      ).rejects.toThrow(ForbiddenException);
    });
    it('allows the org creator', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).addControlFrameworkMapping(reqAs('org-creator'), 'control-1', {} as never),
      ).resolves.toEqual(CONTROL);
    });
  });

  describe('removeControlFrameworkMapping', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).removeControlFrameworkMapping(reqAs('outsider'), 'control-1', 'map-1'),
      ).rejects.toThrow(ForbiddenException);
    });
    it('allows the org creator', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).removeControlFrameworkMapping(reqAs('org-creator'), 'control-1', 'map-1'),
      ).resolves.toEqual(CONTROL);
    });
  });

  describe('listControlEvidence', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).listControlEvidence(reqAs('outsider'), 'control-1'),
      ).rejects.toThrow(ForbiddenException);
    });
    it('allows the org creator', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).listControlEvidence(reqAs('org-creator'), 'control-1'),
      ).resolves.toEqual([]);
    });
  });

  describe('createControlEvidence', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).createControlEvidence(reqAs('outsider'), 'org-1', 'control-1', {} as never),
      ).rejects.toThrow(ForbiddenException);
    });
    it('allows the org creator', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).createControlEvidence(reqAs('org-creator'), 'org-1', 'control-1', {} as never),
      ).resolves.toEqual({});
    });
  });

  describe('listControlAssessments', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).listControlAssessments(reqAs('outsider'), 'control-1'),
      ).rejects.toThrow(ForbiddenException);
    });
    it('allows the org creator', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).listControlAssessments(reqAs('org-creator'), 'control-1'),
      ).resolves.toEqual([]);
    });
  });

  describe('createControlAssessment', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).createControlAssessment(reqAs('outsider'), 'org-1', 'control-1', {} as never),
      ).rejects.toThrow(ForbiddenException);
    });
    it('allows the org creator', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).createControlAssessment(reqAs('org-creator'), 'org-1', 'control-1', {} as never),
      ).resolves.toEqual({});
    });
  });

  describe('listControlActivity', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).listControlActivity(reqAs('outsider'), 'control-1'),
      ).rejects.toThrow(ForbiddenException);
    });
    it('allows the org creator', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).listControlActivity(reqAs('org-creator'), 'control-1'),
      ).resolves.toEqual([]);
    });
  });
});
```

- [ ] **Step 2: Run tests, confirm they fail**

Run: `yarn nx test api -- internal-controls.controller.unit.test.ts`
Expected: FAIL — every outsider-rejection test fails (no `ForbiddenException` thrown today).

- [ ] **Step 3: Implement the fix**

In `apps/api/src/app/notes/notes.controller.ts`, replace each of the 11 handlers below with its guarded version (exact replacements, by original line number):

Replace `listInternalControls` (:174-184):
```ts
  @Get('internal-controls')
  @ApiOperation({ summary: 'List internal controls for org' })
  async listInternalControls(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId?: string,
    @Query('frameworkId') frameworkId?: string,
  ) {
    this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    const org = await this.notes.getOrganizationById(orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'read');
    return this.notes.listInternalControls(orgId, frameworkId);
  }
```

Replace `getInternalControl` (:200-210):
```ts
  @Get('internal-controls/:id')
  @ApiOperation({ summary: 'Get internal control' })
  async getInternalControl(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
  ) {
    this.uid(req);
    const control = await this.notes.getInternalControl(id);
    if (!control?.orgId) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(control.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'read');
    return control;
  }
```

Replace `updateInternalControl` (:212-221):
```ts
  @Patch('internal-controls/:id')
  @ApiOperation({ summary: 'Update internal control' })
  async updateInternalControl(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() patch: InternalControlPatch,
  ) {
    this.uid(req);
    const control = await this.notes.getInternalControl(id);
    if (!control?.orgId) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(control.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.updateInternalControl(id, patch);
  }
```

Replace `deleteInternalControl` (:223-229):
```ts
  @Delete('internal-controls/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete internal control' })
  async deleteInternalControl(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    const control = await this.notes.getInternalControl(id);
    if (!control?.orgId) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(control.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'delete');
    return this.notes.deleteInternalControl(id);
  }
```

Replace `addControlFrameworkMapping` (:231-240):
```ts
  @Post('internal-controls/:id/mappings')
  @ApiOperation({ summary: 'Add a framework mapping to an internal control' })
  async addControlFrameworkMapping(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: ControlFrameworkMappingInput,
  ) {
    this.uid(req);
    const control = await this.notes.getInternalControl(id);
    if (!control?.orgId) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(control.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.addControlFrameworkMapping(id, body);
  }
```

Replace `removeControlFrameworkMapping` (:242-251):
```ts
  @Delete('internal-controls/:id/mappings/:mappingId')
  @ApiOperation({ summary: 'Remove a framework mapping from an internal control' })
  async removeControlFrameworkMapping(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Param('mappingId') mappingId: string,
  ) {
    this.uid(req);
    const control = await this.notes.getInternalControl(id);
    if (!control?.orgId) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(control.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.removeControlFrameworkMapping(id, mappingId);
  }
```

Replace `listControlEvidence` (:253-258):
```ts
  @Get('internal-controls/:id/evidence')
  @ApiOperation({ summary: 'List evidence attached to an internal control' })
  async listControlEvidence(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    const control = await this.notes.getInternalControl(id);
    if (!control?.orgId) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(control.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'read');
    return this.notes.listControlEvidence(id);
  }
```

Replace `createControlEvidence` (:260-288):
```ts
  @Post('internal-controls/:id/evidence')
  @ApiOperation({ summary: 'Attach evidence to an internal control' })
  async createControlEvidence(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
    @Param('id') id: string,
    @Body()
    body: Omit<
      RequirementEvidence,
      'id' | 'controlId' | 'createdBy' | 'verificationStatus' | 'verifiedBy' | 'verifiedAt' | 'reviewNotes'
    >,
  ) {
    const userId = this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    const org = await this.notes.getOrganizationById(orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.createControlEvidence(orgId, id, {
      ...body,
      createdBy: userId,
      verificationStatus: 'pending_review',
      verifiedBy: null,
      verifiedAt: null,
      reviewNotes: null,
    });
  }
```

Replace `listControlAssessments` (:290-295):
```ts
  @Get('internal-controls/:id/assessments')
  @ApiOperation({ summary: 'List assessments for an internal control' })
  async listControlAssessments(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    const control = await this.notes.getInternalControl(id);
    if (!control?.orgId) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(control.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'read');
    return this.notes.listControlAssessments(id);
  }
```

Replace `createControlAssessment` (:297-308):
```ts
  @Post('internal-controls/:id/assessments')
  @ApiOperation({ summary: 'Record a control assessment (may generate a Finding)' })
  async createControlAssessment(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: Omit<RequirementAssessment, 'id' | 'controlId'>,
  ) {
    this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    const org = await this.notes.getOrganizationById(orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.createControlAssessment(orgId, id, body);
  }
```

Replace `listControlActivity` (:464-468):
```ts
  @Get('internal-controls/:id/activity')
  @ApiOperation({ summary: 'List activity log for an internal control' })
  async listControlActivity(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    const control = await this.notes.getInternalControl(id);
    if (!control?.orgId) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(control.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'read');
    return this.notes.listControlActivity(id);
  }
```

`listControlFindings` (:310-323, already correct) stays byte-for-byte unchanged — do not touch it.

No new imports needed (`InternalControlPatch`, `ControlFrameworkMappingInput`, `RequirementEvidence`, `RequirementAssessment`, `BadRequestException`, `NotFoundException` already imported).

- [ ] **Step 4: Run tests, confirm they pass**

Run: `yarn nx test api -- internal-controls.controller.unit.test.ts`
Expected: PASS, all 23 tests.

- [ ] **Step 5: Post-coding routine**

```bash
npx prettier --write apps/api/src/app/notes/notes.controller.ts apps/api/src/app/notes/__tests__/internal-controls.controller.unit.test.ts
yarn nx lint api
yarn nx build api
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/app/notes/notes.controller.ts apps/api/src/app/notes/__tests__/internal-controls.controller.unit.test.ts
git commit -m "fix(notes-gateway): add checkOrgAccess to internal control routes"
```

---

## Task 3: Standards routes

**Files:**
- Modify: `apps/api/src/app/notes/notes.controller.ts:605-730` (8 handlers)
- Test: Create `apps/api/src/app/notes/__tests__/standards.controller.unit.test.ts`

**Interfaces:**
- Consumes: existing `this.notes.getStandardsDocument(id): Promise<StandardsDocument | null>` (has `.orgId`), existing `this.notes.getSnapshot(id): Promise<StandardsSnapshot | null>` (has `.documentId`, no `.orgId` — must resolve via its parent document), existing `this.notes.getOrganizationById`, existing `this.checkOrgAccess`, existing `this.notes.transitionWorkflow(id, transition)` (unchanged — the `supersede` guard inside it stays untouched).
- Produces: nothing new consumed by later tasks.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/app/notes/__tests__/standards.controller.unit.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import type { AiClientService } from '@icore/ai-client';
import type { NotesClientService } from '@icore/notes-client';
import type { Organization, StandardsDocument, StandardsSnapshot, VerifiedToken } from '@icore/shared';
import { NotesController } from '../notes.controller';
import { AbilityFactory } from '../../abilities/ability.factory';
import type { StandardsQueueService } from '../standards-queue.service';

const ORG: Organization = {
  id: 'org-1',
  userId: 'org-creator',
  name: 'Acme',
} as unknown as Organization;

const DOC: StandardsDocument = {
  id: 'doc-1',
  userId: 'org-creator',
  orgId: 'org-1',
  frameworkIds: ['fw-1'],
  standards: [],
  status: 'ready',
  workflowStatus: 'draft',
  createdAt: '2026-01-01T00:00:00Z',
} as unknown as StandardsDocument;

const SNAPSHOT: StandardsSnapshot = {
  id: 'snap-1',
  documentId: 'doc-1',
  version: 1,
  workflowStatus: 'approved',
  standards: [],
  createdAt: '2026-01-01T00:00:00Z',
} as unknown as StandardsSnapshot;

function makeNotes(overrides: Partial<NotesClientService> = {}): NotesClientService {
  return {
    getOrganizationById: vi.fn().mockResolvedValue(ORG),
    getStandardsDocument: vi.fn().mockResolvedValue(DOC),
    getSnapshot: vi.fn().mockResolvedValue(SNAPSHOT),
    listStandardsDocuments: vi.fn().mockResolvedValue([]),
    transitionWorkflow: vi.fn().mockResolvedValue(DOC),
    logAuditEvent: vi.fn().mockResolvedValue(undefined),
    updateStandard: vi.fn().mockResolvedValue(DOC),
    listSnapshots: vi.fn().mockResolvedValue([]),
    failStandardsDocument: vi.fn().mockResolvedValue(undefined),
    deleteStandardsDocument: vi.fn().mockResolvedValue(undefined),
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

describe('NotesController — standards org scoping', () => {
  describe('listStandards', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).listStandards(reqAs('outsider'), 'org-1'),
      ).rejects.toThrow(ForbiddenException);
    });
    it('allows the org creator', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).listStandards(reqAs('org-creator'), 'org-1'),
      ).resolves.toEqual([]);
    });
  });

  describe('getStandards', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).getStandards(reqAs('outsider'), 'doc-1'),
      ).rejects.toThrow(ForbiddenException);
    });
    it('allows the org creator', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).getStandards(reqAs('org-creator'), 'doc-1'),
      ).resolves.toEqual(DOC);
    });
    it('throws NotFound when the document does not exist', async () => {
      const notes = makeNotes({ getStandardsDocument: vi.fn().mockResolvedValue(null) });
      await expect(
        makeController(notes).getStandards(reqAs('org-creator'), 'missing'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('transitionWorkflow', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).transitionWorkflow(reqAs('outsider'), 'doc-1', { transition: 'submit' }),
      ).rejects.toThrow(ForbiddenException);
      expect(notes.transitionWorkflow).not.toHaveBeenCalled();
    });
    it('allows the org creator', async () => {
      const notes = makeNotes();
      await makeController(notes).transitionWorkflow(reqAs('org-creator'), 'doc-1', {
        transition: 'submit',
      });
      expect(notes.transitionWorkflow).toHaveBeenCalledWith('doc-1', 'submit');
    });
  });

  describe('updateStandard', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).updateStandard(reqAs('outsider'), 'doc-1', 'CODE-1', {}),
      ).rejects.toThrow(ForbiddenException);
    });
    it('allows the org creator', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).updateStandard(reqAs('org-creator'), 'doc-1', 'CODE-1', {}),
      ).resolves.toEqual(DOC);
    });
  });

  describe('listSnapshots', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).listSnapshots(reqAs('outsider'), 'doc-1'),
      ).rejects.toThrow(ForbiddenException);
    });
    it('allows the org creator', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).listSnapshots(reqAs('org-creator'), 'doc-1'),
      ).resolves.toEqual([]);
    });
  });

  describe('getSnapshot', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).getSnapshot(reqAs('outsider'), 'snap-1'),
      ).rejects.toThrow(ForbiddenException);
    });
    it('allows the org creator (resolved via the parent document)', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).getSnapshot(reqAs('org-creator'), 'snap-1'),
      ).resolves.toEqual(SNAPSHOT);
    });
    it('throws NotFound when the snapshot does not exist', async () => {
      const notes = makeNotes({ getSnapshot: vi.fn().mockResolvedValue(null) });
      await expect(
        makeController(notes).getSnapshot(reqAs('org-creator'), 'missing'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteStandards', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).deleteStandards(reqAs('outsider'), 'doc-1'),
      ).rejects.toThrow(ForbiddenException);
    });
    it('allows the org creator', async () => {
      const notes = makeNotes();
      await makeController(notes).deleteStandards(reqAs('org-creator'), 'doc-1');
      expect(notes.deleteStandardsDocument).toHaveBeenCalledWith('doc-1');
    });
  });

  describe('retryStandards', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes({
        getStandardsDocument: vi.fn().mockResolvedValue({ ...DOC, status: 'failed' }),
      });
      await expect(
        makeController(notes).retryStandards(reqAs('outsider'), 'doc-1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
```

- [ ] **Step 2: Run tests, confirm they fail**

Run: `yarn nx test api -- standards.controller.unit.test.ts`
Expected: FAIL — every outsider-rejection test fails (no `ForbiddenException` thrown today).

- [ ] **Step 3: Implement the fix**

Replace `listStandards` (:605-613):
```ts
  @Get('standards')
  @SkipThrottle()
  @ApiOperation({ summary: 'List generated standards documents for an org' })
  async listStandards(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId?: string,
  ) {
    if (!orgId) throw new BadRequestException('orgId required');
    const org = await this.notes.getOrganizationById(orgId);
    if (!org) throw new NotFoundException('org_not_found');
    this.checkOrgAccess(req, org, 'read');
    return this.notes.listStandardsDocuments(orgId);
  }
```

Replace `getStandards` (:616-619):
```ts
  @Get('standards/:id')
  @ApiOperation({ summary: 'Get a standards document' })
  async getStandards(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    const doc = await this.notes.getStandardsDocument(id);
    if (!doc) throw new NotFoundException('doc_not_found');
    const org = await this.notes.getOrganizationById(doc.orgId);
    if (!org) throw new NotFoundException('org_not_found');
    this.checkOrgAccess(req, org, 'read');
    return doc;
  }
```

Replace `transitionWorkflow` (:622-644):
```ts
  @Patch('standards/:id/workflow')
  @ApiOperation({ summary: 'Transition standards document workflow state' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['transition'],
      properties: {
        transition: { type: 'string', enum: ['submit', 'approve', 'reject', 'publish'] },
      },
    },
  })
  async transitionWorkflow(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: { transition: WorkflowTransition },
  ) {
    const doc = await this.notes.getStandardsDocument(id);
    if (!doc) throw new NotFoundException('doc_not_found');
    const org = await this.notes.getOrganizationById(doc.orgId);
    if (!org) throw new NotFoundException('org_not_found');
    this.checkOrgAccess(req, org, 'update');
    const result = await this.notes.transitionWorkflow(id, body.transition);
    const uid = req.user?.uid;
    if (uid) {
      void this.notes.logAuditEvent(uid, `workflow.${body.transition}`, 'standards_document', id);
    }
    return result;
  }
```

Replace `updateStandard` (:646-655):
```ts
  @Patch('standards/:id/standards/:code')
  @ApiOperation({ summary: 'Update a single generated standard (objective, scope)' })
  @ApiBody({ schema: { type: 'object' } })
  async updateStandard(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Param('code') code: string,
    @Body() patch: StandardPatch,
  ) {
    const doc = await this.notes.getStandardsDocument(id);
    if (!doc) throw new NotFoundException('doc_not_found');
    const org = await this.notes.getOrganizationById(doc.orgId);
    if (!org) throw new NotFoundException('org_not_found');
    this.checkOrgAccess(req, org, 'update');
    return this.notes.updateStandard(id, code, patch);
  }
```

Replace `listSnapshots` (:657-660):
```ts
  @Get('standards/:id/snapshots')
  @ApiOperation({ summary: 'List immutable approval snapshots for a standards document' })
  async listSnapshots(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    const doc = await this.notes.getStandardsDocument(id);
    if (!doc) throw new NotFoundException('doc_not_found');
    const org = await this.notes.getOrganizationById(doc.orgId);
    if (!org) throw new NotFoundException('org_not_found');
    this.checkOrgAccess(req, org, 'read');
    return this.notes.listSnapshots(id);
  }
```

Replace `getSnapshot` (:663-666):
```ts
  @Get('standards/snapshots/:snapshotId')
  @ApiOperation({ summary: 'Get a single snapshot by ID' })
  async getSnapshot(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('snapshotId') snapshotId: string,
  ) {
    const snapshot = await this.notes.getSnapshot(snapshotId);
    if (!snapshot) throw new NotFoundException('snapshot_not_found');
    const doc = await this.notes.getStandardsDocument(snapshot.documentId);
    if (!doc) throw new NotFoundException('doc_not_found');
    const org = await this.notes.getOrganizationById(doc.orgId);
    if (!org) throw new NotFoundException('org_not_found');
    this.checkOrgAccess(req, org, 'read');
    return snapshot;
  }
```

Replace `deleteStandards` (:706-716):
```ts
  @Delete('standards/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a standards document' })
  async deleteStandards(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    const doc = await this.notes.getStandardsDocument(id);
    if (!doc) throw new NotFoundException('doc_not_found');
    const org = await this.notes.getOrganizationById(doc.orgId);
    if (!org) throw new NotFoundException('org_not_found');
    this.checkOrgAccess(req, org, 'delete');
    if (doc.status === 'pending') {
      await this.notes.failStandardsDocument(id, 'cancelled');
    }
    await this.notes.deleteStandardsDocument(id);
  }
```

Replace the guard clauses at the top of `retryStandards` (:718-729, only the entity-fetch/guard preamble changes — the retry logic body below stays untouched):
```ts
  @Post('standards/:id/retry')
  @ApiOperation({ summary: 'Retry a failed or stuck pending standards document' })
  async retryStandards(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    const doc = await this.notes.getStandardsDocument(id);
    if (!doc) throw new NotFoundException('doc_not_found');
    const org = await this.notes.getOrganizationById(doc.orgId);
    if (!org) throw new NotFoundException('org_not_found');
    this.checkOrgAccess(req, org, 'update');

    const STUCK_MS = 5 * 60 * 1000;
    const isPendingTooLong =
      doc.status === 'pending' && Date.now() - new Date(doc.createdAt).getTime() > STUCK_MS;

    if (doc.status !== 'failed' && !isPendingTooLong) {
      throw new BadRequestException('doc_not_retryable');
    }
    // ... existing retry logic continues below, unchanged
```

`generateStandards` (:669-703, already correct) stays byte-for-byte unchanged.

No new imports needed.

- [ ] **Step 4: Run tests, confirm they pass**

Run: `yarn nx test api -- standards.controller.unit.test.ts`
Expected: PASS, all 17 tests.

- [ ] **Step 5: Post-coding routine**

```bash
npx prettier --write apps/api/src/app/notes/notes.controller.ts apps/api/src/app/notes/__tests__/standards.controller.unit.test.ts
yarn nx lint api
yarn nx build api
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/app/notes/notes.controller.ts apps/api/src/app/notes/__tests__/standards.controller.unit.test.ts
git commit -m "fix(notes-gateway): add checkOrgAccess to standards routes"
```

---

## Task 4: Gap analysis routes

**Files:**
- Modify: `apps/api/src/app/notes/notes.controller.ts:753-772`
- Test: Create `apps/api/src/app/notes/__tests__/gap.controller.unit.test.ts`

**Interfaces:**
- Consumes: existing `this.notes.getGapAnalysis(id): Promise<GapAnalysis | null>` (has `.orgId`), existing `this.notes.getOrganizationById`, existing `this.checkOrgAccess`.
- Produces: nothing new consumed by later tasks.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/app/notes/__tests__/gap.controller.unit.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import type { AiClientService } from '@icore/ai-client';
import type { NotesClientService } from '@icore/notes-client';
import type { GapAnalysis, Organization, VerifiedToken } from '@icore/shared';
import { NotesController } from '../notes.controller';
import { AbilityFactory } from '../../abilities/ability.factory';
import type { StandardsQueueService } from '../standards-queue.service';

const ORG: Organization = {
  id: 'org-1',
  userId: 'org-creator',
  name: 'Acme',
} as unknown as Organization;

const GAP: GapAnalysis = {
  id: 'gap-1',
  orgId: 'org-1',
  userId: 'org-creator',
  docId: null,
  result: {} as never,
  riskScore: 10,
  createdAt: '2026-01-01T00:00:00Z',
} as unknown as GapAnalysis;

function makeNotes(overrides: Partial<NotesClientService> = {}): NotesClientService {
  return {
    getOrganizationById: vi.fn().mockResolvedValue(ORG),
    getGapAnalysis: vi.fn().mockResolvedValue(GAP),
    listGapAnalyses: vi.fn().mockResolvedValue([]),
    saveGapAnalysis: vi.fn().mockResolvedValue(GAP),
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

describe('NotesController — gap analysis org scoping', () => {
  describe('saveGap', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).saveGap(reqAs('outsider'), { orgId: 'org-1', result: {} as never }),
      ).rejects.toThrow(ForbiddenException);
    });
    it('allows the org creator', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).saveGap(reqAs('org-creator'), { orgId: 'org-1', result: {} as never }),
      ).resolves.toEqual(GAP);
    });
    it('rejects when orgId is missing from the body', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).saveGap(reqAs('org-creator'), { orgId: '', result: {} as never }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('listGap', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).listGap(reqAs('outsider'), 'org-1'),
      ).rejects.toThrow(ForbiddenException);
    });
    it('allows the org creator', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).listGap(reqAs('org-creator'), 'org-1'),
      ).resolves.toEqual([]);
    });
  });

  describe('getGap', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).getGap(reqAs('outsider'), 'gap-1'),
      ).rejects.toThrow(ForbiddenException);
    });
    it('allows the org creator', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).getGap(reqAs('org-creator'), 'gap-1'),
      ).resolves.toEqual(GAP);
    });
    it('throws NotFound when the gap analysis does not exist', async () => {
      const notes = makeNotes({ getGapAnalysis: vi.fn().mockResolvedValue(null) });
      await expect(
        makeController(notes).getGap(reqAs('org-creator'), 'missing'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
```

- [ ] **Step 2: Run tests, confirm they fail**

Run: `yarn nx test api -- gap.controller.unit.test.ts`
Expected: FAIL — every outsider-rejection test fails (no `ForbiddenException` thrown today); `getGap`'s tests also fail to compile/run correctly since the handler doesn't accept `@Req()` yet.

- [ ] **Step 3: Implement the fix**

Replace all 3 handlers (:750-772):
```ts
  @Post('gap')
  @ApiOperation({ summary: 'Persist a gap analysis result' })
  @ApiBody({ schema: { type: 'object' } })
  async saveGap(
    @Req() req: Request & { user?: VerifiedToken },
    @Body() body: { orgId: string; docId?: string; result: GapAnalysisResult },
  ) {
    if (!body.orgId) throw new BadRequestException('orgId required');
    const org = await this.notes.getOrganizationById(body.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.saveGapAnalysis(body.orgId, this.uid(req), body.docId ?? null, body.result);
  }

  @Get('gap')
  @ApiOperation({ summary: 'List persisted gap analyses for an org' })
  async listGap(@Req() req: Request & { user?: VerifiedToken }, @Query('orgId') orgId?: string) {
    if (!orgId) throw new BadRequestException('orgId required');
    const org = await this.notes.getOrganizationById(orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'read');
    return this.notes.listGapAnalyses(orgId);
  }

  @Get('gap/:id')
  @ApiOperation({ summary: 'Get a single gap analysis by id' })
  async getGap(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    const gap = await this.notes.getGapAnalysis(id);
    if (!gap) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(gap.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'read');
    return gap;
  }
```

No new imports needed.

- [ ] **Step 4: Run tests, confirm they pass**

Run: `yarn nx test api -- gap.controller.unit.test.ts`
Expected: PASS, all 8 tests.

- [ ] **Step 5: Post-coding routine**

```bash
npx prettier --write apps/api/src/app/notes/notes.controller.ts apps/api/src/app/notes/__tests__/gap.controller.unit.test.ts
yarn nx lint api
yarn nx build api
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/app/notes/notes.controller.ts apps/api/src/app/notes/__tests__/gap.controller.unit.test.ts
git commit -m "fix(notes-gateway): add checkOrgAccess to gap analysis routes"
```

---

## Task 5: Policy routes, `getPolicyControl`, and `listPoliciesForControl` signature change

**Files:**
- Modify: `libs/shared/src/strategies/notes.ts` (interface: add `getPolicyControl`, widen `listPoliciesForControl` signature)
- Modify: `libs/shared/src/strategies/fakes/fake-notes.ts` (implement `getPolicyControl`, widen `listPoliciesForControl`)
- Modify: `apps/microservices/notes/src/app/supabase-notes.strategy.ts` (implement `getPolicyControl`, widen `listPoliciesForControl`)
- Modify: `apps/microservices/notes/src/app/notes.controller.ts` (widen the `notes.policies.for-control` `@MessagePattern` handler payload)
- Modify: `libs/notes-client/src/lib/notes-client.service.ts` (widen `listPoliciesForControl` method)
- Modify: `apps/api/src/app/notes/notes.controller.ts` (10 mechanical route fixes + `removePolicyControl` + `listPoliciesForControl`)
- Modify: `apps/client/src/queries/policies.ts:52-59` (widen `usePoliciesForControl` to take `orgId` — confirmed zero callers today, see Step 3d)
- Test: Extend `apps/api/src/app/notes/__tests__/policies.controller.unit.test.ts` (reuse its existing `ORG`/`POLICY` fixtures and `makeNotes`/`makeController`/`reqAs` helpers — do not duplicate them into a new file)
- Test: Add a contract test to `libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts` for `listPoliciesForControl`'s org filtering

**Interfaces:**
- Consumes: existing `this.notes.getPolicy(id): Promise<Policy | null>` (has `.orgId`), existing `this.notes.getOrganizationById`, existing `this.checkOrgAccess`.
- Produces: `getPolicyControl(id: string): Promise<PolicyControl | null>` — new capability method on the strategy interface, implemented in Fake and Supabase. `listPoliciesForControl(controlCode: string, frameworkId: string, orgId: string): Promise<Policy[]>` — widened signature (previously 2 params, now 3), consumed across MS handler, notes-client, and gateway route.

- [ ] **Step 1: Write the failing tests**

`libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts` already has a `describe('policy controls mapping', ...)` block (around line 1693) with a `beforeEach` that does `s = new FakeNotesStrategy();` — no `Organization` entity exists in this strategy at all, `orgId` is just a plain string parameter (`createPolicy('org1', 'u1', {...})` — confirmed from the file's own existing tests, there is no `createOrganization` method on `FakeNotesStrategy`). Two changes to this block:

**First**, the existing test `'lists policies for a given control code'` (line ~1714-1720) calls `s.listPoliciesForControl('AC-1', 'fw1')` with 2 arguments — this will fail to compile once the signature widens to 3 required params. Update its call site:
```ts
  it('lists policies for a given control code', async () => {
    const p = await s.createPolicy('org1', 'u1', { frameworkId: 'fw1', title: 'T', content: 'C' });
    await s.addPolicyControl(p.id, { controlCode: 'AC-1', frameworkId: 'fw1' });
    const policies = await s.listPoliciesForControl('AC-1', 'fw1', 'org1');
    expect(policies).toHaveLength(1);
    expect(policies[0].id).toBe(p.id);
  });
```

**Second**, add a new test immediately after it, inside the same `describe('policy controls mapping', ...)` block, reusing the same `s` instance pattern:
```ts
  it('scopes listPoliciesForControl results to the requesting org', async () => {
    const policyA = await s.createPolicy('org-a', 'user-a', {
      frameworkId: 'fw1',
      title: 'Policy A',
      content: 'C',
    });
    const policyB = await s.createPolicy('org-b', 'user-b', {
      frameworkId: 'fw1',
      title: 'Policy B',
      content: 'C',
    });
    await s.addPolicyControl(policyA.id, { controlCode: 'AC-1', frameworkId: 'fw1' });
    await s.addPolicyControl(policyB.id, { controlCode: 'AC-1', frameworkId: 'fw1' });

    const resultForA = await s.listPoliciesForControl('AC-1', 'fw1', 'org-a');

    expect(resultForA.map((p) => p.id)).toEqual([policyA.id]);
    expect(resultForA.map((p) => p.id)).not.toContain(policyB.id);
  });
```

Extend `apps/api/src/app/notes/__tests__/policies.controller.unit.test.ts` — add these new `describe` blocks, reusing the file's existing `ORG`, `POLICY`, `makeNotes`, `makeController`, `reqAs` (do not redefine them):

```ts
describe('listPolicies', () => {
  it('rejects a caller outside the org', async () => {
    const notes = makeNotes();
    await expect(makeController(notes).listPolicies(reqAs('outsider'), 'org-1')).rejects.toThrow(
      ForbiddenException,
    );
  });
  it('allows the org creator', async () => {
    const notes = makeNotes();
    await expect(
      makeController(notes).listPolicies(reqAs('org-creator'), 'org-1'),
    ).resolves.toEqual([]);
  });
});

describe('createPolicy', () => {
  it('rejects a caller outside the org', async () => {
    const notes = makeNotes();
    await expect(
      makeController(notes).createPolicy(reqAs('outsider'), 'org-1', {} as never),
    ).rejects.toThrow(ForbiddenException);
  });
  it('allows the org creator', async () => {
    const notes = makeNotes();
    await expect(
      makeController(notes).createPolicy(reqAs('org-creator'), 'org-1', {} as never),
    ).resolves.toEqual(POLICY);
  });
});

describe('cloneTemplate', () => {
  it('rejects a caller outside the org', async () => {
    const notes = makeNotes();
    await expect(
      makeController(notes).cloneTemplate(reqAs('outsider'), 'org-1', 'template-1'),
    ).rejects.toThrow(ForbiddenException);
  });
  it('allows the org creator', async () => {
    const notes = makeNotes();
    await expect(
      makeController(notes).cloneTemplate(reqAs('org-creator'), 'org-1', 'template-1'),
    ).resolves.toEqual(POLICY);
  });
});

describe('getPolicy', () => {
  it('rejects a caller outside the org', async () => {
    const notes = makeNotes();
    await expect(makeController(notes).getPolicy(reqAs('outsider'), 'policy-1')).rejects.toThrow(
      ForbiddenException,
    );
  });
  it('allows the org creator', async () => {
    const notes = makeNotes();
    await expect(
      makeController(notes).getPolicy(reqAs('org-creator'), 'policy-1'),
    ).resolves.toEqual(POLICY);
  });
});

describe('updatePolicy', () => {
  it('rejects a caller outside the org', async () => {
    const notes = makeNotes();
    await expect(
      makeController(notes).updatePolicy(reqAs('outsider'), 'policy-1', {}),
    ).rejects.toThrow(ForbiddenException);
  });
  it('allows the org creator', async () => {
    const notes = makeNotes();
    await expect(
      makeController(notes).updatePolicy(reqAs('org-creator'), 'policy-1', {}),
    ).resolves.toEqual(POLICY);
  });
});

describe('deletePolicy', () => {
  it('rejects a caller outside the org', async () => {
    const notes = makeNotes();
    await expect(makeController(notes).deletePolicy(reqAs('outsider'), 'policy-1')).rejects.toThrow(
      ForbiddenException,
    );
  });
  it('allows the org creator', async () => {
    const notes = makeNotes();
    await expect(
      makeController(notes).deletePolicy(reqAs('org-creator'), 'policy-1'),
    ).resolves.toBeUndefined();
  });
});

describe('listPolicyControls', () => {
  it('rejects a caller outside the org', async () => {
    const notes = makeNotes();
    await expect(
      makeController(notes).listPolicyControls(reqAs('outsider'), 'policy-1'),
    ).rejects.toThrow(ForbiddenException);
  });
  it('allows the org creator', async () => {
    const notes = makeNotes();
    await expect(
      makeController(notes).listPolicyControls(reqAs('org-creator'), 'policy-1'),
    ).resolves.toEqual([]);
  });
});

describe('addPolicyControl', () => {
  it('rejects a caller outside the org', async () => {
    const notes = makeNotes();
    await expect(
      makeController(notes).addPolicyControl(reqAs('outsider'), 'policy-1', {} as never),
    ).rejects.toThrow(ForbiddenException);
  });
  it('allows the org creator', async () => {
    const notes = makeNotes();
    await expect(
      makeController(notes).addPolicyControl(reqAs('org-creator'), 'policy-1', {} as never),
    ).resolves.toEqual({});
  });
});

describe('removePolicyControl', () => {
  it('rejects a caller outside the org', async () => {
    const notes = makeNotes({
      getPolicyControl: vi
        .fn()
        .mockResolvedValue({ id: 'map-1', policyId: 'policy-1', controlCode: 'AC-01', frameworkId: 'fw-1' }),
    });
    await expect(
      makeController(notes).removePolicyControl(reqAs('outsider'), 'map-1'),
    ).rejects.toThrow(ForbiddenException);
  });
  it('allows the org creator', async () => {
    const notes = makeNotes({
      getPolicyControl: vi
        .fn()
        .mockResolvedValue({ id: 'map-1', policyId: 'policy-1', controlCode: 'AC-01', frameworkId: 'fw-1' }),
    });
    await expect(
      makeController(notes).removePolicyControl(reqAs('org-creator'), 'map-1'),
    ).resolves.toBeUndefined();
  });
  it('throws NotFound when the mapping does not exist', async () => {
    const notes = makeNotes({ getPolicyControl: vi.fn().mockResolvedValue(null) });
    await expect(
      makeController(notes).removePolicyControl(reqAs('org-creator'), 'missing'),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('listPoliciesForControl', () => {
  it('rejects a caller outside the org', async () => {
    const notes = makeNotes();
    await expect(
      makeController(notes).listPoliciesForControl(reqAs('outsider'), 'AC-01', 'fw-1', 'org-1'),
    ).rejects.toThrow(ForbiddenException);
  });
  it('allows the org creator and passes orgId through', async () => {
    const notes = makeNotes();
    await makeController(notes).listPoliciesForControl(reqAs('org-creator'), 'AC-01', 'fw-1', 'org-1');
    expect(notes.listPoliciesForControl).toHaveBeenCalledWith('AC-01', 'fw-1', 'org-1');
  });
  it('rejects when orgId is missing', async () => {
    const notes = makeNotes();
    await expect(
      makeController(notes).listPoliciesForControl(reqAs('org-creator'), 'AC-01', 'fw-1', ''),
    ).rejects.toThrow(BadRequestException);
  });
});
```

Also update the file's existing `makeNotes()` factory (at the top of `policies.controller.unit.test.ts`) to add mocks for the newly-tested methods — extend its returned object with:
```ts
listPolicies: vi.fn().mockResolvedValue([]),
createPolicy: vi.fn().mockResolvedValue(POLICY),
cloneTemplate: vi.fn().mockResolvedValue(POLICY),
updatePolicy: vi.fn().mockResolvedValue(POLICY),
deletePolicy: vi.fn().mockResolvedValue(undefined),
listPolicyControls: vi.fn().mockResolvedValue([]),
addPolicyControl: vi.fn().mockResolvedValue({}),
getPolicyControl: vi.fn().mockResolvedValue(null),
removePolicyControl: vi.fn().mockResolvedValue(undefined),
listPoliciesForControl: vi.fn().mockResolvedValue([]),
```
(merge these into the existing object literal alongside the file's current `getOrganizationById`/`getPolicy`/`transitionPolicyWorkflow`/`listPolicyActivity` entries — do not remove those.)

Also import `BadRequestException` at the top of `policies.controller.unit.test.ts` if not already present (it currently imports `ForbiddenException, NotFoundException` from `@nestjs/common` — widen that import line to `ForbiddenException, NotFoundException, BadRequestException`).

- [ ] **Step 2: Run tests, confirm they fail**

Run: `yarn nx test shared -- fake-notes.contract.unit.test.ts` and `yarn nx test api -- policies.controller.unit.test.ts`
Expected: FAIL — the contract test fails because `listPoliciesForControl` doesn't accept an `orgId` param yet (TypeScript compile error) and doesn't filter; the gateway tests fail because outsider-rejection tests get no `ForbiddenException`, and `getPolicyControl`/3-arg `listPoliciesForControl` don't exist on the controller/mock shape yet (compile errors are the expected "test fails" signal here — TDD on a signature change starts with a red compile, not just a red assertion).

- [ ] **Step 3a: Implement `getPolicyControl` (new capability method)**

In `libs/shared/src/strategies/notes.ts`, add to the strategy interface (near the existing `listPolicyControls`/`addPolicyControl`/`removePolicyControl` declarations around line 1561-1563):
```ts
  getPolicyControl(id: string): Promise<PolicyControl | null>;
```

In `libs/shared/src/strategies/fakes/fake-notes.ts`, add (near the existing `listPolicyControls`/`addPolicyControl`/`removePolicyControl` implementations, using the same `this.policyControls` array already used there):
```ts
  async getPolicyControl(id: string): Promise<PolicyControl | null> {
    return this.policyControls.find((c) => c.id === id) ?? null;
  }
```

In `apps/microservices/notes/src/app/supabase-notes.strategy.ts`, add (near the existing Policy-control methods, reusing the existing `toPolicyControl` row-mapper already defined in this file):
```ts
  async getPolicyControl(id: string): Promise<PolicyControl | null> {
    const { data, error } = await this.db.from('policy_controls').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? this.toPolicyControl(data) : null;
  }
```

- [ ] **Step 3b: Widen `listPoliciesForControl` across all 5 layers**

In `libs/shared/src/strategies/notes.ts`, change the interface signature (currently `listPoliciesForControl(controlCode: string, frameworkId: string): Promise<Policy[]>;`) to:
```ts
  listPoliciesForControl(controlCode: string, frameworkId: string, orgId: string): Promise<Policy[]>;
```

In `libs/shared/src/strategies/fakes/fake-notes.ts`, replace the current implementation with:
```ts
  async listPoliciesForControl(controlCode: string, frameworkId: string, orgId: string): Promise<Policy[]> {
    const policyIds = this.policyControls
      .filter((c) => c.controlCode === controlCode && c.frameworkId === frameworkId)
      .map((c) => c.policyId);
    return this.policies.filter((p) => policyIds.includes(p.id) && p.orgId === orgId);
  }
```

In `apps/microservices/notes/src/app/supabase-notes.strategy.ts`, replace the current implementation with:
```ts
  async listPoliciesForControl(controlCode: string, frameworkId: string, orgId: string): Promise<Policy[]> {
    const { data, error } = await this.db
      .from('policy_controls')
      .select('policy_id')
      .eq('control_code', controlCode)
      .eq('framework_id', frameworkId);
    const policyIds = ok(data, error).map((r: Record<string, unknown>) => r['policy_id'] as string);
    if (policyIds.length === 0) return [];
    const { data: policies, error: pErr } = await this.db
      .from('policies')
      .select('*')
      .in('id', policyIds)
      .eq('org_id', orgId);
    return ok(policies, pErr).map(this.toPolicy);
  }
```

In `apps/microservices/notes/src/app/notes.controller.ts`, find the `@MessagePattern('notes.policies.for-control')` handler and replace it with:
```ts
  @MessagePattern('notes.policies.for-control')
  listPoliciesForControl(
    @Payload() p: { controlCode: string; frameworkId: string; orgId: string },
  ): Promise<Policy[]> {
    return this.strategy.listPoliciesForControl(p.controlCode, p.frameworkId, p.orgId);
  }
```

In `libs/notes-client/src/lib/notes-client.service.ts`, replace the current method with:
```ts
  listPoliciesForControl(controlCode: string, frameworkId: string, orgId: string): Promise<Policy[]> {
    return signedSend<Policy[]>(this.client, 'notes.policies.for-control', {
      controlCode,
      frameworkId,
      orgId,
    });
  }
```

- [ ] **Step 3c: Implement all Policy gateway route fixes**

In `apps/api/src/app/notes/notes.controller.ts`, replace each handler:

Replace `listPolicies`:
```ts
  @Get('policies')
  @ApiOperation({ summary: 'List policies for org' })
  async listPolicies(@Req() req: Request & { user?: VerifiedToken }, @Query('orgId') orgId: string) {
    this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    const org = await this.notes.getOrganizationById(orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'read');
    return this.notes.listPolicies(orgId);
  }
```

Replace `createPolicy`:
```ts
  @Post('policies')
  @ApiOperation({ summary: 'Create a policy' })
  async createPolicy(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
    @Body() body: PolicyInput,
  ) {
    const userId = this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    const org = await this.notes.getOrganizationById(orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.createPolicy(orgId, userId, body);
  }
```

Replace `listPoliciesForControl`:
```ts
  @Get('policies/for-control')
  @ApiOperation({ summary: 'List policies mapped to a control' })
  async listPoliciesForControl(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('controlCode') controlCode: string,
    @Query('frameworkId') frameworkId: string,
    @Query('orgId') orgId: string,
  ) {
    this.uid(req);
    if (!controlCode || !frameworkId || !orgId) {
      throw new BadRequestException('controlCode, frameworkId, and orgId required');
    }
    const org = await this.notes.getOrganizationById(orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'read');
    return this.notes.listPoliciesForControl(controlCode, frameworkId, orgId);
  }
```

Replace `cloneTemplate`:
```ts
  @Post('policies/clone/:templateId')
  @ApiOperation({ summary: 'Clone a policy template into an org' })
  async cloneTemplate(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
    @Param('templateId') templateId: string,
  ) {
    const userId = this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    const org = await this.notes.getOrganizationById(orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.cloneTemplate(orgId, userId, templateId);
  }
```

`listPolicyTemplates` (`GET policy-templates`) stays byte-for-byte unchanged — confirmed genuinely platform-wide, no org column anywhere.

Replace `removePolicyControl`:
```ts
  @Delete('policies/controls/:mappingId')
  @HttpCode(204)
  async removePolicyControl(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('mappingId') mappingId: string,
  ) {
    this.uid(req);
    const mapping = await this.notes.getPolicyControl(mappingId);
    if (!mapping) throw new NotFoundException();
    const policy = await this.notes.getPolicy(mapping.policyId);
    if (!policy) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(policy.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'delete');
    return this.notes.removePolicyControl(mappingId);
  }
```

`transitionPolicyWorkflow` and `listPolicyActivity` (already correct, from Policy Lifecycle) stay byte-for-byte unchanged.

Replace `getPolicy`:
```ts
  @Get('policies/:id')
  @ApiOperation({ summary: 'Get a policy' })
  async getPolicy(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    const p = await this.notes.getPolicy(id);
    if (!p) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(p.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'read');
    return p;
  }
```

Replace `updatePolicy`:
```ts
  @Patch('policies/:id')
  @ApiOperation({ summary: 'Update a policy' })
  async updatePolicy(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() patch: PolicyPatch,
  ) {
    this.uid(req);
    const p = await this.notes.getPolicy(id);
    if (!p) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(p.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.updatePolicy(id, patch);
  }
```

Replace `deletePolicy`:
```ts
  @Delete('policies/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a policy' })
  async deletePolicy(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    const p = await this.notes.getPolicy(id);
    if (!p) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(p.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'delete');
    return this.notes.deletePolicy(id);
  }
```

Replace `listPolicyControls`:
```ts
  @Get('policies/:id/controls')
  @ApiOperation({ summary: 'List control mappings for a policy' })
  async listPolicyControls(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') policyId: string,
  ) {
    this.uid(req);
    const p = await this.notes.getPolicy(policyId);
    if (!p) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(p.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'read');
    return this.notes.listPolicyControls(policyId);
  }
```

Replace `addPolicyControl`:
```ts
  @Post('policies/:id/controls')
  @ApiOperation({ summary: 'Add a control mapping to a policy' })
  async addPolicyControl(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') policyId: string,
    @Body() body: PolicyControlInput,
  ) {
    this.uid(req);
    const p = await this.notes.getPolicy(policyId);
    if (!p) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(p.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.addPolicyControl(policyId, body);
  }
```

No new imports needed in this file (`PolicyInput`, `PolicyPatch`, `PolicyControlInput`, `BadRequestException`, `NotFoundException` already imported). `PolicyControl` needs importing into `notes.controller.ts` if not already present — check the top-of-file `import type { ... } from '@icore/shared'` block; if `PolicyControl` isn't listed, add it there (it's exported from `libs/shared/src/index.ts` via the strategies barrel, same path as every other type in that block).

- [ ] **Step 3d: Update the client call site**

`apps/client/src/queries/policies.ts:52-59` has `usePoliciesForControl(controlCode: string, frameworkId: string)`, confirmed to have **zero callers anywhere in `apps/client/src`** (it's defined but never invoked from any component today — dead UI surface, added ahead of a consumer that was never built). Every other hook in this same file (`usePolicies`, `useCreatePolicy`, `useCloneTemplate`, etc.) already takes `orgId` as its first parameter and threads it into the URL via `encodeURIComponent` — match that exact convention:

```ts
export function usePoliciesForControl(orgId: string, controlCode: string, frameworkId: string) {
  return useQuery<Policy[]>({
    queryKey: ['policies', 'for-control', orgId, controlCode, frameworkId],
    queryFn: () =>
      api<Policy[]>(
        `/notes/policies/for-control?orgId=${encodeURIComponent(orgId)}&controlCode=${encodeURIComponent(controlCode)}&frameworkId=${encodeURIComponent(frameworkId)}`,
      ),
    enabled: !!orgId && !!controlCode && !!frameworkId,
  });
}
```

No other file changes needed — since there are no callers, no downstream component needs updating.

- [ ] **Step 4: Run tests, confirm they pass**

Run: `yarn nx test shared -- fake-notes.contract.unit.test.ts` and `yarn nx test api -- policies.controller.unit.test.ts`
Expected: PASS, all tests including the new org-scoping contract test and all new gateway describe blocks.

- [ ] **Step 5: Post-coding routine**

```bash
npx prettier --write libs/shared/src/strategies/notes.ts libs/shared/src/strategies/fakes/fake-notes.ts apps/microservices/notes/src/app/supabase-notes.strategy.ts apps/microservices/notes/src/app/notes.controller.ts libs/notes-client/src/lib/notes-client.service.ts apps/api/src/app/notes/notes.controller.ts apps/api/src/app/notes/__tests__/policies.controller.unit.test.ts libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts apps/client/src/queries/policies.ts
yarn nx lint shared
yarn nx lint notes
yarn nx lint notes-client
yarn nx lint api
yarn nx lint client
yarn nx build shared
yarn nx build notes
yarn nx build notes-client
yarn nx build api
yarn nx build client
```

- [ ] **Step 6: Commit**

```bash
git add libs/shared/src/strategies/notes.ts libs/shared/src/strategies/fakes/fake-notes.ts apps/microservices/notes/src/app/supabase-notes.strategy.ts apps/microservices/notes/src/app/notes.controller.ts libs/notes-client/src/lib/notes-client.service.ts apps/api/src/app/notes/notes.controller.ts apps/api/src/app/notes/__tests__/policies.controller.unit.test.ts libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts apps/client/src/queries/policies.ts
git commit -m "fix(notes-gateway): add checkOrgAccess to policy routes, scope listPoliciesForControl by org"
```

---

## Final Integration Check

After all 5 tasks are complete, run the full workspace test suite to confirm no regressions:

```bash
yarn nx run-many -t test
```

Expected: all projects green, including the pre-existing 250+ `shared` tests, 129+ `api` tests (now higher, given the new/extended test files above), and everything else untouched.

This phase touches no UI and no migrations — no Playwright verification or database migration is required for this plan, unlike Policy Lifecycle. The Final Integration Check is purely the test-suite run above.

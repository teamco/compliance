import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import type { AiClientService } from '@icore/ai-client';
import type { AuthClientService } from '@icore/auth-client';
import type { NotesClientService } from '@icore/notes-client';
import type {
  Issue,
  IssueValidation,
  Organization,
  VerifiedToken,
  IssueValidationSubmitInput,
} from '@icore/shared';
import { NotesController } from '../notes.controller';
import { AbilityFactory } from '../../abilities/ability.factory';
import type { StandardsQueueService } from '../standards-queue.service';

const ORG: Organization = {
  id: 'org-1',
  userId: 'org-creator',
  name: 'Acme',
} as unknown as Organization;

const ISSUE: Issue = {
  id: 'issue-1',
  orgId: 'org-1',
  ownerId: 'owner-1',
  status: 'in_progress',
} as unknown as Issue;

const PENDING_VALIDATION: IssueValidation = {
  id: 'val-1',
  issueId: 'issue-1',
  orgId: 'org-1',
  requestedBy: 'owner-1',
  validatorId: 'validator-1',
  status: 'pending',
  reviewNotes: null,
  reviewedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
};

const SUBMIT_INPUT: IssueValidationSubmitInput = {
  rootCause: 'Missing enforcement policy',
  rootCauseCategory: 'process_gap',
  validatorId: 'validator-1',
};

function makeNotes(overrides: Partial<NotesClientService> = {}): NotesClientService {
  return {
    getIssue: vi.fn().mockResolvedValue(ISSUE),
    getOrganizationById: vi.fn().mockResolvedValue(ORG),
    listIssues: vi.fn().mockResolvedValue([]),
    createIssue: vi.fn().mockResolvedValue(ISSUE),
    updateIssue: vi.fn().mockResolvedValue(ISSUE),
    deleteIssue: vi.fn().mockResolvedValue(undefined),
    listIssueValidations: vi.fn().mockResolvedValue([]),
    listPendingIssueValidations: vi.fn().mockResolvedValue([]),
    getIssueValidation: vi.fn().mockResolvedValue(PENDING_VALIDATION),
    submitIssueForValidation: vi.fn().mockResolvedValue(ISSUE),
    reassignIssueOwner: vi.fn().mockResolvedValue(ISSUE),
    reassignIssueValidator: vi.fn().mockResolvedValue(PENDING_VALIDATION),
    reviewIssueValidation: vi.fn().mockResolvedValue(PENDING_VALIDATION),
    ...overrides,
  } as unknown as NotesClientService;
}

function makeController(
  notes: NotesClientService,
  auth: { listOrgMembers: ReturnType<typeof vi.fn> } = {
    listOrgMembers: vi.fn().mockResolvedValue([
      { userId: 'owner-1', role: 'viewer' },
      { userId: 'validator-1', role: 'viewer' },
    ]),
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

function reqAs(uid: string): Request & { user?: VerifiedToken } {
  return { user: { uid } as VerifiedToken } as Request & { user?: VerifiedToken };
}

function reqAsAdmin(uid: string): Request & { user?: VerifiedToken } {
  return { user: { uid, role: 'admin' } as VerifiedToken } as Request & { user?: VerifiedToken };
}

describe('NotesController — issue validation authorization', () => {
  describe('submitIssueForValidation', () => {
    it('rejects a caller who is not the issue owner', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).submitIssueForValidation(reqAs('someone-else'), 'issue-1', {
          ...SUBMIT_INPUT,
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(notes.submitIssueForValidation).not.toHaveBeenCalled();
    });

    it('throws NotFound when the issue does not exist', async () => {
      const notes = makeNotes({ getIssue: vi.fn().mockResolvedValue(null) });
      await expect(
        makeController(notes).submitIssueForValidation(reqAs('owner-1'), 'missing', {
          ...SUBMIT_INPUT,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('lets the issue owner submit even when they are not the org creator', async () => {
      const notes = makeNotes();
      await makeController(notes).submitIssueForValidation(reqAs('owner-1'), 'issue-1', {
        ...SUBMIT_INPUT,
      });
      expect(notes.submitIssueForValidation).toHaveBeenCalledWith(
        'issue-1',
        'owner-1',
        SUBMIT_INPUT,
      );
    });

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
  });

  describe('reviewIssueValidation', () => {
    it('lets the assigned validator review without org-creator rights', async () => {
      const notes = makeNotes();
      await makeController(notes).reviewIssueValidation(reqAs('validator-1'), 'val-1', {
        decision: 'approved',
      });
      expect(notes.reviewIssueValidation).toHaveBeenCalledWith(
        'val-1',
        'validator-1',
        'approved',
        undefined,
      );
    });

    it('propagates the strategy-level validator check for a non-assigned caller', async () => {
      const notes = makeNotes({
        reviewIssueValidation: vi
          .fn()
          .mockRejectedValue(new Error('issue_validation_not_authorized_validator')),
      });
      await expect(
        makeController(notes).reviewIssueValidation(reqAs('outsider'), 'val-1', {
          decision: 'approved',
        }),
      ).rejects.toThrow('issue_validation_not_authorized_validator');
    });

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
  });

  describe('listIssueValidations', () => {
    it('rejects a caller who is neither the org creator nor a party to the issue', async () => {
      const notes = makeNotes({
        listIssueValidations: vi.fn().mockResolvedValue([PENDING_VALIDATION]),
      });
      await expect(
        makeController(notes).listIssueValidations(reqAs('outsider'), 'issue-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows the issue owner even when they are not the org creator', async () => {
      const notes = makeNotes({
        listIssueValidations: vi.fn().mockResolvedValue([PENDING_VALIDATION]),
      });
      await expect(
        makeController(notes).listIssueValidations(reqAs('owner-1'), 'issue-1'),
      ).resolves.toEqual([PENDING_VALIDATION]);
    });

    it('allows the assigned validator even when they are not the org creator', async () => {
      const notes = makeNotes({
        listIssueValidations: vi.fn().mockResolvedValue([PENDING_VALIDATION]),
      });
      await expect(
        makeController(notes).listIssueValidations(reqAs('validator-1'), 'issue-1'),
      ).resolves.toEqual([PENDING_VALIDATION]);
    });

    it('allows the org creator', async () => {
      const notes = makeNotes({
        listIssueValidations: vi.fn().mockResolvedValue([PENDING_VALIDATION]),
      });
      await expect(
        makeController(notes).listIssueValidations(reqAs('org-creator'), 'issue-1'),
      ).resolves.toEqual([PENDING_VALIDATION]);
    });

    it('throws NotFound when the issue does not exist', async () => {
      const notes = makeNotes({ getIssue: vi.fn().mockResolvedValue(null) });
      await expect(
        makeController(notes).listIssueValidations(reqAs('owner-1'), 'missing'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('listPendingIssueValidations', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).listPendingIssueValidations(reqAs('outsider'), 'org-1'),
      ).rejects.toThrow(ForbiddenException);
      expect(notes.listPendingIssueValidations).not.toHaveBeenCalled();
    });

    it('allows the org creator', async () => {
      const notes = makeNotes({
        listPendingIssueValidations: vi.fn().mockResolvedValue([PENDING_VALIDATION]),
      });
      await expect(
        makeController(notes).listPendingIssueValidations(reqAs('org-creator'), 'org-1'),
      ).resolves.toEqual([PENDING_VALIDATION]);
    });

    it('allows an admin who is not the org creator', async () => {
      const notes = makeNotes({
        listPendingIssueValidations: vi.fn().mockResolvedValue([PENDING_VALIDATION]),
      });
      await expect(
        makeController(notes).listPendingIssueValidations(reqAsAdmin('platform-admin'), 'org-1'),
      ).resolves.toEqual([PENDING_VALIDATION]);
    });

    it('throws BadRequest when orgId is missing', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).listPendingIssueValidations(reqAs('org-creator'), ''),
      ).rejects.toThrow('orgId required');
    });

    it('throws NotFound when the org does not exist', async () => {
      const notes = makeNotes({ getOrganizationById: vi.fn().mockResolvedValue(null) });
      await expect(
        makeController(notes).listPendingIssueValidations(reqAs('org-creator'), 'missing'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});

describe('issues org scoping (Phase 1 hardening)', () => {
  describe('listIssues / createIssue', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(makeController(notes).listIssues(reqAs('outsider'), 'org-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('getIssue / updateIssue / deleteIssue', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(makeController(notes).getIssue(reqAs('outsider'), 'issue-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('allows the org creator', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).getIssue(reqAs('org-creator'), 'issue-1'),
      ).resolves.toEqual(ISSUE);
    });

    it('throws NotFound when the issue does not exist', async () => {
      const notes = makeNotes({ getIssue: vi.fn().mockResolvedValue(null) });
      await expect(makeController(notes).getIssue(reqAs('org-creator'), 'missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('submitIssueForValidation', () => {
    it('rejects a non-owner even if they belong to the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).submitIssueForValidation(reqAs('org-creator'), 'issue-1', {
          ...SUBMIT_INPUT,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});

describe('NotesController — reassignIssueOwner', () => {
  it('rejects a non-manager caller', async () => {
    const notes = makeNotes();
    const auth = {
      listOrgMembers: vi.fn().mockResolvedValue([{ userId: 'viewer-1', role: 'viewer' }]),
    };
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

describe('NotesController — reassignIssueValidator', () => {
  it('rejects a non-manager caller', async () => {
    const notes = makeNotes();
    const auth = {
      listOrgMembers: vi.fn().mockResolvedValue([{ userId: 'viewer-1', role: 'viewer' }]),
    };
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

import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import type { AiClientService } from '@icore/ai-client';
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
    listIssueValidations: vi.fn().mockResolvedValue([]),
    submitIssueForValidation: vi.fn().mockResolvedValue(ISSUE),
    reviewIssueValidation: vi.fn().mockResolvedValue(PENDING_VALIDATION),
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
});

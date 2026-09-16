import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import type { AiClientService } from '@icore/ai-client';
import type { NotesClientService } from '@icore/notes-client';
import type {
  Exception,
  ExceptionInput,
  ExceptionRenewal,
  ExceptionRenewalRequestInput,
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

const EXCEPTION: Exception = {
  id: 'exception-1',
  orgId: 'org-1',
  ownerId: 'owner-1',
  status: 'pending',
} as unknown as Exception;

const PENDING_RENEWAL: ExceptionRenewal = {
  id: 'renewal-1',
  exceptionId: 'exception-1',
  orgId: 'org-1',
  requestedBy: 'owner-1',
  proposedExpiresAt: '2026-12-01T00:00:00Z',
  justification: 'Vendor migration delayed',
  status: 'pending',
  reviewedBy: null,
  reviewNotes: null,
  reviewedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
};

const RENEWAL_INPUT: ExceptionRenewalRequestInput = {
  proposedExpiresAt: '2026-12-01T00:00:00Z',
  justification: 'Vendor migration delayed',
};

function makeNotes(overrides: Partial<NotesClientService> = {}): NotesClientService {
  return {
    getException: vi.fn().mockResolvedValue(EXCEPTION),
    getOrganizationById: vi.fn().mockResolvedValue(ORG),
    getExceptionRenewal: vi.fn().mockResolvedValue(PENDING_RENEWAL),
    listExceptions: vi.fn().mockResolvedValue([]),
    createException: vi.fn().mockResolvedValue(EXCEPTION),
    updateException: vi.fn().mockResolvedValue(EXCEPTION),
    deleteException: vi.fn().mockResolvedValue(undefined),
    listExceptionRenewals: vi.fn().mockResolvedValue([]),
    listPendingExceptionRenewals: vi.fn().mockResolvedValue([]),
    requestExceptionRenewal: vi.fn().mockResolvedValue(PENDING_RENEWAL),
    reviewExceptionRenewal: vi
      .fn()
      .mockResolvedValue({ ...PENDING_RENEWAL, status: 'approved' as const }),
    approveException: vi.fn().mockResolvedValue({ ...EXCEPTION, status: 'approved' }),
    rejectException: vi.fn().mockResolvedValue({ ...EXCEPTION, status: 'rejected' }),
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

describe('NotesController — exception governance authorization', () => {
  describe('requestExceptionRenewal', () => {
    it('rejects a caller who is not the exception owner', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).requestExceptionRenewal(reqAs('someone-else'), 'exception-1', {
          ...RENEWAL_INPUT,
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(notes.requestExceptionRenewal).not.toHaveBeenCalled();
    });

    it('throws NotFound when the exception does not exist', async () => {
      const notes = makeNotes({ getException: vi.fn().mockResolvedValue(null) });
      await expect(
        makeController(notes).requestExceptionRenewal(reqAs('owner-1'), 'missing', {
          ...RENEWAL_INPUT,
        }),
      ).rejects.toThrow(NotFoundException);
      expect(notes.requestExceptionRenewal).not.toHaveBeenCalled();
    });

    it('rejects the exception owner when they are not the org creator (Phase 1 hardening)', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).requestExceptionRenewal(reqAs('owner-1'), 'exception-1', {
          ...RENEWAL_INPUT,
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(notes.requestExceptionRenewal).not.toHaveBeenCalled();
    });

    it('lets the exception owner request a renewal when they are also the org creator', async () => {
      const notes = makeNotes({
        getException: vi.fn().mockResolvedValue({ ...EXCEPTION, ownerId: 'org-creator' }),
      });
      await makeController(notes).requestExceptionRenewal(reqAs('org-creator'), 'exception-1', {
        ...RENEWAL_INPUT,
      });
      expect(notes.requestExceptionRenewal).toHaveBeenCalledWith(
        'exception-1',
        'org-creator',
        RENEWAL_INPUT,
      );
    });
  });

  describe('reviewExceptionRenewal', () => {
    it('propagates the strategy-level self-review check unswallowed', async () => {
      // The org creator is also the requester here, so the gateway's org gate lets
      // them through and only the strategy can block the self-review.
      const notes = makeNotes({
        getExceptionRenewal: vi
          .fn()
          .mockResolvedValue({ ...PENDING_RENEWAL, requestedBy: 'org-creator' }),
        reviewExceptionRenewal: vi
          .fn()
          .mockRejectedValue(new Error('exception_renewal_self_review_forbidden')),
      });
      await expect(
        makeController(notes).reviewExceptionRenewal(reqAs('org-creator'), 'renewal-1', {
          decision: 'approved',
        }),
      ).rejects.toThrow('exception_renewal_self_review_forbidden');
    });

    it('rejects a caller from outside the owning org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).reviewExceptionRenewal(reqAs('other-org-user'), 'renewal-1', {
          decision: 'approved',
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(notes.reviewExceptionRenewal).not.toHaveBeenCalled();
    });

    it('resolves the org through renewal → exception, not a client-supplied id', async () => {
      const notes = makeNotes();
      await makeController(notes).reviewExceptionRenewal(reqAs('org-creator'), 'renewal-1', {
        decision: 'approved',
      });
      expect(notes.getExceptionRenewal).toHaveBeenCalledWith('renewal-1');
      expect(notes.getException).toHaveBeenCalledWith('exception-1');
      expect(notes.getOrganizationById).toHaveBeenCalledWith('org-1');
    });

    it('lets the org creator review a renewal they neither own nor requested', async () => {
      const notes = makeNotes();
      await makeController(notes).reviewExceptionRenewal(reqAs('org-creator'), 'renewal-1', {
        decision: 'rejected',
        reviewNotes: 'Compensating controls insufficient',
      });
      expect(notes.reviewExceptionRenewal).toHaveBeenCalledWith(
        'renewal-1',
        'org-creator',
        'rejected',
        'Compensating controls insufficient',
      );
    });

    it('throws NotFound when the renewal does not exist', async () => {
      const notes = makeNotes({ getExceptionRenewal: vi.fn().mockResolvedValue(null) });
      await expect(
        makeController(notes).reviewExceptionRenewal(reqAs('org-creator'), 'missing', {
          decision: 'approved',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(notes.reviewExceptionRenewal).not.toHaveBeenCalled();
    });
  });

  describe('approveException / rejectException org scoping', () => {
    it('rejects an approve from a caller who is not the org creator', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).approveException(reqAs('other-org-user'), 'exception-1'),
      ).rejects.toThrow(ForbiddenException);
      expect(notes.approveException).not.toHaveBeenCalled();
    });

    it('rejects a reject from a caller who is not the org creator', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).rejectException(reqAs('other-org-user'), 'exception-1'),
      ).rejects.toThrow(ForbiddenException);
      expect(notes.rejectException).not.toHaveBeenCalled();
    });

    it('lets the org creator approve an exception they do not own', async () => {
      const notes = makeNotes();
      await makeController(notes).approveException(reqAs('org-creator'), 'exception-1');
      expect(notes.getOrganizationById).toHaveBeenCalledWith('org-1');
      expect(notes.approveException).toHaveBeenCalledWith('exception-1', 'org-creator');
    });

    it('lets the org creator reject an exception they do not own', async () => {
      const notes = makeNotes();
      await makeController(notes).rejectException(reqAs('org-creator'), 'exception-1');
      expect(notes.rejectException).toHaveBeenCalledWith('exception-1', 'org-creator');
    });

    it('throws NotFound on approve when the exception does not exist', async () => {
      const notes = makeNotes({ getException: vi.fn().mockResolvedValue(null) });
      await expect(
        makeController(notes).approveException(reqAs('org-creator'), 'missing'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFound on reject when the owning org does not exist', async () => {
      const notes = makeNotes({ getOrganizationById: vi.fn().mockResolvedValue(null) });
      await expect(
        makeController(notes).rejectException(reqAs('org-creator'), 'exception-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('lets an admin approve an exception they neither own nor created the org for', async () => {
      const notes = makeNotes();
      await makeController(notes).approveException(reqAsAdmin('platform-admin'), 'exception-1');
      expect(notes.approveException).toHaveBeenCalledWith('exception-1', 'platform-admin');
    });
  });

  describe('listExceptionRenewals', () => {
    it('rejects a caller who is neither the org creator nor a party to the exception', async () => {
      const notes = makeNotes({
        listExceptionRenewals: vi.fn().mockResolvedValue([PENDING_RENEWAL]),
      });
      await expect(
        makeController(notes).listExceptionRenewals(reqAs('outsider'), 'exception-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows the exception owner even when they are not the org creator', async () => {
      const notes = makeNotes({
        listExceptionRenewals: vi.fn().mockResolvedValue([PENDING_RENEWAL]),
      });
      await expect(
        makeController(notes).listExceptionRenewals(reqAs('owner-1'), 'exception-1'),
      ).resolves.toEqual([PENDING_RENEWAL]);
    });

    it('allows a past reviewer of the renewal history', async () => {
      const notes = makeNotes({
        listExceptionRenewals: vi
          .fn()
          .mockResolvedValue([
            { ...PENDING_RENEWAL, status: 'rejected', reviewedBy: 'reviewer-1' },
          ]),
      });
      await expect(
        makeController(notes).listExceptionRenewals(reqAs('reviewer-1'), 'exception-1'),
      ).resolves.toHaveLength(1);
    });

    it('allows the org creator', async () => {
      const notes = makeNotes({
        listExceptionRenewals: vi.fn().mockResolvedValue([PENDING_RENEWAL]),
      });
      await expect(
        makeController(notes).listExceptionRenewals(reqAs('org-creator'), 'exception-1'),
      ).resolves.toEqual([PENDING_RENEWAL]);
    });

    it('throws NotFound when the exception does not exist', async () => {
      const notes = makeNotes({ getException: vi.fn().mockResolvedValue(null) });
      await expect(
        makeController(notes).listExceptionRenewals(reqAs('owner-1'), 'missing'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('listPendingExceptionRenewals', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).listPendingExceptionRenewals(reqAs('outsider'), 'org-1'),
      ).rejects.toThrow(ForbiddenException);
      expect(notes.listPendingExceptionRenewals).not.toHaveBeenCalled();
    });

    it('allows the org creator', async () => {
      const notes = makeNotes({
        listPendingExceptionRenewals: vi.fn().mockResolvedValue([PENDING_RENEWAL]),
      });
      await expect(
        makeController(notes).listPendingExceptionRenewals(reqAs('org-creator'), 'org-1'),
      ).resolves.toEqual([PENDING_RENEWAL]);
    });

    it('allows an admin who is not the org creator', async () => {
      const notes = makeNotes({
        listPendingExceptionRenewals: vi.fn().mockResolvedValue([PENDING_RENEWAL]),
      });
      await expect(
        makeController(notes).listPendingExceptionRenewals(reqAsAdmin('platform-admin'), 'org-1'),
      ).resolves.toEqual([PENDING_RENEWAL]);
    });

    it('throws BadRequest when orgId is missing', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).listPendingExceptionRenewals(reqAs('org-creator'), ''),
      ).rejects.toThrow('orgId required');
    });

    it('throws NotFound when the org does not exist', async () => {
      const notes = makeNotes({ getOrganizationById: vi.fn().mockResolvedValue(null) });
      await expect(
        makeController(notes).listPendingExceptionRenewals(reqAs('org-creator'), 'missing'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});

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

  describe('requestExceptionRenewal org scoping', () => {
    it('rejects a caller who is the owner but whose org no longer resolves', async () => {
      const notes = makeNotes({ getOrganizationById: vi.fn().mockResolvedValue(null) });
      await expect(
        makeController(notes).requestExceptionRenewal(reqAs('owner-1'), 'exception-1', {
          proposedExpiresAt: '2026-12-01T00:00:00Z',
          justification: 'Delay',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});

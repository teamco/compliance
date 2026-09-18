import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import type { AiClientService } from '@icore/ai-client';
import type { AuthClientService } from '@icore/auth-client';
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
    requestChanges: vi.fn().mockResolvedValue({ ...ASSESSMENT, status: 'changes_requested' }),
    reassignAssessmentApprover: vi
      .fn()
      .mockResolvedValue({ ...ASSESSMENT, approverId: 'approver-2' }),
    removeAssessmentItemControlMapping: vi.fn().mockResolvedValue(undefined),
    archiveAssessmentType: vi.fn().mockResolvedValue({ ...TYPE, archived: true }),
    updateAssessmentItem: vi.fn().mockResolvedValue(ITEM),
    deleteAssessmentItem: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as NotesClientService;
}

function makeController(
  notes: NotesClientService,
  auth: Partial<AuthClientService> = { listOrgMembers: vi.fn().mockResolvedValue([]) },
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

describe('NotesController — assessment org scoping (Phase 1 hardening)', () => {
  describe('getAssessment / approveAssessment', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).getAssessment(reqAs('outsider'), 'assessment-1'),
      ).rejects.toThrow(ForbiddenException);
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

describe('NotesController — reassignAssessmentApprover', () => {
  it('rejects a non-manager caller', async () => {
    const notes = makeNotes();
    const auth = {
      listOrgMembers: vi.fn().mockResolvedValue([{ userId: 'viewer-1', role: 'viewer' }]),
    };
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
      makeController(notes, auth).reassignAssessmentApprover(reqAs('org-creator'), 'assessment-1', {
        newApproverId: 'not-a-member',
      }),
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

import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import type { AiClientService } from '@icore/ai-client';
import type { AuthClientService } from '@icore/auth-client';
import type { NotesClientService } from '@icore/notes-client';
import type {
  Asset,
  AssessmentItem,
  Organization,
  RequirementEvidence,
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

const EVIDENCE: RequirementEvidence = {
  id: 'evidence-1',
  orgId: 'org-1',
  controlId: 'control-1',
  title: 'Firewall config',
  owner: 'IT',
  evidenceType: 'config',
  source: 'internal',
  collectionDate: '2026-09-01T00:00:00Z',
  periodCovered: '2026-Q3',
  expirationDate: '2027-09-01T00:00:00Z',
  verificationStatus: 'pending_review',
  createdBy: 'creator-1',
  verifiedBy: null,
  verifiedAt: null,
} as unknown as RequirementEvidence;

const ASSET: Asset = {
  id: 'asset-1',
  orgId: 'org-1',
  userId: 'org-creator',
  name: 'Prod DB',
  type: 'system',
  criticality: 'high',
  description: '',
  owner: 'IT',
  status: 'active',
} as unknown as Asset;

const ASSESSMENT_ITEM: AssessmentItem = {
  id: 'item-1',
  assessmentId: 'assessment-1',
  orgId: 'org-1',
  subject: 'Access review',
  description: '',
  inherentLikelihood: 3,
  inherentImpact: 3,
  inherentScore: 9,
  inherentLabel: 'high',
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
} as unknown as AssessmentItem;

function makeNotes(overrides: Partial<NotesClientService> = {}): NotesClientService {
  return {
    getEvidence: vi.fn().mockResolvedValue(EVIDENCE),
    getOrganizationById: vi.fn().mockResolvedValue(ORG),
    getAsset: vi.fn().mockResolvedValue(ASSET),
    getAssessmentItem: vi.fn().mockResolvedValue(ASSESSMENT_ITEM),
    updateEvidence: vi.fn().mockResolvedValue({ ...EVIDENCE, title: 'Updated' }),
    deleteEvidence: vi.fn().mockResolvedValue(undefined),
    reviewEvidence: vi.fn().mockResolvedValue({ ...EVIDENCE, verificationStatus: 'verified' }),
    createControlEvidence: vi.fn().mockResolvedValue(EVIDENCE),
    createAssetEvidence: vi.fn().mockResolvedValue(EVIDENCE),
    listAssetEvidence: vi.fn().mockResolvedValue([EVIDENCE]),
    createAssessmentItemEvidence: vi.fn().mockResolvedValue(EVIDENCE),
    ...overrides,
  } as unknown as NotesClientService;
}

function makeController(notes: NotesClientService): NotesController {
  return new NotesController(
    notes,
    {} as unknown as AiClientService,
    new AbilityFactory(),
    {} as unknown as StandardsQueueService,
    { listOrgMembers: vi.fn().mockResolvedValue([]) } as unknown as AuthClientService,
  );
}

function reqAs(uid: string): Request & { user?: VerifiedToken } {
  return { user: { uid } as VerifiedToken } as Request & { user?: VerifiedToken };
}

function reqAsAdmin(uid: string): Request & { user?: VerifiedToken } {
  return { user: { uid, role: 'admin' } as VerifiedToken } as Request & { user?: VerifiedToken };
}

describe('NotesController — evidence authorization', () => {
  describe('updateEvidence', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).updateEvidence(reqAs('outsider'), 'evidence-1', { title: 'X' }),
      ).rejects.toThrow(ForbiddenException);
      expect(notes.updateEvidence).not.toHaveBeenCalled();
    });

    it('allows the org creator', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).updateEvidence(reqAs('org-creator'), 'evidence-1', {
          title: 'Updated',
        }),
      ).resolves.toMatchObject({ title: 'Updated' });
    });

    it('throws NotFound when the evidence does not exist', async () => {
      const notes = makeNotes({ getEvidence: vi.fn().mockResolvedValue(null) });
      await expect(
        makeController(notes).updateEvidence(reqAs('org-creator'), 'missing', { title: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteEvidence', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).deleteEvidence(reqAs('outsider'), 'evidence-1'),
      ).rejects.toThrow(ForbiddenException);
      expect(notes.deleteEvidence).not.toHaveBeenCalled();
    });

    it('allows an admin who is not the org creator', async () => {
      const notes = makeNotes();
      await makeController(notes).deleteEvidence(reqAsAdmin('platform-admin'), 'evidence-1');
      expect(notes.deleteEvidence).toHaveBeenCalledWith('evidence-1');
    });
  });

  describe('reviewEvidence', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).reviewEvidence(reqAs('outsider'), 'evidence-1', {
          decision: 'verified',
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(notes.reviewEvidence).not.toHaveBeenCalled();
    });

    it('lets the org creator review evidence they did not create', async () => {
      const notes = makeNotes();
      await makeController(notes).reviewEvidence(reqAs('org-creator'), 'evidence-1', {
        decision: 'verified',
      });
      expect(notes.reviewEvidence).toHaveBeenCalledWith(
        'evidence-1',
        'org-creator',
        'verified',
        undefined,
      );
    });

    it('propagates the strategy-level self-review check unswallowed', async () => {
      const notes = makeNotes({
        reviewEvidence: vi.fn().mockRejectedValue(new Error('evidence_self_review_forbidden')),
      });
      await expect(
        makeController(notes).reviewEvidence(reqAs('org-creator'), 'evidence-1', {
          decision: 'verified',
        }),
      ).rejects.toThrow('evidence_self_review_forbidden');
    });

    it('throws NotFound when the evidence does not exist', async () => {
      const notes = makeNotes({ getEvidence: vi.fn().mockResolvedValue(null) });
      await expect(
        makeController(notes).reviewEvidence(reqAs('org-creator'), 'missing', {
          decision: 'verified',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('listAssetEvidence', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).listAssetEvidence(reqAs('outsider'), 'asset-1'),
      ).rejects.toThrow(ForbiddenException);
      expect(notes.listAssetEvidence).not.toHaveBeenCalled();
    });

    it('allows the org creator', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).listAssetEvidence(reqAs('org-creator'), 'asset-1'),
      ).resolves.toEqual([EVIDENCE]);
      expect(notes.listAssetEvidence).toHaveBeenCalledWith('asset-1');
    });
  });

  describe('createAssetEvidence', () => {
    const body = {
      title: 'DR runbook',
      owner: 'IT',
      evidenceType: 'doc',
      source: 'internal',
      collectionDate: '2026-09-01T00:00:00Z',
      periodCovered: '2026-Q3',
      expirationDate: '2027-09-01T00:00:00Z',
      url: 'https://example.com',
    } as unknown as Omit<
      RequirementEvidence,
      'id' | 'assetId' | 'createdBy' | 'verificationStatus' | 'verifiedBy' | 'verifiedAt'
    >;

    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).createAssetEvidence(reqAs('outsider'), 'org-1', 'asset-1', body),
      ).rejects.toThrow(ForbiddenException);
      expect(notes.createAssetEvidence).not.toHaveBeenCalled();
    });

    it('throws NotFound when the asset does not belong to the given org', async () => {
      const notes = makeNotes({
        getAsset: vi.fn().mockResolvedValue({ ...ASSET, orgId: 'org-2' }),
      });
      await expect(
        makeController(notes).createAssetEvidence(reqAs('org-creator'), 'org-1', 'asset-1', body),
      ).rejects.toThrow(NotFoundException);
      expect(notes.createAssetEvidence).not.toHaveBeenCalled();
    });

    it('allows the org creator and always creates as pending_review', async () => {
      const notes = makeNotes();
      await makeController(notes).createAssetEvidence(
        reqAs('org-creator'),
        'org-1',
        'asset-1',
        body,
      );
      expect(notes.createAssetEvidence).toHaveBeenCalledWith(
        'org-1',
        'asset-1',
        expect.objectContaining({
          createdBy: 'org-creator',
          verificationStatus: 'pending_review',
          verifiedBy: null,
          verifiedAt: null,
        }),
      );
    });
  });

  describe('createControlEvidence', () => {
    it('ignores a client-supplied verificationStatus and always creates as pending_review', async () => {
      const notes = makeNotes();
      const body = {
        title: 'Firewall config',
        owner: 'IT',
        evidenceType: 'config',
        source: 'internal',
        collectionDate: '2026-09-01T00:00:00Z',
        periodCovered: '2026-Q3',
        expirationDate: '2027-09-01T00:00:00Z',
        verificationStatus: 'verified',
        verifiedBy: 'attacker',
        verifiedAt: '2026-09-01T00:00:00Z',
      } as unknown as Omit<
        RequirementEvidence,
        'id' | 'controlId' | 'createdBy' | 'verificationStatus' | 'verifiedBy' | 'verifiedAt'
      >;

      await makeController(notes).createControlEvidence(
        reqAs('org-creator'),
        'org-1',
        'control-1',
        body,
      );

      expect(notes.createControlEvidence).toHaveBeenCalledWith(
        'org-1',
        'control-1',
        expect.objectContaining({
          createdBy: 'org-creator',
          verificationStatus: 'pending_review',
          verifiedBy: null,
          verifiedAt: null,
        }),
      );
    });
  });

  describe('createAssessmentItemEvidence', () => {
    const body = {
      title: 'Access review evidence',
      owner: 'IT',
      evidenceType: 'doc',
      source: 'internal',
      collectionDate: '2026-09-01T00:00:00Z',
      periodCovered: '2026-Q3',
      expirationDate: '2027-09-01T00:00:00Z',
      url: 'https://example.com',
    } as unknown as Omit<
      RequirementEvidence,
      'id' | 'assessmentItemId' | 'createdBy' | 'verificationStatus' | 'verifiedBy' | 'verifiedAt'
    >;

    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).createAssessmentItemEvidence(
          reqAs('outsider'),
          'org-1',
          'item-1',
          body,
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(notes.createAssessmentItemEvidence).not.toHaveBeenCalled();
    });

    it('throws NotFound when the assessment item does not belong to the given org', async () => {
      const notes = makeNotes({
        getAssessmentItem: vi.fn().mockResolvedValue({ ...ASSESSMENT_ITEM, orgId: 'org-2' }),
      });
      await expect(
        makeController(notes).createAssessmentItemEvidence(
          reqAs('org-creator'),
          'org-1',
          'item-1',
          body,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(notes.createAssessmentItemEvidence).not.toHaveBeenCalled();
    });

    it('throws NotFound when the assessment item does not exist', async () => {
      const notes = makeNotes({ getAssessmentItem: vi.fn().mockResolvedValue(null) });
      await expect(
        makeController(notes).createAssessmentItemEvidence(
          reqAs('org-creator'),
          'org-1',
          'missing-item',
          body,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(notes.createAssessmentItemEvidence).not.toHaveBeenCalled();
    });

    it('allows the org creator and always creates as pending_review', async () => {
      const notes = makeNotes();
      await makeController(notes).createAssessmentItemEvidence(
        reqAs('org-creator'),
        'org-1',
        'item-1',
        body,
      );
      expect(notes.createAssessmentItemEvidence).toHaveBeenCalledWith(
        'org-1',
        'item-1',
        expect.objectContaining({
          createdBy: 'org-creator',
          verificationStatus: 'pending_review',
          verifiedBy: null,
          verifiedAt: null,
        }),
      );
    });
  });
});

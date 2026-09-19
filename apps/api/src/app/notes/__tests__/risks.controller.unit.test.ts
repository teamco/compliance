import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import type { AiClientService } from '@icore/ai-client';
import type { AuthClientService } from '@icore/auth-client';
import type { NotesClientService } from '@icore/notes-client';
import type {
  Organization,
  Risk,
  RiskAcceptance,
  RiskTaxonomyCategory,
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

const RISK: Risk = { id: 'risk-1', orgId: 'org-1' } as unknown as Risk;

const ACCEPTANCE: RiskAcceptance = {
  id: 'acceptance-1',
  riskId: 'risk-1',
  orgId: 'org-1',
  requestedBy: 'owner-1',
  approverId: 'ciso-1',
  status: 'requested',
} as unknown as RiskAcceptance;

const TAXONOMY_CATEGORY: RiskTaxonomyCategory = {
  id: 'category-1',
  orgId: 'org-1',
  name: 'Operational',
} as unknown as RiskTaxonomyCategory;

function makeNotes(overrides: Partial<NotesClientService> = {}): NotesClientService {
  return {
    getOrganizationById: vi.fn().mockResolvedValue(ORG),
    getRisk: vi.fn().mockResolvedValue(RISK),
    listRisks: vi.fn().mockResolvedValue([RISK]),
    createRisk: vi.fn().mockResolvedValue(RISK),
    updateRisk: vi.fn().mockResolvedValue(RISK),
    deleteRisk: vi.fn().mockResolvedValue(undefined),
    removeRiskControlMapping: vi.fn().mockResolvedValue(undefined),
    createRiskAcceptance: vi.fn().mockResolvedValue(ACCEPTANCE),
    getRiskAcceptance: vi.fn().mockResolvedValue(ACCEPTANCE),
    getRiskTaxonomyCategory: vi.fn().mockResolvedValue(TAXONOMY_CATEGORY),
    archiveRiskTaxonomyCategory: vi.fn().mockResolvedValue({
      ...TAXONOMY_CATEGORY,
      archived: true,
    }),
    reassignRiskAcceptanceApprover: vi.fn().mockResolvedValue({
      ...ACCEPTANCE,
      approverId: 'ciso-2',
    }),
    reviewRiskAcceptance: vi.fn().mockResolvedValue(ACCEPTANCE),
    approveRiskAcceptance: vi.fn().mockResolvedValue({ ...ACCEPTANCE, status: 'approved' }),
    rejectRiskAcceptance: vi.fn().mockResolvedValue({ ...ACCEPTANCE, status: 'rejected' }),
    ...overrides,
  } as unknown as NotesClientService;
}

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
      await expect(makeController(notes).getRisk(reqAs('org-creator'), 'risk-1')).resolves.toEqual(
        RISK,
      );
    });

    it('allows an admin', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).getRisk(reqAsAdmin('platform-admin'), 'risk-1'),
      ).resolves.toEqual(RISK);
    });

    it('throws NotFound when the risk does not exist', async () => {
      const notes = makeNotes({ getRisk: vi.fn().mockResolvedValue(null) });
      await expect(makeController(notes).getRisk(reqAs('org-creator'), 'missing')).rejects.toThrow(
        NotFoundException,
      );
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

  describe('archiveRiskTaxonomyCategory', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).archiveRiskTaxonomyCategory(reqAs('outsider'), 'category-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows the org creator', async () => {
      const notes = makeNotes();
      await makeController(notes).archiveRiskTaxonomyCategory(reqAs('org-creator'), 'category-1');
      expect(notes.getRiskTaxonomyCategory).toHaveBeenCalledWith('category-1');
      expect(notes.archiveRiskTaxonomyCategory).toHaveBeenCalledWith('category-1');
    });

    it('throws NotFound when the category does not exist', async () => {
      const notes = makeNotes({ getRiskTaxonomyCategory: vi.fn().mockResolvedValue(null) });
      await expect(
        makeController(notes).archiveRiskTaxonomyCategory(reqAs('org-creator'), 'missing'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});

describe('NotesController — reassignRiskAcceptanceApprover', () => {
  it('rejects a non-manager caller', async () => {
    const notes = makeNotes();
    const auth = {
      listOrgMembers: vi.fn().mockResolvedValue([{ userId: 'viewer-1', role: 'viewer' }]),
    };
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

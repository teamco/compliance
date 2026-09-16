import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import type { AiClientService } from '@icore/ai-client';
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
    getRiskTaxonomyCategory: vi.fn().mockResolvedValue(TAXONOMY_CATEGORY),
    archiveRiskTaxonomyCategory: vi.fn().mockResolvedValue({
      ...TAXONOMY_CATEGORY,
      archived: true,
    }),
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

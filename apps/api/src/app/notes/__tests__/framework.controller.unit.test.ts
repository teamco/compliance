import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import type { AiClientService } from '@icore/ai-client';
import type { AuthClientService } from '@icore/auth-client';
import type { NotesClientService } from '@icore/notes-client';
import type { FrameworkRequirement, Organization, VerifiedToken } from '@icore/shared';
import { NotesController } from '../notes.controller';
import { AbilityFactory } from '../../abilities/ability.factory';
import type { StandardsQueueService } from '../standards-queue.service';

const ORG: Organization = {
  id: 'org-1',
  userId: 'org-creator',
  name: 'Acme',
} as unknown as Organization;

const REQUIREMENT = {
  id: 'req-1',
  frameworkId: 'fw-1',
  code: 'GV.PO-01',
} as unknown as FrameworkRequirement;

function makeNotes(overrides: Partial<NotesClientService> = {}): NotesClientService {
  return {
    getOrganizationById: vi.fn().mockResolvedValue(ORG),
    listFrameworkEvidence: vi.fn().mockResolvedValue([]),
    listFrameworkAssessments: vi.fn().mockResolvedValue([]),
    listFrameworkActivities: vi.fn().mockResolvedValue([]),
    listRequirements: vi.fn().mockResolvedValue([REQUIREMENT]),
    getRequirement: vi.fn().mockResolvedValue(REQUIREMENT),
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

  describe('listRequirements', () => {
    it('rejects a caller outside the org when orgId is provided', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).listRequirements(reqAs('outsider'), 'fw-1', 'org-1'),
      ).rejects.toThrow(ForbiddenException);
      expect(notes.listRequirements).not.toHaveBeenCalled();
    });

    it('allows the org creator when orgId is provided', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).listRequirements(reqAs('org-creator'), 'fw-1', 'org-1'),
      ).resolves.toEqual([REQUIREMENT]);
      expect(notes.listRequirements).toHaveBeenCalledWith('fw-1', 'org-1');
    });

    it('rejects when orgId is missing', async () => {
      const notes = makeNotes();
      await expect(makeController(notes).listRequirements(reqAs('anyone'), 'fw-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(notes.listRequirements).not.toHaveBeenCalled();
    });

    it('throws NotFound when orgId is provided but the org does not exist', async () => {
      const notes = makeNotes({ getOrganizationById: vi.fn().mockResolvedValue(null) });
      await expect(
        makeController(notes).listRequirements(reqAs('org-creator'), 'fw-1', 'missing-org'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getRequirement', () => {
    it('rejects a caller outside the org when orgId is provided', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).getRequirement(reqAs('outsider'), 'fw-1', 'req-1', 'org-1'),
      ).rejects.toThrow(ForbiddenException);
      expect(notes.getRequirement).not.toHaveBeenCalled();
    });

    it('allows the org creator when orgId is provided', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).getRequirement(reqAs('org-creator'), 'fw-1', 'req-1', 'org-1'),
      ).resolves.toEqual(REQUIREMENT);
      expect(notes.getRequirement).toHaveBeenCalledWith('fw-1', 'req-1', 'org-1');
    });

    it('rejects when orgId is missing', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).getRequirement(reqAs('anyone'), 'fw-1', 'req-1'),
      ).rejects.toThrow(BadRequestException);
      expect(notes.getRequirement).not.toHaveBeenCalled();
    });

    it('throws NotFound when the requirement does not exist', async () => {
      const notes = makeNotes({ getRequirement: vi.fn().mockResolvedValue(null) });
      await expect(
        makeController(notes).getRequirement(reqAs('org-creator'), 'fw-1', 'missing', 'org-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});

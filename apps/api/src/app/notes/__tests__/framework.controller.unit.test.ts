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

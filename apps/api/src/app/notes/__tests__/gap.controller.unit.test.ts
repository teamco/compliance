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
        makeController(notes).saveGap(reqAs('org-creator'), {
          orgId: 'org-1',
          result: {} as never,
        }),
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
      await expect(makeController(notes).listGap(reqAs('outsider'), 'org-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
    it('allows the org creator', async () => {
      const notes = makeNotes();
      await expect(makeController(notes).listGap(reqAs('org-creator'), 'org-1')).resolves.toEqual(
        [],
      );
    });
  });

  describe('getGap', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(makeController(notes).getGap(reqAs('outsider'), 'gap-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
    it('allows the org creator', async () => {
      const notes = makeNotes();
      await expect(makeController(notes).getGap(reqAs('org-creator'), 'gap-1')).resolves.toEqual(
        GAP,
      );
    });
    it('throws NotFound when the gap analysis does not exist', async () => {
      const notes = makeNotes({ getGapAnalysis: vi.fn().mockResolvedValue(null) });
      await expect(makeController(notes).getGap(reqAs('org-creator'), 'missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});

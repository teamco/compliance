import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import type { AiClientService } from '@icore/ai-client';
import type { AuthClientService } from '@icore/auth-client';
import type { NotesClientService } from '@icore/notes-client';
import type { Asset, Organization, VerifiedToken } from '@icore/shared';
import { NotesController } from '../notes.controller';
import { AbilityFactory } from '../../abilities/ability.factory';
import type { StandardsQueueService } from '../standards-queue.service';

const ORG: Organization = {
  id: 'org-1',
  userId: 'org-creator',
  name: 'Acme',
} as unknown as Organization;

const ASSET: Asset = {
  id: 'asset-1',
  orgId: 'org-1',
  userId: 'org-creator',
  name: 'Prod DB',
  type: 'database',
  criticality: 'high',
  description: 'D',
  owner: 'org-creator',
  status: 'active',
} as unknown as Asset;

function makeNotes(overrides: Partial<NotesClientService> = {}): NotesClientService {
  return {
    getOrganizationById: vi.fn().mockResolvedValue(ORG),
    getAsset: vi.fn().mockResolvedValue(ASSET),
    listAssets: vi.fn().mockResolvedValue([]),
    createAsset: vi.fn().mockResolvedValue(ASSET),
    updateAsset: vi.fn().mockResolvedValue(ASSET),
    deleteAsset: vi.fn().mockResolvedValue(undefined),
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

describe('NotesController — asset org scoping', () => {
  describe('listAssets', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(makeController(notes).listAssets(reqAs('outsider'), 'org-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
    it('allows the org creator', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).listAssets(reqAs('org-creator'), 'org-1'),
      ).resolves.toEqual([]);
    });
  });

  describe('createAsset', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).createAsset(reqAs('outsider'), 'org-1', {} as never),
      ).rejects.toThrow(ForbiddenException);
    });
    it('allows the org creator', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).createAsset(reqAs('org-creator'), 'org-1', {} as never),
      ).resolves.toEqual(ASSET);
    });
  });

  describe('getAsset', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(makeController(notes).getAsset(reqAs('outsider'), 'asset-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
    it('allows the org creator', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).getAsset(reqAs('org-creator'), 'asset-1'),
      ).resolves.toEqual(ASSET);
    });
    it('throws NotFound when the asset does not exist', async () => {
      const notes = makeNotes({ getAsset: vi.fn().mockResolvedValue(null) });
      await expect(makeController(notes).getAsset(reqAs('org-creator'), 'missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateAsset', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).updateAsset(reqAs('outsider'), 'asset-1', {}),
      ).rejects.toThrow(ForbiddenException);
    });
    it('allows the org creator', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).updateAsset(reqAs('org-creator'), 'asset-1', {}),
      ).resolves.toEqual(ASSET);
    });
  });

  describe('deleteAsset', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(makeController(notes).deleteAsset(reqAs('outsider'), 'asset-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
    it('allows the org creator', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).deleteAsset(reqAs('org-creator'), 'asset-1'),
      ).resolves.toBeUndefined();
    });
  });
});

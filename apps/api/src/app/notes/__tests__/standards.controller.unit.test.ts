import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import type { AiClientService } from '@icore/ai-client';
import type { AuthClientService } from '@icore/auth-client';
import type { NotesClientService } from '@icore/notes-client';
import type {
  Organization,
  StandardsDocument,
  StandardsSnapshot,
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

const DOC: StandardsDocument = {
  id: 'doc-1',
  userId: 'org-creator',
  orgId: 'org-1',
  frameworkIds: ['fw-1'],
  standards: [],
  status: 'ready',
  workflowStatus: 'draft',
  createdAt: '2026-01-01T00:00:00Z',
} as unknown as StandardsDocument;

const SNAPSHOT: StandardsSnapshot = {
  id: 'snap-1',
  documentId: 'doc-1',
  version: 1,
  workflowStatus: 'approved',
  standards: [],
  createdAt: '2026-01-01T00:00:00Z',
} as unknown as StandardsSnapshot;

function makeNotes(overrides: Partial<NotesClientService> = {}): NotesClientService {
  return {
    getOrganizationById: vi.fn().mockResolvedValue(ORG),
    getStandardsDocument: vi.fn().mockResolvedValue(DOC),
    getSnapshot: vi.fn().mockResolvedValue(SNAPSHOT),
    listStandardsDocuments: vi.fn().mockResolvedValue([]),
    transitionWorkflow: vi.fn().mockResolvedValue(DOC),
    logAuditEvent: vi.fn().mockResolvedValue(undefined),
    updateStandard: vi.fn().mockResolvedValue(DOC),
    listSnapshots: vi.fn().mockResolvedValue([]),
    failStandardsDocument: vi.fn().mockResolvedValue(undefined),
    deleteStandardsDocument: vi.fn().mockResolvedValue(undefined),
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

describe('NotesController — standards org scoping', () => {
  describe('listStandards', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(makeController(notes).listStandards(reqAs('outsider'), 'org-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
    it('allows the org creator', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).listStandards(reqAs('org-creator'), 'org-1'),
      ).resolves.toEqual([]);
    });
  });

  describe('getStandards', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(makeController(notes).getStandards(reqAs('outsider'), 'doc-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
    it('allows the org creator', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).getStandards(reqAs('org-creator'), 'doc-1'),
      ).resolves.toEqual(DOC);
    });
    it('throws NotFound when the document does not exist', async () => {
      const notes = makeNotes({ getStandardsDocument: vi.fn().mockResolvedValue(null) });
      await expect(
        makeController(notes).getStandards(reqAs('org-creator'), 'missing'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('transitionWorkflow', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).transitionWorkflow(reqAs('outsider'), 'doc-1', {
          transition: 'submit',
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(notes.transitionWorkflow).not.toHaveBeenCalled();
    });
    it('allows the org creator', async () => {
      const notes = makeNotes();
      await makeController(notes).transitionWorkflow(reqAs('org-creator'), 'doc-1', {
        transition: 'submit',
      });
      expect(notes.transitionWorkflow).toHaveBeenCalledWith('doc-1', 'submit');
    });
  });

  describe('updateStandard', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).updateStandard(reqAs('outsider'), 'doc-1', 'CODE-1', {}),
      ).rejects.toThrow(ForbiddenException);
    });
    it('allows the org creator', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).updateStandard(reqAs('org-creator'), 'doc-1', 'CODE-1', {}),
      ).resolves.toEqual(DOC);
    });
  });

  describe('listSnapshots', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(makeController(notes).listSnapshots(reqAs('outsider'), 'doc-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
    it('allows the org creator', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).listSnapshots(reqAs('org-creator'), 'doc-1'),
      ).resolves.toEqual([]);
    });
  });

  describe('getSnapshot', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(makeController(notes).getSnapshot(reqAs('outsider'), 'snap-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
    it('allows the org creator (resolved via the parent document)', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).getSnapshot(reqAs('org-creator'), 'snap-1'),
      ).resolves.toEqual(SNAPSHOT);
    });
    it('throws NotFound when the snapshot does not exist', async () => {
      const notes = makeNotes({ getSnapshot: vi.fn().mockResolvedValue(null) });
      await expect(
        makeController(notes).getSnapshot(reqAs('org-creator'), 'missing'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteStandards', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).deleteStandards(reqAs('outsider'), 'doc-1'),
      ).rejects.toThrow(ForbiddenException);
    });
    it('allows the org creator', async () => {
      const notes = makeNotes();
      await makeController(notes).deleteStandards(reqAs('org-creator'), 'doc-1');
      expect(notes.deleteStandardsDocument).toHaveBeenCalledWith('doc-1');
    });
  });

  describe('retryStandards', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes({
        getStandardsDocument: vi.fn().mockResolvedValue({ ...DOC, status: 'failed' }),
      });
      await expect(
        makeController(notes).retryStandards(reqAs('outsider'), 'doc-1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});

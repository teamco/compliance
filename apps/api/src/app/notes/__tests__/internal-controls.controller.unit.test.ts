import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import type { AiClientService } from '@icore/ai-client';
import type { AuthClientService } from '@icore/auth-client';
import type { NotesClientService } from '@icore/notes-client';
import type { InternalControl, Organization, VerifiedToken } from '@icore/shared';
import { NotesController } from '../notes.controller';
import { AbilityFactory } from '../../abilities/ability.factory';
import type { StandardsQueueService } from '../standards-queue.service';

const ORG: Organization = {
  id: 'org-1',
  userId: 'org-creator',
  name: 'Acme',
} as unknown as Organization;

const CONTROL: InternalControl = {
  id: 'control-1',
  orgId: 'org-1',
  code: 'AC-01',
  title: 'Access Control',
  description: 'D',
  owner: 'org-creator',
} as unknown as InternalControl;

function makeNotes(overrides: Partial<NotesClientService> = {}): NotesClientService {
  return {
    getOrganizationById: vi.fn().mockResolvedValue(ORG),
    getInternalControl: vi.fn().mockResolvedValue(CONTROL),
    listInternalControls: vi.fn().mockResolvedValue([]),
    updateInternalControl: vi.fn().mockResolvedValue(CONTROL),
    deleteInternalControl: vi.fn().mockResolvedValue(undefined),
    addControlFrameworkMapping: vi.fn().mockResolvedValue(CONTROL),
    removeControlFrameworkMapping: vi.fn().mockResolvedValue(CONTROL),
    listControlEvidence: vi.fn().mockResolvedValue([]),
    createControlEvidence: vi.fn().mockResolvedValue({}),
    listControlAssessments: vi.fn().mockResolvedValue([]),
    createControlAssessment: vi.fn().mockResolvedValue({}),
    listControlActivity: vi.fn().mockResolvedValue([]),
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

describe('NotesController — internal control org scoping', () => {
  describe('listInternalControls', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).listInternalControls(reqAs('outsider'), 'org-1'),
      ).rejects.toThrow(ForbiddenException);
    });
    it('allows the org creator', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).listInternalControls(reqAs('org-creator'), 'org-1'),
      ).resolves.toEqual([]);
    });
  });

  describe('getInternalControl', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).getInternalControl(reqAs('outsider'), 'control-1'),
      ).rejects.toThrow(ForbiddenException);
    });
    it('allows the org creator', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).getInternalControl(reqAs('org-creator'), 'control-1'),
      ).resolves.toEqual(CONTROL);
    });
    it('throws NotFound when the control does not exist', async () => {
      const notes = makeNotes({ getInternalControl: vi.fn().mockResolvedValue(null) });
      await expect(
        makeController(notes).getInternalControl(reqAs('org-creator'), 'missing'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateInternalControl', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).updateInternalControl(reqAs('outsider'), 'control-1', {}),
      ).rejects.toThrow(ForbiddenException);
    });
    it('allows the org creator', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).updateInternalControl(reqAs('org-creator'), 'control-1', {}),
      ).resolves.toEqual(CONTROL);
    });
  });

  describe('deleteInternalControl', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).deleteInternalControl(reqAs('outsider'), 'control-1'),
      ).rejects.toThrow(ForbiddenException);
    });
    it('allows the org creator', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).deleteInternalControl(reqAs('org-creator'), 'control-1'),
      ).resolves.toBeUndefined();
    });
  });

  describe('addControlFrameworkMapping', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).addControlFrameworkMapping(
          reqAs('outsider'),
          'control-1',
          {} as never,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
    it('allows the org creator', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).addControlFrameworkMapping(
          reqAs('org-creator'),
          'control-1',
          {} as never,
        ),
      ).resolves.toEqual(CONTROL);
    });
  });

  describe('removeControlFrameworkMapping', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).removeControlFrameworkMapping(
          reqAs('outsider'),
          'control-1',
          'map-1',
        ),
      ).rejects.toThrow(ForbiddenException);
    });
    it('allows the org creator', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).removeControlFrameworkMapping(
          reqAs('org-creator'),
          'control-1',
          'map-1',
        ),
      ).resolves.toEqual(CONTROL);
    });
  });

  describe('listControlEvidence', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).listControlEvidence(reqAs('outsider'), 'control-1'),
      ).rejects.toThrow(ForbiddenException);
    });
    it('allows the org creator', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).listControlEvidence(reqAs('org-creator'), 'control-1'),
      ).resolves.toEqual([]);
    });
  });

  describe('createControlEvidence', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).createControlEvidence(
          reqAs('outsider'),
          'org-1',
          'control-1',
          {} as never,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
    it('allows the org creator', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).createControlEvidence(
          reqAs('org-creator'),
          'org-1',
          'control-1',
          {} as never,
        ),
      ).resolves.toEqual({});
    });
  });

  describe('listControlAssessments', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).listControlAssessments(reqAs('outsider'), 'control-1'),
      ).rejects.toThrow(ForbiddenException);
    });
    it('allows the org creator', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).listControlAssessments(reqAs('org-creator'), 'control-1'),
      ).resolves.toEqual([]);
    });
  });

  describe('createControlAssessment', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).createControlAssessment(
          reqAs('outsider'),
          'org-1',
          'control-1',
          {} as never,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
    it('allows the org creator', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).createControlAssessment(
          reqAs('org-creator'),
          'org-1',
          'control-1',
          {} as never,
        ),
      ).resolves.toEqual({});
    });
  });

  describe('listControlActivity', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).listControlActivity(reqAs('outsider'), 'control-1'),
      ).rejects.toThrow(ForbiddenException);
    });
    it('allows the org creator', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).listControlActivity(reqAs('org-creator'), 'control-1'),
      ).resolves.toEqual([]);
    });
  });
});

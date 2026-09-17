import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';
import type { AiClientService } from '@icore/ai-client';
import type { NotesClientService } from '@icore/notes-client';
import type { AuthClientService } from '@icore/auth-client';
import type { Organization, VerifiedToken } from '@icore/shared';
import { NotesController } from '../notes.controller';
import { AbilityFactory } from '../../abilities/ability.factory';
import type { StandardsQueueService } from '../standards-queue.service';

const ORG: Organization = {
  id: 'org-1',
  userId: 'owner-1',
  name: 'Acme',
} as unknown as Organization;

function makeNotes(overrides: Partial<NotesClientService> = {}): NotesClientService {
  return {
    getOrganizationById: vi.fn().mockResolvedValue(ORG),
    getPolicy: vi.fn(),
    ...overrides,
  } as unknown as NotesClientService;
}

function makeController(
  notes: NotesClientService,
  auth: { listOrgMembers: ReturnType<typeof vi.fn> },
): NotesController {
  return new NotesController(
    notes,
    {} as unknown as AiClientService,
    new AbilityFactory(),
    {} as unknown as StandardsQueueService,
    auth as unknown as AuthClientService,
  );
}

function reqAs(uid: string, role?: string): Request & { user?: VerifiedToken } {
  return { user: { uid, role } as VerifiedToken } as Request & { user?: VerifiedToken };
}

describe('checkOrgAccess role matrix', () => {
  it('allows the owner full access without a membership lookup', async () => {
    const auth = { listOrgMembers: vi.fn() };
    const notes = makeNotes({ getPolicy: vi.fn().mockResolvedValue({ id: 'p1', orgId: 'org-1' }) });
    const controller = makeController(notes, auth);
    await expect(controller.getPolicy(reqAs('owner-1'), 'p1')).resolves.toBeDefined();
    expect(auth.listOrgMembers).not.toHaveBeenCalled();
  });

  it('allows a platform admin full access without a membership lookup', async () => {
    const auth = { listOrgMembers: vi.fn() };
    const notes = makeNotes({ getPolicy: vi.fn().mockResolvedValue({ id: 'p1', orgId: 'org-1' }) });
    const controller = makeController(notes, auth);
    await expect(
      controller.getPolicy(reqAs('platform-admin-1', 'admin'), 'p1'),
    ).resolves.toBeDefined();
    expect(auth.listOrgMembers).not.toHaveBeenCalled();
  });

  it('allows an org-admin member read access', async () => {
    const auth = {
      listOrgMembers: vi.fn().mockResolvedValue([{ userId: 'member-1', role: 'admin' }]),
    };
    const notes = makeNotes({ getPolicy: vi.fn().mockResolvedValue({ id: 'p1', orgId: 'org-1' }) });
    const controller = makeController(notes, auth);
    await expect(controller.getPolicy(reqAs('member-1'), 'p1')).resolves.toBeDefined();
  });

  it('allows an org-admin member to write', async () => {
    const auth = {
      listOrgMembers: vi.fn().mockResolvedValue([{ userId: 'member-1', role: 'admin' }]),
    };
    const notes = makeNotes({
      getPolicy: vi.fn().mockResolvedValue({ id: 'p1', orgId: 'org-1' }),
      updatePolicy: vi.fn().mockResolvedValue({ id: 'p1', title: 'Updated' }),
    });
    const controller = makeController(notes, auth);
    await expect(
      controller.updatePolicy(reqAs('member-1'), 'p1', { title: 'Updated' }),
    ).resolves.toBeDefined();
    expect(notes.updatePolicy).toHaveBeenCalled();
  });

  it('allows a member holding the owner role to write', async () => {
    const auth = {
      listOrgMembers: vi.fn().mockResolvedValue([{ userId: 'member-1', role: 'owner' }]),
    };
    const notes = makeNotes({
      getPolicy: vi.fn().mockResolvedValue({ id: 'p1', orgId: 'org-1' }),
      updatePolicy: vi.fn().mockResolvedValue({ id: 'p1', title: 'Updated' }),
    });
    const controller = makeController(notes, auth);
    await expect(
      controller.updatePolicy(reqAs('member-1'), 'p1', { title: 'Updated' }),
    ).resolves.toBeDefined();
    expect(notes.updatePolicy).toHaveBeenCalled();
  });

  // Regression guard: the role check must be an allowlist. OrgMember.role is an
  // unconstrained `string`, so an unrecognized value must deny writes, not grant them.
  it('rejects a member with an unrecognized role attempting a write', async () => {
    const auth = {
      listOrgMembers: vi.fn().mockResolvedValue([{ userId: 'member-1', role: 'auditor' }]),
    };
    const notes = makeNotes({
      getPolicy: vi.fn().mockResolvedValue({ id: 'p1', orgId: 'org-1' }),
      updatePolicy: vi.fn(),
    });
    const controller = makeController(notes, auth);
    await expect(controller.updatePolicy(reqAs('member-1'), 'p1', {})).rejects.toThrow(
      ForbiddenException,
    );
    expect(notes.updatePolicy).not.toHaveBeenCalled();
  });

  it('allows a member with an unrecognized role read access', async () => {
    const auth = {
      listOrgMembers: vi.fn().mockResolvedValue([{ userId: 'member-1', role: 'auditor' }]),
    };
    const notes = makeNotes({ getPolicy: vi.fn().mockResolvedValue({ id: 'p1', orgId: 'org-1' }) });
    const controller = makeController(notes, auth);
    await expect(controller.getPolicy(reqAs('member-1'), 'p1')).resolves.toBeDefined();
  });

  it('allows a viewer read access', async () => {
    const auth = {
      listOrgMembers: vi.fn().mockResolvedValue([{ userId: 'member-1', role: 'viewer' }]),
    };
    const notes = makeNotes({ getPolicy: vi.fn().mockResolvedValue({ id: 'p1', orgId: 'org-1' }) });
    const controller = makeController(notes, auth);
    await expect(controller.getPolicy(reqAs('member-1'), 'p1')).resolves.toBeDefined();
  });

  it('rejects a viewer attempting a write', async () => {
    const auth = {
      listOrgMembers: vi.fn().mockResolvedValue([{ userId: 'member-1', role: 'viewer' }]),
    };
    const notes = makeNotes({
      getPolicy: vi.fn().mockResolvedValue({ id: 'p1', orgId: 'org-1' }),
      updatePolicy: vi.fn(),
    });
    const controller = makeController(notes, auth);
    await expect(controller.updatePolicy(reqAs('member-1'), 'p1', {})).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejects a non-member entirely', async () => {
    const auth = { listOrgMembers: vi.fn().mockResolvedValue([]) };
    const notes = makeNotes({ getPolicy: vi.fn().mockResolvedValue({ id: 'p1', orgId: 'org-1' }) });
    const controller = makeController(notes, auth);
    await expect(controller.getPolicy(reqAs('outsider'), 'p1')).rejects.toThrow(ForbiddenException);
  });
});

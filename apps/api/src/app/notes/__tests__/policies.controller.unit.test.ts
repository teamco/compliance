import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import type { AiClientService } from '@icore/ai-client';
import type { NotesClientService } from '@icore/notes-client';
import type { Organization, Policy, VerifiedToken } from '@icore/shared';
import { NotesController } from '../notes.controller';
import { AbilityFactory } from '../../abilities/ability.factory';
import type { StandardsQueueService } from '../standards-queue.service';

const ORG: Organization = {
  id: 'org-1',
  userId: 'org-creator',
  name: 'Acme',
} as unknown as Organization;

const POLICY: Policy = {
  id: 'policy-1',
  orgId: 'org-1',
  userId: 'author-1',
  frameworkId: 'fw-1',
  title: 'Access Control Policy',
  content: 'C',
  workflowStatus: 'in_review',
  version: 1,
  templateId: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
} as unknown as Policy;

function makeNotes(overrides: Partial<NotesClientService> = {}): NotesClientService {
  return {
    getOrganizationById: vi.fn().mockResolvedValue(ORG),
    getPolicy: vi.fn().mockResolvedValue(POLICY),
    transitionPolicyWorkflow: vi.fn().mockResolvedValue({ ...POLICY, workflowStatus: 'approved' }),
    listPolicyActivity: vi.fn().mockResolvedValue([]),
    listPolicies: vi.fn().mockResolvedValue([]),
    createPolicy: vi.fn().mockResolvedValue(POLICY),
    cloneTemplate: vi.fn().mockResolvedValue(POLICY),
    updatePolicy: vi.fn().mockResolvedValue(POLICY),
    deletePolicy: vi.fn().mockResolvedValue(undefined),
    listPolicyControls: vi.fn().mockResolvedValue([]),
    addPolicyControl: vi.fn().mockResolvedValue({}),
    getPolicyControl: vi.fn().mockResolvedValue(null),
    removePolicyControl: vi.fn().mockResolvedValue(undefined),
    listPoliciesForControl: vi.fn().mockResolvedValue([]),
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

describe('NotesController — policy workflow org scoping', () => {
  describe('transitionPolicyWorkflow', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).transitionPolicyWorkflow(reqAs('outsider'), 'policy-1', {
          transition: 'approve',
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(notes.transitionPolicyWorkflow).not.toHaveBeenCalled();
    });

    it('lets the org creator approve', async () => {
      const notes = makeNotes();
      await makeController(notes).transitionPolicyWorkflow(reqAs('org-creator'), 'policy-1', {
        transition: 'approve',
      });
      expect(notes.transitionPolicyWorkflow).toHaveBeenCalledWith(
        'policy-1',
        'approve',
        'org-creator',
      );
    });

    it('throws NotFound when the policy does not exist', async () => {
      const notes = makeNotes({ getPolicy: vi.fn().mockResolvedValue(null) });
      await expect(
        makeController(notes).transitionPolicyWorkflow(reqAs('org-creator'), 'missing', {
          transition: 'approve',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects an invalid transition value with a 400 before touching the strategy', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).transitionPolicyWorkflow(reqAs('org-creator'), 'policy-1', {
          transition: 'not_a_real_transition' as never,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(notes.getPolicy).not.toHaveBeenCalled();
      expect(notes.transitionPolicyWorkflow).not.toHaveBeenCalled();
    });

    it('propagates the strategy-level self-approval guard unswallowed', async () => {
      const notes = makeNotes({
        transitionPolicyWorkflow: vi
          .fn()
          .mockRejectedValue(new Error('policy_self_approval_forbidden')),
      });
      await expect(
        makeController(notes).transitionPolicyWorkflow(reqAs('org-creator'), 'policy-1', {
          transition: 'approve',
        }),
      ).rejects.toThrow('policy_self_approval_forbidden');
    });
  });

  describe('listPolicyActivity', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).listPolicyActivity(reqAs('outsider'), 'policy-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows the org creator', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).listPolicyActivity(reqAs('org-creator'), 'policy-1'),
      ).resolves.toEqual([]);
    });
  });
});

describe('listPolicies', () => {
  it('rejects a caller outside the org', async () => {
    const notes = makeNotes();
    await expect(makeController(notes).listPolicies(reqAs('outsider'), 'org-1')).rejects.toThrow(
      ForbiddenException,
    );
  });
  it('allows the org creator', async () => {
    const notes = makeNotes();
    await expect(
      makeController(notes).listPolicies(reqAs('org-creator'), 'org-1'),
    ).resolves.toEqual([]);
  });
});

describe('createPolicy', () => {
  it('rejects a caller outside the org', async () => {
    const notes = makeNotes();
    await expect(
      makeController(notes).createPolicy(reqAs('outsider'), 'org-1', {} as never),
    ).rejects.toThrow(ForbiddenException);
  });
  it('allows the org creator', async () => {
    const notes = makeNotes();
    await expect(
      makeController(notes).createPolicy(reqAs('org-creator'), 'org-1', {} as never),
    ).resolves.toEqual(POLICY);
  });
});

describe('cloneTemplate', () => {
  it('rejects a caller outside the org', async () => {
    const notes = makeNotes();
    await expect(
      makeController(notes).cloneTemplate(reqAs('outsider'), 'org-1', 'template-1'),
    ).rejects.toThrow(ForbiddenException);
  });
  it('allows the org creator', async () => {
    const notes = makeNotes();
    await expect(
      makeController(notes).cloneTemplate(reqAs('org-creator'), 'org-1', 'template-1'),
    ).resolves.toEqual(POLICY);
  });
});

describe('getPolicy', () => {
  it('rejects a caller outside the org', async () => {
    const notes = makeNotes();
    await expect(makeController(notes).getPolicy(reqAs('outsider'), 'policy-1')).rejects.toThrow(
      ForbiddenException,
    );
  });
  it('allows the org creator', async () => {
    const notes = makeNotes();
    await expect(
      makeController(notes).getPolicy(reqAs('org-creator'), 'policy-1'),
    ).resolves.toEqual(POLICY);
  });
});

describe('updatePolicy', () => {
  it('rejects a caller outside the org', async () => {
    const notes = makeNotes();
    await expect(
      makeController(notes).updatePolicy(reqAs('outsider'), 'policy-1', {}),
    ).rejects.toThrow(ForbiddenException);
  });
  it('allows the org creator', async () => {
    const notes = makeNotes();
    await expect(
      makeController(notes).updatePolicy(reqAs('org-creator'), 'policy-1', {}),
    ).resolves.toEqual(POLICY);
  });
});

describe('deletePolicy', () => {
  it('rejects a caller outside the org', async () => {
    const notes = makeNotes();
    await expect(makeController(notes).deletePolicy(reqAs('outsider'), 'policy-1')).rejects.toThrow(
      ForbiddenException,
    );
  });
  it('allows the org creator', async () => {
    const notes = makeNotes();
    await expect(
      makeController(notes).deletePolicy(reqAs('org-creator'), 'policy-1'),
    ).resolves.toBeUndefined();
  });
});

describe('listPolicyControls', () => {
  it('rejects a caller outside the org', async () => {
    const notes = makeNotes();
    await expect(
      makeController(notes).listPolicyControls(reqAs('outsider'), 'policy-1'),
    ).rejects.toThrow(ForbiddenException);
  });
  it('allows the org creator', async () => {
    const notes = makeNotes();
    await expect(
      makeController(notes).listPolicyControls(reqAs('org-creator'), 'policy-1'),
    ).resolves.toEqual([]);
  });
});

describe('addPolicyControl', () => {
  it('rejects a caller outside the org', async () => {
    const notes = makeNotes();
    await expect(
      makeController(notes).addPolicyControl(reqAs('outsider'), 'policy-1', {} as never),
    ).rejects.toThrow(ForbiddenException);
  });
  it('allows the org creator', async () => {
    const notes = makeNotes();
    await expect(
      makeController(notes).addPolicyControl(reqAs('org-creator'), 'policy-1', {} as never),
    ).resolves.toEqual({});
  });
});

describe('removePolicyControl', () => {
  it('rejects a caller outside the org', async () => {
    const notes = makeNotes({
      getPolicyControl: vi.fn().mockResolvedValue({
        id: 'map-1',
        policyId: 'policy-1',
        controlCode: 'AC-01',
        frameworkId: 'fw-1',
      }),
    });
    await expect(
      makeController(notes).removePolicyControl(reqAs('outsider'), 'map-1'),
    ).rejects.toThrow(ForbiddenException);
  });
  it('allows the org creator', async () => {
    const notes = makeNotes({
      getPolicyControl: vi.fn().mockResolvedValue({
        id: 'map-1',
        policyId: 'policy-1',
        controlCode: 'AC-01',
        frameworkId: 'fw-1',
      }),
    });
    await expect(
      makeController(notes).removePolicyControl(reqAs('org-creator'), 'map-1'),
    ).resolves.toBeUndefined();
  });
  it('throws NotFound when the mapping does not exist', async () => {
    const notes = makeNotes({ getPolicyControl: vi.fn().mockResolvedValue(null) });
    await expect(
      makeController(notes).removePolicyControl(reqAs('org-creator'), 'missing'),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('listPoliciesForControl', () => {
  it('rejects a caller outside the org', async () => {
    const notes = makeNotes();
    await expect(
      makeController(notes).listPoliciesForControl(reqAs('outsider'), 'AC-01', 'fw-1', 'org-1'),
    ).rejects.toThrow(ForbiddenException);
  });
  it('allows the org creator and passes orgId through', async () => {
    const notes = makeNotes();
    await makeController(notes).listPoliciesForControl(
      reqAs('org-creator'),
      'AC-01',
      'fw-1',
      'org-1',
    );
    expect(notes.listPoliciesForControl).toHaveBeenCalledWith('AC-01', 'fw-1', 'org-1');
  });
  it('rejects when orgId is missing', async () => {
    const notes = makeNotes();
    await expect(
      makeController(notes).listPoliciesForControl(reqAs('org-creator'), 'AC-01', 'fw-1', ''),
    ).rejects.toThrow(BadRequestException);
  });
});

import type { ClientProxy } from '@nestjs/microservices';
import { signHmac } from '@icore/shared';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotesClientService } from '../notes-client.service';

const ORIG = { ...process.env };

function makeClient(send: ClientProxy['send']): ClientProxy {
  return { send } as unknown as ClientProxy;
}

describe('NotesClientService', () => {
  beforeEach(() => {
    delete process.env['MS_HMAC_SECRET'];
    delete process.env['NODE_ENV'];
  });

  afterEach(() => {
    Object.assign(process.env, ORIG);
  });

  it('getFramework() forwards id and resolves the RPC result', async () => {
    const send = vi.fn().mockReturnValue(of({ id: 'f1' }));
    const service = new NotesClientService(makeClient(send));

    const result = await service.getFramework('f1');

    expect(result).toEqual({ id: 'f1' });
    expect(send).toHaveBeenCalledWith('notes.frameworks.get', { id: 'f1' });
  });

  it('createOrganization() forwards userId and data', async () => {
    const send = vi.fn().mockReturnValue(of({ id: 'o1', name: 'Acme' }));
    const service = new NotesClientService(makeClient(send));

    await service.createOrganization('u1', { name: 'Acme' } as never);

    expect(send).toHaveBeenCalledWith('notes.org.create', { userId: 'u1', data: { name: 'Acme' } });
  });

  it('saveStandardsDocument() resolves void even though the RPC returns a value', async () => {
    const send = vi.fn().mockReturnValue(of({ ok: true }));
    const service = new NotesClientService(makeClient(send));

    const result = await service.saveStandardsDocument('doc1', []);

    expect(result).toBeUndefined();
    expect(send).toHaveBeenCalledWith('notes.standards.save', { id: 'doc1', standards: [] });
  });

  it('logAiUsage() fires and forgets without awaiting the RPC result', () => {
    const send = vi.fn().mockReturnValue(of({ ok: true }));
    const service = new NotesClientService(makeClient(send));
    const entry = { operation: 'chat', model: 'claude-sonnet-4-6' } as never;

    const result = service.logAiUsage(entry);

    expect(result).toBeUndefined();
    expect(send).toHaveBeenCalledWith('admin.ai-usage.log', entry);
  });

  it('propagates an RPC error', async () => {
    const send = vi.fn().mockReturnValue(throwError(() => new Error('not found')));
    const service = new NotesClientService(makeClient(send));

    await expect(service.getFramework('f1')).rejects.toThrow('not found');
  });

  it('signs the payload when MS_HMAC_SECRET is configured', async () => {
    process.env['MS_HMAC_SECRET'] = 'topsecret';
    const send = vi.fn().mockReturnValue(of({ id: 'f1' }));
    const service = new NotesClientService(makeClient(send));

    await service.getFramework('f1');

    const [, body] = send.mock.calls[0] as [string, { payload: unknown; signature: string }];
    expect(body.payload).toEqual({ id: 'f1' });
    expect(body.signature).toBe(signHmac({ id: 'f1' }, 'topsecret'));
  });

  it('createFramework() sends input over RPC', async () => {
    const send = vi.fn().mockReturnValue(of({ id: 'fw-new', name: 'Custom Standard' }));
    const service = new NotesClientService(makeClient(send));

    const result = await service.createFramework('org1', {
      name: 'Custom Standard',
      slug: 'custom-std',
      version: '1.0',
      category: 'security',
      description: 'Desc',
    });

    expect(result).toEqual({ id: 'fw-new', name: 'Custom Standard' });
    expect(send).toHaveBeenCalledWith('notes.frameworks.create', {
      orgId: 'org1',
      input: {
        name: 'Custom Standard',
        slug: 'custom-std',
        version: '1.0',
        category: 'security',
        description: 'Desc',
      },
    });
  });

  it('updateRequirement() sends patch over RPC', async () => {
    const send = vi
      .fn()
      .mockReturnValue(of({ id: 'req1', code: 'GV.PO-01', applicability: 'applicable' }));
    const service = new NotesClientService(makeClient(send));

    const result = await service.updateRequirement('fw1', 'req1', 'org1', {
      applicability: 'applicable',
      implementationStatus: 'implemented',
    });

    expect(result.code).toBe('GV.PO-01');
    expect(send).toHaveBeenCalledWith('notes.frameworks.requirements.update', {
      frameworkId: 'fw1',
      reqId: 'req1',
      orgId: 'org1',
      patch: {
        applicability: 'applicable',
        implementationStatus: 'implemented',
      },
    });
  });

  it('createAssessmentFinding() sends finding creation over RPC', async () => {
    const send = vi.fn().mockReturnValue(of({ findingId: 'FIND-2026-0042' }));
    const service = new NotesClientService(makeClient(send));

    const result = await service.createAssessmentFinding('org1', 'asm1', {
      title: 'Gap finding',
      severity: 'high',
      description: 'Missing evidence',
    });

    expect(result).toEqual({ findingId: 'FIND-2026-0042' });
    expect(send).toHaveBeenCalledWith('notes.frameworks.assessments.finding', {
      orgId: 'org1',
      assessmentId: 'asm1',
      findingData: {
        title: 'Gap finding',
        severity: 'high',
        description: 'Missing evidence',
      },
    });
  });
});

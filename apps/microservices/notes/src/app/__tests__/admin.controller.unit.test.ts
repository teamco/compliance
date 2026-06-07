import { describe, it, expect, beforeEach } from 'vitest';
import { FakeNotesStrategy } from '@icore/shared';
import { AdminController } from '../admin.controller';

describe('AdminController', () => {
  let ctrl: AdminController;
  let fake: FakeNotesStrategy;
  const uid = 'user-1';

  beforeEach(() => {
    fake = new FakeNotesStrategy();
    ctrl = new AdminController(fake);
  });

  it('logAuditEvent delegates to strategy', async () => {
    await ctrl.logAuditEvent({
      userId: uid,
      action: 'test',
      resourceType: undefined,
      resourceId: undefined,
      metadata: {},
    });
    const page = await ctrl.listAuditLogs({ userId: uid });
    expect(page.items).toHaveLength(1);
  });

  it('createApiKey returns fullKey', async () => {
    const result = await ctrl.createApiKey({ userId: uid, name: 'ci', expiresAt: undefined });
    expect(result.fullKey).toMatch(/^cpiq_/);
  });

  it('createWebhook + deleteWebhook', async () => {
    const wh = await ctrl.createWebhook({
      userId: uid,
      input: { url: 'https://x.com', events: ['workflow.approved'] },
    });
    await ctrl.deleteWebhook({ id: wh.id, userId: uid });
    const list = await ctrl.listWebhooks({ userId: uid });
    expect(list).toHaveLength(0);
  });

  it('getRetentionPrefs returns defaults', async () => {
    const prefs = await ctrl.getRetentionPrefs({ userId: uid });
    expect(prefs.auditLogDays).toBe(90);
  });
});

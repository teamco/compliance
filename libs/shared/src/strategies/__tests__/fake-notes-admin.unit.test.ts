import { describe, it, expect, beforeEach } from 'vitest';
import { FakeNotesStrategy } from '../fakes/fake-notes';
import { DEFAULT_RETENTION_PREFS } from '../notes';

describe('FakeNotesStrategy — admin', () => {
  let fake: FakeNotesStrategy;
  const uid = 'user-1';

  beforeEach(() => {
    fake = new FakeNotesStrategy();
  });

  it('logAuditEvent + listAuditLogs round-trip', async () => {
    await fake.logAuditEvent(uid, 'workflow.approved', 'standards_document', 'doc-1');
    const page = await fake.listAuditLogs(uid);
    expect(page.items).toHaveLength(1);
    expect(page.items[0].action).toBe('workflow.approved');
    expect(page.total).toBe(1);
  });

  it('listAuditLogs filters by action', async () => {
    await fake.logAuditEvent(uid, 'workflow.approved');
    await fake.logAuditEvent(uid, 'workflow.rejected');
    const page = await fake.listAuditLogs(uid, { action: 'workflow.approved' });
    expect(page.items).toHaveLength(1);
  });

  it('createApiKey returns fullKey once, listApiKeys hides it', async () => {
    const created = await fake.createApiKey(uid, 'CI key');
    expect(created.fullKey).toBeTruthy();
    expect(created.keyPrefix).toBe(created.fullKey.slice(0, 12));
    const list = await fake.listApiKeys(uid);
    expect(list[0]).not.toHaveProperty('fullKey');
  });

  it('revokeApiKey sets revokedAt', async () => {
    const key = await fake.createApiKey(uid, 'test');
    await fake.revokeApiKey(key.id, uid);
    const list = await fake.listApiKeys(uid);
    expect(list[0].revokedAt).toBeTruthy();
  });

  it('createWebhook + listWebhooks + deleteWebhook', async () => {
    const wh = await fake.createWebhook(uid, {
      url: 'https://example.com/hook',
      events: ['workflow.approved'],
    });
    expect(wh.secret).toBeTruthy();
    expect(wh.active).toBe(true);
    let list = await fake.listWebhooks(uid);
    expect(list).toHaveLength(1);
    await fake.deleteWebhook(wh.id, uid);
    list = await fake.listWebhooks(uid);
    expect(list).toHaveLength(0);
  });

  it('updateWebhook patches active', async () => {
    const wh = await fake.createWebhook(uid, {
      url: 'https://x.com',
      events: ['workflow.submitted'],
    });
    await fake.updateWebhook(wh.id, uid, { active: false });
    const list = await fake.listWebhooks(uid);
    expect(list[0].active).toBe(false);
  });

  it('getRetentionPrefs returns defaults', async () => {
    const prefs = await fake.getRetentionPrefs(uid);
    expect(prefs).toEqual(DEFAULT_RETENTION_PREFS);
  });

  it('updateRetentionPrefs persists', async () => {
    await fake.updateRetentionPrefs(uid, { auditLogDays: 30 });
    const prefs = await fake.getRetentionPrefs(uid);
    expect(prefs.auditLogDays).toBe(30);
    expect(prefs.chatHistoryDays).toBe(DEFAULT_RETENTION_PREFS.chatHistoryDays);
  });
});

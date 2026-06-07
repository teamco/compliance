import { describe, it, expect } from 'vitest';
import { FakeNotesStrategy } from '../fakes/fake-notes';

describe('FakeNotesStrategy — settings', () => {
  it('getUserPrefs returns defaults when not set', async () => {
    const fake = new FakeNotesStrategy();
    const prefs = await fake.getUserPrefs('user-1');
    expect(prefs.theme).toBe('system');
    expect(prefs.language).toBe('en');
    expect(prefs.notificationPrefs.channels.inApp).toBe(true);
    expect(prefs.notificationPrefs.channels.push).toBe(false);
  });

  it('updateUserPrefs persists and returns updated prefs', async () => {
    const fake = new FakeNotesStrategy();
    const updated = await fake.updateUserPrefs('user-1', { theme: 'dark', language: 'ru' });
    expect(updated.theme).toBe('dark');
    expect(updated.language).toBe('ru');
    const fetched = await fake.getUserPrefs('user-1');
    expect(fetched.theme).toBe('dark');
  });

  it('savePushSubscription stores endpoint', async () => {
    const fake = new FakeNotesStrategy();
    const result = await fake.savePushSubscription('user-1', {
      endpoint: 'https://push.example.com/sub/1',
      keys: { p256dh: 'abc', auth: 'xyz' },
    });
    expect(result.ok).toBe(true);
  });

  it('removePushSubscription deletes endpoint', async () => {
    const fake = new FakeNotesStrategy();
    await fake.savePushSubscription('user-1', {
      endpoint: 'https://push.example.com/sub/1',
      keys: { p256dh: 'abc', auth: 'xyz' },
    });
    const result = await fake.removePushSubscription('user-1', 'https://push.example.com/sub/1');
    expect(result.ok).toBe(true);
  });
});

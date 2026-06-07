import { describe, it, expect, beforeEach } from 'vitest';
import { FakeNotesStrategy } from '@icore/shared';
import { SettingsController } from '../settings.controller';

describe('SettingsController', () => {
  let controller: SettingsController;
  let fake: FakeNotesStrategy;

  beforeEach(() => {
    fake = new FakeNotesStrategy();
    controller = new SettingsController(fake);
  });

  it('getUserPrefs returns defaults', async () => {
    const result = await controller.getUserPrefs({ userId: 'u1' });
    expect(result.theme).toBe('system');
    expect(result.language).toBe('en');
  });

  it('updateUserPrefs applies patch', async () => {
    const result = await controller.updateUserPrefs({ userId: 'u1', patch: { theme: 'dark' } });
    expect(result.theme).toBe('dark');
  });

  it('savePushSubscription returns ok', async () => {
    const result = await controller.savePushSubscription({
      userId: 'u1',
      sub: { endpoint: 'https://x.com/1', keys: { p256dh: 'a', auth: 'b' } },
    });
    expect(result.ok).toBe(true);
  });

  it('removePushSubscription returns ok', async () => {
    const result = await controller.removePushSubscription({
      userId: 'u1',
      endpoint: 'https://x.com/1',
    });
    expect(result.ok).toBe(true);
  });
});

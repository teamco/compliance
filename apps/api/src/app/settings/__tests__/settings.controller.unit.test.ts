import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { SettingsController } from '../settings.controller';
import type { NotesClientService } from '@icore/notes-client';
import { DEFAULT_USER_PREFS } from '@icore/shared';
import type { VerifiedToken } from '@icore/shared';

const mockNotes = {
  getUserPrefs: vi.fn().mockResolvedValue({ ...DEFAULT_USER_PREFS }),
  updateUserPrefs: vi.fn().mockResolvedValue({ ...DEFAULT_USER_PREFS, theme: 'dark' }),
  savePushSubscription: vi.fn().mockResolvedValue({ ok: true }),
  removePushSubscription: vi.fn().mockResolvedValue({ ok: true }),
} as unknown as NotesClientService;

const req = (uid?: string): Request & { user?: VerifiedToken } =>
  ({ user: uid ? ({ uid } as VerifiedToken) : undefined }) as Request & { user?: VerifiedToken };

describe('SettingsController', () => {
  let controller: SettingsController;

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new SettingsController(mockNotes);
  });

  it('getPrefs throws 401 when no user', async () => {
    await expect(controller.getPrefs(req())).rejects.toThrow(UnauthorizedException);
  });

  it('getPrefs returns prefs for authenticated user', async () => {
    const result = await controller.getPrefs(req('uid-1'));
    expect(mockNotes.getUserPrefs).toHaveBeenCalledWith('uid-1');
    expect(result.theme).toBe('system');
  });

  it('updatePrefs calls updateUserPrefs with patch', async () => {
    const result = await controller.updatePrefs(req('uid-1'), { theme: 'dark' });
    expect(mockNotes.updateUserPrefs).toHaveBeenCalledWith('uid-1', { theme: 'dark' });
    expect(result.theme).toBe('dark');
  });

  it('savePushSub saves subscription', async () => {
    const sub = { endpoint: 'https://x.com/1', keys: { p256dh: 'a', auth: 'b' } };
    const result = await controller.savePushSub(req('uid-1'), sub);
    expect(mockNotes.savePushSubscription).toHaveBeenCalledWith('uid-1', sub);
    expect(result.ok).toBe(true);
  });

  it('removePushSub removes subscription', async () => {
    const result = await controller.removePushSub(req('uid-1'), { endpoint: 'https://x.com/1' });
    expect(mockNotes.removePushSubscription).toHaveBeenCalledWith('uid-1', 'https://x.com/1');
    expect(result.ok).toBe(true);
  });
});

import { Controller, Inject } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import type { NotesStrategy, UserPrefsPayload, PushSubscriptionPayload } from '@icore/shared';

@Controller()
export class SettingsController {
  constructor(@Inject('NotesStrategy') private readonly strategy: NotesStrategy) {}

  @MessagePattern('settings.prefs.get')
  getUserPrefs(@Payload() payload: { userId: string }): Promise<UserPrefsPayload> {
    return this.strategy.getUserPrefs(payload.userId);
  }

  @MessagePattern('settings.prefs.update')
  updateUserPrefs(
    @Payload() payload: { userId: string; patch: Partial<UserPrefsPayload> },
  ): Promise<UserPrefsPayload> {
    return this.strategy.updateUserPrefs(payload.userId, payload.patch);
  }

  @MessagePattern('settings.push.save')
  savePushSubscription(
    @Payload() payload: { userId: string; sub: PushSubscriptionPayload },
  ): Promise<{ ok: boolean }> {
    return this.strategy.savePushSubscription(payload.userId, payload.sub);
  }

  @MessagePattern('settings.push.remove')
  removePushSubscription(
    @Payload() payload: { userId: string; endpoint: string },
  ): Promise<{ ok: boolean }> {
    return this.strategy.removePushSubscription(payload.userId, payload.endpoint);
  }
}

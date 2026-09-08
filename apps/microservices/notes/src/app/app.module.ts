import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import { FakeNotesStrategy, buildStrategyWithFallback } from '@icore/shared';
import type { NotesStrategy } from '@icore/shared';
import { AdminController } from './admin.controller';
import { ChatHistoryController } from './chat-history.controller';
import { NotesController } from './notes.controller';
import { SettingsController } from './settings.controller';
import { SupabaseNotesStrategy } from './supabase-notes.strategy';

const ENV_PATH = 'apps/microservices/notes/.env';

const REQUIRED_ENV: Record<string, string[]> = {
  supabase: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
};

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        join(process.cwd(), 'apps/microservices/notes/.env'),
        join(process.cwd(), '.env'),
      ],
    }),
  ],
  controllers: [NotesController, SettingsController, ChatHistoryController, AdminController],
  providers: [
    {
      provide: 'NotesStrategy',
      useFactory: (cfg: ConfigService): NotesStrategy => {
        const provider = cfg.get<string>('NOTES_PROVIDER')?.trim();
        const keys = provider ? REQUIRED_ENV[provider] : undefined;

        return buildStrategyWithFallback<NotesStrategy>({
          service: 'notes MS',
          provider: provider ?? '',
          requiredEnv: keys ?? [],
          cfg: { get: (k) => cfg.get<string>(k) },
          envPath: ENV_PATH,
          build: () => {
            if (!keys) {
              throw new Error(
                provider ? `Unknown NOTES_PROVIDER: "${provider}"` : 'Provider env var is not set.',
              );
            }
            const client = createClient(
              cfg.getOrThrow<string>('SUPABASE_URL'),
              cfg.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY'),
              { auth: { autoRefreshToken: false, persistSession: false } },
            );
            return new SupabaseNotesStrategy(client);
          },
          fake: () => new FakeNotesStrategy(),
        });
      },
      inject: [ConfigService],
    },
  ],
})
export class AppModule {}

import { join } from 'node:path';
import { Module, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import { FakeNotesStrategy, missingEnv, formatEnvBanner } from '@icore/shared';
import type { NotesStrategy } from '@icore/shared';
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
  controllers: [NotesController, SettingsController, ChatHistoryController],
  providers: [
    {
      provide: 'NotesStrategy',
      useFactory: (cfg: ConfigService): NotesStrategy => {
        const logger = new Logger('NotesStrategy');
        const provider = cfg.get<string>('NOTES_PROVIDER')?.trim();
        const keys = provider ? REQUIRED_ENV[provider] : undefined;
        const missing = keys ? missingEnv((k) => cfg.get<string>(k), keys) : [];

        const fallback = (reason?: string): NotesStrategy => {
          const banner = formatEnvBanner({
            service: 'notes MS',
            provider,
            missing,
            envPath: ENV_PATH,
            reason,
          });
          if (process.env.NODE_ENV === 'production') throw new Error(banner);
          logger.warn(banner);
          return new FakeNotesStrategy();
        };

        if (!keys || missing.length > 0) return fallback();

        try {
          const client = createClient(
            cfg.getOrThrow<string>('SUPABASE_URL'),
            cfg.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY'),
            { auth: { autoRefreshToken: false, persistSession: false } },
          );
          return new SupabaseNotesStrategy(client);
        } catch (err) {
          return fallback(err instanceof Error ? err.message : String(err));
        }
      },
      inject: [ConfigService],
    },
  ],
})
export class AppModule {}

import { join } from 'node:path';
import { Module, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import { SupabaseStorageStrategy } from '@icore/storage-supabase';
import { FakeStorageStrategy, missingEnv, formatEnvBanner } from '@icore/shared';
import type { StorageStrategy } from '@icore/shared';
import { StorageController } from './storage.controller';

const ENV_PATH = 'apps/microservices/upload/.env';

const REQUIRED_ENV: Record<string, string[]> = {
  supabase: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_STORAGE_BUCKET'],
  cloudinary: ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'],
};

function requireEnv(cfg: ConfigService, key: string): string {
  return cfg.getOrThrow<string>(key);
}

function makeSupabaseStorage(cfg: ConfigService): StorageStrategy {
  const client = createClient(
    requireEnv(cfg, 'SUPABASE_URL'),
    requireEnv(cfg, 'SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  return new SupabaseStorageStrategy({
    client,
    bucket: requireEnv(cfg, 'SUPABASE_STORAGE_BUCKET'),
  });
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        join(process.cwd(), 'apps/microservices/upload/.env'),
        join(process.cwd(), '.env'),
      ],
    }),
  ],
  controllers: [StorageController],
  providers: [
    {
      provide: 'StorageStrategy',
      useFactory: (cfg: ConfigService): StorageStrategy => {
        const logger = new Logger('StorageStrategy');
        const provider = cfg.get<string>('STORAGE_PROVIDER')?.trim();
        const keys = provider ? REQUIRED_ENV[provider] : undefined;
        const missing = keys ? missingEnv((k) => cfg.get<string>(k), keys) : [];

        const fallback = (reason?: string): StorageStrategy => {
          const banner = formatEnvBanner({
            service: 'upload MS',
            provider,
            missing,
            envPath: ENV_PATH,
            reason,
          });
          if (process.env.NODE_ENV === 'production') throw new Error(banner);
          logger.warn(banner);
          return new FakeStorageStrategy();
        };

        if (!keys || missing.length > 0) return fallback();

        try {
          return makeSupabaseStorage(cfg);
        } catch (err) {
          return fallback(err instanceof Error ? err.message : String(err));
        }
      },
      inject: [ConfigService],
    },
  ],
})
export class AppModule {}

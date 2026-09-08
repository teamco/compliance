import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import { SupabaseStorageStrategy } from '@icore/storage-supabase';
import { FakeStorageStrategy, buildStrategyWithFallback } from '@icore/shared';
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
        const provider = cfg.get<string>('STORAGE_PROVIDER')?.trim();
        const keys = provider ? REQUIRED_ENV[provider] : undefined;

        return buildStrategyWithFallback<StorageStrategy>({
          service: 'upload MS',
          provider: provider ?? '',
          requiredEnv: keys ?? [],
          cfg: { get: (k) => cfg.get<string>(k) },
          envPath: ENV_PATH,
          build: () => {
            if (!keys) {
              throw new Error(
                provider
                  ? `Unknown STORAGE_PROVIDER: "${provider}"`
                  : 'Provider env var is not set.',
              );
            }
            return makeSupabaseStorage(cfg);
          },
          fake: () => new FakeStorageStrategy(),
        });
      },
      inject: [ConfigService],
    },
  ],
})
export class AppModule {}

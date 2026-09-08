import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import { SupabaseAuthStrategy } from '@icore/auth-supabase';
import { FakeAuthStrategy, buildStrategyWithFallback } from '@icore/shared';
import type { AuthStrategy } from '@icore/shared';
import { AuthController } from './auth.controller';

const ENV_PATH = 'apps/microservices/auth/.env';

// Env vars each provider needs (besides AUTH_PROVIDER itself).
const REQUIRED_ENV: Record<string, string[]> = {
  supabase: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
};

function requireEnv(cfg: ConfigService, key: string): string {
  return cfg.getOrThrow<string>(key);
}

function makeSupabaseAuth(cfg: ConfigService): AuthStrategy {
  const client = createClient(
    requireEnv(cfg, 'SUPABASE_URL'),
    requireEnv(cfg, 'SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const siteUrl = cfg.get<string>('CLIENT_ORIGIN');
  return new SupabaseAuthStrategy({ client, siteUrl });
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        join(process.cwd(), 'apps/microservices/auth/.env'),
        join(process.cwd(), '.env'),
      ],
    }),
  ],
  controllers: [AuthController],
  providers: [
    {
      provide: 'AuthStrategy',
      useFactory: (cfg: ConfigService): AuthStrategy => {
        const provider = cfg.get<string>('AUTH_PROVIDER')?.trim();
        const keys = provider ? REQUIRED_ENV[provider] : undefined;

        // Prod: fail fast — never silently run a fake auth strategy.
        // Dev: warn with a boxed banner + fall back to the in-memory fake.
        return buildStrategyWithFallback<AuthStrategy>({
          service: 'auth MS',
          provider: provider ?? '',
          requiredEnv: keys ?? [],
          cfg: { get: (k) => cfg.get<string>(k) },
          envPath: ENV_PATH,
          build: () => {
            if (!keys) {
              throw new Error(
                provider ? `Unknown AUTH_PROVIDER: "${provider}"` : 'Provider env var is not set.',
              );
            }
            // Vars present but invalid (e.g. placeholder URL the SDK rejects)
            // still throw here and land in the fallback via buildStrategyWithFallback.
            return makeSupabaseAuth(cfg);
          },
          fake: () => new FakeAuthStrategy(),
        });
      },
      inject: [ConfigService],
    },
  ],
})
export class AppModule {}

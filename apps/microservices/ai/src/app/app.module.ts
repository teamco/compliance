import { join } from 'node:path';
import { Module, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AnthropicAiStrategy } from '@icore/ai-anthropic';
import { FakeAiStrategy, missingEnv, formatEnvBanner } from '@icore/shared';
import type { AiStrategy } from '@icore/shared';
import { AiController } from './ai.controller';

const ENV_PATH = 'apps/microservices/ai/.env';

const REQUIRED_ENV: Record<string, string[]> = {
  anthropic: ['ANTHROPIC_API_KEY'],
};

function makeAnthropicAi(cfg: ConfigService): AiStrategy {
  const apiKey = cfg.getOrThrow<string>('ANTHROPIC_API_KEY');
  return new AnthropicAiStrategy({ apiKey });
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [join(process.cwd(), 'apps/microservices/ai/.env'), join(process.cwd(), '.env')],
    }),
  ],
  controllers: [AiController],
  providers: [
    {
      provide: 'AiStrategy',
      useFactory: (cfg: ConfigService): AiStrategy => {
        const logger = new Logger('AiStrategy');
        const provider = cfg.get<string>('AI_PROVIDER')?.trim();
        const keys = provider ? REQUIRED_ENV[provider] : undefined;
        const missing = keys ? missingEnv((k) => cfg.get<string>(k), keys) : [];

        const fallback = (reason?: string): AiStrategy => {
          const banner = formatEnvBanner({
            service: 'ai MS',
            provider,
            missing,
            envPath: ENV_PATH,
            reason,
          });
          if (process.env['NODE_ENV'] === 'production') throw new Error(banner);
          logger.warn(banner);
          return new FakeAiStrategy();
        };

        if (!keys || missing.length > 0) return fallback();

        try {
          return makeAnthropicAi(cfg);
        } catch (err) {
          return fallback(err instanceof Error ? err.message : String(err));
        }
      },
      inject: [ConfigService],
    },
  ],
})
export class AppModule {}

import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AnthropicAiStrategy } from '@icore/ai-anthropic';
import { FakeAiStrategy, buildStrategyWithFallback } from '@icore/shared';
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
        const provider = cfg.get<string>('AI_PROVIDER')?.trim();
        const keys = provider ? REQUIRED_ENV[provider] : undefined;

        return buildStrategyWithFallback<AiStrategy>({
          service: 'ai MS',
          provider: provider ?? '',
          requiredEnv: keys ?? [],
          cfg: { get: (k) => cfg.get<string>(k) },
          envPath: ENV_PATH,
          build: () => {
            if (!keys) {
              throw new Error(
                provider ? `Unknown AI_PROVIDER: "${provider}"` : 'Provider env var is not set.',
              );
            }
            return makeAnthropicAi(cfg);
          },
          fake: () => new FakeAiStrategy(),
        });
      },
      inject: [ConfigService],
    },
  ],
})
export class AppModule {}

import { join } from 'node:path';
import { Module, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { createClient } from '@supabase/supabase-js';
import { AiClientModule, AiClientService } from '@icore/ai-client';
import { OwnCrawlerStrategy } from '@icore/vendor-risk-crawler';
import { SecurityScorecardStrategy } from '@icore/vendor-risk-scorecard';
import { FakeVendorRiskStrategy, formatEnvBanner, missingEnv } from '@icore/shared';
import type { VendorRiskStrategy } from '@icore/shared';
import { VendorRiskController } from './vendor-risk.controller';
import { VendorRiskService } from './vendor-risk.service';
import { VendorRiskSchedulerService } from './vendor-risk-scheduler.service';
import { HybridVendorRiskStrategy } from './hybrid-vendor-risk.strategy';

const ENV_PATH = 'apps/microservices/vendor-risk/.env';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        join(process.cwd(), 'apps/microservices/vendor-risk/.env'),
        join(process.cwd(), '.env'),
      ],
    }),
    ScheduleModule.forRoot(),
    AiClientModule.forRoot(),
  ],
  controllers: [VendorRiskController],
  providers: [
    {
      provide: 'VendorRiskStrategy',
      useFactory: (cfg: ConfigService): VendorRiskStrategy => {
        const logger = new Logger('VendorRiskStrategy');
        const missing = missingEnv(
          (k) => cfg.get<string>(k),
          ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
        );

        if (missing.length > 0) {
          const banner = formatEnvBanner({
            service: 'vendor-risk MS',
            provider: 'hybrid',
            missing,
            envPath: ENV_PATH,
          });
          if (process.env['NODE_ENV'] === 'production') throw new Error(banner);
          logger.warn(banner);
          return new FakeVendorRiskStrategy();
        }

        const crawler = new OwnCrawlerStrategy({
          shodanApiKey: cfg.get<string>('SHODAN_API_KEY'),
          hibpApiKey: cfg.get<string>('HIBP_API_KEY'),
          abuseipdbApiKey: cfg.get<string>('ABUSEIPDB_API_KEY'),
        });

        const scorecardKey = cfg.get<string>('SCORECARD_API_KEY');
        const scorecard = scorecardKey
          ? new SecurityScorecardStrategy({ apiKey: scorecardKey })
          : null;

        return new HybridVendorRiskStrategy(crawler, scorecard);
      },
      inject: [ConfigService],
    },
    {
      provide: 'SupabaseClient',
      useFactory: (cfg: ConfigService) =>
        createClient(
          cfg.getOrThrow<string>('SUPABASE_URL'),
          cfg.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY'),
          { auth: { autoRefreshToken: false, persistSession: false } },
        ),
      inject: [ConfigService],
    },
    {
      provide: VendorRiskService,
      useFactory: (
        db: ReturnType<typeof createClient>,
        strategy: VendorRiskStrategy,
        ai: AiClientService,
      ) => new VendorRiskService(db, strategy, ai),
      inject: ['SupabaseClient', 'VendorRiskStrategy', AiClientService],
    },
    VendorRiskSchedulerService,
  ],
})
export class AppModule {}

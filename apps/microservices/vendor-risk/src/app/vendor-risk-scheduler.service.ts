import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { VendorRiskService } from './vendor-risk.service';

@Injectable()
export class VendorRiskSchedulerService {
  private readonly logger = new Logger(VendorRiskSchedulerService.name);

  constructor(private readonly svc: VendorRiskService) {}

  @Cron(CronExpression.EVERY_6_HOURS)
  async runScheduledScans(): Promise<void> {
    this.logger.log('Scheduled scan run started');
    try {
      await this.svc.runScheduledScans();
      this.logger.log('Scheduled scan run complete');
    } catch (err) {
      this.logger.error(`Scheduled scan run failed: ${err}`);
    }
  }
}

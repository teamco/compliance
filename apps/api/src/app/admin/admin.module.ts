import { Module } from '@nestjs/common';
import { AdminAiUsageController } from './admin-ai-usage.controller';

@Module({
  controllers: [AdminAiUsageController],
})
export class AdminModule {}

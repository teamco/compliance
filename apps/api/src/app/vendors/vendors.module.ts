import { Module } from '@nestjs/common';
import { VendorRiskClientModule } from '@icore/vendor-risk-client';
import { VendorsController } from './vendors.controller';

@Module({
  imports: [VendorRiskClientModule.forRoot()],
  controllers: [VendorsController],
})
export class VendorsModule {}

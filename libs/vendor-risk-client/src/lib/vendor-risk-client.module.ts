import { DynamicModule, Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { buildTransport } from '@icore/shared';
import { VENDOR_RISK_CLIENT } from './vendor-risk-client.tokens';
import { VendorRiskClientService } from './vendor-risk-client.service';

@Module({})
export class VendorRiskClientModule {
  static forRoot(): DynamicModule {
    return {
      module: VendorRiskClientModule,
      imports: [
        ClientsModule.registerAsync([
          {
            name: VENDOR_RISK_CLIENT,
            useFactory: () => buildTransport('VENDOR_RISK'),
          },
        ]),
      ],
      providers: [VendorRiskClientService],
      exports: [VendorRiskClientService],
    };
  }
}

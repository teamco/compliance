import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions } from '@nestjs/microservices';
import { bootstrapMicroservice, buildTransportMS } from '@icore/shared';
import { AppModule } from './app/app.module';

void bootstrapMicroservice(
  'VENDOR_RISK',
  () =>
    NestFactory.createMicroservice<MicroserviceOptions>(AppModule, buildTransportMS('VENDOR_RISK')),
  new Logger('VendorRisk-Bootstrap'),
);

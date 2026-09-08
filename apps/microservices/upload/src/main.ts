import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions } from '@nestjs/microservices';
import { bootstrapMicroservice, buildTransportMS, HmacGuard } from '@icore/shared';
import { AppModule } from './app/app.module';

void bootstrapMicroservice(
  'UPLOAD',
  async () => {
    const app = await NestFactory.createMicroservice<MicroserviceOptions>(
      AppModule,
      buildTransportMS('UPLOAD'),
    );
    app.useGlobalGuards(new HmacGuard());
    return app;
  },
  new Logger('Upload-Bootstrap'),
);

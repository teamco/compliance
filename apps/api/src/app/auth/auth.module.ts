import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthClientModule } from '@icore/auth-client';
import { NotesClientModule } from '@icore/notes-client';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AbilityFactory } from '../abilities/ability.factory';

@Module({
  imports: [AuthClientModule.forRoot(), NotesClientModule.forRoot()],
  controllers: [AuthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    AbilityFactory,
  ],
  exports: [AuthClientModule],
})
export class AuthModule {}

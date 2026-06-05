import { Module } from '@nestjs/common';
import { AuthClientModule } from '@icore/auth-client';
import { ProfileController } from './profile.controller';

@Module({ imports: [AuthClientModule.forRoot()], controllers: [ProfileController] })
export class ProfileModule {}

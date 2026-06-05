import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, seconds } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { ProfileModule } from './profile/profile.module';
import { AbilitiesModule } from './abilities/abilities.module';
import { StorageModule } from './storage/storage.module';
import { AiModule } from './ai/ai.module';
import { AdminModule } from './admin/admin.module';
import { NotesModule } from './notes/notes.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [join(process.cwd(), 'apps/api/.env'), join(process.cwd(), '.env')],
    }),
    ThrottlerModule.forRoot([{ name: 'auth-burst', ttl: seconds(60), limit: 10 }]),
    AuthModule,
    AbilitiesModule,
    ProfileModule,
    StorageModule,
    AiModule,
    AdminModule,
    NotesModule,
  ],
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { NotesClientModule } from '@icore/notes-client';
import { SettingsController } from './settings.controller';

@Module({
  imports: [NotesClientModule.forRoot()],
  controllers: [SettingsController],
})
export class SettingsModule {}

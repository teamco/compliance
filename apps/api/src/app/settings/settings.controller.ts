import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { NotesClientService } from '@icore/notes-client';
import type { PushSubscriptionPayload, UserPrefsPayload, VerifiedToken } from '@icore/shared';

interface AuthedRequest extends Request { user?: VerifiedToken; }

@ApiTags('settings')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(private readonly notes: NotesClientService) {}

  @Get('me')
  async getPrefs(@Req() req: AuthedRequest) {
    const uid = req.user?.uid;
    if (!uid) throw new UnauthorizedException();
    return this.notes.getUserPrefs(uid);
  }

  @Patch('me')
  async updatePrefs(
    @Req() req: AuthedRequest,
    @Body() body: Partial<UserPrefsPayload>,
  ) {
    const uid = req.user?.uid;
    if (!uid) throw new UnauthorizedException();
    return this.notes.updateUserPrefs(uid, body);
  }

  @Post('push')
  async savePushSub(
    @Req() req: AuthedRequest,
    @Body() body: PushSubscriptionPayload,
  ) {
    const uid = req.user?.uid;
    if (!uid) throw new UnauthorizedException();
    return this.notes.savePushSubscription(uid, body);
  }

  @Delete('push')
  async removePushSub(
    @Req() req: AuthedRequest,
    @Body() body: { endpoint: string },
  ) {
    const uid = req.user?.uid;
    if (!uid) throw new UnauthorizedException();
    return this.notes.removePushSubscription(uid, body.endpoint);
  }
}

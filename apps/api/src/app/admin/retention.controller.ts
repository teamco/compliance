import { Body, Controller, Get, Patch, Req, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { NotesClientService } from '@icore/notes-client';
import type { RetentionPrefsPayload, VerifiedToken } from '@icore/shared';

interface AuthedRequest extends Request { user?: VerifiedToken; }

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/retention')
export class RetentionController {
  constructor(private readonly notes: NotesClientService) {}

  @Get()
  @ApiOperation({ summary: 'Get retention preferences' })
  get(@Req() req: AuthedRequest): Promise<RetentionPrefsPayload> {
    const uid = req.user?.uid;
    if (!uid) throw new UnauthorizedException();
    return this.notes.getRetentionPrefs(uid);
  }

  @Patch()
  @ApiOperation({ summary: 'Update retention preferences' })
  update(
    @Req() req: AuthedRequest,
    @Body() body: Partial<RetentionPrefsPayload>,
  ): Promise<RetentionPrefsPayload> {
    const uid = req.user?.uid;
    if (!uid) throw new UnauthorizedException();
    return this.notes.updateRetentionPrefs(uid, body);
  }
}

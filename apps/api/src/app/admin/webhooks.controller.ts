import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { NotesClientService } from '@icore/notes-client';
import type { VerifiedToken, Webhook, WebhookInput } from '@icore/shared';

interface AuthedRequest extends Request { user?: VerifiedToken; }

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/webhooks')
export class WebhooksController {
  constructor(private readonly notes: NotesClientService) {}

  @Get()
  @ApiOperation({ summary: 'List webhooks' })
  list(@Req() req: AuthedRequest): Promise<Webhook[]> {
    const uid = req.user?.uid;
    if (!uid) throw new UnauthorizedException();
    return this.notes.listWebhooks(uid);
  }

  @Post()
  @ApiOperation({ summary: 'Create webhook' })
  create(@Req() req: AuthedRequest, @Body() body: WebhookInput): Promise<Webhook> {
    const uid = req.user?.uid;
    if (!uid) throw new UnauthorizedException();
    return this.notes.createWebhook(uid, body);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update webhook (url, events, active)' })
  update(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() body: Partial<WebhookInput> & { active?: boolean },
  ): Promise<Webhook> {
    const uid = req.user?.uid;
    if (!uid) throw new UnauthorizedException();
    return this.notes.updateWebhook(id, uid, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete webhook' })
  remove(@Req() req: AuthedRequest, @Param('id') id: string): Promise<{ ok: boolean }> {
    const uid = req.user?.uid;
    if (!uid) throw new UnauthorizedException();
    return this.notes.deleteWebhook(id, uid);
  }
}

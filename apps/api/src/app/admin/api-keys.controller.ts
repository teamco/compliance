import { Body, Controller, Delete, Get, Param, Post, Req, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { NotesClientService } from '@icore/notes-client';
import type { ApiKey, ApiKeyWithSecret, VerifiedToken } from '@icore/shared';

interface AuthedRequest extends Request { user?: VerifiedToken; }

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/api-keys')
export class ApiKeysController {
  constructor(private readonly notes: NotesClientService) {}

  @Get()
  @ApiOperation({ summary: 'List API keys' })
  list(@Req() req: AuthedRequest): Promise<ApiKey[]> {
    const uid = req.user?.uid;
    if (!uid) throw new UnauthorizedException();
    return this.notes.listApiKeys(uid);
  }

  @Post()
  @ApiOperation({ summary: 'Create API key — full key returned once' })
  create(
    @Req() req: AuthedRequest,
    @Body() body: { name: string; expiresAt?: string },
  ): Promise<ApiKeyWithSecret> {
    const uid = req.user?.uid;
    if (!uid) throw new UnauthorizedException();
    return this.notes.createApiKey(uid, body.name, body.expiresAt);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Revoke API key' })
  revoke(@Req() req: AuthedRequest, @Param('id') id: string): Promise<{ ok: boolean }> {
    const uid = req.user?.uid;
    if (!uid) throw new UnauthorizedException();
    return this.notes.revokeApiKey(id, uid);
  }
}

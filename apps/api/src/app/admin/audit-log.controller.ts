import { Controller, Get, Query, Req, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { NotesClientService } from '@icore/notes-client';
import type { AuditLogFilters, AuditLogPage, VerifiedToken } from '@icore/shared';

interface AuthedRequest extends Request {
  user?: VerifiedToken;
}

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/audit-log')
export class AuditLogController {
  constructor(private readonly notes: NotesClientService) {}

  @Get()
  @ApiOperation({ summary: 'List audit log events (paginated)' })
  list(
    @Req() req: AuthedRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('action') action?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<AuditLogPage> {
    const uid = req.user?.uid;
    if (!uid) throw new UnauthorizedException();
    const filters: AuditLogFilters = {
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
      action: action || undefined,
      from: from || undefined,
      to: to || undefined,
    };
    return this.notes.listAuditLogs(uid, filters);
  }
}

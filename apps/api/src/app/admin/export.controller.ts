import { Controller, Get, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { NotesClientService } from '@icore/notes-client';
import type { VerifiedToken } from '@icore/shared';

interface AuthedRequest extends Request {
  user?: VerifiedToken;
}

type ExportType = 'standards' | 'organization' | 'audit-log';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/export')
export class ExportController {
  constructor(private readonly notes: NotesClientService) {}

  @Get()
  @ApiOperation({ summary: 'Export data as JSON download' })
  async export(
    @Req() req: AuthedRequest,
    @Query('type') type: ExportType = 'standards',
    @Res() res: Response,
  ): Promise<void> {
    const uid = req.user?.uid;
    if (!uid) throw new UnauthorizedException();

    let data: unknown;
    const filename = `${type}-${new Date().toISOString().slice(0, 10)}.json`;

    if (type === 'standards') {
      data = await this.notes.listStandardsDocuments(uid);
    } else if (type === 'organization') {
      data = await this.notes.listOrganizations(uid);
    } else {
      const page = await this.notes.listAuditLogs(uid, { limit: 1000 });
      data = page.items;
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(data, null, 2));
  }
}

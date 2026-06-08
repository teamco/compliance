import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { NotesClientService } from '@icore/notes-client';
import type { ReportTemplate, ReportTemplateInput, VerifiedToken } from '@icore/shared';
import { CheckAbility } from '../abilities/check-ability.decorator';

@ApiTags('report-templates')
@ApiBearerAuth()
@Controller('notes/report-templates')
export class ReportTemplatesController {
  constructor(private readonly notes: NotesClientService) {}

  @Get()
  @ApiOperation({ summary: 'List report templates (any authenticated user)' })
  listTemplates(): Promise<ReportTemplate[]> {
    return this.notes.listReportTemplates();
  }

  @Post()
  @CheckAbility('manage', 'ReportTemplate')
  @ApiOperation({ summary: 'Create a report template (admin only)' })
  @ApiBody({ schema: { type: 'object' } })
  createTemplate(
    @Req() req: Request & { user?: VerifiedToken },
    @Body() body: ReportTemplateInput,
  ): Promise<ReportTemplate> {
    return this.notes.createReportTemplate(this.uid(req), body);
  }

  @Put(':id')
  @CheckAbility('manage', 'ReportTemplate')
  @ApiOperation({ summary: 'Update a report template (admin only)' })
  @ApiBody({ schema: { type: 'object' } })
  updateTemplate(
    @Param('id') id: string,
    @Body() body: Partial<ReportTemplateInput>,
  ): Promise<ReportTemplate> {
    return this.notes.updateReportTemplate(id, body);
  }

  @Delete(':id')
  @CheckAbility('manage', 'ReportTemplate')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a report template (admin only)' })
  async deleteTemplate(@Param('id') id: string): Promise<void> {
    await this.notes.deleteReportTemplate(id);
  }

  private uid(req: Request & { user?: VerifiedToken }): string {
    if (!req.user?.uid) throw new UnauthorizedException('missing_user');
    return req.user.uid;
  }
}

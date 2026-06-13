import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Put,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { subject } from '@casl/ability';
import type { Request } from 'express';
import { NotesClientService } from '@icore/notes-client';
import type { ReportTemplate, ReportTemplateInput, VerifiedToken } from '@icore/shared';
import { AbilityFactory } from '../abilities/ability.factory';
import { CheckAbility } from '../abilities/check-ability.decorator';

@ApiTags('report-templates')
@ApiBearerAuth()
@Controller('notes/report-templates')
export class ReportTemplatesController {
  constructor(
    private readonly notes: NotesClientService,
    private readonly abilityFactory: AbilityFactory,
  ) {}

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

  @Post(':id/favorites')
  @ApiOperation({ summary: 'Favorite a template for an org you own' })
  @ApiBody({
    schema: { type: 'object', required: ['orgId'], properties: { orgId: { type: 'string' } } },
  })
  async addFavorite(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: { orgId: string },
  ): Promise<ReportTemplate> {
    await this.assertOrgOwner(req, body.orgId);
    return this.notes.addTemplateFavorite(id, body.orgId);
  }

  @Delete(':id/favorites/:orgId')
  @ApiOperation({ summary: 'Remove a template favorite for an org you own' })
  async removeFavorite(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Param('orgId') orgId: string,
  ): Promise<ReportTemplate> {
    await this.assertOrgOwner(req, orgId);
    return this.notes.removeTemplateFavorite(id, orgId);
  }

  private uid(req: Request & { user?: VerifiedToken }): string {
    if (!req.user?.uid) throw new UnauthorizedException('missing_user');
    return req.user.uid;
  }

  // Favoriting is a per-org preference — allow it for users who can read the org.
  private async assertOrgOwner(
    req: Request & { user?: VerifiedToken },
    orgId: string,
  ): Promise<void> {
    const org = await this.notes.getOrganizationById(orgId);
    if (!org) throw new NotFoundException('org_not_found');
    const ability = this.abilityFactory.forUser(req.user);
    if (!ability.can('read', subject('Organization', { id: org.id, userId: org.userId }))) {
      throw new ForbiddenException();
    }
  }
}

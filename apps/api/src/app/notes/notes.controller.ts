import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { NotesClientService } from '@icore/notes-client';
import { AiClientService } from '@icore/ai-client';
import type {
  ControlPatch,
  OrganizationInput,
  StandardControl,
  VerifiedToken,
} from '@icore/shared';
import type { OrgProfile, StandardsResult } from '@icore/shared';

@ApiTags('notes')
@ApiBearerAuth()
@Controller('notes')
export class NotesController {
  constructor(
    private readonly notes: NotesClientService,
    private readonly ai: AiClientService,
  ) {}

  @Get('frameworks')
  @ApiOperation({ summary: 'List all compliance frameworks' })
  listFrameworks() {
    return this.notes.listFrameworks();
  }

  @Get('frameworks/:id/controls')
  @ApiOperation({ summary: 'List controls for a framework' })
  listControls(@Param('id') id: string) {
    return this.notes.listControlsByFramework(id);
  }

  @Get('org')
  @ApiOperation({ summary: 'Get current user organization profile' })
  async getOrg(@Req() req: Request & { user?: VerifiedToken }) {
    const uid = this.uid(req);
    return this.notes.getOrganization(uid);
  }

  @Put('org')
  @ApiOperation({ summary: 'Create or update organization profile' })
  @ApiBody({ schema: { type: 'object' } })
  async upsertOrg(@Req() req: Request & { user?: VerifiedToken }, @Body() body: OrganizationInput) {
    const uid = this.uid(req);
    return this.notes.upsertOrganization(uid, body);
  }

  @Get('standards')
  @ApiOperation({ summary: 'List generated standards documents for current user' })
  async listStandards(@Req() req: Request & { user?: VerifiedToken }) {
    const uid = this.uid(req);
    return this.notes.listStandardsDocuments(uid);
  }

  @Get('standards/:id')
  @ApiOperation({ summary: 'Get a standards document' })
  getStandards(@Param('id') id: string) {
    return this.notes.getStandardsDocument(id);
  }

  @Patch('standards/:id/controls/:code')
  @ApiOperation({ summary: 'Update a single generated control (priority, implementation)' })
  @ApiBody({ schema: { type: 'object' } })
  updateControl(@Param('id') id: string, @Param('code') code: string, @Body() patch: ControlPatch) {
    return this.notes.updateControl(id, code, patch);
  }

  @Post('standards/generate')
  @ApiOperation({ summary: 'AI-generate standards from org profile + frameworks (long-poll)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['orgId', 'frameworkIds'],
      properties: {
        orgId: { type: 'string' },
        frameworkIds: { type: 'array', items: { type: 'string' } },
      },
    },
  })
  async generateStandards(
    @Req() req: Request & { user?: VerifiedToken },
    @Body() body: { orgId: string; frameworkIds: string[] },
  ) {
    const uid = this.uid(req);

    const org = await this.notes.getOrganization(uid);
    if (!org) throw new Error('org_not_found — complete organization profile first');

    const aiOrgProfile: OrgProfile = {
      id: org.id,
      name: org.name,
      industry: org.industry,
      size: org.size,
      regions: org.regions,
    };

    const { id } = await this.notes.createStandardsDocument(uid, body.orgId, body.frameworkIds);

    const aiResults: StandardsResult[] = await this.ai.generateStandards(
      aiOrgProfile,
      body.frameworkIds,
    );

    const controls: StandardControl[] = aiResults.flatMap((r) =>
      r.controls.map((c) => ({
        code: c.id,
        title: c.title,
        description: c.description,
        implementation: c.implementationGuidance,
        evidence: [],
        frameworkMappings: [{ frameworkId: r.frameworkId, controlCode: c.id }],
        priority: 'high' as const,
        category: 'general',
      })),
    );

    await this.notes.saveStandardsDocument(id, controls);
    return this.notes.getStandardsDocument(id);
  }

  private uid(req: Request & { user?: VerifiedToken }): string {
    if (!req.user?.uid) throw new UnauthorizedException('missing_user');
    return req.user.uid;
  }
}

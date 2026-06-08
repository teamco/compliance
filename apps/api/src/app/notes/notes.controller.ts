import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { subject } from '@casl/ability';
import { NotesClientService } from '@icore/notes-client';
import { AiClientService } from '@icore/ai-client';
import type {
  ControlPatch,
  GapAnalysisResult,
  Organization,
  OrganizationInput,
  VerifiedToken,
  WorkflowTransition,
} from '@icore/shared';
import type { OrgProfile } from '@icore/shared';
import { AbilityFactory } from '../abilities/ability.factory';
import { StandardsQueueService } from './standards-queue.service';

@ApiTags('notes')
@ApiBearerAuth()
@Controller('notes')
export class NotesController {
  constructor(
    private readonly notes: NotesClientService,
    private readonly ai: AiClientService,
    private readonly abilityFactory: AbilityFactory,
    private readonly queue: StandardsQueueService,
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

  @Get('orgs')
  @ApiOperation({ summary: 'List organizations owned by current user' })
  async listOrgs(@Req() req: Request & { user?: VerifiedToken }) {
    return this.notes.listOrganizations(this.uid(req));
  }

  @Post('orgs')
  @ApiOperation({ summary: 'Create a new organization' })
  @ApiBody({ schema: { type: 'object' } })
  async createOrg(@Req() req: Request & { user?: VerifiedToken }, @Body() body: OrganizationInput) {
    return this.notes.createOrganization(this.uid(req), body);
  }

  @Get('orgs/:id')
  @ApiOperation({ summary: 'Get organization by id' })
  async getOrgById(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    const org = await this.notes.getOrganizationById(id);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'read');
    return org;
  }

  @Put('orgs/:id')
  @ApiOperation({ summary: 'Update organization' })
  @ApiBody({ schema: { type: 'object' } })
  async updateOrg(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: OrganizationInput,
  ) {
    const org = await this.notes.getOrganizationById(id);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.updateOrganization(id, body);
  }

  @Delete('orgs/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete organization (owner or admin only)' })
  async deleteOrg(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    const org = await this.notes.getOrganizationById(id);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'delete');
    await this.notes.deleteOrganization(id);
  }

  @Get('standards')
  @SkipThrottle()
  @ApiOperation({ summary: 'List generated standards documents for an org' })
  async listStandards(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId?: string,
  ) {
    if (!orgId) throw new BadRequestException('orgId required');
    return this.notes.listStandardsDocuments(orgId);
  }

  @Get('standards/:id')
  @ApiOperation({ summary: 'Get a standards document' })
  getStandards(@Param('id') id: string) {
    return this.notes.getStandardsDocument(id);
  }

  @Patch('standards/:id/workflow')
  @ApiOperation({ summary: 'Transition standards document workflow state' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['transition'],
      properties: {
        transition: { type: 'string', enum: ['submit', 'approve', 'reject', 'publish'] },
      },
    },
  })
  async transitionWorkflow(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: { transition: WorkflowTransition },
  ) {
    const result = await this.notes.transitionWorkflow(id, body.transition);
    const uid = req.user?.uid;
    if (uid) {
      void this.notes.logAuditEvent(uid, `workflow.${body.transition}`, 'standards_document', id);
    }
    return result;
  }

  @Patch('standards/:id/controls/:code')
  @ApiOperation({ summary: 'Update a single generated control (priority, implementation)' })
  @ApiBody({ schema: { type: 'object' } })
  updateControl(@Param('id') id: string, @Param('code') code: string, @Body() patch: ControlPatch) {
    return this.notes.updateControl(id, code, patch);
  }

  @Get('standards/:id/snapshots')
  @ApiOperation({ summary: 'List immutable approval snapshots for a standards document' })
  listSnapshots(@Param('id') id: string) {
    return this.notes.listSnapshots(id);
  }

  @Get('standards/snapshots/:snapshotId')
  @ApiOperation({ summary: 'Get a single snapshot by ID' })
  getSnapshot(@Param('snapshotId') snapshotId: string) {
    return this.notes.getSnapshot(snapshotId);
  }

  @Post('standards/generate')
  @ApiOperation({ summary: 'Enqueue AI standards generation; poll GET /standards/:id for result' })
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

    const org = await this.notes.getOrganizationById(body.orgId);
    if (!org) throw new NotFoundException('org_not_found');
    this.checkOrgAccess(req, org, 'read');

    const aiOrgProfile: OrgProfile = {
      id: org.id,
      name: org.name,
      industry: org.industry,
      size: org.size,
      regions: org.regions,
    };

    const { id } = await this.notes.createStandardsDocument(uid, body.orgId, body.frameworkIds);

    await this.queue.enqueue(id, aiOrgProfile, body.frameworkIds);

    return { docId: id };
  }

  @Post('gap')
  @ApiOperation({ summary: 'Persist a gap analysis result' })
  @ApiBody({ schema: { type: 'object' } })
  async saveGap(
    @Req() req: Request & { user?: VerifiedToken },
    @Body() body: { orgId: string; docId?: string; result: GapAnalysisResult },
  ) {
    return this.notes.saveGapAnalysis(body.orgId, this.uid(req), body.docId ?? null, body.result);
  }

  @Get('gap')
  @ApiOperation({ summary: 'List persisted gap analyses for an org' })
  async listGap(@Req() req: Request & { user?: VerifiedToken }, @Query('orgId') orgId?: string) {
    if (!orgId) throw new BadRequestException('orgId required');
    return this.notes.listGapAnalyses(orgId);
  }

  @Get('gap/:id')
  @ApiOperation({ summary: 'Get a single gap analysis by id' })
  async getGap(@Param('id') id: string) {
    const gap = await this.notes.getGapAnalysis(id);
    if (!gap) throw new NotFoundException();
    return gap;
  }

  private uid(req: Request & { user?: VerifiedToken }): string {
    if (!req.user?.uid) throw new UnauthorizedException('missing_user');
    return req.user.uid;
  }

  private checkOrgAccess(
    req: Request & { user?: VerifiedToken },
    org: Organization,
    action: 'read' | 'update' | 'delete',
  ): void {
    const ability = this.abilityFactory.forUser(req.user);
    if (!ability.can(action, subject('Organization', { id: org.id, userId: org.userId }))) {
      throw new ForbiddenException();
    }
  }
}

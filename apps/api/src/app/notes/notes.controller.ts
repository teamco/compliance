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
  StandardPatch,
  DocumentStandard,
  GapAnalysisResult,
  Organization,
  OrganizationInput,
  OrgProfile,
  PolicyInput,
  PolicyPatch,
  PolicyControlInput,
  VerifiedToken,
  WorkflowTransition,
  AssetInput,
  AssetPatch,
  ExceptionInput,
  ExceptionPatch,
  ExceptionRenewalRequestInput,
  IssueInput,
  IssuePatch,
  IssueSeverity,
  IssueValidationSubmitInput,
  RiskInput,
  RiskPatch,
  AssessmentInput,
  AssessmentPatch,
  AssessmentItemPatch,
  AssessmentTypeInput,
  AssessmentItemInput,
  AssessmentItemControlMappingInput,
  RiskMethodologyInput,
  RiskTaxonomyCategoryInput,
  RiskControlMappingInput,
  RiskAcceptanceInput,
  FrameworkInput,
  FrameworkPatch,
  FrameworkRequirementPatch,
  InternalControlInput,
  InternalControlPatch,
  RequirementEvidence,
  EvidencePatch,
  RequirementAssessment,
  ControlFrameworkMappingInput,
} from '@icore/shared';
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
  listFrameworks(@Query('orgId') orgId?: string) {
    return this.notes.listFrameworks(orgId);
  }

  @Get('frameworks/:id')
  @ApiOperation({ summary: 'Get compliance framework by id' })
  async getFramework(@Param('id') id: string, @Query('orgId') orgId?: string) {
    const fw = await this.notes.getFramework(id, orgId);
    if (!fw) throw new NotFoundException('Framework not found');
    return fw;
  }

  @Post('frameworks')
  @ApiOperation({ summary: 'Create or import a compliance framework' })
  async createFramework(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
    @Body() body: FrameworkInput,
  ) {
    if (!orgId) throw new BadRequestException('orgId required');
    const org = await this.notes.getOrganizationById(orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.createFramework(orgId, body);
  }

  @Patch('frameworks/:id')
  @ApiOperation({ summary: 'Update framework status or details' })
  async updateFramework(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Query('orgId') orgId: string,
    @Body() body: FrameworkPatch,
  ) {
    if (!orgId) throw new BadRequestException('orgId required');
    const org = await this.notes.getOrganizationById(orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.updateFramework(id, orgId, body);
  }

  @Delete('frameworks/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete custom framework' })
  async deleteFramework(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Query('orgId') orgId: string,
  ) {
    if (!orgId) throw new BadRequestException('orgId required');
    const org = await this.notes.getOrganizationById(orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'delete');
    await this.notes.deleteFramework(id, orgId);
  }

  @Get('frameworks/:id/requirements')
  @ApiOperation({ summary: 'List requirements for a framework' })
  listRequirements(@Param('id') id: string, @Query('orgId') orgId?: string) {
    return this.notes.listRequirements(id, orgId);
  }

  @Get('frameworks/:id/requirements/:reqId')
  @ApiOperation({ summary: 'Get specific requirement details' })
  async getRequirement(
    @Param('id') id: string,
    @Param('reqId') reqId: string,
    @Query('orgId') orgId?: string,
  ) {
    const req = await this.notes.getRequirement(id, reqId, orgId);
    if (!req) throw new NotFoundException('Requirement not found');
    return req;
  }

  @Patch('frameworks/:id/requirements/:reqId')
  @ApiOperation({ summary: 'Update requirement applicability and implementation' })
  async updateRequirement(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Param('reqId') reqId: string,
    @Query('orgId') orgId: string,
    @Body() body: FrameworkRequirementPatch,
  ) {
    if (!orgId) throw new BadRequestException('orgId required');
    const org = await this.notes.getOrganizationById(orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.updateRequirement(id, reqId, orgId, body);
  }

  @Get('internal-controls')
  @ApiOperation({ summary: 'List internal controls for org' })
  listInternalControls(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId?: string,
    @Query('frameworkId') frameworkId?: string,
  ) {
    this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    return this.notes.listInternalControls(orgId, frameworkId);
  }

  @Post('internal-controls')
  @ApiOperation({ summary: 'Create internal control' })
  async createInternalControl(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
    @Body() body: InternalControlInput,
  ) {
    if (!orgId) throw new BadRequestException('orgId required');
    const org = await this.notes.getOrganizationById(orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.createInternalControl(orgId, body);
  }

  @Get('internal-controls/:id')
  @ApiOperation({ summary: 'Get internal control' })
  async getInternalControl(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
  ) {
    this.uid(req);
    const control = await this.notes.getInternalControl(id);
    if (!control) throw new NotFoundException();
    return control;
  }

  @Patch('internal-controls/:id')
  @ApiOperation({ summary: 'Update internal control' })
  updateInternalControl(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() patch: InternalControlPatch,
  ) {
    this.uid(req);
    return this.notes.updateInternalControl(id, patch);
  }

  @Delete('internal-controls/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete internal control' })
  deleteInternalControl(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    return this.notes.deleteInternalControl(id);
  }

  @Post('internal-controls/:id/mappings')
  @ApiOperation({ summary: 'Add a framework mapping to an internal control' })
  addControlFrameworkMapping(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: ControlFrameworkMappingInput,
  ) {
    this.uid(req);
    return this.notes.addControlFrameworkMapping(id, body);
  }

  @Delete('internal-controls/:id/mappings/:mappingId')
  @ApiOperation({ summary: 'Remove a framework mapping from an internal control' })
  removeControlFrameworkMapping(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Param('mappingId') mappingId: string,
  ) {
    this.uid(req);
    return this.notes.removeControlFrameworkMapping(id, mappingId);
  }

  @Get('internal-controls/:id/evidence')
  @ApiOperation({ summary: 'List evidence attached to an internal control' })
  listControlEvidence(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    return this.notes.listControlEvidence(id);
  }

  @Post('internal-controls/:id/evidence')
  @ApiOperation({ summary: 'Attach evidence to an internal control' })
  createControlEvidence(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
    @Param('id') id: string,
    @Body()
    body: Omit<
      RequirementEvidence,
      'id' | 'controlId' | 'createdBy' | 'verificationStatus' | 'verifiedBy' | 'verifiedAt'
    >,
  ) {
    const userId = this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    return this.notes.createControlEvidence(orgId, id, {
      ...body,
      createdBy: userId,
      verificationStatus: 'pending_review',
      verifiedBy: null,
      verifiedAt: null,
    });
  }

  @Get('internal-controls/:id/assessments')
  @ApiOperation({ summary: 'List assessments for an internal control' })
  listControlAssessments(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    return this.notes.listControlAssessments(id);
  }

  @Post('internal-controls/:id/assessments')
  @ApiOperation({ summary: 'Record a control assessment (may generate a Finding)' })
  createControlAssessment(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: Omit<RequirementAssessment, 'id' | 'controlId'>,
  ) {
    this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    return this.notes.createControlAssessment(orgId, id, body);
  }

  @Get('internal-controls/:id/findings')
  @ApiOperation({ summary: 'List findings for an internal control' })
  async listControlFindings(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
  ) {
    this.uid(req);
    const control = await this.notes.getInternalControl(id);
    if (!control?.orgId) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(control.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'read');
    return this.notes.listControlFindings(id);
  }

  @Post('findings/:id/link-risk')
  @ApiOperation({ summary: 'Link a finding to a risk register entry' })
  async linkFindingToRisk(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: { riskId: string },
  ) {
    this.uid(req);
    const finding = await this.notes.getFinding(id);
    if (!finding) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(finding.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    const risk = await this.notes.getRisk(body.riskId);
    if (!risk || risk.orgId !== finding.orgId) throw new ForbiddenException();
    return this.notes.linkFindingToRisk(id, body.riskId);
  }

  @Post('findings/:id/link-issue')
  @ApiOperation({ summary: 'Link a finding to an issue' })
  async linkFindingToIssue(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: { issueId: string },
  ) {
    this.uid(req);
    const finding = await this.notes.getFinding(id);
    if (!finding) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(finding.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    const issue = await this.notes.getIssue(body.issueId);
    if (!issue || issue.orgId !== finding.orgId) throw new ForbiddenException();
    return this.notes.linkFindingToIssue(id, body.issueId);
  }

  @Post('findings/:id/resolve-via-exception')
  @ApiOperation({ summary: 'Resolve a finding by attaching an approved exception' })
  async resolveFindingViaException(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: { exceptionId: string },
  ) {
    this.uid(req);
    const finding = await this.notes.getFinding(id);
    if (!finding) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(finding.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    const exception = await this.notes.getException(body.exceptionId);
    if (!exception || exception.orgId !== finding.orgId) throw new ForbiddenException();
    return this.notes.resolveFindingViaException(id, body.exceptionId);
  }

  @Post('findings/:id/create-issue')
  @ApiOperation({ summary: 'Create a new Issue from a Finding and link it back' })
  async createIssueFromFinding(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: { title: string; description: string; severity: IssueSeverity; ownerId: string },
  ) {
    const uid = this.uid(req);
    const finding = await this.notes.getFinding(id);
    if (!finding) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(finding.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.createIssueFromFinding(finding.orgId, uid, id, body);
  }

  @Post('findings/:id/create-risk')
  @ApiOperation({ summary: 'Create a new Risk from a Finding and link it back' })
  async createRiskFromFinding(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body()
    body: {
      title: string;
      description: string;
      taxonomyCategoryId: string;
      ownerId: string;
      inherentLikelihood: number;
      inherentImpact: number;
    },
  ) {
    const uid = this.uid(req);
    const finding = await this.notes.getFinding(id);
    if (!finding) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(finding.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.createRiskFromFinding(finding.orgId, uid, id, body);
  }

  @Post('findings/:id/create-exception')
  @ApiOperation({ summary: 'Create a new (pending) Exception from a Finding' })
  async createExceptionFromFinding(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body()
    body: {
      controlCode: string;
      frameworkId: string;
      title: string;
      statement: string;
      justification: string;
      ownerId: string;
      compensatingControls?: string;
    },
  ) {
    const uid = this.uid(req);
    const finding = await this.notes.getFinding(id);
    if (!finding) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(finding.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.createExceptionFromFinding(finding.orgId, uid, id, body);
  }

  @Get('findings/by-link')
  @ApiOperation({ summary: 'List findings linked to a given Issue, Risk, or Exception' })
  async listFindingsByLink(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('issueId') issueId?: string,
    @Query('riskId') riskId?: string,
    @Query('exceptionId') exceptionId?: string,
  ) {
    this.uid(req);
    let orgId: string | undefined;
    if (issueId) orgId = (await this.notes.getIssue(issueId))?.orgId;
    else if (riskId) orgId = (await this.notes.getRisk(riskId))?.orgId;
    else if (exceptionId) orgId = (await this.notes.getException(exceptionId))?.orgId;
    if (!orgId) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'read');
    return this.notes.listFindingsByLink({ issueId, riskId, exceptionId });
  }

  @Get('internal-controls/:id/activity')
  @ApiOperation({ summary: 'List activity log for an internal control' })
  listControlActivity(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    return this.notes.listControlActivity(id);
  }

  @Get('frameworks/:id/evidence')
  @ApiOperation({ summary: 'List evidence for a framework' })
  listFrameworkEvidence(@Param('id') id: string, @Query('orgId') orgId?: string) {
    return this.notes.listFrameworkEvidence(id, orgId);
  }

  @Post('frameworks/:id/evidence')
  @ApiOperation({ summary: 'Add evidence for a framework' })
  async createFrameworkEvidence(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Query('orgId') orgId: string,
    @Body()
    body: Omit<
      RequirementEvidence,
      'id' | 'createdBy' | 'verificationStatus' | 'verifiedBy' | 'verifiedAt'
    >,
  ) {
    if (!orgId) throw new BadRequestException('orgId required');
    const org = await this.notes.getOrganizationById(orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    const userId = this.uid(req);
    return this.notes.createFrameworkEvidence(orgId, {
      ...body,
      frameworkId: id,
      createdBy: userId,
      verificationStatus: 'pending_review',
      verifiedBy: null,
      verifiedAt: null,
    });
  }

  @Get('frameworks/:id/assessments')
  @ApiOperation({ summary: 'List assessment history for a framework' })
  listFrameworkAssessments(@Param('id') id: string, @Query('orgId') orgId?: string) {
    return this.notes.listFrameworkAssessments(id, orgId);
  }

  @Post('frameworks/:id/assessments/:assessmentId/findings')
  @ApiOperation({ summary: 'Create finding from assessment' })
  async createAssessmentFinding(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') _id: string,
    @Param('assessmentId') assessmentId: string,
    @Body()
    body: {
      title: string;
      severity: 'critical' | 'high' | 'medium' | 'low';
      description: string;
    },
  ) {
    this.uid(req);
    const assessment = await this.notes.getRequirementAssessment(assessmentId);
    if (!assessment || !assessment.orgId) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(assessment.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.createAssessmentFinding(assessment.orgId, assessmentId, body);
  }

  @Get('frameworks/:id/activities')
  @ApiOperation({ summary: 'List activities for a framework' })
  listFrameworkActivities(@Param('id') id: string, @Query('orgId') orgId?: string) {
    return this.notes.listFrameworkActivities(id, orgId);
  }

  @Get('frameworks/:id/controls')
  @ApiOperation({ summary: 'List controls for a framework' })
  listControls(@Param('id') id: string) {
    return this.notes.listControlsByFramework(id);
  }

  @Get('frameworks/:id/standards')
  @ApiOperation({ summary: 'List standards mapped to a framework for the current org' })
  async listFrameworkStandards(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
    @Param('id') id: string,
  ): Promise<DocumentStandard[]> {
    if (!orgId) throw new BadRequestException('orgId required');
    const org = await this.notes.getOrganizationById(orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'read');
    return this.notes.listStandardsByFramework(orgId, id);
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

  @Patch('standards/:id/standards/:code')
  @ApiOperation({ summary: 'Update a single generated standard (objective, scope)' })
  @ApiBody({ schema: { type: 'object' } })
  updateStandard(
    @Param('id') id: string,
    @Param('code') code: string,
    @Body() patch: StandardPatch,
  ) {
    return this.notes.updateStandard(id, code, patch);
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

  @Delete('standards/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a standards document' })
  async deleteStandards(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    const doc = await this.notes.getStandardsDocument(id);
    if (!doc) throw new NotFoundException('doc_not_found');
    if (doc.status === 'pending') {
      await this.notes.failStandardsDocument(id, 'cancelled');
    }
    await this.notes.deleteStandardsDocument(id);
  }

  @Post('standards/:id/retry')
  @ApiOperation({ summary: 'Retry a failed or stuck pending standards document' })
  async retryStandards(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    const doc = await this.notes.getStandardsDocument(id);
    if (!doc) throw new NotFoundException('doc_not_found');

    const STUCK_MS = 5 * 60 * 1000;
    const isPendingTooLong =
      doc.status === 'pending' && Date.now() - new Date(doc.createdAt).getTime() > STUCK_MS;

    if (doc.status !== 'failed' && !isPendingTooLong) {
      throw new BadRequestException('doc_not_retryable');
    }

    const org = await this.notes.getOrganizationById(doc.orgId);
    if (!org) throw new NotFoundException('org_not_found');

    await this.notes.resetStandardsDocument(id);

    const aiOrgProfile: OrgProfile = {
      id: org.id,
      name: org.name,
      industry: org.industry,
      size: org.size,
      regions: org.regions,
    };

    await this.queue.enqueue(id, aiOrgProfile, doc.frameworkIds);

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

  // ─── Exceptions ──────────────────────────────────────────────────────────

  @Get('exceptions')
  @ApiOperation({ summary: 'List exceptions for org' })
  async listExceptions(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
  ) {
    this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    const org = await this.notes.getOrganizationById(orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'read');
    return this.notes.listExceptions(orgId);
  }

  @Post('exceptions')
  @ApiOperation({ summary: 'Create exception' })
  async createException(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
    @Body() body: ExceptionInput,
  ) {
    const userId = this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    const org = await this.notes.getOrganizationById(orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.createException(orgId, userId, body);
  }

  @Get('exceptions/:id')
  @ApiOperation({ summary: 'Get exception' })
  async getException(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    const exc = await this.notes.getException(id);
    if (!exc) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(exc.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'read');
    return exc;
  }

  @Patch('exceptions/:id')
  @ApiOperation({ summary: 'Update exception' })
  async updateException(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() patch: ExceptionPatch,
  ) {
    this.uid(req);
    const exc = await this.notes.getException(id);
    if (!exc) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(exc.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.updateException(id, patch);
  }

  @Post('exceptions/:id/approve')
  @ApiOperation({ summary: 'Approve exception' })
  async approveException(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    const userId = this.uid(req);
    const exception = await this.notes.getException(id);
    if (!exception) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(exception.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.approveException(id, userId);
  }

  @Post('exceptions/:id/reject')
  @ApiOperation({ summary: 'Reject exception' })
  async rejectException(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    const userId = this.uid(req);
    const exception = await this.notes.getException(id);
    if (!exception) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(exception.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.rejectException(id, userId);
  }

  @Delete('exceptions/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete exception' })
  async deleteException(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    const exc = await this.notes.getException(id);
    if (!exc) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(exc.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'delete');
    return this.notes.deleteException(id);
  }

  @Post('exceptions/:id/renewals')
  @ApiOperation({ summary: 'Owner requests a renewal (new expiry) for an exception' })
  async requestExceptionRenewal(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: ExceptionRenewalRequestInput,
  ) {
    const userId = this.uid(req);
    const exception = await this.notes.getException(id);
    if (!exception) throw new NotFoundException();
    if (exception.ownerId !== userId) throw new ForbiddenException();
    return this.notes.requestExceptionRenewal(id, userId, body);
  }

  @Post('exception-renewals/:id/review')
  @ApiOperation({ summary: 'A different user approves or rejects a pending exception renewal' })
  async reviewExceptionRenewal(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: { decision: 'approved' | 'rejected'; reviewNotes?: string },
  ) {
    const userId = this.uid(req);
    const renewal = await this.notes.getExceptionRenewal(id);
    if (!renewal) throw new NotFoundException();
    const exception = await this.notes.getException(renewal.exceptionId);
    if (!exception) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(exception.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.reviewExceptionRenewal(id, userId, body.decision, body.reviewNotes);
  }

  @Get('exceptions/:id/renewals')
  @ApiOperation({ summary: 'List renewal history for an exception' })
  async listExceptionRenewals(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
  ) {
    const userId = this.uid(req);
    const exception = await this.notes.getException(id);
    if (!exception) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(exception.orgId);
    if (!org) throw new NotFoundException();
    const renewals = await this.notes.listExceptionRenewals(id);
    const isPartyToException =
      exception.ownerId === userId ||
      renewals.some((r) => r.requestedBy === userId || r.reviewedBy === userId);
    if (org.userId !== userId && !isPartyToException) throw new ForbiddenException();
    return renewals;
  }

  @Get('exception-renewals')
  @ApiOperation({ summary: 'List all pending exception renewals for an org' })
  async listPendingExceptionRenewals(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
  ) {
    this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    const org = await this.notes.getOrganizationById(orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'read');
    return this.notes.listPendingExceptionRenewals(orgId);
  }

  // ─── Issues ──────────────────────────────────────────────────────────────

  @Get('issues')
  @ApiOperation({ summary: 'List issues for org' })
  async listIssues(@Req() req: Request & { user?: VerifiedToken }, @Query('orgId') orgId: string) {
    this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    const org = await this.notes.getOrganizationById(orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'read');
    return this.notes.listIssues(orgId);
  }

  @Post('issues')
  @ApiOperation({ summary: 'Create issue' })
  async createIssue(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
    @Body() body: IssueInput,
  ) {
    const userId = this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    const org = await this.notes.getOrganizationById(orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.createIssue(orgId, userId, body);
  }

  @Get('issues/:id')
  @ApiOperation({ summary: 'Get issue' })
  async getIssue(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    const issue = await this.notes.getIssue(id);
    if (!issue) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(issue.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'read');
    return issue;
  }

  @Patch('issues/:id')
  @ApiOperation({ summary: 'Update issue status / severity' })
  async updateIssue(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() patch: IssuePatch,
  ) {
    this.uid(req);
    const issue = await this.notes.getIssue(id);
    if (!issue) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(issue.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.updateIssue(id, patch);
  }

  @Delete('issues/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete issue' })
  async deleteIssue(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    const issue = await this.notes.getIssue(id);
    if (!issue) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(issue.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'delete');
    return this.notes.deleteIssue(id);
  }

  @Post('issues/:id/submit-for-validation')
  @ApiOperation({ summary: 'Owner submits an issue fix for validator review' })
  async submitIssueForValidation(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: IssueValidationSubmitInput,
  ) {
    const userId = this.uid(req);
    const issue = await this.notes.getIssue(id);
    if (!issue) throw new NotFoundException();
    if (issue.ownerId !== userId) throw new ForbiddenException();
    return this.notes.submitIssueForValidation(id, userId, body);
  }

  @Post('issue-validations/:id/review')
  @ApiOperation({ summary: 'Validator approves or rejects a pending issue validation' })
  async reviewIssueValidation(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: { decision: 'approved' | 'rejected'; reviewNotes?: string },
  ) {
    const userId = this.uid(req);
    return this.notes.reviewIssueValidation(id, userId, body.decision, body.reviewNotes);
  }

  @Get('issues/:id/validations')
  @ApiOperation({ summary: 'List validation history for an issue' })
  async listIssueValidations(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
  ) {
    const userId = this.uid(req);
    const issue = await this.notes.getIssue(id);
    if (!issue) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(issue.orgId);
    if (!org) throw new NotFoundException();
    const validations = await this.notes.listIssueValidations(id);
    const isPartyToIssue =
      issue.ownerId === userId ||
      validations.some((v) => v.requestedBy === userId || v.validatorId === userId);
    if (org.userId !== userId && !isPartyToIssue) throw new ForbiddenException();
    return validations;
  }

  @Get('issue-validations')
  @ApiOperation({ summary: 'List all pending issue validations for an org' })
  async listPendingIssueValidations(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
  ) {
    this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    const org = await this.notes.getOrganizationById(orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'read');
    return this.notes.listPendingIssueValidations(orgId);
  }

  // ─── Assets ──────────────────────────────────────────────────────────────

  @Get('assets')
  @ApiOperation({ summary: 'List assets for org' })
  listAssets(@Req() req: Request & { user?: VerifiedToken }, @Query('orgId') orgId: string) {
    this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    return this.notes.listAssets(orgId);
  }

  @Post('assets')
  @ApiOperation({ summary: 'Create asset' })
  createAsset(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
    @Body() body: AssetInput,
  ) {
    const userId = this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    return this.notes.createAsset(orgId, userId, body);
  }

  @Get('assets/:id')
  @ApiOperation({ summary: 'Get asset' })
  async getAsset(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    const asset = await this.notes.getAsset(id);
    if (!asset) throw new NotFoundException();
    return asset;
  }

  @Patch('assets/:id')
  @ApiOperation({ summary: 'Update asset' })
  updateAsset(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() patch: AssetPatch,
  ) {
    this.uid(req);
    return this.notes.updateAsset(id, patch);
  }

  @Delete('assets/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete asset' })
  deleteAsset(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    return this.notes.deleteAsset(id);
  }

  @Get('assets/:id/evidence')
  @ApiOperation({ summary: 'List evidence attached to an asset' })
  async listAssetEvidence(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    const asset = await this.notes.getAsset(id);
    if (!asset) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(asset.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'read');
    return this.notes.listAssetEvidence(id);
  }

  @Post('assets/:id/evidence')
  @ApiOperation({ summary: 'Attach evidence to an asset' })
  async createAssetEvidence(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
    @Param('id') id: string,
    @Body()
    body: Omit<
      RequirementEvidence,
      'id' | 'assetId' | 'createdBy' | 'verificationStatus' | 'verifiedBy' | 'verifiedAt'
    >,
  ) {
    const userId = this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    const org = await this.notes.getOrganizationById(orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    const asset = await this.notes.getAsset(id);
    if (!asset || asset.orgId !== orgId) throw new NotFoundException();
    return this.notes.createAssetEvidence(orgId, id, {
      ...body,
      createdBy: userId,
      verificationStatus: 'pending_review',
      verifiedBy: null,
      verifiedAt: null,
    });
  }

  @Patch('evidence/:id')
  @ApiOperation({ summary: 'Edit evidence metadata' })
  async updateEvidence(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() patch: EvidencePatch,
  ) {
    const evidence = await this.notes.getEvidence(id);
    if (!evidence || !evidence.orgId) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(evidence.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.updateEvidence(id, patch);
  }

  @Delete('evidence/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete evidence' })
  async deleteEvidence(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    const evidence = await this.notes.getEvidence(id);
    if (!evidence || !evidence.orgId) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(evidence.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'delete');
    return this.notes.deleteEvidence(id);
  }

  @Post('evidence/:id/review')
  @ApiOperation({ summary: 'Verify or reject evidence' })
  async reviewEvidence(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: { decision: 'verified' | 'rejected'; reviewNotes?: string },
  ) {
    const userId = this.uid(req);
    const evidence = await this.notes.getEvidence(id);
    if (!evidence || !evidence.orgId) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(evidence.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.reviewEvidence(id, userId, body.decision, body.reviewNotes);
  }

  // ─── Risks ───────────────────────────────────────────────────────────────

  @Get('risks')
  @ApiOperation({ summary: 'List risks for org (sorted by risk score desc)' })
  listRisks(@Req() req: Request & { user?: VerifiedToken }, @Query('orgId') orgId: string) {
    this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    return this.notes.listRisks(orgId);
  }

  @Post('risks')
  @ApiOperation({ summary: 'Create risk entry' })
  createRisk(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
    @Body() body: RiskInput,
  ) {
    const userId = this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    return this.notes.createRisk(orgId, userId, body);
  }

  @Get('risks/methodology')
  @ApiOperation({ summary: 'Get the org active risk methodology' })
  getRiskMethodology(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
  ) {
    this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    return this.notes.getRiskMethodology(orgId);
  }

  @Get('risks/taxonomy')
  @ApiOperation({ summary: 'List the org risk taxonomy categories' })
  listRiskTaxonomy(@Req() req: Request & { user?: VerifiedToken }, @Query('orgId') orgId: string) {
    this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    return this.notes.listRiskTaxonomy(orgId);
  }

  @Get('risks/:id')
  @ApiOperation({ summary: 'Get risk' })
  async getRisk(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    const risk = await this.notes.getRisk(id);
    if (!risk) throw new NotFoundException();
    return risk;
  }

  @Patch('risks/:id')
  @ApiOperation({ summary: 'Update risk (writes a history snapshot first)' })
  updateRisk(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: RiskPatch & { reason?: string },
  ) {
    const userId = this.uid(req);
    const { reason, ...patch } = body;
    return this.notes.updateRisk(id, patch, userId, reason);
  }

  @Delete('risks/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete risk' })
  deleteRisk(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    return this.notes.deleteRisk(id);
  }

  // ─── Risk Register ───────────────────────────────────────────────────────

  @Post('risks/methodology')
  @ApiOperation({ summary: 'Update the org risk methodology (creates a new version)' })
  upsertRiskMethodology(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
    @Body() body: RiskMethodologyInput,
  ) {
    this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    return this.notes.upsertRiskMethodology(orgId, body);
  }

  @Post('risks/taxonomy')
  @ApiOperation({ summary: 'Add a risk taxonomy category' })
  createRiskTaxonomyCategory(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
    @Body() body: RiskTaxonomyCategoryInput,
  ) {
    this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    return this.notes.createRiskTaxonomyCategory(orgId, body);
  }

  @Patch('risks/taxonomy/:id/archive')
  @ApiOperation({ summary: 'Archive a risk taxonomy category' })
  archiveRiskTaxonomyCategory(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
  ) {
    this.uid(req);
    return this.notes.archiveRiskTaxonomyCategory(id);
  }

  @Get('risks/:id/mappings')
  @ApiOperation({ summary: 'List controls mapped to a risk' })
  listRiskControlMappings(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    return this.notes.listRiskControlMappings(id);
  }

  @Post('risks/:id/mappings')
  @ApiOperation({ summary: 'Map a control to a risk' })
  addRiskControlMapping(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: RiskControlMappingInput,
  ) {
    this.uid(req);
    return this.notes.addRiskControlMapping(id, body);
  }

  @Delete('risks/:riskId/mappings/:mappingId')
  @ApiOperation({ summary: 'Remove a risk-control mapping' })
  removeRiskControlMapping(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('mappingId') mappingId: string,
  ) {
    this.uid(req);
    return this.notes.removeRiskControlMapping(mappingId);
  }

  @Post('risks/:id/acceptance')
  @ApiOperation({ summary: 'Request risk acceptance' })
  createRiskAcceptance(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: RiskAcceptanceInput,
  ) {
    const userId = this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    return this.notes.createRiskAcceptance(orgId, id, userId, body);
  }

  @Get('risks/:id/acceptance/active')
  @ApiOperation({ summary: 'Get the active risk acceptance, if any' })
  getActiveRiskAcceptance(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    return this.notes.getActiveRiskAcceptance(id);
  }

  @Post('risk-acceptances/:id/review')
  @ApiOperation({ summary: 'Review a risk acceptance request' })
  reviewRiskAcceptance(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: { reviewNotes?: string },
  ) {
    const userId = this.uid(req);
    return this.notes.reviewRiskAcceptance(id, userId, body.reviewNotes);
  }

  @Post('risk-acceptances/:id/approve')
  @ApiOperation({ summary: 'Approve a risk acceptance request' })
  approveRiskAcceptance(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    const userId = this.uid(req);
    return this.notes.approveRiskAcceptance(id, userId);
  }

  @Post('risk-acceptances/:id/reject')
  @ApiOperation({ summary: 'Reject a risk acceptance request' })
  rejectRiskAcceptance(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    const userId = this.uid(req);
    return this.notes.rejectRiskAcceptance(id, userId);
  }

  @Get('risks/:id/snapshots')
  @ApiOperation({ summary: 'List risk history snapshots' })
  listRiskSnapshots(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    return this.notes.listRiskSnapshots(id);
  }

  @Get('risks/:id/evidence')
  @ApiOperation({ summary: 'List evidence attached to a risk' })
  listRiskEvidence(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    return this.notes.listRiskEvidence(id);
  }

  @Post('risks/:id/evidence')
  @ApiOperation({ summary: 'Attach evidence to a risk' })
  createRiskEvidence(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
    @Param('id') id: string,
    @Body()
    body: Omit<
      RequirementEvidence,
      'id' | 'riskId' | 'createdBy' | 'verificationStatus' | 'verifiedBy' | 'verifiedAt'
    >,
  ) {
    const userId = this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    return this.notes.createRiskEvidence(orgId, id, {
      ...body,
      createdBy: userId,
      verificationStatus: 'pending_review',
      verifiedBy: null,
      verifiedAt: null,
    });
  }

  @Get('risks/:id/assessment-items')
  @ApiOperation({ summary: 'List assessment items linked to a risk' })
  listAssessmentItemsForRisk(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
  ) {
    this.uid(req);
    return this.notes.listAssessmentItemsForRisk(id);
  }

  // ─── Risk Assessments ────────────────────────────────────────────────────

  @Get('assessments')
  @ApiOperation({ summary: 'List risk assessments for org' })
  listAssessments(@Req() req: Request & { user?: VerifiedToken }, @Query('orgId') orgId: string) {
    this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    return this.notes.listAssessments(orgId);
  }

  @Post('assessments')
  @ApiOperation({ summary: 'Create risk assessment' })
  createAssessment(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
    @Body() body: AssessmentInput,
  ) {
    const userId = this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    return this.notes.createAssessment(orgId, userId, body);
  }

  @Get('assessments/:id')
  @ApiOperation({ summary: 'Get risk assessment' })
  async getAssessment(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    const a = await this.notes.getAssessment(id);
    if (!a) throw new NotFoundException();
    return a;
  }

  @Patch('assessments/:id')
  @ApiOperation({ summary: 'Update risk assessment' })
  updateAssessment(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() patch: AssessmentPatch,
  ) {
    this.uid(req);
    return this.notes.updateAssessment(id, patch);
  }

  @Delete('assessments/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete risk assessment' })
  deleteAssessment(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    const userId = this.uid(req);
    return this.notes.deleteAssessment(id, userId);
  }

  @Get('assessments/:id/items')
  @ApiOperation({ summary: 'List items for a risk assessment' })
  listAssessmentItems(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    return this.notes.listAssessmentItems(id);
  }

  @Post('assessments/:id/items')
  @ApiOperation({ summary: 'Add item to risk assessment' })
  createAssessmentItem(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') assessmentId: string,
    @Body() body: AssessmentItemInput,
  ) {
    this.uid(req);
    return this.notes.createAssessmentItem(assessmentId, body);
  }

  // ─── Assessment Types & Lifecycle ─────────────────────────────────────────

  @Get('assessment-types')
  @ApiOperation({ summary: 'List assessment types for org' })
  listAssessmentTypes(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
  ) {
    this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    return this.notes.listAssessmentTypes(orgId);
  }

  @Post('assessment-types')
  @ApiOperation({ summary: 'Create an assessment type' })
  createAssessmentType(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
    @Body() body: AssessmentTypeInput,
  ) {
    this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    return this.notes.createAssessmentType(orgId, body);
  }

  @Patch('assessment-types/:id/archive')
  @ApiOperation({ summary: 'Archive an assessment type' })
  archiveAssessmentType(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    return this.notes.archiveAssessmentType(id);
  }

  @Post('assessments/:id/start')
  @ApiOperation({ summary: 'Start an assessment (draft -> in_progress)' })
  startAssessment(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    const userId = this.uid(req);
    return this.notes.startAssessment(id, userId);
  }

  @Post('assessments/:id/submit-for-review')
  @ApiOperation({ summary: 'Submit an assessment for review' })
  submitForReview(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    const userId = this.uid(req);
    return this.notes.submitForReview(id, userId);
  }

  @Post('assessments/:id/approve')
  @ApiOperation({ summary: 'Approve an assessment' })
  approveAssessment(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    const userId = this.uid(req);
    return this.notes.approveAssessment(id, userId);
  }

  @Post('assessments/:id/request-changes')
  @ApiOperation({ summary: 'Request changes on an assessment' })
  requestChanges(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: { note: string },
  ) {
    const userId = this.uid(req);
    return this.notes.requestChanges(id, userId, body.note);
  }

  @Post('assessments/:id/complete')
  @ApiOperation({ summary: 'Complete an approved assessment' })
  completeAssessment(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    const userId = this.uid(req);
    return this.notes.completeAssessment(id, userId);
  }

  @Post('assessments/:id/archive')
  @ApiOperation({ summary: 'Archive an assessment' })
  archiveAssessment(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    const userId = this.uid(req);
    return this.notes.archiveAssessment(id, userId);
  }

  @Get('assessments/items/:itemId/mappings')
  @ApiOperation({ summary: 'List controls mapped to an assessment item' })
  listAssessmentItemControlMappings(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('itemId') itemId: string,
  ) {
    this.uid(req);
    return this.notes.listAssessmentItemControlMappings(itemId);
  }

  @Post('assessments/items/:itemId/mappings')
  @ApiOperation({ summary: 'Map a control to an assessment item' })
  addAssessmentItemControlMapping(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('itemId') itemId: string,
    @Body() body: AssessmentItemControlMappingInput,
  ) {
    this.uid(req);
    return this.notes.addAssessmentItemControlMapping(itemId, body);
  }

  @Delete('assessments/items/mappings/:mappingId')
  @ApiOperation({ summary: 'Remove an assessment item-control mapping' })
  removeAssessmentItemControlMapping(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('mappingId') mappingId: string,
  ) {
    this.uid(req);
    return this.notes.removeAssessmentItemControlMapping(mappingId);
  }

  @Get('assessments/items/:itemId/evidence')
  @ApiOperation({ summary: 'List evidence attached to an assessment item' })
  listAssessmentItemEvidence(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('itemId') itemId: string,
  ) {
    this.uid(req);
    return this.notes.listAssessmentItemEvidence(itemId);
  }

  @Post('assessments/items/:itemId/evidence')
  @ApiOperation({ summary: 'Attach evidence to an assessment item' })
  async createAssessmentItemEvidence(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
    @Param('itemId') itemId: string,
    @Body()
    body: Omit<
      RequirementEvidence,
      'id' | 'assessmentItemId' | 'createdBy' | 'verificationStatus' | 'verifiedBy' | 'verifiedAt'
    >,
  ) {
    const userId = this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    const org = await this.notes.getOrganizationById(orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    const item = await this.notes.getAssessmentItem(itemId);
    if (!item || item.orgId !== orgId) throw new NotFoundException();
    return this.notes.createAssessmentItemEvidence(orgId, itemId, {
      ...body,
      createdBy: userId,
      verificationStatus: 'pending_review',
      verifiedBy: null,
      verifiedAt: null,
    });
  }

  @Patch('assessments/items/:itemId')
  @ApiOperation({ summary: 'Update risk assessment item' })
  updateAssessmentItem(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('itemId') itemId: string,
    @Body() patch: AssessmentItemPatch,
  ) {
    this.uid(req);
    return this.notes.updateAssessmentItem(itemId, patch);
  }

  @Delete('assessments/items/:itemId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete risk assessment item' })
  deleteAssessmentItem(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('itemId') itemId: string,
  ) {
    this.uid(req);
    return this.notes.deleteAssessmentItem(itemId);
  }

  @Post('assessments/items/:itemId/create-risk')
  @ApiOperation({ summary: 'Create a new Risk from an assessment item' })
  async createRiskFromAssessmentItem(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('itemId') itemId: string,
    @Body() body: { taxonomyCategoryId: string },
  ) {
    const uid = this.uid(req);
    const item = await this.notes.getAssessmentItem(itemId);
    if (!item) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(item.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.createRiskFromAssessmentItem(item.orgId, uid, itemId, body);
  }

  @Post('assessments/items/:itemId/link-risk')
  @ApiOperation({ summary: 'Link an assessment item to an existing Risk' })
  async linkAssessmentItemToRisk(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('itemId') itemId: string,
    @Body() body: { riskId: string },
  ) {
    this.uid(req);
    const item = await this.notes.getAssessmentItem(itemId);
    if (!item) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(item.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.linkAssessmentItemToRisk(itemId, body.riskId);
  }

  @Delete('assessments/items/:itemId/link-risk')
  @ApiOperation({ summary: 'Unlink an assessment item from its Risk' })
  async unlinkAssessmentItemFromRisk(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('itemId') itemId: string,
  ) {
    this.uid(req);
    const item = await this.notes.getAssessmentItem(itemId);
    if (!item) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(item.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.unlinkAssessmentItemFromRisk(itemId);
  }

  // ─── Policies ────────────────────────────────────────────────────────────

  @Get('policies')
  @ApiOperation({ summary: 'List policies for org' })
  listPolicies(@Req() req: Request & { user?: VerifiedToken }, @Query('orgId') orgId: string) {
    this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    return this.notes.listPolicies(orgId);
  }

  @Post('policies')
  @ApiOperation({ summary: 'Create policy' })
  createPolicy(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
    @Body() body: PolicyInput,
  ) {
    const userId = this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    return this.notes.createPolicy(orgId, userId, body);
  }

  @Get('policies/for-control')
  @ApiOperation({ summary: 'List policies linked to a specific control' })
  listPoliciesForControl(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('controlCode') controlCode: string,
    @Query('frameworkId') frameworkId: string,
  ) {
    this.uid(req);
    if (!controlCode || !frameworkId)
      throw new BadRequestException('controlCode and frameworkId required');
    return this.notes.listPoliciesForControl(controlCode, frameworkId);
  }

  @Post('policies/clone/:templateId')
  @ApiOperation({ summary: 'Clone a policy template into org' })
  cloneTemplate(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
    @Param('templateId') templateId: string,
  ) {
    const userId = this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    return this.notes.cloneTemplate(orgId, userId, templateId);
  }

  @Get('policy-templates')
  @ApiOperation({ summary: 'List policy templates (platform-wide)' })
  listPolicyTemplates(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('frameworkId') frameworkId?: string,
  ) {
    this.uid(req);
    return this.notes.listPolicyTemplates(frameworkId);
  }

  @Delete('policies/controls/:mappingId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove a policy-control mapping' })
  removePolicyControl(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('mappingId') mappingId: string,
  ) {
    this.uid(req);
    return this.notes.removePolicyControl(mappingId);
  }

  @Get('policies/:id')
  @ApiOperation({ summary: 'Get policy' })
  async getPolicy(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    const p = await this.notes.getPolicy(id);
    if (!p) throw new NotFoundException();
    return p;
  }

  @Patch('policies/:id')
  @ApiOperation({ summary: 'Update policy' })
  updatePolicy(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() patch: PolicyPatch,
  ) {
    this.uid(req);
    return this.notes.updatePolicy(id, patch);
  }

  @Delete('policies/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete policy' })
  deletePolicy(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    return this.notes.deletePolicy(id);
  }

  @Get('policies/:id/controls')
  @ApiOperation({ summary: 'List controls linked to a policy' })
  listPolicyControls(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') policyId: string,
  ) {
    this.uid(req);
    return this.notes.listPolicyControls(policyId);
  }

  @Post('policies/:id/controls')
  @ApiOperation({ summary: 'Add control mapping to policy' })
  addPolicyControl(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') policyId: string,
    @Body() body: PolicyControlInput,
  ) {
    this.uid(req);
    return this.notes.addPolicyControl(policyId, body);
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

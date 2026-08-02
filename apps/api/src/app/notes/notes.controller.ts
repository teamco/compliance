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
  IssueInput,
  IssuePatch,
  RiskInput,
  RiskPatch,
  RiskAssessmentInput,
  RiskAssessmentPatch,
  RiskAssessmentItemInput,
  RiskAssessmentItemPatch,
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
  listFrameworks() {
    return this.notes.listFrameworks();
  }

  @Get('frameworks/:id/controls')
  @ApiOperation({ summary: 'List controls for a framework' })
  listControls(@Param('id') id: string) {
    return this.notes.listControlsByFramework(id);
  }

  @Get('frameworks/:id/standards')
  @ApiOperation({ summary: 'List standards mapped to a framework for the current org' })
  listFrameworkStandards(
    @Query('orgId') orgId: string,
    @Param('id') id: string,
  ): Promise<DocumentStandard[]> {
    if (!orgId) throw new BadRequestException('orgId required');
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
  listExceptions(@Req() req: Request & { user?: VerifiedToken }, @Query('orgId') orgId: string) {
    this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    return this.notes.listExceptions(orgId);
  }

  @Post('exceptions')
  @ApiOperation({ summary: 'Create exception' })
  createException(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
    @Body() body: ExceptionInput,
  ) {
    const userId = this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    return this.notes.createException(orgId, userId, body);
  }

  @Get('exceptions/:id')
  @ApiOperation({ summary: 'Get exception' })
  async getException(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    const exc = await this.notes.getException(id);
    if (!exc) throw new NotFoundException();
    return exc;
  }

  @Patch('exceptions/:id')
  @ApiOperation({ summary: 'Update exception' })
  updateException(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() patch: ExceptionPatch,
  ) {
    this.uid(req);
    return this.notes.updateException(id, patch);
  }

  @Post('exceptions/:id/approve')
  @ApiOperation({ summary: 'Approve exception' })
  approveException(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    return this.notes.approveException(id);
  }

  @Post('exceptions/:id/reject')
  @ApiOperation({ summary: 'Reject exception' })
  rejectException(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    return this.notes.rejectException(id);
  }

  @Delete('exceptions/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete exception' })
  deleteException(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    return this.notes.deleteException(id);
  }

  // ─── Issues ──────────────────────────────────────────────────────────────

  @Get('issues')
  @ApiOperation({ summary: 'List issues for org' })
  listIssues(@Req() req: Request & { user?: VerifiedToken }, @Query('orgId') orgId: string) {
    this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    return this.notes.listIssues(orgId);
  }

  @Post('issues')
  @ApiOperation({ summary: 'Create issue' })
  createIssue(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
    @Body() body: IssueInput,
  ) {
    const userId = this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    return this.notes.createIssue(orgId, userId, body);
  }

  @Get('issues/:id')
  @ApiOperation({ summary: 'Get issue' })
  async getIssue(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    const issue = await this.notes.getIssue(id);
    if (!issue) throw new NotFoundException();
    return issue;
  }

  @Patch('issues/:id')
  @ApiOperation({ summary: 'Update issue status / severity' })
  updateIssue(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() patch: IssuePatch,
  ) {
    this.uid(req);
    return this.notes.updateIssue(id, patch);
  }

  @Delete('issues/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete issue' })
  deleteIssue(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    return this.notes.deleteIssue(id);
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

  @Get('risks/:id')
  @ApiOperation({ summary: 'Get risk' })
  async getRisk(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    const risk = await this.notes.getRisk(id);
    if (!risk) throw new NotFoundException();
    return risk;
  }

  @Patch('risks/:id')
  @ApiOperation({ summary: 'Update risk' })
  updateRisk(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() patch: RiskPatch,
  ) {
    this.uid(req);
    return this.notes.updateRisk(id, patch);
  }

  @Delete('risks/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete risk' })
  deleteRisk(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    return this.notes.deleteRisk(id);
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
    @Body() body: RiskAssessmentInput,
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
    @Body() patch: RiskAssessmentPatch,
  ) {
    this.uid(req);
    return this.notes.updateAssessment(id, patch);
  }

  @Delete('assessments/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete risk assessment' })
  deleteAssessment(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    return this.notes.deleteAssessment(id);
  }

  @Get('assessments/:id/items')
  @ApiOperation({ summary: 'List items for a risk assessment' })
  listAssessmentItems(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    return this.notes.listAssessmentItems(id);
  }

  @Post('assessments/:id/items')
  @ApiOperation({ summary: 'Add item to risk assessment' })
  addAssessmentItem(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') assessmentId: string,
    @Body() body: RiskAssessmentItemInput,
  ) {
    this.uid(req);
    return this.notes.addAssessmentItem(assessmentId, body);
  }

  @Patch('assessments/items/:itemId')
  @ApiOperation({ summary: 'Update risk assessment item' })
  updateAssessmentItem(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('itemId') itemId: string,
    @Body() patch: RiskAssessmentItemPatch,
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

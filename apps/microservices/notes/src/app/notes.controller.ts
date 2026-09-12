import { Controller, Inject } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import type {
  DocumentStandard,
  Asset,
  AssetInput,
  AssetPatch,
  Exception,
  ExceptionInput,
  ExceptionPatch,
  ControlFrameworkMappingInput,
  Finding,
  Framework,
  FrameworkControl,
  FrameworkRequirement,
  FrameworkRequirementPatch,
  InternalControl,
  InternalControlInput,
  InternalControlPatch,
  RequirementEvidence,
  RequirementAssessment,
  FrameworkActivity,
  FrameworkInput,
  FrameworkPatch,
  GapAnalysis,
  GapAnalysisResult,
  Issue,
  IssueInput,
  IssuePatch,
  NotesStrategy,
  Policy,
  PolicyInput,
  PolicyPatch,
  PolicyTemplate,
  PolicyControl,
  PolicyControlInput,
  Risk,
  RiskInput,
  RiskPatch,
  RiskAssessment,
  RiskAssessmentInput,
  RiskAssessmentPatch,
  RiskAssessmentItem,
  RiskAssessmentItemInput,
  RiskAssessmentItemPatch,
  RiskMethodology,
  RiskMethodologyInput,
  RiskTaxonomyCategory,
  RiskTaxonomyCategoryInput,
  RiskControlMapping,
  RiskControlMappingInput,
  RiskAcceptance,
  RiskAcceptanceInput,
  RiskSnapshot,
  Organization,
  OrganizationInput,
  ReportTemplate,
  ReportTemplateInput,
  StandardPatch,
  StandardsDocument,
  StandardsSnapshot,
  WorkflowTransition,
} from '@icore/shared';

@Controller()
export class NotesController {
  constructor(@Inject('NotesStrategy') private readonly strategy: NotesStrategy) {}

  @MessagePattern('notes.frameworks.list')
  listFrameworks(@Payload() payload?: { orgId?: string }): Promise<Framework[]> {
    return this.strategy.listFrameworks(payload?.orgId);
  }

  @MessagePattern('notes.frameworks.get')
  getFramework(@Payload() payload: { id: string; orgId?: string }): Promise<Framework | null> {
    return this.strategy.getFramework(payload.id, payload.orgId);
  }

  @MessagePattern('notes.frameworks.create')
  createFramework(
    @Payload() payload: { orgId: string; input: FrameworkInput },
  ): Promise<Framework> {
    return this.strategy.createFramework(payload.orgId, payload.input);
  }

  @MessagePattern('notes.frameworks.update')
  updateFramework(
    @Payload() payload: { id: string; orgId: string; patch: FrameworkPatch },
  ): Promise<Framework> {
    return this.strategy.updateFramework(payload.id, payload.orgId, payload.patch);
  }

  @MessagePattern('notes.frameworks.delete')
  deleteFramework(@Payload() payload: { id: string; orgId: string }): Promise<void> {
    return this.strategy.deleteFramework(payload.id, payload.orgId);
  }

  @MessagePattern('notes.frameworks.requirements.list')
  listRequirements(
    @Payload() payload: { frameworkId: string; orgId?: string },
  ): Promise<FrameworkRequirement[]> {
    return this.strategy.listRequirements(payload.frameworkId, payload.orgId);
  }

  @MessagePattern('notes.frameworks.requirements.get')
  getRequirement(
    @Payload() payload: { frameworkId: string; reqId: string; orgId?: string },
  ): Promise<FrameworkRequirement | null> {
    return this.strategy.getRequirement(payload.frameworkId, payload.reqId, payload.orgId);
  }

  @MessagePattern('notes.frameworks.requirements.update')
  updateRequirement(
    @Payload()
    payload: {
      frameworkId: string;
      reqId: string;
      orgId: string;
      patch: FrameworkRequirementPatch;
    },
  ): Promise<FrameworkRequirement> {
    return this.strategy.updateRequirement(
      payload.frameworkId,
      payload.reqId,
      payload.orgId,
      payload.patch,
    );
  }

  @MessagePattern('notes.internal-controls.list')
  listInternalControls(
    @Payload() payload: { orgId?: string; frameworkId?: string },
  ): Promise<InternalControl[]> {
    return this.strategy.listInternalControls(payload?.orgId, payload?.frameworkId);
  }

  @MessagePattern('notes.internal-controls.create')
  createInternalControl(
    @Payload() payload: { orgId: string; data: InternalControlInput },
  ): Promise<InternalControl> {
    return this.strategy.createInternalControl(payload.orgId, payload.data);
  }

  @MessagePattern('notes.internal-controls.get')
  getInternalControl(
    @Payload() payload: { id: string; orgId?: string },
  ): Promise<InternalControl | null> {
    return this.strategy.getInternalControl(payload.id, payload.orgId);
  }

  @MessagePattern('notes.internal-controls.update')
  updateInternalControl(
    @Payload() payload: { id: string; patch: InternalControlPatch },
  ): Promise<InternalControl> {
    return this.strategy.updateInternalControl(payload.id, payload.patch);
  }

  @MessagePattern('notes.internal-controls.delete')
  deleteInternalControl(@Payload() payload: { id: string }): Promise<void> {
    return this.strategy.deleteInternalControl(payload.id);
  }

  @MessagePattern('notes.internal-controls.mappings.add')
  addControlFrameworkMapping(
    @Payload() payload: { controlId: string; data: ControlFrameworkMappingInput },
  ): Promise<InternalControl> {
    return this.strategy.addControlFrameworkMapping(payload.controlId, payload.data);
  }

  @MessagePattern('notes.internal-controls.mappings.remove')
  removeControlFrameworkMapping(
    @Payload() payload: { controlId: string; mappingId: string },
  ): Promise<InternalControl> {
    return this.strategy.removeControlFrameworkMapping(payload.controlId, payload.mappingId);
  }

  @MessagePattern('notes.internal-controls.evidence.list')
  listControlEvidence(@Payload() payload: { controlId: string }): Promise<RequirementEvidence[]> {
    return this.strategy.listControlEvidence(payload.controlId);
  }

  @MessagePattern('notes.internal-controls.evidence.create')
  createControlEvidence(
    @Payload()
    payload: {
      orgId: string;
      controlId: string;
      data: Omit<RequirementEvidence, 'id' | 'controlId'>;
    },
  ): Promise<RequirementEvidence> {
    return this.strategy.createControlEvidence(payload.orgId, payload.controlId, payload.data);
  }

  @MessagePattern('notes.internal-controls.assessments.list')
  listControlAssessments(
    @Payload() payload: { controlId: string },
  ): Promise<RequirementAssessment[]> {
    return this.strategy.listControlAssessments(payload.controlId);
  }

  @MessagePattern('notes.internal-controls.assessments.create')
  createControlAssessment(
    @Payload()
    payload: {
      orgId: string;
      controlId: string;
      data: Omit<RequirementAssessment, 'id' | 'controlId'>;
    },
  ): Promise<RequirementAssessment> {
    return this.strategy.createControlAssessment(payload.orgId, payload.controlId, payload.data);
  }

  @MessagePattern('notes.internal-controls.findings.list')
  listControlFindings(@Payload() payload: { controlId: string }): Promise<Finding[]> {
    return this.strategy.listControlFindings(payload.controlId);
  }

  @MessagePattern('notes.internal-controls.findings.link-risk')
  linkFindingToRisk(@Payload() payload: { findingId: string; riskId: string }): Promise<Finding> {
    return this.strategy.linkFindingToRisk(payload.findingId, payload.riskId);
  }

  @MessagePattern('notes.internal-controls.findings.link-issue')
  linkFindingToIssue(@Payload() payload: { findingId: string; issueId: string }): Promise<Finding> {
    return this.strategy.linkFindingToIssue(payload.findingId, payload.issueId);
  }

  @MessagePattern('notes.internal-controls.findings.resolve-via-exception')
  resolveFindingViaException(
    @Payload() payload: { findingId: string; exceptionId: string },
  ): Promise<Finding> {
    return this.strategy.resolveFindingViaException(payload.findingId, payload.exceptionId);
  }

  @MessagePattern('notes.internal-controls.activity.list')
  listControlActivity(@Payload() payload: { controlId: string }): Promise<FrameworkActivity[]> {
    return this.strategy.listControlActivity(payload.controlId);
  }

  @MessagePattern('notes.frameworks.evidence.list')
  listFrameworkEvidence(
    @Payload() payload: { frameworkId: string; orgId?: string },
  ): Promise<RequirementEvidence[]> {
    return this.strategy.listFrameworkEvidence(payload.frameworkId, payload.orgId);
  }

  @MessagePattern('notes.frameworks.evidence.create')
  createFrameworkEvidence(
    @Payload() payload: { orgId: string; data: Omit<RequirementEvidence, 'id'> },
  ): Promise<RequirementEvidence> {
    return this.strategy.createFrameworkEvidence(payload.orgId, payload.data);
  }

  @MessagePattern('notes.frameworks.assessments.list')
  listFrameworkAssessments(
    @Payload() payload: { frameworkId: string; orgId?: string },
  ): Promise<RequirementAssessment[]> {
    return this.strategy.listFrameworkAssessments(payload.frameworkId, payload.orgId);
  }

  @MessagePattern('notes.frameworks.assessments.finding')
  createAssessmentFinding(
    @Payload()
    payload: {
      orgId: string;
      assessmentId: string;
      findingData: {
        title: string;
        severity: 'critical' | 'high' | 'medium' | 'low';
        description: string;
      };
    },
  ): Promise<{ findingId: string }> {
    return this.strategy.createAssessmentFinding(
      payload.orgId,
      payload.assessmentId,
      payload.findingData,
    );
  }

  @MessagePattern('notes.frameworks.activities.list')
  listFrameworkActivities(
    @Payload() payload: { frameworkId: string; orgId?: string },
  ): Promise<FrameworkActivity[]> {
    return this.strategy.listFrameworkActivities(payload.frameworkId, payload.orgId);
  }

  @MessagePattern('notes.controls.list')
  listControls(@Payload() payload: { frameworkId: string }): Promise<FrameworkControl[]> {
    return this.strategy.listControlsByFramework(payload.frameworkId);
  }

  @MessagePattern('notes.standards.by-framework')
  listStandardsByFramework(
    @Payload() payload: { orgId: string; frameworkId: string },
  ): Promise<DocumentStandard[]> {
    return this.strategy.listStandardsByFramework(payload.orgId, payload.frameworkId);
  }

  @MessagePattern('notes.org.list')
  listOrganizations(@Payload() payload: { userId: string }): Promise<Organization[]> {
    return this.strategy.listOrganizations(payload.userId);
  }

  @MessagePattern('notes.org.create')
  createOrganization(
    @Payload() payload: { userId: string; data: OrganizationInput },
  ): Promise<Organization> {
    return this.strategy.createOrganization(payload.userId, payload.data);
  }

  @MessagePattern('notes.org.get-by-id')
  getOrganizationById(@Payload() payload: { orgId: string }): Promise<Organization | null> {
    return this.strategy.getOrganizationById(payload.orgId);
  }

  @MessagePattern('notes.org.update')
  updateOrganization(
    @Payload() payload: { orgId: string; data: OrganizationInput },
  ): Promise<Organization> {
    return this.strategy.updateOrganization(payload.orgId, payload.data);
  }

  @MessagePattern('notes.org.delete')
  deleteOrganization(@Payload() payload: { orgId: string }): Promise<void> {
    return this.strategy.deleteOrganization(payload.orgId);
  }

  @MessagePattern('notes.standards.create')
  createStandardsDocument(
    @Payload() payload: { userId: string; orgId: string; frameworkIds: string[] },
  ): Promise<{ id: string }> {
    return this.strategy.createStandardsDocument(
      payload.userId,
      payload.orgId,
      payload.frameworkIds,
    );
  }

  @MessagePattern('notes.standards.save')
  async saveStandardsDocument(
    @Payload() payload: { id: string; standards: DocumentStandard[] },
  ): Promise<{ ok: boolean }> {
    await this.strategy.saveStandardsDocument(payload.id, payload.standards);
    return { ok: true };
  }

  @MessagePattern('notes.standards.fail')
  async failStandardsDocument(
    @Payload() payload: { id: string; reason?: string },
  ): Promise<{ ok: boolean }> {
    await this.strategy.failStandardsDocument(payload.id, payload.reason);
    return { ok: true };
  }

  @MessagePattern('notes.standards.delete')
  async deleteStandardsDocument(@Payload() payload: { id: string }): Promise<{ ok: boolean }> {
    await this.strategy.deleteStandardsDocument(payload.id);
    return { ok: true };
  }

  @MessagePattern('notes.standards.reset')
  async resetStandardsDocument(@Payload() payload: { id: string }): Promise<{ ok: boolean }> {
    await this.strategy.resetStandardsDocument(payload.id);
    return { ok: true };
  }

  @MessagePattern('notes.standards.get')
  getStandardsDocument(@Payload() payload: { id: string }): Promise<StandardsDocument | null> {
    return this.strategy.getStandardsDocument(payload.id);
  }

  @MessagePattern('notes.standards.list')
  listStandardsDocuments(@Payload() payload: { orgId: string }): Promise<StandardsDocument[]> {
    return this.strategy.listStandardsDocuments(payload.orgId);
  }

  @MessagePattern('notes.standards.workflow')
  transitionWorkflow(
    @Payload() payload: { id: string; transition: WorkflowTransition },
  ): Promise<StandardsDocument> {
    return this.strategy.transitionWorkflow(payload.id, payload.transition);
  }

  @MessagePattern('notes.standards.update-standard')
  updateStandard(
    @Payload() payload: { docId: string; code: string; patch: StandardPatch },
  ): Promise<DocumentStandard> {
    return this.strategy.updateStandard(payload.docId, payload.code, payload.patch);
  }

  @MessagePattern('notes.standards.snapshots.list')
  listSnapshots(@Payload() payload: { documentId: string }): Promise<StandardsSnapshot[]> {
    return this.strategy.listSnapshots(payload.documentId);
  }

  @MessagePattern('notes.standards.snapshots.get')
  getSnapshot(@Payload() payload: { snapshotId: string }): Promise<StandardsSnapshot | null> {
    return this.strategy.getSnapshot(payload.snapshotId);
  }

  @MessagePattern('notes.templates.list')
  listReportTemplates(): Promise<ReportTemplate[]> {
    return this.strategy.listReportTemplates();
  }

  @MessagePattern('notes.templates.create')
  createReportTemplate(
    @Payload() payload: { userId: string; input: ReportTemplateInput },
  ): Promise<ReportTemplate> {
    return this.strategy.createReportTemplate(payload.userId, payload.input);
  }

  @MessagePattern('notes.templates.update')
  updateReportTemplate(
    @Payload() payload: { id: string; patch: Partial<ReportTemplateInput> },
  ): Promise<ReportTemplate> {
    return this.strategy.updateReportTemplate(payload.id, payload.patch);
  }

  @MessagePattern('notes.templates.delete')
  deleteReportTemplate(@Payload() payload: { id: string }): Promise<{ ok: boolean }> {
    return this.strategy.deleteReportTemplate(payload.id);
  }

  @MessagePattern('notes.templates.favorite.add')
  addTemplateFavorite(@Payload() payload: { id: string; orgId: string }): Promise<ReportTemplate> {
    return this.strategy.addTemplateFavorite(payload.id, payload.orgId);
  }

  @MessagePattern('notes.templates.favorite.remove')
  removeTemplateFavorite(
    @Payload() payload: { id: string; orgId: string },
  ): Promise<ReportTemplate> {
    return this.strategy.removeTemplateFavorite(payload.id, payload.orgId);
  }

  @MessagePattern('notes.gap.save')
  saveGapAnalysis(
    @Payload()
    payload: {
      orgId: string;
      userId: string;
      docId: string | null;
      result: GapAnalysisResult;
    },
  ): Promise<GapAnalysis> {
    return this.strategy.saveGapAnalysis(
      payload.orgId,
      payload.userId,
      payload.docId,
      payload.result,
    );
  }

  @MessagePattern('notes.gap.list')
  listGapAnalyses(@Payload() payload: { orgId: string }): Promise<GapAnalysis[]> {
    return this.strategy.listGapAnalyses(payload.orgId);
  }

  @MessagePattern('notes.gap.get')
  getGapAnalysis(@Payload() payload: { id: string }): Promise<GapAnalysis | null> {
    return this.strategy.getGapAnalysis(payload.id);
  }

  // ─── Exceptions ──────────────────────────────────────────────────────────

  @MessagePattern('notes.exceptions.list')
  listExceptions(@Payload() payload: { orgId: string }): Promise<Exception[]> {
    return this.strategy.listExceptions(payload.orgId);
  }

  @MessagePattern('notes.exceptions.create')
  createException(
    @Payload() payload: { orgId: string; userId: string; data: ExceptionInput },
  ): Promise<Exception> {
    return this.strategy.createException(payload.orgId, payload.userId, payload.data);
  }

  @MessagePattern('notes.exceptions.get')
  getException(@Payload() payload: { id: string }): Promise<Exception | null> {
    return this.strategy.getException(payload.id);
  }

  @MessagePattern('notes.exceptions.update')
  updateException(@Payload() payload: { id: string; patch: ExceptionPatch }): Promise<Exception> {
    return this.strategy.updateException(payload.id, payload.patch);
  }

  @MessagePattern('notes.exceptions.approve')
  approveException(@Payload() payload: { id: string }): Promise<Exception> {
    return this.strategy.approveException(payload.id);
  }

  @MessagePattern('notes.exceptions.reject')
  rejectException(@Payload() payload: { id: string }): Promise<Exception> {
    return this.strategy.rejectException(payload.id);
  }

  @MessagePattern('notes.exceptions.delete')
  deleteException(@Payload() payload: { id: string }): Promise<void> {
    return this.strategy.deleteException(payload.id);
  }

  // ─── Issues ──────────────────────────────────────────────────────────────

  @MessagePattern('notes.issues.list')
  listIssues(@Payload() payload: { orgId: string }): Promise<Issue[]> {
    return this.strategy.listIssues(payload.orgId);
  }

  @MessagePattern('notes.issues.create')
  createIssue(
    @Payload() payload: { orgId: string; userId: string; data: IssueInput },
  ): Promise<Issue> {
    return this.strategy.createIssue(payload.orgId, payload.userId, payload.data);
  }

  @MessagePattern('notes.issues.get')
  getIssue(@Payload() payload: { id: string }): Promise<Issue | null> {
    return this.strategy.getIssue(payload.id);
  }

  @MessagePattern('notes.issues.update')
  updateIssue(@Payload() payload: { id: string; patch: IssuePatch }): Promise<Issue> {
    return this.strategy.updateIssue(payload.id, payload.patch);
  }

  @MessagePattern('notes.issues.delete')
  deleteIssue(@Payload() payload: { id: string }): Promise<void> {
    return this.strategy.deleteIssue(payload.id);
  }

  // ─── Assets ──────────────────────────────────────────────────────────────

  @MessagePattern('notes.assets.list')
  listAssets(@Payload() payload: { orgId: string }): Promise<Asset[]> {
    return this.strategy.listAssets(payload.orgId);
  }

  @MessagePattern('notes.assets.create')
  createAsset(
    @Payload() payload: { orgId: string; userId: string; data: AssetInput },
  ): Promise<Asset> {
    return this.strategy.createAsset(payload.orgId, payload.userId, payload.data);
  }

  @MessagePattern('notes.assets.get')
  getAsset(@Payload() payload: { id: string }): Promise<Asset | null> {
    return this.strategy.getAsset(payload.id);
  }

  @MessagePattern('notes.assets.update')
  updateAsset(@Payload() payload: { id: string; patch: AssetPatch }): Promise<Asset> {
    return this.strategy.updateAsset(payload.id, payload.patch);
  }

  @MessagePattern('notes.assets.delete')
  deleteAsset(@Payload() payload: { id: string }): Promise<void> {
    return this.strategy.deleteAsset(payload.id);
  }

  // ─── Risks ───────────────────────────────────────────────────────────────

  @MessagePattern('notes.risks.list')
  listRisks(@Payload() payload: { orgId: string }): Promise<Risk[]> {
    return this.strategy.listRisks(payload.orgId);
  }

  @MessagePattern('notes.risks.create')
  createRisk(
    @Payload() payload: { orgId: string; userId: string; data: RiskInput },
  ): Promise<Risk> {
    return this.strategy.createRisk(payload.orgId, payload.userId, payload.data);
  }

  @MessagePattern('notes.risks.get')
  getRisk(@Payload() payload: { id: string }): Promise<Risk | null> {
    return this.strategy.getRisk(payload.id);
  }

  @MessagePattern('notes.risks.update')
  updateRisk(
    @Payload()
    payload: {
      id: string;
      patch: RiskPatch;
      changedBy: string;
      reason?: string;
    },
  ): Promise<Risk> {
    return this.strategy.updateRisk(payload.id, payload.patch, payload.changedBy, payload.reason);
  }

  @MessagePattern('notes.risks.delete')
  deleteRisk(@Payload() payload: { id: string }): Promise<void> {
    return this.strategy.deleteRisk(payload.id);
  }

  @MessagePattern('notes.risks.methodology.get')
  getRiskMethodology(@Payload() payload: { orgId: string }): Promise<RiskMethodology | null> {
    return this.strategy.getRiskMethodology(payload.orgId);
  }

  @MessagePattern('notes.risks.methodology.upsert')
  upsertRiskMethodology(
    @Payload() payload: { orgId: string; data: RiskMethodologyInput },
  ): Promise<RiskMethodology> {
    return this.strategy.upsertRiskMethodology(payload.orgId, payload.data);
  }

  @MessagePattern('notes.risks.taxonomy.list')
  listRiskTaxonomy(@Payload() payload: { orgId: string }): Promise<RiskTaxonomyCategory[]> {
    return this.strategy.listRiskTaxonomy(payload.orgId);
  }

  @MessagePattern('notes.risks.taxonomy.create')
  createRiskTaxonomyCategory(
    @Payload() payload: { orgId: string; data: RiskTaxonomyCategoryInput },
  ): Promise<RiskTaxonomyCategory> {
    return this.strategy.createRiskTaxonomyCategory(payload.orgId, payload.data);
  }

  @MessagePattern('notes.risks.taxonomy.archive')
  archiveRiskTaxonomyCategory(@Payload() payload: { id: string }): Promise<RiskTaxonomyCategory> {
    return this.strategy.archiveRiskTaxonomyCategory(payload.id);
  }

  @MessagePattern('notes.risks.mappings.list')
  listRiskControlMappings(@Payload() payload: { riskId: string }): Promise<RiskControlMapping[]> {
    return this.strategy.listRiskControlMappings(payload.riskId);
  }

  @MessagePattern('notes.risks.mappings.add')
  addRiskControlMapping(
    @Payload() payload: { riskId: string; data: RiskControlMappingInput },
  ): Promise<RiskControlMapping> {
    return this.strategy.addRiskControlMapping(payload.riskId, payload.data);
  }

  @MessagePattern('notes.risks.mappings.remove')
  removeRiskControlMapping(@Payload() payload: { id: string }): Promise<void> {
    return this.strategy.removeRiskControlMapping(payload.id);
  }

  @MessagePattern('notes.risks.acceptance.create')
  createRiskAcceptance(
    @Payload()
    payload: {
      orgId: string;
      riskId: string;
      requestedBy: string;
      data: RiskAcceptanceInput;
    },
  ): Promise<RiskAcceptance> {
    return this.strategy.createRiskAcceptance(
      payload.orgId,
      payload.riskId,
      payload.requestedBy,
      payload.data,
    );
  }

  @MessagePattern('notes.risks.acceptance.active')
  getActiveRiskAcceptance(@Payload() payload: { riskId: string }): Promise<RiskAcceptance | null> {
    return this.strategy.getActiveRiskAcceptance(payload.riskId);
  }

  @MessagePattern('notes.risks.acceptance.review')
  reviewRiskAcceptance(
    @Payload() payload: { id: string; reviewedBy: string; reviewNotes?: string },
  ): Promise<RiskAcceptance> {
    return this.strategy.reviewRiskAcceptance(payload.id, payload.reviewedBy, payload.reviewNotes);
  }

  @MessagePattern('notes.risks.acceptance.approve')
  approveRiskAcceptance(@Payload() payload: { id: string }): Promise<RiskAcceptance> {
    return this.strategy.approveRiskAcceptance(payload.id);
  }

  @MessagePattern('notes.risks.acceptance.reject')
  rejectRiskAcceptance(@Payload() payload: { id: string }): Promise<RiskAcceptance> {
    return this.strategy.rejectRiskAcceptance(payload.id);
  }

  @MessagePattern('notes.risks.snapshots.list')
  listRiskSnapshots(@Payload() payload: { riskId: string }): Promise<RiskSnapshot[]> {
    return this.strategy.listRiskSnapshots(payload.riskId);
  }

  @MessagePattern('notes.risks.evidence.list')
  listRiskEvidence(@Payload() payload: { riskId: string }): Promise<RequirementEvidence[]> {
    return this.strategy.listRiskEvidence(payload.riskId);
  }

  @MessagePattern('notes.risks.evidence.create')
  createRiskEvidence(
    @Payload()
    payload: {
      orgId: string;
      riskId: string;
      data: Omit<RequirementEvidence, 'id' | 'riskId'>;
    },
  ): Promise<RequirementEvidence> {
    return this.strategy.createRiskEvidence(payload.orgId, payload.riskId, payload.data);
  }

  // ─── Risk Assessments ────────────────────────────────────────────────────

  @MessagePattern('notes.assessments.list')
  listAssessments(@Payload() p: { orgId: string }): Promise<RiskAssessment[]> {
    return this.strategy.listAssessments(p.orgId);
  }

  @MessagePattern('notes.assessments.create')
  createAssessment(
    @Payload() p: { orgId: string; userId: string; data: RiskAssessmentInput },
  ): Promise<RiskAssessment> {
    return this.strategy.createAssessment(p.orgId, p.userId, p.data);
  }

  @MessagePattern('notes.assessments.get')
  getAssessment(@Payload() p: { id: string }): Promise<RiskAssessment | null> {
    return this.strategy.getAssessment(p.id);
  }

  @MessagePattern('notes.assessments.update')
  updateAssessment(
    @Payload() p: { id: string; patch: RiskAssessmentPatch },
  ): Promise<RiskAssessment> {
    return this.strategy.updateAssessment(p.id, p.patch);
  }

  @MessagePattern('notes.assessments.delete')
  deleteAssessment(@Payload() p: { id: string }): Promise<void> {
    return this.strategy.deleteAssessment(p.id);
  }

  @MessagePattern('notes.assessments.items.list')
  listAssessmentItems(@Payload() p: { assessmentId: string }): Promise<RiskAssessmentItem[]> {
    return this.strategy.listAssessmentItems(p.assessmentId);
  }

  @MessagePattern('notes.assessments.items.add')
  addAssessmentItem(
    @Payload() p: { assessmentId: string; data: RiskAssessmentItemInput },
  ): Promise<RiskAssessmentItem> {
    return this.strategy.addAssessmentItem(p.assessmentId, p.data);
  }

  @MessagePattern('notes.assessments.items.update')
  updateAssessmentItem(
    @Payload() p: { id: string; patch: RiskAssessmentItemPatch },
  ): Promise<RiskAssessmentItem> {
    return this.strategy.updateAssessmentItem(p.id, p.patch);
  }

  @MessagePattern('notes.assessments.items.delete')
  deleteAssessmentItem(@Payload() p: { id: string }): Promise<void> {
    return this.strategy.deleteAssessmentItem(p.id);
  }

  // ─── Policies ────────────────────────────────────────────────────────────

  @MessagePattern('notes.policies.list')
  listPolicies(@Payload() p: { orgId: string }): Promise<Policy[]> {
    return this.strategy.listPolicies(p.orgId);
  }

  @MessagePattern('notes.policies.create')
  createPolicy(
    @Payload() p: { orgId: string; userId: string; data: PolicyInput },
  ): Promise<Policy> {
    return this.strategy.createPolicy(p.orgId, p.userId, p.data);
  }

  @MessagePattern('notes.policies.get')
  getPolicy(@Payload() p: { id: string }): Promise<Policy | null> {
    return this.strategy.getPolicy(p.id);
  }

  @MessagePattern('notes.policies.update')
  updatePolicy(@Payload() p: { id: string; patch: PolicyPatch }): Promise<Policy> {
    return this.strategy.updatePolicy(p.id, p.patch);
  }

  @MessagePattern('notes.policies.delete')
  deletePolicy(@Payload() p: { id: string }): Promise<void> {
    return this.strategy.deletePolicy(p.id);
  }

  @MessagePattern('notes.policies.clone-template')
  cloneTemplate(
    @Payload() p: { orgId: string; userId: string; templateId: string },
  ): Promise<Policy> {
    return this.strategy.cloneTemplate(p.orgId, p.userId, p.templateId);
  }

  @MessagePattern('notes.policy-templates.list')
  listPolicyTemplates(@Payload() p: { frameworkId?: string }): Promise<PolicyTemplate[]> {
    return this.strategy.listPolicyTemplates(p.frameworkId);
  }

  @MessagePattern('notes.policies.controls.list')
  listPolicyControls(@Payload() p: { policyId: string }): Promise<PolicyControl[]> {
    return this.strategy.listPolicyControls(p.policyId);
  }

  @MessagePattern('notes.policies.controls.add')
  addPolicyControl(
    @Payload() p: { policyId: string; data: PolicyControlInput },
  ): Promise<PolicyControl> {
    return this.strategy.addPolicyControl(p.policyId, p.data);
  }

  @MessagePattern('notes.policies.controls.remove')
  removePolicyControl(@Payload() p: { id: string }): Promise<void> {
    return this.strategy.removePolicyControl(p.id);
  }

  @MessagePattern('notes.policies.for-control')
  listPoliciesForControl(
    @Payload() p: { controlCode: string; frameworkId: string },
  ): Promise<Policy[]> {
    return this.strategy.listPoliciesForControl(p.controlCode, p.frameworkId);
  }
}

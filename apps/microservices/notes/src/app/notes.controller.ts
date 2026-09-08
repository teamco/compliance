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
  Framework,
  FrameworkControl,
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
  listFrameworks(): Promise<Framework[]> {
    return this.strategy.listFrameworks();
  }

  @MessagePattern('notes.frameworks.get')
  getFramework(@Payload() payload: { id: string }): Promise<Framework | null> {
    return this.strategy.getFramework(payload.id);
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
  updateRisk(@Payload() payload: { id: string; patch: RiskPatch }): Promise<Risk> {
    return this.strategy.updateRisk(payload.id, payload.patch);
  }

  @MessagePattern('notes.risks.delete')
  deleteRisk(@Payload() payload: { id: string }): Promise<void> {
    return this.strategy.deleteRisk(payload.id);
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

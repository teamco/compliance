import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { signedSend } from '@icore/shared';
import type {
  AiChatMessage,
  AiUsageLogEntry,
  AiUsageSummaryRpc,
  AiUsageTimeseriesPoint,
  ApiKey,
  ApiKeyWithSecret,
  Asset,
  AssetInput,
  AssetPatch,
  Assessment,
  AssessmentInput,
  AssessmentPatch,
  AssessmentItem,
  AssessmentItemInput,
  AssessmentItemPatch,
  AssessmentItemWithContext,
  AssessmentType,
  AssessmentTypeInput,
  AssessmentItemControlMapping,
  AssessmentItemControlMappingInput,
  AuditLogFilters,
  AuditLogPage,
  ControlFrameworkMappingInput,
  DocumentStandard,
  Exception,
  ExceptionInput,
  ExceptionPatch,
  ExceptionRenewal,
  ExceptionRenewalRequestInput,
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
  IssueSeverity,
  IssueValidation,
  IssueValidationSubmitInput,
  Organization,
  OrganizationInput,
  Policy,
  PolicyInput,
  PolicyPatch,
  PolicyTemplate,
  PolicyControl,
  PolicyControlInput,
  PushSubscriptionPayload,
  ReportTemplate,
  ReportTemplateInput,
  RetentionPrefsPayload,
  Risk,
  RiskInput,
  RiskPatch,
  RiskMethodology,
  RiskMethodologyInput,
  RiskTaxonomyCategory,
  RiskTaxonomyCategoryInput,
  RiskControlMapping,
  RiskControlMappingInput,
  RiskAcceptance,
  RiskAcceptanceInput,
  RiskSnapshot,
  StandardPatch,
  StandardsDocument,
  StandardsSnapshot,
  UserPrefsPayload,
  Webhook,
  WebhookInput,
  WorkflowTransition,
  EvidencePatch,
} from '@icore/shared';
import { NOTES_CLIENT } from './notes-client.tokens';

@Injectable()
export class NotesClientService {
  constructor(@Inject(NOTES_CLIENT) private readonly client: ClientProxy) {}

  listFrameworks(orgId?: string): Promise<Framework[]> {
    return signedSend<Framework[]>(this.client, 'notes.frameworks.list', { orgId });
  }

  getFramework(id: string, orgId?: string): Promise<Framework | null> {
    return signedSend<Framework | null>(this.client, 'notes.frameworks.get', { id, orgId });
  }

  createFramework(orgId: string, input: FrameworkInput): Promise<Framework> {
    return signedSend<Framework>(this.client, 'notes.frameworks.create', { orgId, input });
  }

  updateFramework(id: string, orgId: string, patch: FrameworkPatch): Promise<Framework> {
    return signedSend<Framework>(this.client, 'notes.frameworks.update', { id, orgId, patch });
  }

  deleteFramework(id: string, orgId: string): Promise<void> {
    return signedSend<void>(this.client, 'notes.frameworks.delete', { id, orgId });
  }

  listRequirements(frameworkId: string, orgId?: string): Promise<FrameworkRequirement[]> {
    return signedSend<FrameworkRequirement[]>(this.client, 'notes.frameworks.requirements.list', {
      frameworkId,
      orgId,
    });
  }

  getRequirement(
    frameworkId: string,
    reqId: string,
    orgId?: string,
  ): Promise<FrameworkRequirement | null> {
    return signedSend<FrameworkRequirement | null>(
      this.client,
      'notes.frameworks.requirements.get',
      {
        frameworkId,
        reqId,
        orgId,
      },
    );
  }

  updateRequirement(
    frameworkId: string,
    reqId: string,
    orgId: string,
    patch: FrameworkRequirementPatch,
  ): Promise<FrameworkRequirement> {
    return signedSend<FrameworkRequirement>(this.client, 'notes.frameworks.requirements.update', {
      frameworkId,
      reqId,
      orgId,
      patch,
    });
  }

  listInternalControls(orgId?: string, frameworkId?: string): Promise<InternalControl[]> {
    return signedSend<InternalControl[]>(this.client, 'notes.internal-controls.list', {
      orgId,
      frameworkId,
    });
  }

  createInternalControl(orgId: string, data: InternalControlInput): Promise<InternalControl> {
    return signedSend<InternalControl>(this.client, 'notes.internal-controls.create', {
      orgId,
      data,
    });
  }

  getInternalControl(id: string, orgId?: string): Promise<InternalControl | null> {
    return signedSend<InternalControl | null>(this.client, 'notes.internal-controls.get', {
      id,
      orgId,
    });
  }

  updateInternalControl(id: string, patch: InternalControlPatch): Promise<InternalControl> {
    return signedSend<InternalControl>(this.client, 'notes.internal-controls.update', {
      id,
      patch,
    });
  }

  deleteInternalControl(id: string): Promise<void> {
    return signedSend<void>(this.client, 'notes.internal-controls.delete', { id });
  }

  addControlFrameworkMapping(
    controlId: string,
    data: ControlFrameworkMappingInput,
  ): Promise<InternalControl> {
    return signedSend<InternalControl>(this.client, 'notes.internal-controls.mappings.add', {
      controlId,
      data,
    });
  }

  removeControlFrameworkMapping(controlId: string, mappingId: string): Promise<InternalControl> {
    return signedSend<InternalControl>(this.client, 'notes.internal-controls.mappings.remove', {
      controlId,
      mappingId,
    });
  }

  listControlEvidence(controlId: string): Promise<RequirementEvidence[]> {
    return signedSend<RequirementEvidence[]>(this.client, 'notes.internal-controls.evidence.list', {
      controlId,
    });
  }

  createControlEvidence(
    orgId: string,
    controlId: string,
    data: Omit<RequirementEvidence, 'id' | 'controlId'>,
  ): Promise<RequirementEvidence> {
    return signedSend<RequirementEvidence>(this.client, 'notes.internal-controls.evidence.create', {
      orgId,
      controlId,
      data,
    });
  }

  listControlAssessments(controlId: string): Promise<RequirementAssessment[]> {
    return signedSend<RequirementAssessment[]>(
      this.client,
      'notes.internal-controls.assessments.list',
      { controlId },
    );
  }

  createControlAssessment(
    orgId: string,
    controlId: string,
    data: Omit<RequirementAssessment, 'id' | 'controlId'>,
  ): Promise<RequirementAssessment> {
    return signedSend<RequirementAssessment>(
      this.client,
      'notes.internal-controls.assessments.create',
      { orgId, controlId, data },
    );
  }

  listControlFindings(controlId: string): Promise<Finding[]> {
    return signedSend<Finding[]>(this.client, 'notes.internal-controls.findings.list', {
      controlId,
    });
  }

  linkFindingToRisk(findingId: string, riskId: string): Promise<Finding> {
    return signedSend<Finding>(this.client, 'notes.internal-controls.findings.link-risk', {
      findingId,
      riskId,
    });
  }

  linkFindingToIssue(findingId: string, issueId: string): Promise<Finding> {
    return signedSend<Finding>(this.client, 'notes.internal-controls.findings.link-issue', {
      findingId,
      issueId,
    });
  }

  resolveFindingViaException(findingId: string, exceptionId: string): Promise<Finding> {
    return signedSend<Finding>(
      this.client,
      'notes.internal-controls.findings.resolve-via-exception',
      { findingId, exceptionId },
    );
  }

  getFinding(id: string): Promise<Finding | null> {
    return signedSend<Finding | null>(this.client, 'notes.internal-controls.findings.get', {
      id,
    });
  }

  listFindingsByLink(params: {
    issueId?: string;
    riskId?: string;
    exceptionId?: string;
  }): Promise<Finding[]> {
    return signedSend<Finding[]>(this.client, 'notes.internal-controls.findings.by-link', params);
  }

  createIssueFromFinding(
    orgId: string,
    userId: string,
    findingId: string,
    data: { title: string; description: string; severity: IssueSeverity; ownerId: string },
  ): Promise<Issue> {
    return signedSend<Issue>(this.client, 'notes.internal-controls.findings.create-issue', {
      orgId,
      userId,
      findingId,
      data,
    });
  }

  createRiskFromFinding(
    orgId: string,
    userId: string,
    findingId: string,
    data: {
      title: string;
      description: string;
      taxonomyCategoryId: string;
      ownerId: string;
      inherentLikelihood: number;
      inherentImpact: number;
    },
  ): Promise<Risk> {
    return signedSend<Risk>(this.client, 'notes.internal-controls.findings.create-risk', {
      orgId,
      userId,
      findingId,
      data,
    });
  }

  createExceptionFromFinding(
    orgId: string,
    userId: string,
    findingId: string,
    data: {
      controlCode: string;
      frameworkId: string;
      title: string;
      statement: string;
      justification: string;
      ownerId: string;
      compensatingControls?: string;
    },
  ): Promise<Exception> {
    return signedSend<Exception>(this.client, 'notes.internal-controls.findings.create-exception', {
      orgId,
      userId,
      findingId,
      data,
    });
  }

  listControlActivity(controlId: string): Promise<FrameworkActivity[]> {
    return signedSend<FrameworkActivity[]>(this.client, 'notes.internal-controls.activity.list', {
      controlId,
    });
  }

  listAssetActivity(assetId: string): Promise<FrameworkActivity[]> {
    return signedSend<FrameworkActivity[]>(this.client, 'notes.assets.activity.list', {
      assetId,
    });
  }

  listFrameworkEvidence(frameworkId: string, orgId?: string): Promise<RequirementEvidence[]> {
    return signedSend<RequirementEvidence[]>(this.client, 'notes.frameworks.evidence.list', {
      frameworkId,
      orgId,
    });
  }

  createFrameworkEvidence(
    orgId: string,
    data: Omit<RequirementEvidence, 'id'>,
  ): Promise<RequirementEvidence> {
    return signedSend<RequirementEvidence>(this.client, 'notes.frameworks.evidence.create', {
      orgId,
      data,
    });
  }

  listFrameworkAssessments(frameworkId: string, orgId?: string): Promise<RequirementAssessment[]> {
    return signedSend<RequirementAssessment[]>(this.client, 'notes.frameworks.assessments.list', {
      frameworkId,
      orgId,
    });
  }

  getRequirementAssessment(id: string): Promise<RequirementAssessment | null> {
    return signedSend<RequirementAssessment | null>(
      this.client,
      'notes.frameworks.assessments.get',
      {
        id,
      },
    );
  }

  createAssessmentFinding(
    orgId: string,
    assessmentId: string,
    findingData: {
      title: string;
      severity: 'critical' | 'high' | 'medium' | 'low';
      description: string;
    },
  ): Promise<{ findingId: string }> {
    return signedSend<{ findingId: string }>(this.client, 'notes.frameworks.assessments.finding', {
      orgId,
      assessmentId,
      findingData,
    });
  }

  listFrameworkActivities(frameworkId: string, orgId?: string): Promise<FrameworkActivity[]> {
    return signedSend<FrameworkActivity[]>(this.client, 'notes.frameworks.activities.list', {
      frameworkId,
      orgId,
    });
  }

  listControlsByFramework(frameworkId: string): Promise<FrameworkControl[]> {
    return signedSend<FrameworkControl[]>(this.client, 'notes.controls.list', { frameworkId });
  }

  listStandardsByFramework(orgId: string, frameworkId: string): Promise<DocumentStandard[]> {
    return signedSend<DocumentStandard[]>(this.client, 'notes.standards.by-framework', {
      orgId,
      frameworkId,
    });
  }

  listOrganizations(userId: string): Promise<Organization[]> {
    return signedSend<Organization[]>(this.client, 'notes.org.list', { userId });
  }

  createOrganization(userId: string, data: OrganizationInput): Promise<Organization> {
    return signedSend<Organization>(this.client, 'notes.org.create', { userId, data });
  }

  getOrganizationById(orgId: string): Promise<Organization | null> {
    return signedSend<Organization | null>(this.client, 'notes.org.get-by-id', { orgId });
  }

  updateOrganization(orgId: string, data: OrganizationInput): Promise<Organization> {
    return signedSend<Organization>(this.client, 'notes.org.update', { orgId, data });
  }

  deleteOrganization(orgId: string): Promise<void> {
    return signedSend<void>(this.client, 'notes.org.delete', { orgId });
  }

  createStandardsDocument(
    userId: string,
    orgId: string,
    frameworkIds: string[],
  ): Promise<{ id: string }> {
    return signedSend<{ id: string }>(this.client, 'notes.standards.create', {
      userId,
      orgId,
      frameworkIds,
    });
  }

  saveStandardsDocument(id: string, standards: DocumentStandard[]): Promise<void> {
    return signedSend<{ ok: boolean }>(this.client, 'notes.standards.save', { id, standards }).then(
      () => undefined,
    );
  }

  failStandardsDocument(id: string, reason?: string): Promise<void> {
    return signedSend<{ ok: boolean }>(this.client, 'notes.standards.fail', { id, reason }).then(
      () => undefined,
    );
  }

  deleteStandardsDocument(id: string): Promise<void> {
    return signedSend<{ ok: boolean }>(this.client, 'notes.standards.delete', { id }).then(
      () => undefined,
    );
  }

  resetStandardsDocument(id: string): Promise<void> {
    return signedSend<{ ok: boolean }>(this.client, 'notes.standards.reset', { id }).then(
      () => undefined,
    );
  }

  getStandardsDocument(id: string): Promise<StandardsDocument | null> {
    return signedSend<StandardsDocument | null>(this.client, 'notes.standards.get', { id });
  }

  listStandardsDocuments(orgId: string): Promise<StandardsDocument[]> {
    return signedSend<StandardsDocument[]>(this.client, 'notes.standards.list', { orgId });
  }

  transitionWorkflow(id: string, transition: WorkflowTransition): Promise<StandardsDocument> {
    return signedSend<StandardsDocument>(this.client, 'notes.standards.workflow', {
      id,
      transition,
    });
  }

  updateStandard(docId: string, code: string, patch: StandardPatch): Promise<DocumentStandard> {
    return signedSend<DocumentStandard>(this.client, 'notes.standards.update-standard', {
      docId,
      code,
      patch,
    });
  }

  listSnapshots(documentId: string): Promise<StandardsSnapshot[]> {
    return signedSend<StandardsSnapshot[]>(this.client, 'notes.standards.snapshots.list', {
      documentId,
    });
  }

  getSnapshot(snapshotId: string): Promise<StandardsSnapshot | null> {
    return signedSend<StandardsSnapshot | null>(this.client, 'notes.standards.snapshots.get', {
      snapshotId,
    });
  }

  getUserPrefs(userId: string): Promise<UserPrefsPayload> {
    return signedSend<UserPrefsPayload>(this.client, 'settings.prefs.get', { userId });
  }

  updateUserPrefs(userId: string, patch: Partial<UserPrefsPayload>): Promise<UserPrefsPayload> {
    return signedSend<UserPrefsPayload>(this.client, 'settings.prefs.update', { userId, patch });
  }

  savePushSubscription(userId: string, sub: PushSubscriptionPayload): Promise<{ ok: boolean }> {
    return signedSend<{ ok: boolean }>(this.client, 'settings.push.save', { userId, sub });
  }

  removePushSubscription(userId: string, endpoint: string): Promise<{ ok: boolean }> {
    return signedSend<{ ok: boolean }>(this.client, 'settings.push.remove', { userId, endpoint });
  }

  getChatHistory(userId: string, limit?: number): Promise<AiChatMessage[]> {
    return signedSend<AiChatMessage[]>(this.client, 'chat.history.get', { userId, limit });
  }

  saveChatMessage(
    userId: string,
    role: 'user' | 'assistant',
    content: string,
  ): Promise<AiChatMessage> {
    return signedSend<AiChatMessage>(this.client, 'chat.history.save', { userId, role, content });
  }

  clearChatHistory(userId: string): Promise<{ ok: boolean }> {
    return signedSend<{ ok: boolean }>(this.client, 'chat.history.clear', { userId });
  }

  // ─── Admin ─────────────────────────────────────────────────────────────────

  logAuditEvent(
    userId: string,
    action: string,
    resourceType?: string,
    resourceId?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    return signedSend<void>(this.client, 'admin.audit.log', {
      userId,
      action,
      resourceType,
      resourceId,
      metadata,
    });
  }

  listAuditLogs(userId: string, filters?: AuditLogFilters): Promise<AuditLogPage> {
    return signedSend<AuditLogPage>(this.client, 'admin.audit.list', { userId, filters });
  }

  createApiKey(userId: string, name: string, expiresAt?: string): Promise<ApiKeyWithSecret> {
    return signedSend<ApiKeyWithSecret>(this.client, 'admin.apikeys.create', {
      userId,
      name,
      expiresAt,
    });
  }

  listApiKeys(userId: string): Promise<ApiKey[]> {
    return signedSend<ApiKey[]>(this.client, 'admin.apikeys.list', { userId });
  }

  revokeApiKey(id: string, userId: string): Promise<{ ok: boolean }> {
    return signedSend<{ ok: boolean }>(this.client, 'admin.apikeys.revoke', { id, userId });
  }

  createWebhook(userId: string, input: WebhookInput): Promise<Webhook> {
    return signedSend<Webhook>(this.client, 'admin.webhooks.create', { userId, input });
  }

  listWebhooks(userId: string): Promise<Webhook[]> {
    return signedSend<Webhook[]>(this.client, 'admin.webhooks.list', { userId });
  }

  updateWebhook(
    id: string,
    userId: string,
    patch: Partial<WebhookInput> & { active?: boolean },
  ): Promise<Webhook> {
    return signedSend<Webhook>(this.client, 'admin.webhooks.update', { id, userId, patch });
  }

  deleteWebhook(id: string, userId: string): Promise<{ ok: boolean }> {
    return signedSend<{ ok: boolean }>(this.client, 'admin.webhooks.delete', { id, userId });
  }

  getRetentionPrefs(userId: string): Promise<RetentionPrefsPayload> {
    return signedSend<RetentionPrefsPayload>(this.client, 'admin.retention.get', { userId });
  }

  updateRetentionPrefs(
    userId: string,
    patch: Partial<RetentionPrefsPayload>,
  ): Promise<RetentionPrefsPayload> {
    return signedSend<RetentionPrefsPayload>(this.client, 'admin.retention.update', {
      userId,
      patch,
    });
  }

  // ─── Report templates ────────────────────────────────────────────────────

  listReportTemplates(): Promise<ReportTemplate[]> {
    return signedSend<ReportTemplate[]>(this.client, 'notes.templates.list', {});
  }

  createReportTemplate(userId: string, input: ReportTemplateInput): Promise<ReportTemplate> {
    return signedSend<ReportTemplate>(this.client, 'notes.templates.create', { userId, input });
  }

  updateReportTemplate(id: string, patch: Partial<ReportTemplateInput>): Promise<ReportTemplate> {
    return signedSend<ReportTemplate>(this.client, 'notes.templates.update', { id, patch });
  }

  deleteReportTemplate(id: string): Promise<{ ok: boolean }> {
    return signedSend<{ ok: boolean }>(this.client, 'notes.templates.delete', { id });
  }

  addTemplateFavorite(id: string, orgId: string): Promise<ReportTemplate> {
    return signedSend<ReportTemplate>(this.client, 'notes.templates.favorite.add', { id, orgId });
  }

  removeTemplateFavorite(id: string, orgId: string): Promise<ReportTemplate> {
    return signedSend<ReportTemplate>(this.client, 'notes.templates.favorite.remove', {
      id,
      orgId,
    });
  }

  saveGapAnalysis(
    orgId: string,
    userId: string,
    docId: string | null,
    result: GapAnalysisResult,
  ): Promise<GapAnalysis> {
    return signedSend<GapAnalysis>(this.client, 'notes.gap.save', { orgId, userId, docId, result });
  }

  listGapAnalyses(orgId: string): Promise<GapAnalysis[]> {
    return signedSend<GapAnalysis[]>(this.client, 'notes.gap.list', { orgId });
  }

  getGapAnalysis(id: string): Promise<GapAnalysis | null> {
    return signedSend<GapAnalysis | null>(this.client, 'notes.gap.get', { id });
  }

  // ─── AI usage ─────────────────────────────────────────────────────────────

  logAiUsage(entry: AiUsageLogEntry): void {
    void signedSend(this.client, 'admin.ai-usage.log', entry);
  }

  getAiUsageSummary(since: string, userId?: string): Promise<AiUsageSummaryRpc> {
    return signedSend<AiUsageSummaryRpc>(this.client, 'admin.ai-usage.summary', { since, userId });
  }

  getAiUsageTimeseries(since: string, userId?: string): Promise<AiUsageTimeseriesPoint[]> {
    return signedSend<AiUsageTimeseriesPoint[]>(this.client, 'admin.ai-usage.timeseries', {
      since,
      userId,
    });
  }

  // ─── Exceptions ──────────────────────────────────────────────────────────

  listExceptions(orgId: string): Promise<Exception[]> {
    return signedSend<Exception[]>(this.client, 'notes.exceptions.list', { orgId });
  }

  createException(orgId: string, userId: string, data: ExceptionInput): Promise<Exception> {
    return signedSend<Exception>(this.client, 'notes.exceptions.create', { orgId, userId, data });
  }

  getException(id: string): Promise<Exception | null> {
    return signedSend<Exception | null>(this.client, 'notes.exceptions.get', { id });
  }

  updateException(id: string, patch: ExceptionPatch): Promise<Exception> {
    return signedSend<Exception>(this.client, 'notes.exceptions.update', { id, patch });
  }

  approveException(id: string, approverId: string): Promise<Exception> {
    return signedSend<Exception>(this.client, 'notes.exceptions.approve', { id, approverId });
  }

  rejectException(id: string, approverId: string): Promise<Exception> {
    return signedSend<Exception>(this.client, 'notes.exceptions.reject', { id, approverId });
  }

  deleteException(id: string): Promise<void> {
    return signedSend<void>(this.client, 'notes.exceptions.delete', { id });
  }

  requestExceptionRenewal(
    exceptionId: string,
    requestedBy: string,
    data: ExceptionRenewalRequestInput,
  ): Promise<ExceptionRenewal> {
    return signedSend<ExceptionRenewal>(this.client, 'notes.exceptions.renewals.request', {
      exceptionId,
      requestedBy,
      data,
    });
  }

  reviewExceptionRenewal(
    id: string,
    reviewerId: string,
    decision: 'approved' | 'rejected',
    reviewNotes?: string,
  ): Promise<ExceptionRenewal> {
    return signedSend<ExceptionRenewal>(this.client, 'notes.exceptions.renewals.review', {
      id,
      reviewerId,
      decision,
      reviewNotes,
    });
  }

  getExceptionRenewal(id: string): Promise<ExceptionRenewal | null> {
    return signedSend<ExceptionRenewal | null>(this.client, 'notes.exceptions.renewals.get', {
      id,
    });
  }

  listExceptionRenewals(exceptionId: string): Promise<ExceptionRenewal[]> {
    return signedSend<ExceptionRenewal[]>(this.client, 'notes.exceptions.renewals.list', {
      exceptionId,
    });
  }

  listPendingExceptionRenewals(orgId: string): Promise<ExceptionRenewal[]> {
    return signedSend<ExceptionRenewal[]>(this.client, 'notes.exceptions.renewals.pending', {
      orgId,
    });
  }

  // ─── Issues ──────────────────────────────────────────────────────────────

  listIssues(orgId: string): Promise<Issue[]> {
    return signedSend<Issue[]>(this.client, 'notes.issues.list', { orgId });
  }

  createIssue(orgId: string, userId: string, data: IssueInput): Promise<Issue> {
    return signedSend<Issue>(this.client, 'notes.issues.create', { orgId, userId, data });
  }

  getIssue(id: string): Promise<Issue | null> {
    return signedSend<Issue | null>(this.client, 'notes.issues.get', { id });
  }

  updateIssue(id: string, patch: IssuePatch): Promise<Issue> {
    return signedSend<Issue>(this.client, 'notes.issues.update', { id, patch });
  }

  deleteIssue(id: string): Promise<void> {
    return signedSend<void>(this.client, 'notes.issues.delete', { id });
  }

  submitIssueForValidation(
    id: string,
    ownerId: string,
    data: IssueValidationSubmitInput,
  ): Promise<Issue> {
    return signedSend<Issue>(this.client, 'notes.issues.submit-for-validation', {
      id,
      ownerId,
      data,
    });
  }

  reviewIssueValidation(
    id: string,
    validatorId: string,
    decision: 'approved' | 'rejected',
    reviewNotes?: string,
  ): Promise<IssueValidation> {
    return signedSend<IssueValidation>(this.client, 'notes.issues.review-validation', {
      id,
      validatorId,
      decision,
      reviewNotes,
    });
  }

  getIssueValidation(id: string): Promise<IssueValidation | null> {
    return signedSend<IssueValidation | null>(this.client, 'notes.issues.validations.get', {
      id,
    });
  }

  listIssueValidations(issueId: string): Promise<IssueValidation[]> {
    return signedSend<IssueValidation[]>(this.client, 'notes.issues.validations.list', {
      issueId,
    });
  }

  listPendingIssueValidations(orgId: string): Promise<IssueValidation[]> {
    return signedSend<IssueValidation[]>(this.client, 'notes.issues.validations.pending', {
      orgId,
    });
  }

  listAssets(orgId: string): Promise<Asset[]> {
    return signedSend<Asset[]>(this.client, 'notes.assets.list', { orgId });
  }
  createAsset(orgId: string, userId: string, data: AssetInput): Promise<Asset> {
    return signedSend<Asset>(this.client, 'notes.assets.create', { orgId, userId, data });
  }
  getAsset(id: string): Promise<Asset | null> {
    return signedSend<Asset | null>(this.client, 'notes.assets.get', { id });
  }
  updateAsset(id: string, patch: AssetPatch): Promise<Asset> {
    return signedSend<Asset>(this.client, 'notes.assets.update', { id, patch });
  }
  deleteAsset(id: string): Promise<void> {
    return signedSend<void>(this.client, 'notes.assets.delete', { id });
  }

  listAssetEvidence(assetId: string): Promise<RequirementEvidence[]> {
    return signedSend<RequirementEvidence[]>(this.client, 'notes.assets.evidence.list', {
      assetId,
    });
  }

  createAssetEvidence(
    orgId: string,
    assetId: string,
    data: Omit<RequirementEvidence, 'id' | 'assetId'>,
  ): Promise<RequirementEvidence> {
    return signedSend<RequirementEvidence>(this.client, 'notes.assets.evidence.create', {
      orgId,
      assetId,
      data,
    });
  }

  getEvidence(id: string): Promise<RequirementEvidence | null> {
    return signedSend<RequirementEvidence | null>(this.client, 'notes.evidence.get', { id });
  }

  updateEvidence(id: string, patch: EvidencePatch): Promise<RequirementEvidence> {
    return signedSend<RequirementEvidence>(this.client, 'notes.evidence.update', { id, patch });
  }

  deleteEvidence(id: string): Promise<void> {
    return signedSend<void>(this.client, 'notes.evidence.delete', { id });
  }

  reviewEvidence(
    id: string,
    reviewerId: string,
    decision: 'verified' | 'rejected',
    reviewNotes?: string,
  ): Promise<RequirementEvidence> {
    return signedSend<RequirementEvidence>(this.client, 'notes.evidence.review', {
      id,
      reviewerId,
      decision,
      reviewNotes,
    });
  }

  listRisks(orgId: string): Promise<Risk[]> {
    return signedSend<Risk[]>(this.client, 'notes.risks.list', { orgId });
  }
  createRisk(orgId: string, userId: string, data: RiskInput): Promise<Risk> {
    return signedSend<Risk>(this.client, 'notes.risks.create', { orgId, userId, data });
  }
  getRisk(id: string): Promise<Risk | null> {
    return signedSend<Risk | null>(this.client, 'notes.risks.get', { id });
  }
  updateRisk(id: string, patch: RiskPatch, changedBy: string, reason?: string): Promise<Risk> {
    return signedSend<Risk>(this.client, 'notes.risks.update', { id, patch, changedBy, reason });
  }
  deleteRisk(id: string): Promise<void> {
    return signedSend<void>(this.client, 'notes.risks.delete', { id });
  }

  getRiskMethodology(orgId: string): Promise<RiskMethodology | null> {
    return signedSend<RiskMethodology | null>(this.client, 'notes.risks.methodology.get', {
      orgId,
    });
  }

  upsertRiskMethodology(orgId: string, data: RiskMethodologyInput): Promise<RiskMethodology> {
    return signedSend<RiskMethodology>(this.client, 'notes.risks.methodology.upsert', {
      orgId,
      data,
    });
  }

  listRiskTaxonomy(orgId: string): Promise<RiskTaxonomyCategory[]> {
    return signedSend<RiskTaxonomyCategory[]>(this.client, 'notes.risks.taxonomy.list', { orgId });
  }

  getRiskTaxonomyCategory(id: string): Promise<RiskTaxonomyCategory | null> {
    return signedSend<RiskTaxonomyCategory | null>(this.client, 'notes.risks.taxonomy.get', {
      id,
    });
  }

  createRiskTaxonomyCategory(
    orgId: string,
    data: RiskTaxonomyCategoryInput,
  ): Promise<RiskTaxonomyCategory> {
    return signedSend<RiskTaxonomyCategory>(this.client, 'notes.risks.taxonomy.create', {
      orgId,
      data,
    });
  }

  archiveRiskTaxonomyCategory(id: string): Promise<RiskTaxonomyCategory> {
    return signedSend<RiskTaxonomyCategory>(this.client, 'notes.risks.taxonomy.archive', { id });
  }

  listRiskControlMappings(riskId: string): Promise<RiskControlMapping[]> {
    return signedSend<RiskControlMapping[]>(this.client, 'notes.risks.mappings.list', { riskId });
  }

  addRiskControlMapping(
    riskId: string,
    data: RiskControlMappingInput,
  ): Promise<RiskControlMapping> {
    return signedSend<RiskControlMapping>(this.client, 'notes.risks.mappings.add', {
      riskId,
      data,
    });
  }

  removeRiskControlMapping(id: string): Promise<void> {
    return signedSend<void>(this.client, 'notes.risks.mappings.remove', { id });
  }

  createRiskAcceptance(
    orgId: string,
    riskId: string,
    requestedBy: string,
    data: RiskAcceptanceInput,
  ): Promise<RiskAcceptance> {
    return signedSend<RiskAcceptance>(this.client, 'notes.risks.acceptance.create', {
      orgId,
      riskId,
      requestedBy,
      data,
    });
  }

  getActiveRiskAcceptance(riskId: string): Promise<RiskAcceptance | null> {
    return signedSend<RiskAcceptance | null>(this.client, 'notes.risks.acceptance.active', {
      riskId,
    });
  }

  getRiskAcceptance(id: string): Promise<RiskAcceptance | null> {
    return signedSend<RiskAcceptance | null>(this.client, 'notes.risks.acceptance.get', { id });
  }

  reviewRiskAcceptance(
    id: string,
    reviewedBy: string,
    reviewNotes?: string,
  ): Promise<RiskAcceptance> {
    return signedSend<RiskAcceptance>(this.client, 'notes.risks.acceptance.review', {
      id,
      reviewedBy,
      reviewNotes,
    });
  }

  approveRiskAcceptance(id: string, userId: string): Promise<RiskAcceptance> {
    return signedSend<RiskAcceptance>(this.client, 'notes.risks.acceptance.approve', {
      id,
      userId,
    });
  }

  rejectRiskAcceptance(id: string, userId: string): Promise<RiskAcceptance> {
    return signedSend<RiskAcceptance>(this.client, 'notes.risks.acceptance.reject', {
      id,
      userId,
    });
  }

  listRiskSnapshots(riskId: string): Promise<RiskSnapshot[]> {
    return signedSend<RiskSnapshot[]>(this.client, 'notes.risks.snapshots.list', { riskId });
  }

  listRiskEvidence(riskId: string): Promise<RequirementEvidence[]> {
    return signedSend<RequirementEvidence[]>(this.client, 'notes.risks.evidence.list', { riskId });
  }

  createRiskEvidence(
    orgId: string,
    riskId: string,
    data: Omit<RequirementEvidence, 'id' | 'riskId'>,
  ): Promise<RequirementEvidence> {
    return signedSend<RequirementEvidence>(this.client, 'notes.risks.evidence.create', {
      orgId,
      riskId,
      data,
    });
  }

  listAssessmentItemEvidence(itemId: string): Promise<RequirementEvidence[]> {
    return signedSend<RequirementEvidence[]>(this.client, 'notes.assessments.items.evidence.list', {
      itemId,
    });
  }

  createAssessmentItemEvidence(
    orgId: string,
    itemId: string,
    data: Omit<RequirementEvidence, 'id' | 'assessmentItemId'>,
  ): Promise<RequirementEvidence> {
    return signedSend<RequirementEvidence>(this.client, 'notes.assessments.items.evidence.create', {
      orgId,
      itemId,
      data,
    });
  }

  // ─── Risk Assessments ────────────────────────────────────────────────────

  listAssessments(orgId: string): Promise<Assessment[]> {
    return signedSend<Assessment[]>(this.client, 'notes.assessments.list', { orgId });
  }

  createAssessment(orgId: string, userId: string, data: AssessmentInput): Promise<Assessment> {
    return signedSend<Assessment>(this.client, 'notes.assessments.create', {
      orgId,
      userId,
      data,
    });
  }

  getAssessment(id: string): Promise<Assessment | null> {
    return signedSend<Assessment | null>(this.client, 'notes.assessments.get', { id });
  }

  updateAssessment(id: string, patch: AssessmentPatch): Promise<Assessment> {
    return signedSend<Assessment>(this.client, 'notes.assessments.update', { id, patch });
  }

  deleteAssessment(id: string, userId: string): Promise<void> {
    return signedSend<void>(this.client, 'notes.assessments.delete', { id, userId });
  }

  listAssessmentItems(assessmentId: string): Promise<AssessmentItem[]> {
    return signedSend<AssessmentItem[]>(this.client, 'notes.assessments.items.list', {
      assessmentId,
    });
  }

  getAssessmentItem(id: string): Promise<AssessmentItem | null> {
    return signedSend<AssessmentItem | null>(this.client, 'notes.assessments.items.get', { id });
  }

  createAssessmentItem(assessmentId: string, data: AssessmentItemInput): Promise<AssessmentItem> {
    return signedSend<AssessmentItem>(this.client, 'notes.assessments.items.add', {
      assessmentId,
      data,
    });
  }

  updateAssessmentItem(id: string, patch: AssessmentItemPatch): Promise<AssessmentItem> {
    return signedSend<AssessmentItem>(this.client, 'notes.assessments.items.update', {
      id,
      patch,
    });
  }

  deleteAssessmentItem(id: string): Promise<void> {
    return signedSend<void>(this.client, 'notes.assessments.items.delete', { id });
  }

  listAssessmentTypes(orgId: string): Promise<AssessmentType[]> {
    return signedSend<AssessmentType[]>(this.client, 'notes.assessment-types.list', { orgId });
  }

  getAssessmentType(id: string): Promise<AssessmentType | null> {
    return signedSend<AssessmentType | null>(this.client, 'notes.assessment-types.get', { id });
  }

  createAssessmentType(orgId: string, data: AssessmentTypeInput): Promise<AssessmentType> {
    return signedSend<AssessmentType>(this.client, 'notes.assessment-types.create', {
      orgId,
      data,
    });
  }

  archiveAssessmentType(id: string): Promise<AssessmentType> {
    return signedSend<AssessmentType>(this.client, 'notes.assessment-types.archive', { id });
  }

  startAssessment(id: string, userId: string): Promise<Assessment> {
    return signedSend<Assessment>(this.client, 'notes.assessments.start', { id, userId });
  }

  submitForReview(id: string, userId: string): Promise<Assessment> {
    return signedSend<Assessment>(this.client, 'notes.assessments.submit-for-review', {
      id,
      userId,
    });
  }

  approveAssessment(id: string, userId: string): Promise<Assessment> {
    return signedSend<Assessment>(this.client, 'notes.assessments.approve', { id, userId });
  }

  requestChanges(id: string, userId: string, note: string): Promise<Assessment> {
    return signedSend<Assessment>(this.client, 'notes.assessments.request-changes', {
      id,
      userId,
      note,
    });
  }

  completeAssessment(id: string, userId: string): Promise<Assessment> {
    return signedSend<Assessment>(this.client, 'notes.assessments.complete', { id, userId });
  }

  archiveAssessment(id: string, userId: string): Promise<Assessment> {
    return signedSend<Assessment>(this.client, 'notes.assessments.archive', { id, userId });
  }

  listAssessmentItemControlMappings(itemId: string): Promise<AssessmentItemControlMapping[]> {
    return signedSend<AssessmentItemControlMapping[]>(
      this.client,
      'notes.assessments.items.mappings.list',
      { itemId },
    );
  }

  getAssessmentItemControlMapping(id: string): Promise<AssessmentItemControlMapping | null> {
    return signedSend<AssessmentItemControlMapping | null>(
      this.client,
      'notes.assessments.items.mappings.get',
      { id },
    );
  }

  addAssessmentItemControlMapping(
    itemId: string,
    data: AssessmentItemControlMappingInput,
  ): Promise<AssessmentItemControlMapping> {
    return signedSend<AssessmentItemControlMapping>(
      this.client,
      'notes.assessments.items.mappings.add',
      { itemId, data },
    );
  }

  removeAssessmentItemControlMapping(id: string): Promise<void> {
    return signedSend<void>(this.client, 'notes.assessments.items.mappings.remove', { id });
  }

  createRiskFromAssessmentItem(
    orgId: string,
    userId: string,
    itemId: string,
    data: { taxonomyCategoryId: string },
  ): Promise<Risk> {
    return signedSend<Risk>(this.client, 'notes.assessments.items.risk.create', {
      orgId,
      userId,
      itemId,
      data,
    });
  }

  linkAssessmentItemToRisk(itemId: string, riskId: string): Promise<AssessmentItem> {
    return signedSend<AssessmentItem>(this.client, 'notes.assessments.items.risk.link', {
      itemId,
      riskId,
    });
  }

  unlinkAssessmentItemFromRisk(itemId: string): Promise<AssessmentItem> {
    return signedSend<AssessmentItem>(this.client, 'notes.assessments.items.risk.unlink', {
      itemId,
    });
  }

  listAssessmentItemsForRisk(riskId: string): Promise<AssessmentItemWithContext[]> {
    return signedSend<AssessmentItemWithContext[]>(
      this.client,
      'notes.risks.assessment-items.list',
      { riskId },
    );
  }

  // ─── Policies ────────────────────────────────────────────────────────────

  listPolicies(orgId: string): Promise<Policy[]> {
    return signedSend<Policy[]>(this.client, 'notes.policies.list', { orgId });
  }

  createPolicy(orgId: string, userId: string, data: PolicyInput): Promise<Policy> {
    return signedSend<Policy>(this.client, 'notes.policies.create', { orgId, userId, data });
  }

  getPolicy(id: string): Promise<Policy | null> {
    return signedSend<Policy | null>(this.client, 'notes.policies.get', { id });
  }

  updatePolicy(id: string, patch: PolicyPatch): Promise<Policy> {
    return signedSend<Policy>(this.client, 'notes.policies.update', { id, patch });
  }

  deletePolicy(id: string): Promise<void> {
    return signedSend<void>(this.client, 'notes.policies.delete', { id });
  }

  cloneTemplate(orgId: string, userId: string, templateId: string): Promise<Policy> {
    return signedSend<Policy>(this.client, 'notes.policies.clone-template', {
      orgId,
      userId,
      templateId,
    });
  }

  listPolicyTemplates(frameworkId?: string): Promise<PolicyTemplate[]> {
    return signedSend<PolicyTemplate[]>(this.client, 'notes.policy-templates.list', {
      frameworkId,
    });
  }

  listPolicyControls(policyId: string): Promise<PolicyControl[]> {
    return signedSend<PolicyControl[]>(this.client, 'notes.policies.controls.list', { policyId });
  }

  addPolicyControl(policyId: string, data: PolicyControlInput): Promise<PolicyControl> {
    return signedSend<PolicyControl>(this.client, 'notes.policies.controls.add', {
      policyId,
      data,
    });
  }

  removePolicyControl(id: string): Promise<void> {
    return signedSend<void>(this.client, 'notes.policies.controls.remove', { id });
  }

  listPoliciesForControl(controlCode: string, frameworkId: string): Promise<Policy[]> {
    return signedSend<Policy[]>(this.client, 'notes.policies.for-control', {
      controlCode,
      frameworkId,
    });
  }
}

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
  AuditLogFilters,
  AuditLogPage,
  DocumentStandard,
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
  RiskAssessment,
  RiskAssessmentInput,
  RiskAssessmentPatch,
  RiskAssessmentItem,
  RiskAssessmentItemInput,
  RiskAssessmentItemPatch,
  StandardPatch,
  StandardsDocument,
  StandardsSnapshot,
  UserPrefsPayload,
  Webhook,
  WebhookInput,
  WorkflowTransition,
} from '@icore/shared';
import { NOTES_CLIENT } from './notes-client.tokens';

@Injectable()
export class NotesClientService {
  constructor(@Inject(NOTES_CLIENT) private readonly client: ClientProxy) {}

  listFrameworks(): Promise<Framework[]> {
    return signedSend<Framework[]>(this.client, 'notes.frameworks.list', {});
  }

  getFramework(id: string): Promise<Framework | null> {
    return signedSend<Framework | null>(this.client, 'notes.frameworks.get', { id });
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

  approveException(id: string): Promise<Exception> {
    return signedSend<Exception>(this.client, 'notes.exceptions.approve', { id });
  }

  rejectException(id: string): Promise<Exception> {
    return signedSend<Exception>(this.client, 'notes.exceptions.reject', { id });
  }

  deleteException(id: string): Promise<void> {
    return signedSend<void>(this.client, 'notes.exceptions.delete', { id });
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

  listRisks(orgId: string): Promise<Risk[]> {
    return signedSend<Risk[]>(this.client, 'notes.risks.list', { orgId });
  }
  createRisk(orgId: string, userId: string, data: RiskInput): Promise<Risk> {
    return signedSend<Risk>(this.client, 'notes.risks.create', { orgId, userId, data });
  }
  getRisk(id: string): Promise<Risk | null> {
    return signedSend<Risk | null>(this.client, 'notes.risks.get', { id });
  }
  updateRisk(id: string, patch: RiskPatch): Promise<Risk> {
    return signedSend<Risk>(this.client, 'notes.risks.update', { id, patch });
  }
  deleteRisk(id: string): Promise<void> {
    return signedSend<void>(this.client, 'notes.risks.delete', { id });
  }

  // ─── Risk Assessments ────────────────────────────────────────────────────

  listAssessments(orgId: string): Promise<RiskAssessment[]> {
    return signedSend<RiskAssessment[]>(this.client, 'notes.assessments.list', { orgId });
  }

  createAssessment(
    orgId: string,
    userId: string,
    data: RiskAssessmentInput,
  ): Promise<RiskAssessment> {
    return signedSend<RiskAssessment>(this.client, 'notes.assessments.create', {
      orgId,
      userId,
      data,
    });
  }

  getAssessment(id: string): Promise<RiskAssessment | null> {
    return signedSend<RiskAssessment | null>(this.client, 'notes.assessments.get', { id });
  }

  updateAssessment(id: string, patch: RiskAssessmentPatch): Promise<RiskAssessment> {
    return signedSend<RiskAssessment>(this.client, 'notes.assessments.update', { id, patch });
  }

  deleteAssessment(id: string): Promise<void> {
    return signedSend<void>(this.client, 'notes.assessments.delete', { id });
  }

  listAssessmentItems(assessmentId: string): Promise<RiskAssessmentItem[]> {
    return signedSend<RiskAssessmentItem[]>(this.client, 'notes.assessments.items.list', {
      assessmentId,
    });
  }

  addAssessmentItem(
    assessmentId: string,
    data: RiskAssessmentItemInput,
  ): Promise<RiskAssessmentItem> {
    return signedSend<RiskAssessmentItem>(this.client, 'notes.assessments.items.add', {
      assessmentId,
      data,
    });
  }

  updateAssessmentItem(id: string, patch: RiskAssessmentItemPatch): Promise<RiskAssessmentItem> {
    return signedSend<RiskAssessmentItem>(this.client, 'notes.assessments.items.update', {
      id,
      patch,
    });
  }

  deleteAssessmentItem(id: string): Promise<void> {
    return signedSend<void>(this.client, 'notes.assessments.items.delete', { id });
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

export type FrameworkCategory = 'security' | 'privacy' | 'cloud' | 'risk';
export type OrgSize = 'startup' | 'smb' | 'enterprise';
export type StandardsStatus = 'pending' | 'completed' | 'failed';

export interface Framework {
  id: string;
  slug: string;
  name: string;
  description: string;
  version: string;
  category: FrameworkCategory;
  controlCount?: number;
}

// A framework control (seed data — not AI-generated).
export interface FrameworkControl {
  id: string;
  frameworkId: string;
  code: string;
  title: string;
  description: string;
  category: string;
}

// An organization stored in the notes DB.
export interface Organization {
  id: string;
  userId: string;
  name: string;
  industry: string;
  size: OrgSize;
  regions: string[];
  techStack: string[];
  regulations: string[];
  createdAt: string;
  updatedAt: string;
}

export type OrganizationInput = Omit<Organization, 'id' | 'userId' | 'createdAt' | 'updatedAt'>;

// An AI-generated compliance standard stored as part of a StandardsDocument.
export interface DocumentStandard {
  code: string;
  title: string;
  objective: string;
  scope: string;
  requirements: string[];
  frameworkMappings: { frameworkId: string; standardCode: string }[];
}

export type WorkflowStatus = 'draft' | 'in_review' | 'approved' | 'published';
export type WorkflowTransition = 'submit' | 'approve' | 'reject' | 'publish';

export const WORKFLOW_TRANSITIONS: Record<
  WorkflowTransition,
  { from: WorkflowStatus; to: WorkflowStatus }
> = {
  submit: { from: 'draft', to: 'in_review' },
  approve: { from: 'in_review', to: 'approved' },
  reject: { from: 'in_review', to: 'draft' },
  publish: { from: 'approved', to: 'published' },
};

export const ADMIN_TRANSITIONS: WorkflowTransition[] = ['approve', 'reject', 'publish'];

export interface StandardsDocument {
  id: string;
  userId: string;
  orgId: string;
  frameworkIds: string[];
  standards: DocumentStandard[];
  status: StandardsStatus;
  workflowStatus: WorkflowStatus;
  createdAt: string;
}

export interface StandardPatch {
  objective?: string;
  scope?: string;
}

export interface StandardsSnapshot {
  id: string;
  documentId: string;
  version: number;
  workflowStatus: WorkflowStatus;
  standards: DocumentStandard[];
  createdAt: string;
  createdBy?: string;
}

export type {
  GapSeverity,
  RecommendationEffort,
  GapItem,
  Recommendation,
  GapFinding,
  GapAnalysisResult,
} from './ai';
import type { GapAnalysisResult } from './ai';

export interface GapAnalysis {
  id: string;
  orgId: string;
  userId: string;
  docId: string | null;
  result: GapAnalysisResult;
  riskScore: number;
  createdAt: string;
}

// ─── Exceptions ────────────────────────────────────────────────────────────

export type ExceptionStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export interface Exception {
  id: string;
  orgId: string;
  userId: string;
  controlCode: string;
  standardCode?: string;
  frameworkId: string;
  title: string;
  statement: string;
  justification: string;
  ownerId: string;
  compensatingControls?: string;
  status: ExceptionStatus;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExceptionInput {
  controlCode: string;
  standardCode?: string;
  frameworkId: string;
  title: string;
  statement: string;
  justification: string;
  ownerId: string;
  compensatingControls?: string;
  expiresAt?: string;
}

export interface ExceptionPatch {
  title?: string;
  statement?: string;
  justification?: string;
  ownerId?: string;
  compensatingControls?: string;
  expiresAt?: string | null;
}

// ─── Issues ────────────────────────────────────────────────────────────────

export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type IssueStatus = 'open' | 'in_progress' | 'resolved' | 'wont_fix';
export type IssueSource = 'manual' | 'gap_analysis' | 'vendor_risk';

export interface Issue {
  id: string;
  orgId: string;
  userId: string;
  title: string;
  description: string;
  severity: IssueSeverity;
  status: IssueStatus;
  source: IssueSource;
  sourceId: string | null;
  dueDate: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IssueInput {
  title: string;
  description: string;
  severity: IssueSeverity;
  source?: IssueSource;
  sourceId?: string;
  dueDate?: string;
}

export interface IssuePatch {
  title?: string;
  description?: string;
  severity?: IssueSeverity;
  status?: IssueStatus;
  dueDate?: string | null;
  resolvedAt?: string | null;
}

// ─── Assets ────────────────────────────────────────────────────────────────

export type AssetType = 'service' | 'application' | 'infrastructure' | 'data' | 'device' | 'other';
export type AssetCriticality = 'critical' | 'high' | 'medium' | 'low';

export interface Asset {
  id: string;
  orgId: string;
  userId: string;
  name: string;
  type: AssetType;
  criticality: AssetCriticality;
  description: string;
  owner: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AssetInput {
  name: string;
  type: AssetType;
  criticality: AssetCriticality;
  description: string;
  owner: string;
  tags?: string[];
}

export interface AssetPatch {
  name?: string;
  type?: AssetType;
  criticality?: AssetCriticality;
  description?: string;
  owner?: string;
  tags?: string[];
}

// ─── Risks ─────────────────────────────────────────────────────────────────

export type RiskLikelihood = 'very_low' | 'low' | 'medium' | 'high' | 'very_high';
export type RiskImpact = 'very_low' | 'low' | 'medium' | 'high' | 'very_high';
export type RiskTreatment = 'accept' | 'mitigate' | 'transfer' | 'avoid';

export interface Risk {
  id: string;
  orgId: string;
  userId: string;
  title: string;
  description: string;
  category: string;
  likelihood: RiskLikelihood;
  impact: RiskImpact;
  riskScore: number;
  treatment: RiskTreatment;
  assetId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RiskInput {
  title: string;
  description: string;
  category: string;
  likelihood: RiskLikelihood;
  impact: RiskImpact;
  treatment?: RiskTreatment;
  assetId?: string;
}

export interface RiskPatch {
  title?: string;
  description?: string;
  category?: string;
  likelihood?: RiskLikelihood;
  impact?: RiskImpact;
  treatment?: RiskTreatment;
  assetId?: string | null;
}

// ─── Risk Assessments ──────────────────────────────────────────────────────

export type AssessmentType = 'cvra' | 'ctra';
export type AssessmentStatus = 'draft' | 'in_review' | 'completed';

export interface RiskAssessment {
  id: string;
  orgId: string;
  userId: string;
  type: AssessmentType;
  title: string;
  scope: string;
  status: AssessmentStatus;
  riskScore: number;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface RiskAssessmentInput {
  type: AssessmentType;
  title: string;
  scope: string;
}

export interface RiskAssessmentPatch {
  title?: string;
  scope?: string;
  status?: AssessmentStatus;
}

export interface RiskAssessmentItem {
  id: string;
  assessmentId: string;
  subject: string;
  description: string;
  likelihood: RiskLikelihood;
  impact: RiskImpact;
  itemScore: number;
  mitigations: string;
  createdAt: string;
  updatedAt: string;
}

export interface RiskAssessmentItemInput {
  subject: string;
  description: string;
  likelihood: RiskLikelihood;
  impact: RiskImpact;
  mitigations?: string;
}

export interface RiskAssessmentItemPatch {
  subject?: string;
  description?: string;
  likelihood?: RiskLikelihood;
  impact?: RiskImpact;
  mitigations?: string;
}

// ─── Policies ──────────────────────────────────────────────────────────────

export type PolicyStatus = 'draft' | 'approved';

export interface Policy {
  id: string;
  orgId: string;
  userId: string;
  frameworkId: string;
  title: string;
  content: string;
  status: PolicyStatus;
  version: number;
  templateId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PolicyInput {
  frameworkId: string;
  title: string;
  content: string;
  templateId?: string;
}

export interface PolicyPatch {
  title?: string;
  content?: string;
  status?: PolicyStatus;
}

// ─── Policy Templates ──────────────────────────────────────────────────────

export interface PolicyTemplate {
  id: string;
  frameworkId: string;
  title: string;
  content: string;
  createdAt: string;
}

// ─── Controls ↔ Policies mapping ───────────────────────────────────────────

export interface PolicyControl {
  id: string;
  policyId: string;
  controlCode: string;
  frameworkId: string;
  createdAt: string;
}

export interface PolicyControlInput {
  controlCode: string;
  frameworkId: string;
}

export interface AiUsageLogEntry {
  user_id: string;
  provider: string;
  operation: string;
  model: string;
  key_source: 'platform' | 'byok';
  input_tokens?: number;
  output_tokens?: number;
  success: boolean;
  error_code?: string;
  latency_ms?: number;
}

export interface AiUsageRpcRow {
  label: string;
  calls: number;
  tokens: number;
}

export interface AiUsageSummaryRpc {
  total_calls: number;
  total_input_tokens: number;
  total_output_tokens: number;
  success_count: number;
  error_count: number;
  by_provider: Array<{
    provider: string;
    calls: number;
    input_tokens: number;
    output_tokens: number;
  }>;
  by_operation: Array<{
    operation: string;
    calls: number;
    input_tokens: number;
    output_tokens: number;
  }>;
  by_key_source: Array<{
    key_source: string;
    calls: number;
    input_tokens: number;
    output_tokens: number;
  }>;
  by_user: Array<{
    user_id: string;
    email: string;
    full_name: string | null;
    calls: number;
    input_tokens: number;
    output_tokens: number;
  }>;
}

export interface AiUsageTimeseriesPoint {
  date: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  errors: number;
}

export interface NotesStrategy {
  listFrameworks(): Promise<Framework[]>;
  getFramework(id: string): Promise<Framework | null>;
  listControlsByFramework(frameworkId: string): Promise<FrameworkControl[]>;

  listOrganizations(userId: string): Promise<Organization[]>;
  createOrganization(userId: string, data: OrganizationInput): Promise<Organization>;
  getOrganizationById(orgId: string): Promise<Organization | null>;
  updateOrganization(orgId: string, data: OrganizationInput): Promise<Organization>;
  deleteOrganization(orgId: string): Promise<void>;

  createStandardsDocument(
    userId: string,
    orgId: string,
    frameworkIds: string[],
  ): Promise<{ id: string }>;
  saveStandardsDocument(id: string, standards: DocumentStandard[]): Promise<void>;
  failStandardsDocument(id: string, reason?: string): Promise<void>;
  deleteStandardsDocument(id: string): Promise<void>;
  resetStandardsDocument(id: string): Promise<void>;
  getStandardsDocument(id: string): Promise<StandardsDocument | null>;
  listStandardsDocuments(orgId: string): Promise<StandardsDocument[]>;

  updateStandard(docId: string, code: string, patch: StandardPatch): Promise<DocumentStandard>;

  transitionWorkflow(id: string, transition: WorkflowTransition): Promise<StandardsDocument>;

  listSnapshots(documentId: string): Promise<StandardsSnapshot[]>;
  getSnapshot(snapshotId: string): Promise<StandardsSnapshot | null>;

  saveGapAnalysis(
    orgId: string,
    userId: string,
    docId: string | null,
    result: GapAnalysisResult,
  ): Promise<GapAnalysis>;
  listGapAnalyses(orgId: string): Promise<GapAnalysis[]>;
  getGapAnalysis(id: string): Promise<GapAnalysis | null>;

  // Settings
  getUserPrefs(userId: string): Promise<UserPrefsPayload>;
  updateUserPrefs(userId: string, patch: Partial<UserPrefsPayload>): Promise<UserPrefsPayload>;
  savePushSubscription(userId: string, sub: PushSubscriptionPayload): Promise<{ ok: boolean }>;
  removePushSubscription(userId: string, endpoint: string): Promise<{ ok: boolean }>;

  // Chat history
  getChatHistory(userId: string, limit?: number): Promise<AiChatMessage[]>;
  saveChatMessage(
    userId: string,
    role: 'user' | 'assistant',
    content: string,
  ): Promise<AiChatMessage>;
  clearChatHistory(userId: string): Promise<{ ok: boolean }>;

  // Audit log
  logAuditEvent(
    userId: string,
    action: string,
    resourceType?: string,
    resourceId?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void>;
  listAuditLogs(userId: string, filters?: AuditLogFilters): Promise<AuditLogPage>;

  // AI usage
  logAiUsage(entry: AiUsageLogEntry): void;
  getAiUsageSummary(since: string, userId?: string): Promise<AiUsageSummaryRpc>;
  getAiUsageTimeseries(since: string, userId?: string): Promise<AiUsageTimeseriesPoint[]>;

  // API keys
  createApiKey(userId: string, name: string, expiresAt?: string): Promise<ApiKeyWithSecret>;
  listApiKeys(userId: string): Promise<ApiKey[]>;
  revokeApiKey(id: string, userId: string): Promise<{ ok: boolean }>;

  // Webhooks
  createWebhook(userId: string, input: WebhookInput): Promise<Webhook>;
  listWebhooks(userId: string): Promise<Webhook[]>;
  updateWebhook(
    id: string,
    userId: string,
    patch: Partial<WebhookInput> & { active?: boolean },
  ): Promise<Webhook>;
  deleteWebhook(id: string, userId: string): Promise<{ ok: boolean }>;

  // Retention
  getRetentionPrefs(userId: string): Promise<RetentionPrefsPayload>;
  updateRetentionPrefs(
    userId: string,
    patch: Partial<RetentionPrefsPayload>,
  ): Promise<RetentionPrefsPayload>;

  // Report templates
  listReportTemplates(): Promise<ReportTemplate[]>;
  createReportTemplate(userId: string, input: ReportTemplateInput): Promise<ReportTemplate>;
  updateReportTemplate(id: string, patch: Partial<ReportTemplateInput>): Promise<ReportTemplate>;
  deleteReportTemplate(id: string): Promise<{ ok: boolean }>;
  addTemplateFavorite(id: string, orgId: string): Promise<ReportTemplate>;
  removeTemplateFavorite(id: string, orgId: string): Promise<ReportTemplate>;

  // Exceptions
  listExceptions(orgId: string): Promise<Exception[]>;
  createException(orgId: string, userId: string, data: ExceptionInput): Promise<Exception>;
  getException(id: string): Promise<Exception | null>;
  updateException(id: string, patch: ExceptionPatch): Promise<Exception>;
  approveException(id: string): Promise<Exception>;
  rejectException(id: string): Promise<Exception>;
  deleteException(id: string): Promise<void>;

  // Issues
  listIssues(orgId: string): Promise<Issue[]>;
  createIssue(orgId: string, userId: string, data: IssueInput): Promise<Issue>;
  getIssue(id: string): Promise<Issue | null>;
  updateIssue(id: string, patch: IssuePatch): Promise<Issue>;
  deleteIssue(id: string): Promise<void>;

  // Assets
  listAssets(orgId: string): Promise<Asset[]>;
  createAsset(orgId: string, userId: string, data: AssetInput): Promise<Asset>;
  getAsset(id: string): Promise<Asset | null>;
  updateAsset(id: string, patch: AssetPatch): Promise<Asset>;
  deleteAsset(id: string): Promise<void>;

  // Risks
  listRisks(orgId: string): Promise<Risk[]>;
  createRisk(orgId: string, userId: string, data: RiskInput): Promise<Risk>;
  getRisk(id: string): Promise<Risk | null>;
  updateRisk(id: string, patch: RiskPatch): Promise<Risk>;
  deleteRisk(id: string): Promise<void>;

  // Risk Assessments
  listAssessments(orgId: string): Promise<RiskAssessment[]>;
  createAssessment(
    orgId: string,
    userId: string,
    data: RiskAssessmentInput,
  ): Promise<RiskAssessment>;
  getAssessment(id: string): Promise<RiskAssessment | null>;
  updateAssessment(id: string, patch: RiskAssessmentPatch): Promise<RiskAssessment>;
  deleteAssessment(id: string): Promise<void>;

  // Assessment items
  listAssessmentItems(assessmentId: string): Promise<RiskAssessmentItem[]>;
  addAssessmentItem(
    assessmentId: string,
    data: RiskAssessmentItemInput,
  ): Promise<RiskAssessmentItem>;
  updateAssessmentItem(id: string, patch: RiskAssessmentItemPatch): Promise<RiskAssessmentItem>;
  deleteAssessmentItem(id: string): Promise<void>;

  // Policies
  listPolicies(orgId: string): Promise<Policy[]>;
  createPolicy(orgId: string, userId: string, data: PolicyInput): Promise<Policy>;
  getPolicy(id: string): Promise<Policy | null>;
  updatePolicy(id: string, patch: PolicyPatch): Promise<Policy>;
  deletePolicy(id: string): Promise<void>;
  cloneTemplate(orgId: string, userId: string, templateId: string): Promise<Policy>;

  // Policy templates (platform-wide seed data)
  listPolicyTemplates(frameworkId?: string): Promise<PolicyTemplate[]>;

  // Controls ↔ Policies
  listPolicyControls(policyId: string): Promise<PolicyControl[]>;
  addPolicyControl(policyId: string, data: PolicyControlInput): Promise<PolicyControl>;
  removePolicyControl(id: string): Promise<void>;
  listPoliciesForControl(controlCode: string, frameworkId: string): Promise<Policy[]>;
}

// ─── Chat history types ────────────────────────────────────────────────────

export interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

// ─── Settings types ────────────────────────────────────────────────────────

export interface NotificationPrefsPayload {
  channels: { inApp: boolean; push: boolean };
  events: {
    workflowSubmitted: { inApp: boolean; push: boolean };
    workflowApproved: { inApp: boolean; push: boolean };
    workflowRejected: { inApp: boolean; push: boolean };
    workflowPublished: { inApp: boolean; push: boolean };
    aiStandardsGenerated: { inApp: boolean; push: boolean };
    aiGapAnalysisDone: { inApp: boolean; push: boolean };
    systemNewFramework: { inApp: boolean; push: boolean };
  };
}

export interface UserPrefsPayload {
  theme: 'dark' | 'light' | 'system';
  language: 'en' | 'ru' | 'he' | 'es';
  notificationPrefs: NotificationPrefsPayload;
}

export interface PushSubscriptionPayload {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefsPayload = {
  channels: { inApp: true, push: false },
  events: {
    workflowSubmitted: { inApp: true, push: false },
    workflowApproved: { inApp: true, push: false },
    workflowRejected: { inApp: true, push: false },
    workflowPublished: { inApp: true, push: false },
    aiStandardsGenerated: { inApp: true, push: false },
    aiGapAnalysisDone: { inApp: true, push: false },
    systemNewFramework: { inApp: false, push: false },
  },
};

export const DEFAULT_USER_PREFS: UserPrefsPayload = {
  theme: 'system',
  language: 'en',
  notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
};

// ─── Admin types ───────────────────────────────────────────────────────────

export interface AuditLog {
  id: string;
  userId: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AuditLogFilters {
  page?: number;
  limit?: number;
  action?: string;
  from?: string;
  to?: string;
}

export interface AuditLogPage {
  items: AuditLog[];
  total: number;
  page: number;
  limit: number;
}

export interface ApiKey {
  id: string;
  userId: string;
  name: string;
  keyPrefix: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface ApiKeyWithSecret extends ApiKey {
  fullKey: string;
}

export type WebhookEvent =
  | 'workflow.submitted'
  | 'workflow.approved'
  | 'workflow.rejected'
  | 'workflow.published'
  | 'ai.standards.generated'
  | 'ai.gap.done';

export const WEBHOOK_EVENTS: WebhookEvent[] = [
  'workflow.submitted',
  'workflow.approved',
  'workflow.rejected',
  'workflow.published',
  'ai.standards.generated',
  'ai.gap.done',
];

export interface Webhook {
  id: string;
  userId: string;
  url: string;
  events: WebhookEvent[];
  secret: string;
  active: boolean;
  createdAt: string;
}

export interface WebhookInput {
  url: string;
  events: WebhookEvent[];
}

// ─── Report templates ──────────────────────────────────────────────────────

export type ReportTemplateScope = 'gap' | 'standards' | 'all';

export interface ReportTemplate {
  id: string;
  name: string;
  scope: ReportTemplateScope;
  brandName: string;
  accentColor: string;
  includeSummary: boolean;
  includeDetails: boolean;
  includeRecommendations: boolean;
  footerNote: string;
  // Orgs that favorited (assigned) this global template — surfaced first in the
  // export menu for the matching org.
  favoriteOrgIds: string[];
  createdBy: string | null;
  createdAt: string;
}

export interface ReportTemplateInput {
  name: string;
  scope: ReportTemplateScope;
  brandName: string;
  accentColor: string;
  includeSummary: boolean;
  includeDetails: boolean;
  includeRecommendations: boolean;
  footerNote: string;
  favoriteOrgIds: string[];
}

export interface RetentionPrefsPayload {
  auditLogDays: number;
  chatHistoryDays: number;
  notificationDays: number;
}

export const DEFAULT_RETENTION_PREFS: RetentionPrefsPayload = {
  auditLogDays: 90,
  chatHistoryDays: 365,
  notificationDays: 30,
};

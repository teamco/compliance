export type FrameworkCategory = 'security' | 'privacy' | 'cloud' | 'risk';
export type OrgSize = 'startup' | 'smb' | 'enterprise';
export type StandardsStatus = 'pending' | 'completed' | 'failed';
export type StandardControlPriority = 'critical' | 'high' | 'medium' | 'low';

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

// An AI-generated compliance control stored as part of a StandardsDocument.
export interface StandardControl {
  code: string;
  title: string;
  description: string;
  implementation: string;
  evidence: string[];
  frameworkMappings: { frameworkId: string; controlCode: string }[];
  priority: StandardControlPriority;
  category: string;
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
  controls: StandardControl[];
  status: StandardsStatus;
  workflowStatus: WorkflowStatus;
  createdAt: string;
}

export interface ControlPatch {
  priority?: StandardControlPriority;
  implementation?: string;
}

export interface StandardsSnapshot {
  id: string;
  documentId: string;
  version: number;
  workflowStatus: WorkflowStatus;
  controls: StandardControl[];
  createdAt: string;
  createdBy?: string;
}

export type {
  GapSeverity,
  RecommendationEffort,
  GapItem,
  Recommendation,
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
  saveStandardsDocument(id: string, controls: StandardControl[]): Promise<void>;
  failStandardsDocument(id: string, reason?: string): Promise<void>;
  deleteStandardsDocument(id: string): Promise<void>;
  resetStandardsDocument(id: string): Promise<void>;
  getStandardsDocument(id: string): Promise<StandardsDocument | null>;
  listStandardsDocuments(orgId: string): Promise<StandardsDocument[]>;

  updateControl(docId: string, code: string, patch: ControlPatch): Promise<StandardControl>;

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

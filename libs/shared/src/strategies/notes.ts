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

export interface NotesStrategy {
  listFrameworks(): Promise<Framework[]>;
  getFramework(id: string): Promise<Framework | null>;
  listControlsByFramework(frameworkId: string): Promise<FrameworkControl[]>;

  upsertOrganization(userId: string, data: OrganizationInput): Promise<Organization>;
  getOrganization(userId: string): Promise<Organization | null>;

  createStandardsDocument(
    userId: string,
    orgId: string,
    frameworkIds: string[],
  ): Promise<{ id: string }>;
  saveStandardsDocument(id: string, controls: StandardControl[]): Promise<void>;
  getStandardsDocument(id: string): Promise<StandardsDocument | null>;
  listStandardsDocuments(userId: string): Promise<StandardsDocument[]>;

  updateControl(docId: string, code: string, patch: ControlPatch): Promise<StandardControl>;

  transitionWorkflow(id: string, transition: WorkflowTransition): Promise<StandardsDocument>;

  listSnapshots(documentId: string): Promise<StandardsSnapshot[]>;
  getSnapshot(snapshotId: string): Promise<StandardsSnapshot | null>;

  // Settings
  getUserPrefs(userId: string): Promise<UserPrefsPayload>;
  updateUserPrefs(userId: string, patch: Partial<UserPrefsPayload>): Promise<UserPrefsPayload>;
  savePushSubscription(userId: string, sub: PushSubscriptionPayload): Promise<{ ok: boolean }>;
  removePushSubscription(userId: string, endpoint: string): Promise<{ ok: boolean }>;
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

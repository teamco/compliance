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

export interface StandardsDocument {
  id: string;
  userId: string;
  orgId: string;
  frameworkIds: string[];
  controls: StandardControl[];
  status: StandardsStatus;
  createdAt: string;
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
}

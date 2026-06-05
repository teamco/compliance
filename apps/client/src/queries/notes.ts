import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../main';

export interface Framework {
  id: string;
  slug: string;
  name: string;
  description: string;
  version: string;
  category: 'security' | 'privacy' | 'cloud' | 'risk';
  controlCount?: number;
}

export interface FrameworkControl {
  id: string;
  frameworkId: string;
  code: string;
  title: string;
  description: string;
  category: string;
}

export type OrgSize = 'startup' | 'smb' | 'enterprise';

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

export type StandardControlPriority = 'critical' | 'high' | 'medium' | 'low';

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

export type StandardsStatus = 'pending' | 'completed' | 'failed';

export interface StandardsDocument {
  id: string;
  userId: string;
  orgId: string;
  frameworkIds: string[];
  controls: StandardControl[];
  status: StandardsStatus;
  createdAt: string;
}

export function useFrameworks() {
  return useQuery<Framework[]>({
    queryKey: ['notes', 'frameworks'],
    queryFn: () => api<Framework[]>('/notes/frameworks'),
  });
}

export function useFrameworkControls(frameworkId: string) {
  return useQuery<FrameworkControl[]>({
    queryKey: ['notes', 'frameworks', frameworkId, 'controls'],
    queryFn: () => api<FrameworkControl[]>(`/notes/frameworks/${frameworkId}/controls`),
    enabled: !!frameworkId,
  });
}

export function useOrganization() {
  return useQuery<Organization | null>({
    queryKey: ['notes', 'org'],
    queryFn: () => api<Organization | null>('/notes/org'),
  });
}

export function useUpsertOrganization() {
  const qc = useQueryClient();
  return useMutation<Organization, Error, OrganizationInput>({
    mutationFn: (data) =>
      api<Organization>('/notes/org', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes', 'org'] }),
  });
}

export function useStandardsDocuments() {
  return useQuery<StandardsDocument[]>({
    queryKey: ['notes', 'standards'],
    queryFn: () => api<StandardsDocument[]>('/notes/standards'),
  });
}

export function useStandardsDocument(id: string) {
  return useQuery<StandardsDocument | null>({
    queryKey: ['notes', 'standards', id],
    queryFn: () => api<StandardsDocument | null>(`/notes/standards/${id}`),
    enabled: !!id,
  });
}

export function useGenerateStandards() {
  const qc = useQueryClient();
  return useMutation<StandardsDocument, Error, { orgId: string; frameworkIds: string[] }>({
    mutationFn: (body) =>
      api<StandardsDocument>('/notes/standards/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes', 'standards'] }),
  });
}

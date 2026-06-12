import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  Organization,
  OrganizationInput,
  OrgSize,
  DocumentStandard,
  StandardPatch,
} from '@icore/shared';

export type { Organization, OrganizationInput, OrgSize, DocumentStandard, StandardPatch };

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

export type StandardsStatus = 'pending' | 'completed' | 'failed';
export type WorkflowStatus = 'draft' | 'in_review' | 'approved' | 'published';
export type WorkflowTransition = 'submit' | 'approve' | 'reject' | 'publish';

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

export interface StandardsSnapshot {
  id: string;
  documentId: string;
  version: number;
  workflowStatus: WorkflowStatus;
  standards: DocumentStandard[];
  createdAt: string;
  createdBy?: string;
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

export function useOrganizations() {
  return useQuery<Organization[]>({
    queryKey: ['notes', 'orgs'],
    queryFn: () => api<Organization[]>('/notes/orgs'),
  });
}

export function useCreateOrganization() {
  const qc = useQueryClient();
  return useMutation<Organization, Error, OrganizationInput>({
    mutationFn: (data) =>
      api<Organization>('/notes/orgs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes', 'orgs'] }),
  });
}

export function useUpdateOrganization(orgId: string) {
  const qc = useQueryClient();
  return useMutation<Organization, Error, OrganizationInput>({
    mutationFn: (data) =>
      api<Organization>(`/notes/orgs/${orgId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes', 'orgs'] }),
  });
}

export function useDeleteOrganization() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (orgId) => api<void>(`/notes/orgs/${orgId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes', 'orgs'] }),
  });
}

export function useStandardsDocuments(orgId: string) {
  return useQuery<StandardsDocument[]>({
    queryKey: ['notes', 'standards', orgId],
    queryFn: () => api<StandardsDocument[]>(`/notes/standards?orgId=${encodeURIComponent(orgId)}`),
    enabled: !!orgId,
    refetchInterval: (query) =>
      query.state.data?.some((d) => d.status === 'pending') ? 10000 : false,
  });
}

export function useStandardsDocument(id: string) {
  return useQuery<StandardsDocument | null>({
    queryKey: ['notes', 'standards', id],
    queryFn: () => api<StandardsDocument | null>(`/notes/standards/${id}`),
    enabled: !!id,
  });
}

export function useTransitionWorkflow(docId: string) {
  const qc = useQueryClient();
  return useMutation<StandardsDocument, Error, WorkflowTransition>({
    mutationFn: (transition) =>
      api<StandardsDocument>(`/notes/standards/${docId}/workflow`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transition }),
      }),
    onSuccess: (_doc, transition) => {
      qc.invalidateQueries({ queryKey: ['notes', 'standards'] });
      qc.invalidateQueries({ queryKey: ['notes', 'standards', docId] });
      if (transition === 'approve') {
        qc.invalidateQueries({ queryKey: ['notes', 'snapshots', docId] });
      }
    },
  });
}

export function useUpdateStandard(docId: string) {
  const qc = useQueryClient();
  return useMutation<DocumentStandard, Error, { code: string; patch: StandardPatch }>({
    mutationFn: ({ code, patch }) =>
      api<DocumentStandard>(`/notes/standards/${docId}/standards/${code}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes', 'standards', docId] }),
  });
}

export function useSnapshots(documentId: string) {
  return useQuery<StandardsSnapshot[]>({
    queryKey: ['notes', 'snapshots', documentId],
    queryFn: () => api<StandardsSnapshot[]>(`/notes/standards/${documentId}/snapshots`),
    enabled: !!documentId,
  });
}

export function useSnapshot(snapshotId: string) {
  return useQuery<StandardsSnapshot | null>({
    queryKey: ['notes', 'snapshot', snapshotId],
    queryFn: () => api<StandardsSnapshot | null>(`/notes/standards/snapshots/${snapshotId}`),
    enabled: !!snapshotId,
  });
}

export function useGenerateStandards() {
  const qc = useQueryClient();
  return useMutation<{ docId: string }, Error, { orgId: string; frameworkIds: string[] }>({
    mutationFn: (body) =>
      api<{ docId: string }>('/notes/standards/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['notes', 'standards', vars.orgId] }),
  });
}

export function useDeleteStandards(orgId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => api<void>(`/notes/standards/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes', 'standards', orgId] }),
  });
}

export function useRetryStandards(orgId: string) {
  const qc = useQueryClient();
  return useMutation<{ docId: string }, Error, string>({
    mutationFn: (id) => api<{ docId: string }>(`/notes/standards/${id}/retry`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes', 'standards', orgId] }),
  });
}

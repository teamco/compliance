import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  Policy,
  PolicyInput,
  PolicyPatch,
  PolicyTemplate,
  PolicyControl,
  PolicyControlInput,
} from '@icore/shared';

export type { Policy, PolicyInput, PolicyPatch, PolicyTemplate, PolicyControl, PolicyControlInput };

export function usePolicies(orgId: string) {
  return useQuery<Policy[]>({
    queryKey: ['policies', orgId],
    queryFn: () => api<Policy[]>(`/notes/policies?orgId=${encodeURIComponent(orgId)}`),
    enabled: !!orgId,
  });
}

export function usePolicy(id: string) {
  return useQuery<Policy>({
    queryKey: ['policies', id],
    queryFn: () => api<Policy>(`/notes/policies/${id}`),
    enabled: !!id,
  });
}

export function usePolicyTemplates(frameworkId?: string) {
  return useQuery<PolicyTemplate[]>({
    queryKey: ['policy-templates', frameworkId ?? 'all'],
    queryFn: () =>
      api<PolicyTemplate[]>(
        frameworkId
          ? `/notes/policy-templates?frameworkId=${encodeURIComponent(frameworkId)}`
          : '/notes/policy-templates',
      ),
  });
}

export function usePolicyControls(policyId: string) {
  return useQuery<PolicyControl[]>({
    queryKey: ['policies', policyId, 'controls'],
    queryFn: () => api<PolicyControl[]>(`/notes/policies/${policyId}/controls`),
    enabled: !!policyId,
  });
}

export function usePoliciesForControl(controlCode: string, frameworkId: string) {
  return useQuery<Policy[]>({
    queryKey: ['policies', 'for-control', controlCode, frameworkId],
    queryFn: () =>
      api<Policy[]>(
        `/notes/policies/for-control?controlCode=${encodeURIComponent(controlCode)}&frameworkId=${encodeURIComponent(frameworkId)}`,
      ),
    enabled: !!controlCode && !!frameworkId,
  });
}

export function useCreatePolicy(orgId: string) {
  const qc = useQueryClient();
  return useMutation<Policy, Error, PolicyInput>({
    mutationFn: (data) =>
      api<Policy>(`/notes/policies?orgId=${encodeURIComponent(orgId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['policies', orgId] }),
  });
}

export function useCloneTemplate(orgId: string) {
  const qc = useQueryClient();
  return useMutation<Policy, Error, string>({
    mutationFn: (templateId) =>
      api<Policy>(`/notes/policies/clone/${templateId}?orgId=${encodeURIComponent(orgId)}`, {
        method: 'POST',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['policies', orgId] }),
  });
}

export function useUpdatePolicy(orgId: string, id: string) {
  const qc = useQueryClient();
  return useMutation<Policy, Error, PolicyPatch>({
    mutationFn: (patch) =>
      api<Policy>(`/notes/policies/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['policies', orgId] });
      qc.invalidateQueries({ queryKey: ['policies', id] });
    },
  });
}

export function useDeletePolicy(orgId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => api<void>(`/notes/policies/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['policies', orgId] }),
  });
}

export function useAddPolicyControl(policyId: string) {
  const qc = useQueryClient();
  return useMutation<PolicyControl, Error, PolicyControlInput>({
    mutationFn: (data) =>
      api<PolicyControl>(`/notes/policies/${policyId}/controls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['policies', policyId, 'controls'] }),
  });
}

export function useRemovePolicyControl(policyId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => api<void>(`/notes/policies/controls/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['policies', policyId, 'controls'] }),
  });
}

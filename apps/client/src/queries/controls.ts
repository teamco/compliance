import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  InternalControl,
  InternalControlInput,
  InternalControlPatch,
  ControlFrameworkMappingInput,
  RequirementEvidence,
  RequirementAssessment,
  Finding,
  FrameworkActivity,
} from '@icore/shared';

export function useInternalControlsList(orgId?: string, frameworkId?: string) {
  return useQuery<InternalControl[]>({
    queryKey: ['internal-controls', orgId, frameworkId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (orgId) params.set('orgId', orgId);
      if (frameworkId) params.set('frameworkId', frameworkId);
      return api<InternalControl[]>(`/notes/internal-controls?${params.toString()}`);
    },
    enabled: !!orgId,
  });
}

export function useInternalControl(id: string) {
  return useQuery<InternalControl>({
    queryKey: ['internal-controls', id],
    queryFn: () => api<InternalControl>(`/notes/internal-controls/${id}`),
    enabled: !!id,
  });
}

export function useCreateControl(orgId: string) {
  const qc = useQueryClient();
  return useMutation<InternalControl, Error, InternalControlInput>({
    mutationFn: (data) =>
      api<InternalControl>(`/notes/internal-controls?orgId=${encodeURIComponent(orgId)}`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['internal-controls'] }),
  });
}

export function useUpdateControl(id: string) {
  const qc = useQueryClient();
  return useMutation<InternalControl, Error, InternalControlPatch>({
    mutationFn: (patch) =>
      api<InternalControl>(`/notes/internal-controls/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['internal-controls'] });
      qc.invalidateQueries({ queryKey: ['internal-controls', id] });
    },
  });
}

export function useDeleteControl() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => api<void>(`/notes/internal-controls/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['internal-controls'] }),
  });
}

export function useAddControlMapping(controlId: string) {
  const qc = useQueryClient();
  return useMutation<InternalControl, Error, ControlFrameworkMappingInput>({
    mutationFn: (data) =>
      api<InternalControl>(`/notes/internal-controls/${controlId}/mappings`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['internal-controls', controlId] }),
  });
}

export function useControlEvidence(controlId: string) {
  return useQuery<RequirementEvidence[]>({
    queryKey: ['internal-controls', controlId, 'evidence'],
    queryFn: () => api<RequirementEvidence[]>(`/notes/internal-controls/${controlId}/evidence`),
    enabled: !!controlId,
  });
}

export function useCreateControlEvidence(orgId: string, controlId: string) {
  const qc = useQueryClient();
  return useMutation<RequirementEvidence, Error, Omit<RequirementEvidence, 'id' | 'controlId'>>({
    mutationFn: (data) =>
      api<RequirementEvidence>(
        `/notes/internal-controls/${controlId}/evidence?orgId=${encodeURIComponent(orgId)}`,
        { method: 'POST', body: JSON.stringify(data) },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['internal-controls', controlId, 'evidence'] });
      qc.invalidateQueries({ queryKey: ['internal-controls', controlId] });
    },
  });
}

export function useControlAssessments(controlId: string) {
  return useQuery<RequirementAssessment[]>({
    queryKey: ['internal-controls', controlId, 'assessments'],
    queryFn: () => api<RequirementAssessment[]>(`/notes/internal-controls/${controlId}/assessments`),
    enabled: !!controlId,
  });
}

export function useCreateControlAssessment(orgId: string, controlId: string) {
  const qc = useQueryClient();
  return useMutation<RequirementAssessment, Error, Omit<RequirementAssessment, 'id' | 'controlId'>>({
    mutationFn: (data) =>
      api<RequirementAssessment>(
        `/notes/internal-controls/${controlId}/assessments?orgId=${encodeURIComponent(orgId)}`,
        { method: 'POST', body: JSON.stringify(data) },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['internal-controls', controlId, 'assessments'] });
      qc.invalidateQueries({ queryKey: ['internal-controls', controlId, 'findings'] });
      qc.invalidateQueries({ queryKey: ['internal-controls', controlId] });
    },
  });
}

export function useControlFindings(controlId: string) {
  return useQuery<Finding[]>({
    queryKey: ['internal-controls', controlId, 'findings'],
    queryFn: () => api<Finding[]>(`/notes/internal-controls/${controlId}/findings`),
    enabled: !!controlId,
  });
}

export function useControlActivity(controlId: string) {
  return useQuery<FrameworkActivity[]>({
    queryKey: ['internal-controls', controlId, 'activity'],
    queryFn: () => api<FrameworkActivity[]>(`/notes/internal-controls/${controlId}/activity`),
    enabled: !!controlId,
  });
}

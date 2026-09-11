import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  Framework,
  FrameworkInput,
  FrameworkPatch,
  FrameworkRequirement,
  FrameworkRequirementPatch,
  FrameworkStatus,
  FrameworkApplicabilityStatus,
  ImplementationStatus,
  EffectivenessStatus,
  InternalControl,
  RequirementEvidence,
  RequirementAssessment,
  FrameworkActivity,
} from '@icore/shared';

export type {
  Framework,
  FrameworkInput,
  FrameworkPatch,
  FrameworkRequirement,
  FrameworkRequirementPatch,
  FrameworkStatus,
  FrameworkApplicabilityStatus,
  ImplementationStatus,
  EffectivenessStatus,
  InternalControl,
  RequirementEvidence,
  RequirementAssessment,
  FrameworkActivity,
};

export function useFrameworks(orgId?: string) {
  return useQuery<Framework[]>({
    queryKey: ['frameworks', orgId ?? 'all'],
    queryFn: () => {
      const url = orgId
        ? `/notes/frameworks?orgId=${encodeURIComponent(orgId)}`
        : '/notes/frameworks';
      return api<Framework[]>(url);
    },
  });
}

export function useFramework(id: string, orgId?: string) {
  return useQuery<Framework>({
    queryKey: ['frameworks', id, orgId ?? 'all'],
    queryFn: () => {
      const url = orgId
        ? `/notes/frameworks/${encodeURIComponent(id)}?orgId=${encodeURIComponent(orgId)}`
        : `/notes/frameworks/${encodeURIComponent(id)}`;
      return api<Framework>(url);
    },
    enabled: !!id,
  });
}

export function useCreateFramework(orgId: string) {
  const qc = useQueryClient();
  return useMutation<Framework, Error, FrameworkInput>({
    mutationFn: (data) =>
      api<Framework>(`/notes/frameworks?orgId=${encodeURIComponent(orgId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['frameworks'] });
      qc.invalidateQueries({ queryKey: ['notes', 'frameworks'] });
    },
  });
}

export function useUpdateFramework(orgId: string, id: string) {
  const qc = useQueryClient();
  return useMutation<Framework, Error, FrameworkPatch>({
    mutationFn: (patch) =>
      api<Framework>(
        `/notes/frameworks/${encodeURIComponent(id)}?orgId=${encodeURIComponent(orgId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['frameworks'] });
      qc.invalidateQueries({ queryKey: ['notes', 'frameworks'] });
    },
  });
}

export function useDeleteFramework(orgId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) =>
      api<void>(`/notes/frameworks/${encodeURIComponent(id)}?orgId=${encodeURIComponent(orgId)}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['frameworks'] });
      qc.invalidateQueries({ queryKey: ['notes', 'frameworks'] });
    },
  });
}

export function useFrameworkRequirements(frameworkId: string, orgId?: string) {
  return useQuery<FrameworkRequirement[]>({
    queryKey: ['frameworks', frameworkId, 'requirements', orgId ?? 'all'],
    queryFn: () => {
      const url = orgId
        ? `/notes/frameworks/${encodeURIComponent(frameworkId)}/requirements?orgId=${encodeURIComponent(orgId)}`
        : `/notes/frameworks/${encodeURIComponent(frameworkId)}/requirements`;
      return api<FrameworkRequirement[]>(url);
    },
    enabled: !!frameworkId,
  });
}

export function useFrameworkRequirement(frameworkId: string, reqId: string, orgId?: string) {
  return useQuery<FrameworkRequirement>({
    queryKey: ['frameworks', frameworkId, 'requirements', reqId, orgId ?? 'all'],
    queryFn: () => {
      const url = orgId
        ? `/notes/frameworks/${encodeURIComponent(frameworkId)}/requirements/${encodeURIComponent(reqId)}?orgId=${encodeURIComponent(orgId)}`
        : `/notes/frameworks/${encodeURIComponent(frameworkId)}/requirements/${encodeURIComponent(reqId)}`;
      return api<FrameworkRequirement>(url);
    },
    enabled: !!frameworkId && !!reqId,
  });
}

export function useUpdateRequirement(orgId: string, frameworkId: string, reqId: string) {
  const qc = useQueryClient();
  return useMutation<FrameworkRequirement, Error, FrameworkRequirementPatch>({
    mutationFn: (patch) =>
      api<FrameworkRequirement>(
        `/notes/frameworks/${encodeURIComponent(frameworkId)}/requirements/${encodeURIComponent(reqId)}?orgId=${encodeURIComponent(orgId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['frameworks', frameworkId, 'requirements'] });
      qc.invalidateQueries({ queryKey: ['frameworks', frameworkId, 'requirements', reqId] });
      qc.invalidateQueries({ queryKey: ['frameworks'] });
    },
  });
}

export function useInternalControls(orgId?: string, frameworkId?: string) {
  return useQuery<InternalControl[]>({
    queryKey: ['internal-controls', orgId ?? 'all', frameworkId ?? 'all'],
    queryFn: () => {
      const params = new URLSearchParams();
      if (orgId) params.set('orgId', orgId);
      if (frameworkId) params.set('frameworkId', frameworkId);
      const query = params.toString() ? `?${params.toString()}` : '';
      return api<InternalControl[]>(`/notes/internal-controls${query}`);
    },
  });
}

export function useCreateInternalControl(orgId: string) {
  const qc = useQueryClient();
  return useMutation<InternalControl, Error, Omit<InternalControl, 'id'>>({
    mutationFn: (data) =>
      api<InternalControl>(`/notes/internal-controls?orgId=${encodeURIComponent(orgId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['internal-controls'] });
    },
  });
}

export function useFrameworkEvidence(frameworkId: string, orgId?: string) {
  return useQuery<RequirementEvidence[]>({
    queryKey: ['frameworks', frameworkId, 'evidence', orgId ?? 'all'],
    queryFn: () => {
      const url = orgId
        ? `/notes/frameworks/${encodeURIComponent(frameworkId)}/evidence?orgId=${encodeURIComponent(orgId)}`
        : `/notes/frameworks/${encodeURIComponent(frameworkId)}/evidence`;
      return api<RequirementEvidence[]>(url);
    },
    enabled: !!frameworkId,
  });
}

export function useCreateFrameworkEvidence(orgId: string, frameworkId: string) {
  const qc = useQueryClient();
  return useMutation<RequirementEvidence, Error, Omit<RequirementEvidence, 'id'>>({
    mutationFn: (data) =>
      api<RequirementEvidence>(
        `/notes/frameworks/${encodeURIComponent(frameworkId)}/evidence?orgId=${encodeURIComponent(orgId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['frameworks', frameworkId, 'evidence'] });
      qc.invalidateQueries({ queryKey: ['frameworks', frameworkId, 'requirements'] });
    },
  });
}

export function useFrameworkAssessments(frameworkId: string, orgId?: string) {
  return useQuery<RequirementAssessment[]>({
    queryKey: ['frameworks', frameworkId, 'assessments', orgId ?? 'all'],
    queryFn: () => {
      const url = orgId
        ? `/notes/frameworks/${encodeURIComponent(frameworkId)}/assessments?orgId=${encodeURIComponent(orgId)}`
        : `/notes/frameworks/${encodeURIComponent(frameworkId)}/assessments`;
      return api<RequirementAssessment[]>(url);
    },
    enabled: !!frameworkId,
  });
}

export function useCreateAssessmentFinding(orgId: string, frameworkId: string) {
  const qc = useQueryClient();
  return useMutation<
    { findingId: string },
    Error,
    {
      assessmentId: string;
      data: {
        title: string;
        severity: 'critical' | 'high' | 'medium' | 'low';
        description: string;
      };
    }
  >({
    mutationFn: ({ assessmentId, data }) =>
      api<{ findingId: string }>(
        `/notes/frameworks/${encodeURIComponent(frameworkId)}/assessments/${encodeURIComponent(assessmentId)}/findings?orgId=${encodeURIComponent(orgId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['frameworks', frameworkId, 'assessments'] });
      qc.invalidateQueries({ queryKey: ['frameworks', frameworkId, 'requirements'] });
      qc.invalidateQueries({ queryKey: ['issues', orgId] });
    },
  });
}

export function useFrameworkActivities(frameworkId: string, orgId?: string) {
  return useQuery<FrameworkActivity[]>({
    queryKey: ['frameworks', frameworkId, 'activities', orgId ?? 'all'],
    queryFn: () => {
      const url = orgId
        ? `/notes/frameworks/${encodeURIComponent(frameworkId)}/activities?orgId=${encodeURIComponent(orgId)}`
        : `/notes/frameworks/${encodeURIComponent(frameworkId)}/activities`;
      return api<FrameworkActivity[]>(url);
    },
    enabled: !!frameworkId,
  });
}

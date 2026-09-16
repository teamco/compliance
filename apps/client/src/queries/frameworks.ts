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
  Finding,
  Issue,
  Risk,
  Exception,
  IssueSeverity,
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
  Finding,
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
    queryFn: () =>
      api<RequirementEvidence[]>(
        `/notes/frameworks/${encodeURIComponent(frameworkId)}/evidence?orgId=${encodeURIComponent(orgId as string)}`,
      ),
    enabled: !!frameworkId && !!orgId,
  });
}

export function useCreateFrameworkEvidence(orgId: string, frameworkId: string) {
  const qc = useQueryClient();
  return useMutation<
    RequirementEvidence,
    Error,
    Omit<
      RequirementEvidence,
      'id' | 'createdBy' | 'verificationStatus' | 'verifiedBy' | 'verifiedAt'
    >
  >({
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
    queryFn: () =>
      api<RequirementAssessment[]>(
        `/notes/frameworks/${encodeURIComponent(frameworkId)}/assessments?orgId=${encodeURIComponent(orgId as string)}`,
      ),
    enabled: !!frameworkId && !!orgId,
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
    queryFn: () =>
      api<FrameworkActivity[]>(
        `/notes/frameworks/${encodeURIComponent(frameworkId)}/activities?orgId=${encodeURIComponent(orgId as string)}`,
      ),
    enabled: !!frameworkId && !!orgId,
  });
}

export function useControlFindings(controlId: string, orgId?: string) {
  return useQuery<Finding[]>({
    queryKey: ['controls', controlId, 'findings', orgId ?? 'all'],
    queryFn: () =>
      api<Finding[]>(
        `/notes/internal-controls/${encodeURIComponent(controlId)}/findings?orgId=${encodeURIComponent(orgId ?? '')}`,
      ),
    enabled: !!controlId && !!orgId,
  });
}

export function useFindingsByLink(params: {
  issueId?: string;
  riskId?: string;
  exceptionId?: string;
}) {
  const key = params.issueId
    ? `issue:${params.issueId}`
    : params.riskId
      ? `risk:${params.riskId}`
      : params.exceptionId
        ? `exception:${params.exceptionId}`
        : 'none';
  const qs = new URLSearchParams();
  if (params.issueId) qs.set('issueId', params.issueId);
  if (params.riskId) qs.set('riskId', params.riskId);
  if (params.exceptionId) qs.set('exceptionId', params.exceptionId);
  return useQuery<Finding[]>({
    queryKey: ['findings', 'by-link', key],
    queryFn: () => api<Finding[]>(`/notes/findings/by-link?${qs.toString()}`),
    enabled: key !== 'none',
  });
}

export function useLinkFindingToIssue(findingId: string) {
  const qc = useQueryClient();
  return useMutation<Finding, Error, { issueId: string }>({
    mutationFn: (data) =>
      api<Finding>(`/notes/findings/${findingId}/link-issue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['controls'] });
      qc.invalidateQueries({ queryKey: ['findings'] });
    },
  });
}

export function useLinkFindingToRisk(findingId: string) {
  const qc = useQueryClient();
  return useMutation<Finding, Error, { riskId: string }>({
    mutationFn: (data) =>
      api<Finding>(`/notes/findings/${findingId}/link-risk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['controls'] });
      qc.invalidateQueries({ queryKey: ['findings'] });
    },
  });
}

export function useResolveFindingViaException(findingId: string) {
  const qc = useQueryClient();
  return useMutation<Finding, Error, { exceptionId: string }>({
    mutationFn: (data) =>
      api<Finding>(`/notes/findings/${findingId}/resolve-via-exception`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['controls'] });
      qc.invalidateQueries({ queryKey: ['findings'] });
    },
  });
}

export function useCreateIssueFromFinding(findingId: string) {
  const qc = useQueryClient();
  return useMutation<
    Issue,
    Error,
    { title: string; description: string; severity: IssueSeverity; ownerId: string }
  >({
    mutationFn: (data) =>
      api(`/notes/findings/${findingId}/create-issue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: (_, __, ___) => {
      qc.invalidateQueries({ queryKey: ['controls'] });
      qc.invalidateQueries({ queryKey: ['findings'] });
      qc.invalidateQueries({ queryKey: ['issues'] });
    },
  });
}

export function useCreateRiskFromFinding(findingId: string) {
  const qc = useQueryClient();
  return useMutation<
    Risk,
    Error,
    {
      title: string;
      description: string;
      taxonomyCategoryId: string;
      ownerId: string;
      inherentLikelihood: number;
      inherentImpact: number;
    }
  >({
    mutationFn: (data) =>
      api(`/notes/findings/${findingId}/create-risk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['controls'] });
      qc.invalidateQueries({ queryKey: ['findings'] });
      qc.invalidateQueries({ queryKey: ['risks'] });
    },
  });
}

export function useCreateExceptionFromFinding(findingId: string) {
  const qc = useQueryClient();
  return useMutation<
    Exception,
    Error,
    {
      controlCode: string;
      frameworkId: string;
      title: string;
      statement: string;
      justification: string;
      ownerId: string;
      compensatingControls?: string;
    }
  >({
    mutationFn: (data) =>
      api(`/notes/findings/${findingId}/create-exception`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['controls'] });
      qc.invalidateQueries({ queryKey: ['findings'] });
      qc.invalidateQueries({ queryKey: ['exceptions'] });
    },
  });
}

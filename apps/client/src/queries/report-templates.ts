import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ReportTemplate, ReportTemplateInput } from '@icore/shared';

export type { ReportTemplate, ReportTemplateInput };

const KEY = ['notes', 'report-templates'];

export function useReportTemplates() {
  return useQuery<ReportTemplate[]>({
    queryKey: KEY,
    queryFn: () => api<ReportTemplate[]>('/notes/report-templates'),
  });
}

export function useCreateReportTemplate() {
  const qc = useQueryClient();
  return useMutation<ReportTemplate, Error, ReportTemplateInput>({
    mutationFn: (input) =>
      api<ReportTemplate>('/notes/report-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateReportTemplate() {
  const qc = useQueryClient();
  return useMutation<ReportTemplate, Error, { id: string; patch: Partial<ReportTemplateInput> }>({
    mutationFn: ({ id, patch }) =>
      api<ReportTemplate>(`/notes/report-templates/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteReportTemplate() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => api<void>(`/notes/report-templates/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

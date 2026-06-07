import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../main';

// ─── Types (mirror shared) ──────────────────────────────────────────────────

export interface AuditLog {
  id: string;
  userId: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AuditLogPage {
  items: AuditLog[];
  total: number;
  page: number;
  limit: number;
}

export interface ApiKey {
  id: string;
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

export const WEBHOOK_EVENT_LABELS: Record<WebhookEvent, string> = {
  'workflow.submitted':    'Workflow Submitted',
  'workflow.approved':     'Workflow Approved',
  'workflow.rejected':     'Workflow Rejected',
  'workflow.published':    'Workflow Published',
  'ai.standards.generated': 'Standards Generated',
  'ai.gap.done':           'Gap Analysis Done',
};

export interface Webhook {
  id: string;
  url: string;
  events: WebhookEvent[];
  secret: string;
  active: boolean;
  createdAt: string;
}

export interface RetentionPrefsPayload {
  auditLogDays: number;
  chatHistoryDays: number;
  notificationDays: number;
}

// ─── Audit log ──────────────────────────────────────────────────────────────

export function useAuditLog(page: number, action?: string) {
  const params = new URLSearchParams({ page: String(page), limit: '50' });
  if (action) params.set('action', action);
  return useQuery<AuditLogPage>({
    queryKey: ['admin', 'audit-log', page, action],
    queryFn: () => api<AuditLogPage>(`/admin/audit-log?${params}`),
  });
}

// ─── API keys ───────────────────────────────────────────────────────────────

export function useApiKeys() {
  return useQuery<ApiKey[]>({
    queryKey: ['admin', 'api-keys'],
    queryFn: () => api<ApiKey[]>('/admin/api-keys'),
  });
}

export function useCreateApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; expiresAt?: string }) =>
      api<ApiKeyWithSecret>('/admin/api-keys', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'api-keys'] }),
  });
}

export function useRevokeApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<{ ok: boolean }>(`/admin/api-keys/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'api-keys'] }),
  });
}

// ─── Webhooks ───────────────────────────────────────────────────────────────

export function useWebhooks() {
  return useQuery<Webhook[]>({
    queryKey: ['admin', 'webhooks'],
    queryFn: () => api<Webhook[]>('/admin/webhooks'),
  });
}

export function useCreateWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { url: string; events: WebhookEvent[] }) =>
      api<Webhook>('/admin/webhooks', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'webhooks'] }),
  });
}

export function useUpdateWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<{ url: string; events: WebhookEvent[]; active: boolean }> }) =>
      api<Webhook>(`/admin/webhooks/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'webhooks'] }),
  });
}

export function useDeleteWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<{ ok: boolean }>(`/admin/webhooks/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'webhooks'] }),
  });
}

// ─── Retention ──────────────────────────────────────────────────────────────

export function useRetentionPrefs() {
  return useQuery<RetentionPrefsPayload>({
    queryKey: ['admin', 'retention'],
    queryFn: () => api<RetentionPrefsPayload>('/admin/retention'),
  });
}

export function useUpdateRetentionPrefs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<RetentionPrefsPayload>) =>
      api<RetentionPrefsPayload>('/admin/retention', { method: 'PATCH', body: JSON.stringify(patch) }),
    onSuccess: (data) => qc.setQueryData(['admin', 'retention'], data),
  });
}

// ─── AI Usage ───────────────────────────────────────────────────────────────

export interface AiUsageSummary {
  total_calls: number;
  total_tokens: number;
  total_cost_usd: number;
  by_operation: { operation: string; calls: number; tokens: number }[];
  users: { userId: string; calls: number; tokens: number }[];
}

export type AiUsageRange = '24h' | '7d' | '30d' | '90d';

export function useAiUsageSummary(range: AiUsageRange = '7d') {
  return useQuery<AiUsageSummary>({
    queryKey: ['admin', 'ai-usage', range],
    queryFn: () => api<AiUsageSummary>(`/admin/ai-usage/summary?range=${range}`),
  });
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type OrgMemberRole = 'owner' | 'admin' | 'viewer';
export type OrgInviteRole = 'admin' | 'viewer';

export interface OrgMember {
  userId: string;
  role: OrgMemberRole;
  displayName?: string;
  email?: string;
}

export interface OrgInvite {
  id: string;
  orgId: string;
  email: string;
  role: OrgInviteRole;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  expiresAt: string;
  createdAt: string;
}

export function useOrgMembers(orgId: string, opts?: { includeInactive?: boolean }) {
  const includeInactive = opts?.includeInactive ?? false;
  return useQuery<OrgMember[]>({
    queryKey: ['org-members', orgId, includeInactive ? 'all' : 'active'],
    queryFn: () =>
      api<OrgMember[]>(
        `/auth/org/members?orgId=${encodeURIComponent(orgId)}${includeInactive ? '&includeInactive=true' : ''}`,
      ),
    enabled: !!orgId,
  });
}

export function useOrgInvites(orgId: string, enabled = true) {
  return useQuery<OrgInvite[]>({
    queryKey: ['org-invites', orgId],
    queryFn: () => api<OrgInvite[]>(`/auth/org/invites?orgId=${encodeURIComponent(orgId)}`),
    enabled: !!orgId && enabled,
  });
}

export function useCreateOrgInvite(orgId: string) {
  const qc = useQueryClient();
  return useMutation<OrgInvite, Error, { email: string; role: OrgInviteRole }>({
    mutationFn: (body) =>
      api<OrgInvite>(`/auth/org/invites?orgId=${encodeURIComponent(orgId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-invites', orgId] }),
  });
}

export function useRevokeOrgInvite(orgId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (inviteId) =>
      api<void>(`/auth/org/invites/${inviteId}?orgId=${encodeURIComponent(orgId)}`, {
        method: 'DELETE',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-invites', orgId] }),
  });
}

export function useResendOrgInvite(orgId: string) {
  const qc = useQueryClient();
  return useMutation<OrgInvite, Error, string>({
    mutationFn: (inviteId) =>
      api<OrgInvite>(`/auth/org/invites/${inviteId}/resend?orgId=${encodeURIComponent(orgId)}`, {
        method: 'POST',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-invites', orgId] }),
  });
}

export function useDeactivateOrgMember(orgId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (userId) =>
      api<void>(`/auth/org/members/${userId}?orgId=${encodeURIComponent(orgId)}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-members', orgId] });
      // Covers self-removal: the org list (creator's orgs unioned with
      // listOrgIdsForMember) must drop this org from the switcher too.
      qc.invalidateQueries({ queryKey: ['notes', 'orgs'] });
    },
  });
}

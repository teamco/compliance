import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { OrgMember } from '@icore/shared';

export type { OrgMember };

export function useOrgMembers(orgId: string) {
  return useQuery<OrgMember[]>({
    queryKey: ['auth', 'org', orgId, 'members'],
    queryFn: () => api<OrgMember[]>(`/auth/org/members?orgId=${encodeURIComponent(orgId)}`),
    enabled: !!orgId,
  });
}

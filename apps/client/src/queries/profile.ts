import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface ProfilePayload {
  uid: string;
  email?: string;
  role?: string;
  displayName?: string;
  avatarUrl?: string;
  lastSignedIn?: string;
}

export function useProfile() {
  return useQuery<ProfilePayload>({
    queryKey: ['profile'],
    queryFn: () => api<ProfilePayload>('/profile'),
  });
}

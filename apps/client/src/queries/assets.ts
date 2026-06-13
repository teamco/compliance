import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Asset, AssetInput, AssetPatch } from '@icore/shared';

export type { Asset, AssetInput, AssetPatch };

export function useAssets(orgId: string) {
  return useQuery<Asset[]>({
    queryKey: ['assets', orgId],
    queryFn: () => api<Asset[]>(`/assets?orgId=${encodeURIComponent(orgId)}`),
    enabled: !!orgId,
  });
}

export function useCreateAsset(orgId: string) {
  const qc = useQueryClient();
  return useMutation<Asset, Error, AssetInput>({
    mutationFn: (data) =>
      api<Asset>(`/assets?orgId=${encodeURIComponent(orgId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assets', orgId] }),
  });
}

export function useUpdateAsset(orgId: string) {
  const qc = useQueryClient();
  return useMutation<Asset, Error, { id: string; patch: AssetPatch }>({
    mutationFn: ({ id, patch }) =>
      api<Asset>(`/assets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assets', orgId] }),
  });
}

export function useDeleteAsset(orgId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => api<void>(`/assets/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assets', orgId] }),
  });
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  Asset,
  AssetInput,
  AssetPatch,
  FrameworkActivity,
  RequirementEvidence,
} from '@icore/shared';

export type { Asset, AssetInput, AssetPatch };

export function useAssets(orgId: string) {
  return useQuery<Asset[]>({
    queryKey: ['assets', orgId],
    queryFn: () => api<Asset[]>(`/notes/assets?orgId=${encodeURIComponent(orgId)}`),
    enabled: !!orgId,
  });
}

export function useCreateAsset(orgId: string) {
  const qc = useQueryClient();
  return useMutation<Asset, Error, AssetInput>({
    mutationFn: (data) =>
      api<Asset>(`/notes/assets?orgId=${encodeURIComponent(orgId)}`, {
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
      api<Asset>(`/notes/assets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      }),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['assets', orgId] });
      qc.invalidateQueries({ queryKey: ['assets', id, 'activity'] });
    },
  });
}

export function useDeleteAsset(orgId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => api<void>(`/notes/assets/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assets', orgId] }),
  });
}

export function useAssetEvidence(assetId: string) {
  return useQuery<RequirementEvidence[]>({
    queryKey: ['assets', assetId, 'evidence'],
    queryFn: () => api<RequirementEvidence[]>(`/notes/assets/${assetId}/evidence`),
    enabled: !!assetId,
  });
}

export function useAssetActivity(assetId: string) {
  return useQuery<FrameworkActivity[]>({
    queryKey: ['assets', assetId, 'activity'],
    queryFn: () => api<FrameworkActivity[]>(`/notes/assets/${assetId}/activity`),
    enabled: !!assetId,
  });
}

export function useCreateAssetEvidence(orgId: string, assetId: string) {
  const qc = useQueryClient();
  return useMutation<
    RequirementEvidence,
    Error,
    Omit<
      RequirementEvidence,
      'id' | 'assetId' | 'createdBy' | 'verificationStatus' | 'verifiedBy' | 'verifiedAt'
    >
  >({
    mutationFn: (data) =>
      api<RequirementEvidence>(
        `/notes/assets/${assetId}/evidence?orgId=${encodeURIComponent(orgId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assets', assetId, 'evidence'] });
      qc.invalidateQueries({ queryKey: ['assets', assetId, 'activity'] });
    },
  });
}

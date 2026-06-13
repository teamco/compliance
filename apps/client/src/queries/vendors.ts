import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  CategoryResult,
  ScanCategory,
  ScanFinding,
  Vendor,
  VendorAiAnalysis,
  VendorInput,
  VendorScan,
} from '@icore/shared';

export type {
  Vendor,
  VendorInput,
  VendorScan,
  VendorAiAnalysis,
  CategoryResult,
  ScanCategory,
  ScanFinding,
};

export interface VendorScanDetail extends VendorScan {
  analysis: VendorAiAnalysis | null;
}

export function useVendors(orgId: string) {
  return useQuery<Vendor[]>({
    queryKey: ['vendors', orgId],
    queryFn: () => api<Vendor[]>(`/vendors?orgId=${encodeURIComponent(orgId)}`),
    enabled: !!orgId,
  });
}

export function useVendor(id: string) {
  return useQuery<Vendor>({
    queryKey: ['vendors', id],
    queryFn: () => api<Vendor>(`/vendors/${id}`),
    enabled: !!id,
  });
}

export function useVendorScans(vendorId: string) {
  return useQuery<VendorScan[]>({
    queryKey: ['vendors', vendorId, 'scans'],
    queryFn: () => api<VendorScan[]>(`/vendors/${vendorId}/scans`),
    enabled: !!vendorId,
  });
}

export function useVendorScan(vendorId: string, scanId: string) {
  return useQuery<VendorScanDetail>({
    queryKey: ['vendors', vendorId, 'scans', scanId],
    queryFn: () => api<VendorScanDetail>(`/vendors/${vendorId}/scans/${scanId}`),
    enabled: !!vendorId && !!scanId,
  });
}

export function useCreateVendor(orgId: string) {
  const qc = useQueryClient();
  return useMutation<Vendor, Error, VendorInput>({
    mutationFn: (data) =>
      api<Vendor>(`/vendors?orgId=${encodeURIComponent(orgId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vendors', orgId] }),
  });
}

export function useUpdateVendor(id: string) {
  const qc = useQueryClient();
  return useMutation<Vendor, Error, Partial<VendorInput>>({
    mutationFn: (patch) =>
      api<Vendor>(`/vendors/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vendors', id] });
    },
  });
}

export function useDeleteVendor(orgId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => api<void>(`/vendors/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vendors', orgId] }),
  });
}

export function useTriggerScan(vendorId: string) {
  const qc = useQueryClient();
  return useMutation<VendorScan, Error, 'baseline' | 'deep'>({
    mutationFn: (mode) =>
      api<VendorScan>(`/vendors/${vendorId}/scan${mode === 'deep' ? '/deep' : ''}`, {
        method: 'POST',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vendors', vendorId, 'scans'] });
    },
  });
}

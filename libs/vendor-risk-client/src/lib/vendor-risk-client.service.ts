import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { signedSend } from '@icore/shared';
import type { Vendor, VendorAiAnalysis, VendorInput, VendorScan } from '@icore/shared';
import { VENDOR_RISK_CLIENT } from './vendor-risk-client.tokens';

const SCAN_TIMEOUT_MS = 120_000;
const DEFAULT_TIMEOUT_MS = 15_000;

@Injectable()
export class VendorRiskClientService {
  constructor(@Inject(VENDOR_RISK_CLIENT) private readonly client: ClientProxy) {}

  listVendors(orgId: string): Promise<Vendor[]> {
    return signedSend<Vendor[]>(
      this.client,
      'vendor.list',
      { orgId },
      {
        timeout: { ms: DEFAULT_TIMEOUT_MS },
      },
    );
  }

  getVendor(id: string): Promise<Vendor | null> {
    return signedSend<Vendor | null>(
      this.client,
      'vendor.get',
      { id },
      {
        timeout: { ms: DEFAULT_TIMEOUT_MS },
      },
    );
  }

  createVendor(orgId: string, input: VendorInput): Promise<Vendor> {
    return signedSend<Vendor>(
      this.client,
      'vendor.create',
      { orgId, input },
      {
        timeout: { ms: SCAN_TIMEOUT_MS },
      },
    );
  }

  updateVendor(id: string, patch: Partial<VendorInput>): Promise<Vendor> {
    return signedSend<Vendor>(
      this.client,
      'vendor.update',
      { id, patch },
      {
        timeout: { ms: DEFAULT_TIMEOUT_MS },
      },
    );
  }

  deleteVendor(id: string): Promise<void> {
    return signedSend<void>(
      this.client,
      'vendor.delete',
      { id },
      {
        timeout: { ms: DEFAULT_TIMEOUT_MS },
      },
    );
  }

  triggerScan(id: string, mode: 'baseline' | 'deep'): Promise<VendorScan> {
    return signedSend<VendorScan>(
      this.client,
      'vendor.scan',
      { id, mode },
      {
        timeout: { ms: SCAN_TIMEOUT_MS },
      },
    );
  }

  listScans(vendorId: string): Promise<VendorScan[]> {
    return signedSend<VendorScan[]>(
      this.client,
      'vendor.scans.list',
      { vendorId },
      {
        timeout: { ms: DEFAULT_TIMEOUT_MS },
      },
    );
  }

  getScan(scanId: string): Promise<VendorScan & { analysis: VendorAiAnalysis | null }> {
    return signedSend<VendorScan & { analysis: VendorAiAnalysis | null }>(
      this.client,
      'vendor.scans.get',
      { scanId },
      { timeout: { ms: DEFAULT_TIMEOUT_MS } },
    );
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import type { Vendor, VendorAiAnalysis, VendorInput, VendorScan } from '@icore/shared';
import { VENDOR_RISK_CLIENT } from './vendor-risk-client.tokens';

const SCAN_TIMEOUT_MS = 120_000;
const DEFAULT_TIMEOUT_MS = 15_000;

@Injectable()
export class VendorRiskClientService {
  constructor(@Inject(VENDOR_RISK_CLIENT) private readonly client: ClientProxy) {}

  listVendors(orgId: string): Promise<Vendor[]> {
    return firstValueFrom(
      this.client
        .send<Vendor[]>('vendor.list', { orgId })
        .pipe(timeout({ each: DEFAULT_TIMEOUT_MS })),
    );
  }

  getVendor(id: string): Promise<Vendor | null> {
    return firstValueFrom(
      this.client
        .send<Vendor | null>('vendor.get', { id })
        .pipe(timeout({ each: DEFAULT_TIMEOUT_MS })),
    );
  }

  createVendor(orgId: string, input: VendorInput): Promise<Vendor> {
    return firstValueFrom(
      this.client
        .send<Vendor>('vendor.create', { orgId, input })
        .pipe(timeout({ each: SCAN_TIMEOUT_MS })),
    );
  }

  updateVendor(id: string, patch: Partial<VendorInput>): Promise<Vendor> {
    return firstValueFrom(
      this.client
        .send<Vendor>('vendor.update', { id, patch })
        .pipe(timeout({ each: DEFAULT_TIMEOUT_MS })),
    );
  }

  deleteVendor(id: string): Promise<void> {
    return firstValueFrom(
      this.client.send<void>('vendor.delete', { id }).pipe(timeout({ each: DEFAULT_TIMEOUT_MS })),
    );
  }

  triggerScan(id: string, mode: 'baseline' | 'deep'): Promise<VendorScan> {
    return firstValueFrom(
      this.client
        .send<VendorScan>('vendor.scan', { id, mode })
        .pipe(timeout({ each: SCAN_TIMEOUT_MS })),
    );
  }

  listScans(vendorId: string): Promise<VendorScan[]> {
    return firstValueFrom(
      this.client
        .send<VendorScan[]>('vendor.scans.list', { vendorId })
        .pipe(timeout({ each: DEFAULT_TIMEOUT_MS })),
    );
  }

  getScan(scanId: string): Promise<VendorScan & { analysis: VendorAiAnalysis | null }> {
    return firstValueFrom(
      this.client
        .send<VendorScan & { analysis: VendorAiAnalysis | null }>('vendor.scans.get', { scanId })
        .pipe(timeout({ each: DEFAULT_TIMEOUT_MS })),
    );
  }
}

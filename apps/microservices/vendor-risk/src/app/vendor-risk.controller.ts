import { Controller, Inject } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import type { Vendor, VendorAiAnalysis, VendorInput, VendorScan } from '@icore/shared';
import { VendorRiskService } from './vendor-risk.service';

@Controller()
export class VendorRiskController {
  constructor(@Inject(VendorRiskService) private readonly svc: VendorRiskService) {}

  @MessagePattern('vendor.list')
  list(@Payload() payload: { orgId: string }): Promise<Vendor[]> {
    return this.svc.listVendors(payload.orgId);
  }

  @MessagePattern('vendor.get')
  get(@Payload() payload: { id: string }): Promise<Vendor | null> {
    return this.svc.getVendor(payload.id);
  }

  @MessagePattern('vendor.create')
  create(@Payload() payload: { orgId: string; input: VendorInput }): Promise<Vendor> {
    return this.svc.createVendor(payload.orgId, payload.input);
  }

  @MessagePattern('vendor.update')
  update(@Payload() payload: { id: string; patch: Partial<VendorInput> }): Promise<Vendor> {
    return this.svc.updateVendor(payload.id, payload.patch);
  }

  @MessagePattern('vendor.delete')
  delete(@Payload() payload: { id: string }): Promise<void> {
    return this.svc.deleteVendor(payload.id);
  }

  @MessagePattern('vendor.scan')
  scan(@Payload() payload: { id: string; mode: 'baseline' | 'deep' }): Promise<VendorScan> {
    return this.svc.runScan(payload.id, payload.mode);
  }

  @MessagePattern('vendor.scans.list')
  listScans(@Payload() payload: { vendorId: string }): Promise<VendorScan[]> {
    return this.svc.listScans(payload.vendorId);
  }

  @MessagePattern('vendor.scans.get')
  getScan(
    @Payload() payload: { scanId: string },
  ): Promise<VendorScan & { analysis: VendorAiAnalysis | null }> {
    return this.svc.getScan(payload.scanId);
  }
}

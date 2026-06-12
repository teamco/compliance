import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AiClientService } from '@icore/ai-client';
import type {
  CategoryResult,
  ScanCategory,
  ScanFinding,
  ScanMode,
  Vendor,
  VendorAiAnalysis,
  VendorInput,
  VendorRiskStrategy,
  VendorScan,
} from '@icore/shared';

@Injectable()
export class VendorRiskService {
  private readonly logger = new Logger(VendorRiskService.name);

  constructor(
    private readonly db: SupabaseClient,
    private readonly strategy: VendorRiskStrategy,
    private readonly ai: AiClientService,
  ) {}

  async listVendors(orgId: string): Promise<Vendor[]> {
    const { data, error } = await this.db
      .from('vendors')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(this.mapVendor);
  }

  async getVendor(id: string): Promise<Vendor | null> {
    const { data, error } = await this.db.from('vendors').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? this.mapVendor(data) : null;
  }

  async createVendor(orgId: string, input: VendorInput): Promise<Vendor> {
    const { data, error } = await this.db
      .from('vendors')
      .insert({
        org_id: orgId,
        name: input.name,
        domain: input.domain,
        tags: input.tags,
        tier: input.tier,
        rescan_interval_days: input.rescanIntervalDays,
        alert_threshold: input.alertThreshold,
      })
      .select('*')
      .single();
    if (error) throw error;
    const vendor = this.mapVendor(data);
    this.runScan(vendor.id, 'baseline').catch((err) =>
      this.logger.error(`Initial scan failed for ${vendor.domain}: ${err}`),
    );
    return vendor;
  }

  async updateVendor(id: string, patch: Partial<VendorInput>): Promise<Vendor> {
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.name !== undefined) update['name'] = patch.name;
    if (patch.domain !== undefined) update['domain'] = patch.domain;
    if (patch.tags !== undefined) update['tags'] = patch.tags;
    if (patch.tier !== undefined) update['tier'] = patch.tier;
    if (patch.rescanIntervalDays !== undefined)
      update['rescan_interval_days'] = patch.rescanIntervalDays;
    if (patch.alertThreshold !== undefined) update['alert_threshold'] = patch.alertThreshold;
    const { data, error } = await this.db
      .from('vendors')
      .update(update)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return this.mapVendor(data);
  }

  async deleteVendor(id: string): Promise<void> {
    const { error } = await this.db.from('vendors').delete().eq('id', id);
    if (error) throw error;
  }

  async runScan(vendorId: string, mode: ScanMode): Promise<VendorScan> {
    const vendor = await this.getVendor(vendorId);
    if (!vendor) throw new NotFoundException(`Vendor ${vendorId} not found`);

    this.logger.log(`Scanning ${vendor.domain} [${mode}]`);
    const result = await this.strategy.scan(vendor.domain, mode);

    const triggeredBy = mode === 'deep' ? 'deep' : 'manual';
    const { data: scanRow, error: scanErr } = await this.db
      .from('vendor_scans')
      .insert({
        vendor_id: vendorId,
        triggered_by: triggeredBy,
        score: result.score,
        grade: result.grade,
        breakdown: result.breakdown,
        findings: result.findings,
        scorecard_data: result.scorecardData ?? null,
      })
      .select('*')
      .single();
    if (scanErr) throw scanErr;

    await this.db
      .from('vendors')
      .update({
        last_scanned_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', vendorId);

    const scan = this.mapScan(scanRow);

    this.runAnalysis(vendor.domain, scan).catch((err) =>
      this.logger.error(`AI analysis failed for scan ${scan.id}: ${err}`),
    );

    return scan;
  }

  async runScheduledScans(): Promise<void> {
    const { data: vendors } = await this.db
      .from('vendors')
      .select('*')
      .order('tier', { ascending: false });

    if (!vendors?.length) return;

    const CONCURRENCY = 5;
    for (let i = 0; i < vendors.length; i += CONCURRENCY) {
      const batch = vendors.slice(i, i + CONCURRENCY);
      await Promise.allSettled(
        batch.map(async (v: Record<string, unknown>) => {
          const vendor = this.mapVendor(v);
          const lastScanned = vendor.lastScannedAt ? new Date(vendor.lastScannedAt) : null;
          const intervalMs = vendor.rescanIntervalDays * 86_400_000;
          if (lastScanned && Date.now() - lastScanned.getTime() < intervalMs) return;
          const prevScan = await this.getLatestScan(vendor.id);
          const scan = await this.runScan(vendor.id, 'baseline');
          if (prevScan) await this.checkAndFireAlert(vendor, prevScan.score, scan);
        }),
      );
    }
  }

  async listScans(vendorId: string): Promise<VendorScan[]> {
    const { data, error } = await this.db
      .from('vendor_scans')
      .select('*')
      .eq('vendor_id', vendorId)
      .order('scanned_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(this.mapScan);
  }

  async getScan(scanId: string): Promise<VendorScan & { analysis: VendorAiAnalysis | null }> {
    const { data: scan, error } = await this.db
      .from('vendor_scans')
      .select('*')
      .eq('id', scanId)
      .maybeSingle();
    if (error) throw error;
    if (!scan) throw new NotFoundException(`Scan ${scanId} not found`);

    const { data: analysis } = await this.db
      .from('vendor_ai_analyses')
      .select('*')
      .eq('scan_id', scanId)
      .maybeSingle();

    return { ...this.mapScan(scan), analysis: analysis ? this.mapAnalysis(analysis) : null };
  }

  private async getLatestScan(vendorId: string): Promise<VendorScan | null> {
    const { data } = await this.db
      .from('vendor_scans')
      .select('*')
      .eq('vendor_id', vendorId)
      .order('scanned_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data ? this.mapScan(data) : null;
  }

  private async runAnalysis(domain: string, scan: VendorScan): Promise<void> {
    const result = await this.ai.analyzeVendorPosture({
      domain,
      findings: scan.findings,
      breakdown: scan.breakdown,
    });

    await this.db.from('vendor_ai_analyses').insert({
      scan_id: scan.id,
      vendor_id: scan.vendorId,
      summary: result.summary,
      risk_rating: result.riskRating,
      recommendations: result.recommendations,
      model: 'claude-sonnet-4-6',
      input_tokens: 0,
      output_tokens: 0,
    });
  }

  private async checkAndFireAlert(
    vendor: Vendor,
    scoreBefore: number,
    scan: VendorScan,
  ): Promise<void> {
    const drop = scoreBefore - scan.score;
    if (drop < vendor.alertThreshold) return;

    await this.db.from('vendor_alert_events').insert({
      vendor_id: vendor.id,
      scan_id: scan.id,
      score_before: scoreBefore,
      score_after: scan.score,
      drop,
      channels: ['push'],
    });

    this.logger.warn(
      `Alert: ${vendor.domain} score dropped ${drop} pts (${scoreBefore} → ${scan.score})`,
    );
  }

  private mapVendor(row: Record<string, unknown>): Vendor {
    return {
      id: row['id'] as string,
      orgId: row['org_id'] as string,
      name: row['name'] as string,
      domain: row['domain'] as string,
      tags: (row['tags'] as string[]) ?? [],
      tier: row['tier'] as Vendor['tier'],
      rescanIntervalDays: row['rescan_interval_days'] as number,
      alertThreshold: row['alert_threshold'] as number,
      lastScannedAt: (row['last_scanned_at'] as string | null) ?? null,
      createdAt: row['created_at'] as string,
      updatedAt: row['updated_at'] as string,
    };
  }

  private mapScan(row: Record<string, unknown>): VendorScan {
    return {
      id: row['id'] as string,
      vendorId: row['vendor_id'] as string,
      triggeredBy: row['triggered_by'] as VendorScan['triggeredBy'],
      score: row['score'] as number,
      grade: row['grade'] as VendorScan['grade'],
      breakdown: row['breakdown'] as Record<ScanCategory, CategoryResult>,
      findings: (row['findings'] as ScanFinding[]) ?? [],
      scorecardData: row['scorecard_data'] ?? null,
      scannedAt: row['scanned_at'] as string,
    };
  }

  private mapAnalysis(row: Record<string, unknown>): VendorAiAnalysis {
    return {
      id: row['id'] as string,
      scanId: row['scan_id'] as string,
      vendorId: row['vendor_id'] as string,
      summary: row['summary'] as string,
      riskRating: row['risk_rating'] as VendorAiAnalysis['riskRating'],
      recommendations: row['recommendations'] as VendorAiAnalysis['recommendations'],
      model: row['model'] as string,
      inputTokens: row['input_tokens'] as number,
      outputTokens: row['output_tokens'] as number,
      createdAt: row['created_at'] as string,
    };
  }
}

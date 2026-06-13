export type VendorTier = 'critical' | 'high' | 'medium' | 'low';
export type ScanGrade = 'A' | 'B' | 'C' | 'D' | 'F';
export type ScanMode = 'baseline' | 'deep';
export type ScanCategory = 'dns' | 'email' | 'tls' | 'web' | 'network' | 'breach' | 'reputation';
export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type VendorRiskLevel = 'critical' | 'high' | 'medium' | 'low';

export interface CategoryResult {
  score: number;
  grade: ScanGrade;
  findingCount: number;
}

export interface ScanFinding {
  category: ScanCategory;
  severity: FindingSeverity;
  title: string;
  detail: string;
  remediation: string;
}

export interface VendorScanResult {
  score: number;
  grade: ScanGrade;
  breakdown: Record<ScanCategory, CategoryResult>;
  findings: ScanFinding[];
  scorecardData?: unknown;
}

export interface VendorRiskStrategy {
  scan(domain: string, mode: ScanMode): Promise<VendorScanResult>;
}

export interface Vendor {
  id: string;
  orgId: string;
  name: string;
  domain: string;
  tags: string[];
  tier: VendorTier;
  rescanIntervalDays: number;
  alertThreshold: number;
  lastScannedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type VendorInput = Omit<
  Vendor,
  'id' | 'orgId' | 'lastScannedAt' | 'createdAt' | 'updatedAt'
>;

export interface VendorScan {
  id: string;
  vendorId: string;
  triggeredBy: 'manual' | 'scheduled' | 'deep';
  score: number;
  grade: ScanGrade;
  breakdown: Record<ScanCategory, CategoryResult>;
  findings: ScanFinding[];
  scorecardData: unknown | null;
  scannedAt: string;
}

export interface VendorAiAnalysis {
  id: string;
  scanId: string;
  vendorId: string;
  summary: string;
  riskRating: VendorRiskLevel;
  recommendations: Array<{ priority: number; action: string; effort: 'low' | 'medium' | 'high' }>;
  model: string;
  inputTokens: number;
  outputTokens: number;
  createdAt: string;
}

export interface VendorPostureInput {
  domain: string;
  findings: ScanFinding[];
  breakdown: Record<ScanCategory, CategoryResult>;
}

export interface VendorPostureResult {
  summary: string;
  riskRating: VendorRiskLevel;
  recommendations: Array<{ priority: number; action: string; effort: 'low' | 'medium' | 'high' }>;
}

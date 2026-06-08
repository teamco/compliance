export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatContext {
  orgId?: string;
  frameworkId?: string;
  pageContext?: string;
}

export interface ChatResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export interface OrgProfile {
  id: string;
  name: string;
  industry: string;
  size: string;
  regions: string[];
}

export interface GeneratedControl {
  id: string;
  title: string;
  description: string;
  implementationGuidance: string;
}

export interface StandardsResult {
  frameworkId: string;
  controls: GeneratedControl[];
}

export interface ControlFinding {
  controlId: string;
  status: 'compliant' | 'partial' | 'non-compliant';
  evidence?: string;
}

export type GapSeverity = 'critical' | 'high' | 'medium' | 'low';
export type RecommendationEffort = 'low' | 'medium' | 'high';

export interface GapItem {
  controlId: string;
  severity: GapSeverity;
  description: string;
}

export interface Recommendation {
  priority: number;
  action: string;
  effort: RecommendationEffort;
}

// A control finding enriched with its title, persisted alongside the AI result
// so the saved report can show a per-control compliance breakdown.
export interface GapFinding {
  controlId: string;
  title: string;
  status: 'compliant' | 'partial' | 'non-compliant';
  evidence?: string;
}

export interface GapAnalysisResult {
  summary: string;
  criticalGaps: GapItem[];
  recommendations: Recommendation[];
  riskScore: number;
  // Optional — attached client-side at save time; not produced by the model.
  findings?: GapFinding[];
}

export interface AiStrategy {
  chat(messages: ChatMessage[], context: ChatContext): Promise<ChatResult>;
  generateStandards(orgProfile: OrgProfile, frameworkIds: string[]): Promise<StandardsResult[]>;
  analyzeGap(controls: GeneratedControl[], findings: ControlFinding[]): Promise<GapAnalysisResult>;
}

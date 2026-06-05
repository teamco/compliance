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

export interface GapItem {
  controlId: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
}

export interface Recommendation {
  priority: number;
  action: string;
  effort: 'low' | 'medium' | 'high';
}

export interface GapAnalysisResult {
  summary: string;
  criticalGaps: GapItem[];
  recommendations: Recommendation[];
  riskScore: number;
}

export interface AiStrategy {
  chat(messages: ChatMessage[], context: ChatContext): Promise<ChatResult>;
  generateStandards(orgProfile: OrgProfile, frameworkIds: string[]): Promise<StandardsResult[]>;
  analyzeGap(controls: GeneratedControl[], findings: ControlFinding[]): Promise<GapAnalysisResult>;
}

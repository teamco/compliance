import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { CircuitBreaker, signedSend, type ComposeResilienceOpts } from '@icore/shared';
import type {
  ChatContext,
  ChatMessage,
  ChatResult,
  ControlFinding,
  GapAnalysisResult,
  GeneratedStandard,
  OrgProfile,
  StandardsResult,
  VendorPostureInput,
  VendorPostureResult,
} from '@icore/shared';
import { AI_CLIENT } from './ai-client.tokens';

// AI calls run through Anthropic and can be slow; without a timeout a dropped
// TCP socket to the AI MS leaves the gateway awaiting a reply that never comes,
// so the SSE stream hangs silently. Timing out rejects the promise → the
// gateway's catch surfaces an error to the browser instead of stalling.
const CHAT_TIMEOUT_MS = 90_000;
const BATCH_TIMEOUT_MS = 180_000;

// Retrying an in-flight LLM call risks double-spending tokens on a request
// that already reached Anthropic, so only network-level failures — which by
// definition happen before the AI MS could have started the call — are
// retried. A timeout of an already-dispatched request is never retried.
function isTransportError(err: unknown): boolean {
  const code = (err as { code?: string } | undefined)?.code;
  return code === 'ECONNREFUSED' || code === 'ECONNRESET' || code === 'EPIPE';
}

@Injectable()
export class AiClientService {
  // Shared across all four RPC patterns below — they hit the same downstream
  // AI MS, so failures in one operation should open the breaker for all of
  // them rather than tracking failure counts per-pattern.
  private readonly breaker = new CircuitBreaker({ failureThreshold: 5, resetTimeoutMs: 30_000 });

  constructor(@Inject(AI_CLIENT) private readonly client: ClientProxy) {}

  private resilience(ms: number): ComposeResilienceOpts {
    return {
      timeout: { ms },
      retry: { maxAttempts: 2, baseDelayMs: 500, isRetryable: isTransportError },
      circuitBreaker: this.breaker,
    };
  }

  chat(messages: ChatMessage[], context: ChatContext): Promise<ChatResult> {
    return signedSend<ChatResult>(
      this.client,
      'ai.chat',
      { messages, context },
      this.resilience(CHAT_TIMEOUT_MS),
    );
  }

  generateStandards(orgProfile: OrgProfile, frameworkIds: string[]): Promise<StandardsResult[]> {
    return signedSend<StandardsResult[]>(
      this.client,
      'ai.standards.generate',
      { orgProfile, frameworkIds },
      this.resilience(BATCH_TIMEOUT_MS),
    );
  }

  analyzeGap(
    standards: GeneratedStandard[],
    findings: ControlFinding[],
  ): Promise<GapAnalysisResult> {
    return signedSend<GapAnalysisResult>(
      this.client,
      'ai.gap.analyze',
      { standards, findings },
      this.resilience(BATCH_TIMEOUT_MS),
    );
  }

  analyzeVendorPosture(input: VendorPostureInput): Promise<VendorPostureResult> {
    return signedSend<VendorPostureResult>(
      this.client,
      'vendor.posture.analyze',
      input,
      this.resilience(BATCH_TIMEOUT_MS),
    );
  }
}

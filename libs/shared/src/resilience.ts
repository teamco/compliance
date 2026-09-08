// Retry / timeout / circuit-breaker / bulkhead primitives, their composition,
// a NestJS ClientProxy.send wrapper, and the MS-factory fallback helper.
// Implementation lives in @idevconn/nestjs-resilience; re-exported so every
// consumer keeps importing from @icore/shared.
export {
  withRetry,
  type RetryOpts,
  withTimeout,
  TimeoutError,
  type TimeoutOpts,
  Bulkhead,
  BulkheadRejectedError,
  type BulkheadOpts,
  CircuitBreaker,
  CircuitBreakerRegistry,
  CircuitOpenError,
  type CircuitBreakerOpts,
  type CircuitState,
  composeResilience,
  type ComposeResilienceOpts,
  type ComposeTimeoutOpts,
  resilientSend,
  buildStrategyWithFallback,
  type BuildStrategyOpts,
  type StrategyConfigReader,
} from '@idevconn/nestjs-resilience';

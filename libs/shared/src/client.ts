// Browser-safe subset of @icore/shared.
// Import from '@icore/shared/client' in client-side code to avoid pulling
// in NestJS / Node.js-only modules (transport, strategies, contracts).
export * from './abilities';
export * from './types';

// Pure helper with no NestJS dependency — safe to expose to the browser
// without re-exporting the rest of the notes DB-strategy contract.
export { effectiveExceptionStatus } from './strategies/notes';

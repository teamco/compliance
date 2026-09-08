// Server-side env helpers. NOT exported from ./client (browser-safe entry) —
// microservices import these to report which provider credentials are
// missing on startup instead of crashing. Implementation lives in
// @idevconn/nestjs-resilience; re-exported here so every consumer keeps
// importing from @icore/shared without caring where it comes from.
export {
  missingEnv,
  formatEnvBanner,
  requireEnv,
  formatGatewayBanner,
} from '@idevconn/nestjs-resilience';

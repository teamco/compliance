# Env changes — httpOnly-cookie-auth migration (PR #87/#88/#89/#90)

New/changed env vars introduced while migrating client auth off
localStorage tokens onto httpOnly cookies. Only `apps/api/.env` needs
changes — no other service's `.env` was touched.

## `apps/api/.env` — 2 new required vars

```bash
# Controls cookie security flags (Secure/SameSite) for the httpOnly auth
# cookies (icore_rt/icore_csrf) — MUST be `production` in any real
# deployment, or:
#   - refresh/CSRF cookies ship without Secure/SameSite=None, and CORS
#     credentials get rejected by browsers in cross-origin production setups
#   - Express `trust proxy` is NOT enabled, so @nestjs/throttler's per-IP
#     rate limiting on /auth/refresh keys on the reverse proxy's IP instead
#     of the real client's (only matters with a real proxy/LB in front —
#     leave this unset/`development` on a plain dev machine, and DO NOT set
#     to `production` unless there really is a reverse proxy in front, or
#     client IPs become spoofable via X-Forwarded-For)
NODE_ENV=development   # or `production` in real deployments

# Origin of the SPA client — used for CORS (credentials:true) and every
# auth redirect URL (login/register/magic-link/OAuth callback). Must exactly
# match the client's real origin (scheme+host+port). This var already
# existed before this migration for some routes; it's now load-bearing for
# ALL of them (cookie-issuing routes read it too).
CLIENT_ORIGIN=http://localhost:4200   # or the real client origin in prod
```

**On this machine, `NODE_ENV` is currently unset in `apps/api/.env`** —
add it when migrating. `CLIENT_ORIGIN` was already present.

## No other env changes

- No new vars in `apps/client/.env`, any `apps/microservices/*/.env`, or
  the root `.env`.
- No Supabase dashboard/project config changes required — the new
  `POST /auth/session/adopt` endpoint (magic-link/OAuth cookie fix, PR #87
  final-review fix) works entirely off the SPA redirect URLs Supabase
  already had allowlisted; nothing needed adding there.

## Related, not an env change but needed on a fresh machine

- `@idevconn/api-client` was bumped to `^0.3.3` (published to npm, not a
  local link) — a plain `yarn install` picks it up. If `yarn nx build`
  ever fails with `Object literal may only specify known properties, and
  'credentials' does not exist in type 'ApiClientConfig'`, `node_modules`
  still has the old `0.3.2` resolved — re-run `yarn install`.

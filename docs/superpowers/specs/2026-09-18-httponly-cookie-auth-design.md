# httpOnly Refresh-Cookie Auth — Design

## Problem

Both the access token and the refresh token live in `useAuthStore`
(`libs/template-shared/src/lib/stores/auth.store.ts`), a Zustand store
persisted to `localStorage` under the key `icore-auth`. Any XSS on the
client (a real risk surface — this app renders user-supplied text in
several places) can read `localStorage` directly and exfiltrate both
tokens. The refresh token is long-lived, so a stolen one grants
indefinite account access, not just a momentary window.

## Scope decisions confirmed by the user (do not re-ask)

- The design must support the client and gateway being deployed on
  **different origins** in the future, even though today they share a
  domain. This rules out a same-origin-only shortcut (plain
  `SameSite=Strict`, no CORS work) — cookies must work cross-origin
  (`SameSite=None; Secure`) and CORS must be configured with explicit
  `credentials: true` and a named origin (never a wildcard, which
  `credentials: true` rejects anyway).
- A brief loading state on every full page reload (while a silent
  refresh completes) is an acceptable trade-off — the access token is
  never persisted, so it must be re-minted from the httpOnly cookie on
  every fresh page load. No requirement for an instant, flash-free
  reload.
- The known cross-tab refresh race (see below) must be fixed as part
  of this design, not deferred.

## Architecture

**Approach chosen (of 3 discussed): hybrid token placement.** The access
token stays exactly as it is today — a short-lived JWT sent as
`Authorization: Bearer <token>` on every API call — except it now lives
in an in-memory JS variable instead of a persisted store. The refresh
token moves to an `httpOnly` cookie the browser manages entirely; no
JS on the page can ever read it, XSS or not.

This was chosen over two alternatives:

- **Full cookie session** (both tokens in cookies, no `Authorization`
  header at all) would need CSRF protection on every single mutating
  route in the app, not just one, and would require dropping
  `@idevconn/api-client` entirely rather than lightly forking it.
- **Do nothing structural, just shorten access-token TTL** doesn't
  address the actual ask — the refresh token would still sit in
  `localStorage`, still XSS-exfiltratable, still long-lived.

The hybrid keeps the blast radius of this change to one route
(`/auth/refresh`) needing CSRF protection, and keeps every other route
untouched — they still authenticate via the same `Authorization: Bearer`
header they always have, which isn't cookie-driven and so isn't a CSRF
target in the first place.

### New backend gap found during design: there is no logout endpoint today

`useAuthStore.logout()` is purely client-side — it just clears the
Zustand store. With the refresh token stored in localStorage, that was
harmless (nothing left to revoke was resident on the server anyway
beyond Supabase's own token). With the refresh token now living in an
httpOnly cookie the browser keeps sending, "logout" that doesn't tell
the server would leave the cookie live — the same token could mint new
access tokens indefinitely after the user thinks they've logged out.
`POST /auth/logout` is therefore a new, required part of this design,
not an optional nicety.

### Cookie flags are environment-conditional

`SameSite=None` requires `Secure` per spec, and `Secure` cookies aren't
sent back over plain `http://` except for a browser-specific
`localhost` exemption that doesn't extend to other non-TLS dev hosts.
Cookie flags must therefore branch on environment: production issues
`Secure; SameSite=None`; local dev issues `SameSite=Lax` with no
`Secure`. This must be driven by config (e.g. `NODE_ENV` /
`CLIENT_ORIGIN`), never hardcoded to one branch.

### Cross-tab refresh-token rotation race — fixed via Web Locks

Supabase's `refreshSession` already rotates the refresh token on every
call (confirmed in `SupabaseAuthStrategy.refresh`, `libs/auth-strategies/
supabase/src/lib/supabase-auth.strategy.ts:53-59` — this is Supabase's
own standard behavior, not something this design changes). If two
browser tabs both hit a 401 at the same moment and both independently
POST `/auth/refresh`, the second request's refresh token has already
been invalidated by the first's rotation, and that tab gets logged out
for no real reason.

Fixed by serializing the actual refresh network call across tabs with
the Web Locks API: `navigator.locks.request('icore-auth-refresh', {mode:
'exclusive'}, async () => { ...POST /auth/refresh... })`. Because the
refresh token itself is never held in JS (only in the browser's cookie
jar, which is shared storage across tabs of the same origin), a tab
that had to wait for the lock will, once it runs, send the browser's
now-current cookie value — not a stale one it cached itself — so its
request succeeds naturally. No cross-tab message-passing of token
values is needed, only serializing *when* the requests fire.
Browsers without Web Locks support (pre-15.4 Safari) fall back to
today's single-tab in-flight-promise dedup only; the rare race in that
one case is an accepted, undocumented-elsewhere edge case, not worth a
polyfill.

### `@idevconn/api-client` must be forked, not configured

Read the library's actual implementation (`node_modules/@idevconn/
api-client/dist/index.js`, ~80 lines, zero deps). Two hard blockers,
neither exposed as config:

1. Its internal `fetch()` calls (both the main request path and the
   internal `doRefresh()`) never set `credentials`, so they default to
   `'same-origin'` — cookies will never be sent cross-origin no matter
   how the gateway is configured.
2. `doRefresh()`'s POST body is fixed to `{[refreshRequestField]:
   getRefreshToken()}` with no way to attach an extra header — there is
   no hook to add the `X-CSRF-Token` header the double-submit design
   below needs.

`grep`-confirmed this library has exactly one consumer in the repo
(`libs/template-shared/src/lib/api/create-api.ts`). Forking a small,
internally-owned replacement with the same call-site shape (same
`createApiClient(config)` signature, same returned `ApiClient` function
type) is lower-risk than trying to route around a dependency that
can't do what's needed — replace the import, keep every call site
(`apps/client/src/lib/api.ts` and its consumers) unchanged.

## Components

**Backend:**

- `libs/shared/src/http/auth-cookies.ts` (new) — `setAuthCookies(res,
  {refreshToken, csrfToken})`, `clearAuthCookies(res)`,
  `readRefreshToken(req)`, `verifyCsrf(req)`. Single place owning cookie
  names (`icore_rt`, `icore_csrf`), flags, and TTL, including the
  environment-conditional `Secure`/`SameSite` branching above.
- `apps/api/src/app/auth/auth.controller.ts`:
  - `register`, `login`, `verifyMagicLink`, and the OAuth callback route
    gain a `@Res({ passthrough: true }) res: Response` parameter (where
    not already present) and call `setAuthCookies` before returning;
    their response bodies drop `refreshToken`, keeping only
    `{accessToken, user}`.
  - `refresh` is rewritten: reads the refresh token via
    `readRefreshToken(req)` (cookie, not body), calls `verifyCsrf(req)`
    (throws `ForbiddenException('csrf_mismatch')` on mismatch/missing),
    then proceeds as today; on success calls `setAuthCookies` again with
    the rotated pair.
  - New `POST /auth/logout`: calls the new strategy method below, then
    `clearAuthCookies(res)`. Idempotent — a missing/already-expired
    cookie is not an error.
- `AuthStrategy` interface (`libs/shared/src/strategies/auth.ts`) plus
  `SupabaseAuthStrategy` and `FakeAuthStrategy`: new
  `revokeSession(refreshToken: string): Promise<void>` method. The
  exact `supabase-js` admin call this wraps (revoke-by-refresh-token vs.
  a scoped `signOut`) needs verifying against the installed SDK version
  during plan-writing — not yet confirmed which surface exists.
- `apps/api/src/main.ts`: no `enableCors` call exists anywhere in this
  codebase today. Add one with an explicit `origin` (from
  `CLIENT_ORIGIN` config, never `*`) and `credentials: true` — required
  for cross-origin cookies to work at all, and harmless for the current
  same-origin deployment.

**Client:**

- `apps/client/src/lib/access-token.ts` (new) — the access token as a
  module-level variable with a getter/setter. Not part of any store,
  not persisted.
- `apps/client/src/lib/csrf.ts` (new) — reads the `icore_csrf` cookie
  value out of `document.cookie` (it's intentionally not `httpOnly`, so
  this is a plain string read, not a security boundary by itself — the
  boundary is the double-submit comparison happening server-side).
- Forked replacement for `@idevconn/api-client`
  (`libs/template-shared/src/lib/api/create-api-client.ts`, new, next
  to the existing `create-api.ts`): same `createApiClient(config)`
  shape, plus `credentials: 'include'` on both fetch call sites, an
  `X-CSRF-Token` header attached only to the refresh call, and the
  Web Locks serialization around the refresh call described above.
- `create-api.ts` — imports the fork instead of the npm package,
  `getAccessToken`/`onTokenRefreshed` wired to the new in-memory module
  instead of `useAuthStore`.
- `useAuthStore` — drops `accessToken` and `refreshToken` fields
  entirely; keeps only `user` (still persisted, so the corner
  email/avatar can render instantly on reload before the silent refresh
  resolves — this is display-only, no request depends on it).
- New `AuthBootstrap` wrapper (mounted high in `apps/client/src/app/
  app.tsx`, before protected routes render): on mount, reads the CSRF
  cookie (already present from the last login, survives reload) and
  calls the refresh endpoint with `credentials: 'include'`; shows a
  loading state until it resolves either way. Success populates the
  in-memory access token and `useAuthStore.user`; failure (no valid
  cookie) proceeds straight to the unauthenticated state — not an error
  to surface to the user, just "not logged in."
- `auth.callback.tsx`, `auth.oauth.callback.tsx`, `login.tsx`: replace
  their `useAuthStore.setAuth(session)` token-carrying calls with
  `setAccessToken(session.accessToken)` for the token half;
  `useAuthStore` now only ever receives `user`.
- New `POST /auth/logout` call site wired into wherever the app's
  existing logout UI action lives; clears the in-memory access token
  and `useAuthStore`'s `user` after the server call resolves.

## Data flow

**Login / register / magic-link / OAuth (first sign-in):**
1. Client → the relevant auth endpoint, no cookies involved yet.
2. Backend authenticates via Supabase, gets `{accessToken, refreshToken,
   user}`.
3. Backend responds with `Set-Cookie: icore_rt=...; HttpOnly; Secure;
   SameSite=None; Path=/api/auth` and `Set-Cookie: icore_csrf=...;
   Secure; SameSite=None; Path=/api/auth` (not `HttpOnly` — JS must be
   able to read this one), plus body `{accessToken, user}`.
4. Client stores `accessToken` in memory, `user` in `useAuthStore`.

**Reload / new tab (silent refresh):**
1. `AuthBootstrap` on mount reads `icore_csrf` from `document.cookie`,
   POSTs `/auth/refresh` with `credentials: 'include'` and
   `X-CSRF-Token: <value>`, inside a Web Locks-guarded section.
2. Backend: the browser already attached `icore_rt` automatically;
   compares the CSRF header to the CSRF cookie, calls
   `strategy.refresh(refreshToken)`, which Supabase rotates.
3. Backend re-issues both cookies with the new values, responds with
   the new `accessToken`.
4. Client sets the in-memory token, renders routes. No valid cookie ⇒
   401/403 ⇒ render the unauthenticated state directly, no error toast.

**Ordinary API call:**
- Unchanged: `Authorization: Bearer <in-memory token>`. The cookies'
  `Path=/api/auth` scoping means they are never even sent on these
  requests.
- A 401 triggers the same Web-Locks-guarded refresh-and-retry path as
  the boot sequence; final failure triggers the existing
  `onUnauthorized` → redirect-to-login behavior, unchanged.

**Logout:**
1. `POST /auth/logout` — an ordinary Bearer-authenticated call, no CSRF
   needed (it isn't cookie-driven).
2. Backend calls `revokeSession` with the cookie's refresh token, then
   `clearAuthCookies(res)`.
3. Client clears the in-memory token and `useAuthStore.user`.

## Error handling

- Missing/mismatched `X-CSRF-Token` on refresh → `403
  ForbiddenException('csrf_mismatch')`.
- Missing/expired `icore_rt` cookie → `401`, reusing the strategy's
  existing `invalid_refresh_token` message.
- `POST /auth/logout` with no cookie present → succeeds silently
  (idempotent), not an error.
- Cookie flags branch on environment as described above — this is a
  config concern, not a runtime error path, but getting it wrong either
  breaks local dev (cookies silently dropped) or ships an insecure
  cookie to production, so it's called out explicitly here rather than
  left to be discovered.
- Cross-tab refresh-token rotation race: fixed via Web Locks (see
  Architecture) rather than left as a known limitation, per explicit
  user decision.

## Testing

- **Backend:** unit tests for `auth-cookies.ts`'s pure helper functions
  (set/clear/verify-CSRF) in isolation. Extend
  `auth.controller.unit.test.ts`'s existing `makeRes()` fixture (it
  already captures `res.cookie()`/`res.clearCookie()` calls) to assert
  on `res.cookies['icore_rt']` / `icore_csrf` for login/register/verify/
  refresh instead of asserting on response-body tokens. New tests for
  `refresh` (CSRF mismatch → 403, missing cookie → 401, success →
  both cookies rotate) and the new `logout` route (revocation called,
  idempotent on a missing cookie).
- **Client:** unit tests for the forked api-client replacement
  (`credentials: 'include'` present on both fetch call sites, the
  `X-CSRF-Token` header attached only on the refresh path, `navigator.
  locks.request` mocked to verify two concurrent refresh calls actually
  serialize). Trivial unit tests for `access-token.ts` (getter/setter)
  and `csrf.ts` (cookie-string parsing, including the empty/missing
  case).
- **Live Playwright (mandatory, this is a UI-behavior change per
  `AGENTS.md`):** log in → reload the page → confirm the session
  survives and `localStorage.getItem('icore-auth')` contains no token
  fields → log out → confirm a subsequent refresh attempt fails (cookie
  cleared).

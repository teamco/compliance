# httpOnly Refresh-Cookie Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the refresh token out of `localStorage` (XSS-exfiltratable today via `useAuthStore`'s persisted Zustand state) into an `httpOnly` cookie the browser alone controls; keep the access token as a `Bearer`-header value, now held only in memory. Add the logout endpoint this app never had. Fix a cross-tab refresh-token-rotation race along the way, per explicit decision.

**Architecture:** Hybrid token placement (see spec). One route (`POST /auth/refresh`) becomes cookie-driven and CSRF-protected via double-submit cookie; every other route is untouched — still `Authorization: Bearer` as today. Two repositories are touched: `@idevconn/api-client` (published npm package, separate repo, needs two small additive config options) and this `compliance` monorepo (the actual feature).

**Tech Stack:** NestJS gateway (`apps/api`) + auth microservice (`apps/microservices/auth`), `@supabase/supabase-js` auth, Vite/React 19 client, Vitest, Web Locks API, `cookie-parser` (already installed and wired).

**Spec:** `docs/superpowers/specs/2026-09-18-httponly-cookie-auth-design.md`

## Global Constraints

- Cross-origin-capable by requirement: cookies use `SameSite=None; Secure` in production, `SameSite=Lax` (no `Secure`) in local dev — branch on `NODE_ENV`, mirroring the exact pattern already used for the `oauth_state` cookie in `apps/api/src/app/auth/auth.controller.ts:336-341`.
- Cookie names: `icore_rt` (httpOnly, the refresh token) and `icore_csrf` (NOT httpOnly, a random double-submit value). Both scoped `path: '/api/auth'` — never sent on ordinary API calls.
- `X-CSRF-Token` header is required and verified ONLY on `POST /auth/refresh`. No other route becomes cookie-authenticated or CSRF-checked.
- `revokeSession` takes the caller's own **access token** (`scope: 'local'` via `supabase-js`'s `GoTrueAdminApi.signOut(jwt, scope)`), never the refresh token — confirmed against the installed `@supabase/auth-js` typings.
- Every response body that used to include `refreshToken` (`register`, `login`, `verifyMagicLink`, and the OAuth callback's redirect fragment) drops it — the cookie carries it now, never the JSON/fragment.
- `@idevconn/api-client` lives in a separate repo at `/home/vladimir-tkach/Projects/api-client` (not a path inside `compliance`) — Task 1 works there; every other task works in `/home/vladimir-tkach/Projects/compliance`. Do not confuse the two working directories.
- Task 1 must be published (or at minimum built + version-bumped) before Task 8, which depends on consuming the new config fields from `compliance`'s `package.json` dependency.
- Post-coding routine before every commit in `compliance`: `npx prettier --write <files>` → `yarn nx lint <project>` → `yarn nx build <project>`. In `api-client`: `npm run typecheck && npm run test && npm run lint`.
- Any UI change requires a live Playwright verification pass before being reported done (`AGENTS.md`'s non-negotiable rule) — Task 13.

---

### Task 1: `@idevconn/api-client` — add `credentials` and `getRefreshHeaders` config

**Repo:** `/home/vladimir-tkach/Projects/api-client` (separate git repo — work here, not in `compliance`)

**Files:**
- Modify: `src/types.ts`
- Modify: `src/create-api-client.ts`
- Test: `src/__tests__/create-api-client.test.ts`

**Interfaces:**
- Produces: `ApiClientConfig.credentials?: RequestCredentials` — passed to every `fetch()` call this library makes.
- Produces: `ApiClientConfig.getRefreshHeaders?: () => Record<string, string>` — called fresh on each refresh attempt, merged into the refresh request's headers.

- [ ] **Step 1: Write the failing tests**

In `src/__tests__/create-api-client.test.ts`, add these two tests directly after the existing `'honors custom refresh field names'` test:

```ts
  it('passes credentials through to both the main request and the refresh request', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(
        jsonResponse({ access_token: 'access-2', refresh_token: 'refresh-2' }),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    const api = createApiClient(makeConfig({ credentials: 'include' }));
    await api('/protected');

    for (const call of fetchMock.mock.calls) {
      const init = call[1] as RequestInit;
      expect(init.credentials).toBe('include');
    }
  });

  it('merges getRefreshHeaders into the refresh request only, not the main request', async () => {
    const getRefreshHeaders = vi.fn(() => ({ 'X-CSRF-Token': 'csrf-abc' }));
    fetchMock
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(
        jsonResponse({ access_token: 'access-2', refresh_token: 'refresh-2' }),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    const api = createApiClient(makeConfig({ getRefreshHeaders }));
    await api('/protected');

    const mainCallHeaders = new Headers((fetchMock.mock.calls[0]![1] as RequestInit).headers);
    expect(mainCallHeaders.get('X-CSRF-Token')).toBeNull();
    const refreshCallHeaders = new Headers((fetchMock.mock.calls[1]![1] as RequestInit).headers);
    expect(refreshCallHeaders.get('X-CSRF-Token')).toBe('csrf-abc');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- -t "credentials|getRefreshHeaders"`
Expected: FAIL — `credentials` and `getRefreshHeaders` aren't recognized config fields yet, so `init.credentials` is `undefined` and the CSRF header is never set.

- [ ] **Step 3: Add the two config fields to the type**

In `src/types.ts`, find the `refreshTokenField?: string;` line (the last field before the closing `}`) and add directly after it:

```ts
  /**
   * Passed through to every `fetch()` call this client makes (both the main
   * request and the internal refresh request). Needed to send cookies on
   * cross-origin requests (`'include'`). Default: browser default
   * (`'same-origin'`).
   */
  credentials?: RequestCredentials;

  /**
   * Extra headers merged into the refresh request only — e.g. a CSRF
   * double-submit token read from a cookie. Called fresh on every refresh
   * attempt, never cached.
   */
  getRefreshHeaders?: () => Record<string, string>;
```

- [ ] **Step 4: Wire `credentials` into both fetch call sites**

In `src/create-api-client.ts`, find the `fetch(`${cfg.baseUrl}${cfg.refreshPath}`` call inside `doRefresh()` and change:

```ts
      const res = await fetch(`${cfg.baseUrl}${cfg.refreshPath}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [cfg.refreshRequestField]: refreshToken }),
      });
```

to:

```ts
      const res = await fetch(`${cfg.baseUrl}${cfg.refreshPath}`, {
        method: "POST",
        credentials: cfg.credentials,
        headers: {
          "Content-Type": "application/json",
          ...cfg.getRefreshHeaders?.(),
        },
        body: JSON.stringify({ [cfg.refreshRequestField]: refreshToken }),
      });
```

Then find the two `fetch(`${cfg.baseUrl}${path}`` calls inside the returned `api` function (the initial request and the post-refresh retry) and add `credentials: cfg.credentials,` to both `{ ...options, headers }` object literals, making each:

```ts
      res = await fetch(`${cfg.baseUrl}${path}`, { ...options, headers, credentials: cfg.credentials });
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test`
Expected: PASS — all tests, including the 2 new ones.

- [ ] **Step 6: Typecheck, lint, build**

```bash
npm run typecheck
npm run lint
npm run build
```

Expected: all green.

- [ ] **Step 7: Version bump and publish**

```bash
npx changeset add
```

Pick `patch` (additive, backward-compatible config fields — no breaking change), write a summary like "Add `credentials` and `getRefreshHeaders` config options for cookie-based refresh flows." Then:

```bash
npx changeset version
npm run build
npm publish
```

Note the resulting version number (e.g. `0.3.3`) — Task 8 in `compliance` needs it.

- [ ] **Step 8: Commit**

```bash
git add src/types.ts src/create-api-client.ts src/__tests__/create-api-client.test.ts package.json CHANGELOG.md .changeset
git commit -m "feat: add credentials and getRefreshHeaders config options"
```

---

### Task 2: `compliance` — cookie + CSRF helpers

**Repo:** `/home/vladimir-tkach/Projects/compliance`

**Files:**
- Create: `libs/shared/src/http/auth-cookies.ts`
- Test: `libs/shared/src/http/__tests__/auth-cookies.unit.test.ts`
- Modify: `libs/shared/src/index.ts` (export the new module, matching how every other `libs/shared` submodule is re-exported — find the existing export list and add `export * from './http/auth-cookies';` alongside it)

**Interfaces:**
- Produces: `setAuthCookies(res: Response, opts: { refreshToken: string; csrfToken: string; isProd: boolean }): void`
- Produces: `clearAuthCookies(res: Response, opts: { isProd: boolean }): void`
- Produces: `readRefreshToken(req: Request): string | undefined`
- Produces: `verifyCsrf(req: Request): boolean` — compares the `X-CSRF-Token` header to the `icore_csrf` cookie.
- Produces: `generateCsrfToken(): string` — a random string for the double-submit cookie.

- [ ] **Step 1: Write the failing tests**

Create `libs/shared/src/http/__tests__/auth-cookies.unit.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import {
  setAuthCookies,
  clearAuthCookies,
  readRefreshToken,
  verifyCsrf,
  generateCsrfToken,
} from '../auth-cookies';

function makeRes(): Response {
  return { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as Response;
}

describe('setAuthCookies', () => {
  it('sets icore_rt as httpOnly and icore_csrf as readable, both scoped to /api/auth', () => {
    const res = makeRes();
    setAuthCookies(res, { refreshToken: 'rt-1', csrfToken: 'csrf-1', isProd: false });

    expect(res.cookie).toHaveBeenCalledWith(
      'icore_rt',
      'rt-1',
      expect.objectContaining({ httpOnly: true, path: '/api/auth' }),
    );
    expect(res.cookie).toHaveBeenCalledWith(
      'icore_csrf',
      'csrf-1',
      expect.objectContaining({ httpOnly: false, path: '/api/auth' }),
    );
  });

  it('uses Secure + SameSite=None in production', () => {
    const res = makeRes();
    setAuthCookies(res, { refreshToken: 'rt-1', csrfToken: 'csrf-1', isProd: true });

    const rtCall = (res.cookie as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0] === 'icore_rt',
    );
    expect(rtCall![2]).toMatchObject({ secure: true, sameSite: 'none' });
  });

  it('uses no Secure + SameSite=Lax outside production', () => {
    const res = makeRes();
    setAuthCookies(res, { refreshToken: 'rt-1', csrfToken: 'csrf-1', isProd: false });

    const rtCall = (res.cookie as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0] === 'icore_rt',
    );
    expect(rtCall![2]).toMatchObject({ secure: false, sameSite: 'lax' });
  });
});

describe('clearAuthCookies', () => {
  it('clears both cookies at the same path they were set on', () => {
    const res = makeRes();
    clearAuthCookies(res, { isProd: false });

    expect(res.clearCookie).toHaveBeenCalledWith('icore_rt', expect.objectContaining({ path: '/api/auth' }));
    expect(res.clearCookie).toHaveBeenCalledWith('icore_csrf', expect.objectContaining({ path: '/api/auth' }));
  });
});

describe('readRefreshToken', () => {
  it('reads icore_rt from req.cookies', () => {
    const req = { cookies: { icore_rt: 'rt-1' } } as unknown as Request;
    expect(readRefreshToken(req)).toBe('rt-1');
  });

  it('returns undefined when no cookie is present', () => {
    const req = { cookies: {} } as unknown as Request;
    expect(readRefreshToken(req)).toBeUndefined();
  });
});

describe('verifyCsrf', () => {
  it('returns true when the header matches the cookie', () => {
    const req = {
      cookies: { icore_csrf: 'csrf-1' },
      headers: { 'x-csrf-token': 'csrf-1' },
    } as unknown as Request;
    expect(verifyCsrf(req)).toBe(true);
  });

  it('returns false when the header does not match the cookie', () => {
    const req = {
      cookies: { icore_csrf: 'csrf-1' },
      headers: { 'x-csrf-token': 'wrong' },
    } as unknown as Request;
    expect(verifyCsrf(req)).toBe(false);
  });

  it('returns false when either is missing', () => {
    const req = { cookies: {}, headers: {} } as unknown as Request;
    expect(verifyCsrf(req)).toBe(false);
  });
});

describe('generateCsrfToken', () => {
  it('returns a non-empty random string, different each call', () => {
    const a = generateCsrfToken();
    const b = generateCsrfToken();
    expect(a).toBeTruthy();
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `yarn nx test shared -t "auth-cookies|setAuthCookies|clearAuthCookies|readRefreshToken|verifyCsrf|generateCsrfToken"`
Expected: FAIL — module doesn't exist yet.

- [ ] **Step 3: Implement the module**

Create `libs/shared/src/http/auth-cookies.ts`:

```ts
import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';

const REFRESH_COOKIE = 'icore_rt';
const CSRF_COOKIE = 'icore_csrf';
const COOKIE_PATH = '/api/auth';
const REFRESH_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function cookieOptions(isProd: boolean, httpOnly: boolean) {
  return {
    httpOnly,
    secure: isProd,
    sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
    path: COOKIE_PATH,
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
  };
}

export function setAuthCookies(
  res: Response,
  opts: { refreshToken: string; csrfToken: string; isProd: boolean },
): void {
  res.cookie(REFRESH_COOKIE, opts.refreshToken, cookieOptions(opts.isProd, true));
  res.cookie(CSRF_COOKIE, opts.csrfToken, cookieOptions(opts.isProd, false));
}

export function clearAuthCookies(res: Response, opts: { isProd: boolean }): void {
  res.clearCookie(REFRESH_COOKIE, cookieOptions(opts.isProd, true));
  res.clearCookie(CSRF_COOKIE, cookieOptions(opts.isProd, false));
}

export function readRefreshToken(req: Request): string | undefined {
  return (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
}

export function verifyCsrf(req: Request): boolean {
  const cookieValue = (req.cookies as Record<string, string> | undefined)?.[CSRF_COOKIE];
  const headerValue = req.headers['x-csrf-token'];
  if (!cookieValue || !headerValue || typeof headerValue !== 'string') return false;
  return cookieValue === headerValue;
}

export function generateCsrfToken(): string {
  return randomBytes(32).toString('hex');
}
```

- [ ] **Step 4: Export from `libs/shared`**

In `libs/shared/src/index.ts`, find the existing `export * from './strategies/auth';` line (or the nearest similar submodule export) and add directly after it:

```ts
export * from './http/auth-cookies';
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `yarn nx test shared -t "auth-cookies|setAuthCookies|clearAuthCookies|readRefreshToken|verifyCsrf|generateCsrfToken"`
Expected: PASS — all tests.

- [ ] **Step 6: Format, lint, build**

```bash
npx prettier --write libs/shared/src/http/auth-cookies.ts libs/shared/src/http/__tests__/auth-cookies.unit.test.ts libs/shared/src/index.ts
yarn nx lint shared
yarn nx build shared
```

- [ ] **Step 7: Commit**

```bash
git add libs/shared/src/http/auth-cookies.ts libs/shared/src/http/__tests__/auth-cookies.unit.test.ts libs/shared/src/index.ts
git commit -m "feat(shared): add httpOnly refresh-cookie + CSRF helpers"
```

---

### Task 3: `compliance` — `revokeSession` across all 5 layers

**Repo:** `/home/vladimir-tkach/Projects/compliance`

**Files:**
- Modify: `libs/shared/src/strategies/auth.ts` (interface)
- Modify: `libs/shared/src/strategies/fakes/fake-auth.ts`
- Modify: `libs/auth-strategies/supabase/src/lib/supabase-auth.strategy.ts`
- Modify: `apps/microservices/auth/src/app/auth.controller.ts`
- Modify: `libs/auth-client/src/lib/auth-client.service.ts`
- Test: `libs/shared/src/strategies/fakes/__tests__/fake-auth.unit.test.ts`
- Test: `libs/auth-client/src/lib/__tests__/auth-client.service.unit.test.ts`

**Interfaces:**
- Produces: `AuthStrategy.revokeSession(accessToken: string): Promise<void>`
- Produces: `AuthClientService.revokeSession(accessToken: string): Promise<void>`

- [ ] **Step 1: Write the failing Fake-strategy test**

In `libs/shared/src/strategies/fakes/__tests__/fake-auth.unit.test.ts`, add this test (find the existing `describe('FakeAuthStrategy.listOrgIdsForMember', ...)` block and add a new sibling `describe` directly after it):

```ts
describe('FakeAuthStrategy.revokeSession', () => {
  it('invalidates the access token so verifyToken rejects it afterward', async () => {
    const strategy = new FakeAuthStrategy();
    const session = await strategy.signUp('revoke@example.com', 'password123');

    await strategy.revokeSession(session.accessToken);

    await expect(strategy.verifyToken(session.accessToken)).rejects.toThrow('invalid_token');
  });

  it('is a no-op for an already-invalid access token (idempotent)', async () => {
    const strategy = new FakeAuthStrategy();
    await expect(strategy.revokeSession('never-issued')).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn nx test shared -t "revokeSession"`
Expected: FAIL — `strategy.revokeSession is not a function`.

- [ ] **Step 3: Add `revokeSession` to the `AuthStrategy` interface**

In `libs/shared/src/strategies/auth.ts`, find `refresh(refreshToken: string): Promise<AuthSession>;` and add directly after it:

```ts
  revokeSession(accessToken: string): Promise<void>;
```

- [ ] **Step 4: Implement in `FakeAuthStrategy`**

In `libs/shared/src/strategies/fakes/fake-auth.ts`, find the existing `async refresh(refreshToken: string): Promise<AuthSession> {` method and add directly after its closing `}`:

```ts
  async revokeSession(accessToken: string): Promise<void> {
    this.tokensToUid.delete(accessToken);
  }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `yarn nx test shared -t "revokeSession"`
Expected: PASS — both tests.

- [ ] **Step 6: Implement in `SupabaseAuthStrategy`**

In `libs/auth-strategies/supabase/src/lib/supabase-auth.strategy.ts`, find `async refresh(refreshToken: string): Promise<AuthSession> {` and add directly after its closing `}`:

```ts
  async revokeSession(accessToken: string): Promise<void> {
    const { error } = await this.client.auth.admin.signOut(accessToken, 'local');
    if (error) throw new Error(error.message);
  }
```

Not covered by a unit test — this repo has no dedicated Supabase-strategy unit test file for admin-API calls; live-verified in Task 13 instead, matching this codebase's established convention for Supabase-only code paths.

- [ ] **Step 7: Add the microservice message handler**

In `apps/microservices/auth/src/app/auth.controller.ts`, find `@MessagePattern('auth.setRole')` and add directly before it:

```ts
  @MessagePattern('auth.revokeSession')
  async revokeSession(@Payload() payload: { accessToken: string }): Promise<{ ok: boolean }> {
    await this.strategy.revokeSession(payload.accessToken);
    return { ok: true };
  }
```

- [ ] **Step 8: Write the failing `AuthClientService` test**

In `libs/auth-client/src/lib/__tests__/auth-client.service.unit.test.ts`, find the existing test for `setRole` (or the nearest `signedSend`-mocking test) and add a new one following the exact same pattern for `revokeSession`, mocking `signedSend` to resolve `{ ok: true }` and asserting it was called with `('auth.revokeSession', { accessToken: '<value>' })`. Match this file's existing mock-setup style exactly — read the file first to copy its precise `vi.mock`/import shape before writing the new test, since the exact mock scaffolding must match what's already there.

- [ ] **Step 9: Run the test to verify it fails**

Run: `yarn nx test auth-client -t "revokeSession"`
Expected: FAIL — `AuthClientService.revokeSession` doesn't exist yet.

- [ ] **Step 10: Add the gateway client method**

In `libs/auth-client/src/lib/auth-client.service.ts`, find `setRole(uid: string, role: string): Promise<void> {` and add directly after its closing `}`:

```ts
  revokeSession(accessToken: string): Promise<void> {
    return signedSend<{ ok: boolean }>(this.client, 'auth.revokeSession', { accessToken }).then(
      () => undefined,
    );
  }
```

- [ ] **Step 11: Run the tests to verify they pass**

Run: `yarn nx test shared -t "revokeSession"` then `yarn nx test auth-client -t "revokeSession"`
Expected: PASS.

- [ ] **Step 12: Format, lint, build**

```bash
npx prettier --write libs/shared/src/strategies/auth.ts libs/shared/src/strategies/fakes/fake-auth.ts libs/shared/src/strategies/fakes/__tests__/fake-auth.unit.test.ts libs/auth-strategies/supabase/src/lib/supabase-auth.strategy.ts apps/microservices/auth/src/app/auth.controller.ts libs/auth-client/src/lib/auth-client.service.ts libs/auth-client/src/lib/__tests__/auth-client.service.unit.test.ts
yarn nx lint shared && yarn nx lint auth-strategies-supabase && yarn nx lint auth && yarn nx lint auth-client
yarn nx build shared && yarn nx build auth-strategies-supabase && yarn nx build auth && yarn nx build auth-client
```

(Run `yarn nx show project auth-strategies-supabase` first if that project name doesn't match — confirm the exact nx project name for `libs/auth-strategies/supabase` before running.)

- [ ] **Step 13: Commit**

```bash
git add libs/shared/src/strategies/auth.ts libs/shared/src/strategies/fakes/fake-auth.ts libs/shared/src/strategies/fakes/__tests__/fake-auth.unit.test.ts libs/auth-strategies/supabase/src/lib/supabase-auth.strategy.ts apps/microservices/auth/src/app/auth.controller.ts libs/auth-client/src/lib/auth-client.service.ts libs/auth-client/src/lib/__tests__/auth-client.service.unit.test.ts
git commit -m "feat(auth): add revokeSession across all strategy layers"
```

---

### Task 4: `compliance` — cookie-issuing on login/register/magic-link-verify + CORS

**Files:**
- Modify: `apps/api/src/app/auth/auth.controller.ts`
- Modify: `apps/api/src/main.ts`
- Test: `apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts`

**Interfaces:**
- Consumes: `setAuthCookies`, `generateCsrfToken` (Task 2).
- `register`/`login`/`verifyMagicLink` response bodies change from `{accessToken, refreshToken, user}` to `{accessToken, user}`.

- [ ] **Step 1: Write the failing tests**

In `apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts`, find `describe('AuthController (gateway) — magic-link', ...)` and replace the whole block with (the existing 3 tests plus 3 new cookie-asserting ones):

```ts
describe('AuthController (gateway) — magic-link', () => {
  it('requestMagicLink builds callback URL from CLIENT_ORIGIN', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({ CLIENT_ORIGIN: 'https://my.app' }));
    await controller.requestMagicLink({ email: 'a@x.com' });
    expect(client.sendMagicLink).toHaveBeenCalledWith('a@x.com', 'https://my.app/auth/callback');
  });

  it('requestMagicLink falls back to http://localhost:4200 when CLIENT_ORIGIN unset', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}));
    await controller.requestMagicLink({ email: 'a@x.com' });
    expect(client.sendMagicLink).toHaveBeenCalledWith(
      'a@x.com',
      'http://localhost:4200/auth/callback',
    );
  });

  it('verifyMagicLink forwards the token, sets auth cookies, and returns accessToken+user only', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}));
    const res = makeRes();
    const session = await controller.verifyMagicLink(
      { token: 'tok' },
      res as unknown as import('express').Response,
    );
    expect(client.verifyMagicLink).toHaveBeenCalledWith('tok');
    expect(session).toEqual({ accessToken: 'at', user: { id: 'u1', email: 'a@x.com' } });
    expect(res.cookies['icore_rt']).toBe('rt');
    expect(res.cookies['icore_csrf']).toBeTruthy();
  });

  it('login sets auth cookies and returns accessToken+user only', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}));
    const res = makeRes();
    const session = await controller.login(
      { email: 'a@x.com', password: 'pw' },
      res as unknown as import('express').Response,
    );
    expect(session).toEqual({ accessToken: 'at', user: { id: 'u1', email: 'a@x.com' } });
    expect(res.cookies['icore_rt']).toBe('rt');
    expect(res.cookies['icore_csrf']).toBeTruthy();
  });

  it('register sets auth cookies and returns accessToken+user only', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}));
    const res = makeRes();
    const session = await controller.register(
      { email: 'a@x.com', password: 'password123' },
      res as unknown as import('express').Response,
    );
    expect(session).toEqual({ accessToken: 'at', user: { id: 'u1', email: 'a@x.com' } });
    expect(res.cookies['icore_rt']).toBe('rt');
  });
});
```

Note: `login`'s existing mock in `makeAuthClient()` resolves `{accessToken:'at', refreshToken:'rt', expiresIn:3600, user:{id:'u1',email:'a@x.com'}}` — reuse it, but confirm `client.login`/`client.signup`/`client.verifyMagicLink` in `makeAuthClient()` all return this exact shape before writing these assertions (read the file's current `makeAuthClient()` first — if any of the three use a different mock, align the test's expected `session` shape with whatever `AuthSession`-shaped mock that mock actually returns).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `yarn nx test api -t "AuthController .gateway. — magic-link"`
Expected: FAIL — `verifyMagicLink`/`login`/`register` don't yet accept a `res` param, don't set cookies, and still return `refreshToken` in the body.

- [ ] **Step 3: Add `isProd` resolution and rewire `register`**

In `apps/api/src/app/auth/auth.controller.ts`, add this import at the top (alongside the existing `@icore/shared` import — merge into the existing `import type {...} from '@icore/shared'` line's non-type siblings, or add a second import line):

```ts
import { setAuthCookies, generateCsrfToken } from '@icore/shared';
```

Add this private helper right after the `assertProvider` function (top-level, before the `@ApiTags` class decorator):

Actually — add it as a private method on the class instead, since it needs `this.cfg`. Find the closing `}` of the `uid` private method (the last method in the class) and add directly before the class's final closing `}`:

```ts
  private isProd(): boolean {
    return this.cfg.get<string>('NODE_ENV') === 'production';
  }
```

Then find `async register(@Body() body: { email: string; password: string }) {` and replace its signature and body:

```ts
  async register(
    @Body() body: { email: string; password: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const session = await this.authClient.signup(body.email, body.password);
      const csrfToken = generateCsrfToken();
      setAuthCookies(res, {
        refreshToken: session.refreshToken,
        csrfToken,
        isProd: this.isProd(),
      });
      return { accessToken: session.accessToken, user: session.user };
    } catch (err) {
      const msg =
        (err as { message?: string; code?: string })?.message ??
        (err as { code?: string })?.code ??
        '';
      if (msg === 'email_confirmation_required') {
        throw new BadRequestException('email_confirmation_required');
      }
      throw err;
    }
  }
```

- [ ] **Step 4: Rewire `login`**

Find:

```ts
  login(@Body() body: { email: string; password: string }) {
    return this.authClient.login(body.email, body.password);
  }
```

Replace with:

```ts
  async login(
    @Body() body: { email: string; password: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.authClient.login(body.email, body.password);
    const csrfToken = generateCsrfToken();
    setAuthCookies(res, { refreshToken: session.refreshToken, csrfToken, isProd: this.isProd() });
    return { accessToken: session.accessToken, user: session.user };
  }
```

- [ ] **Step 5: Rewire `verifyMagicLink`**

Find:

```ts
  verifyMagicLink(@Body() body: { token: string }) {
    return this.authClient.verifyMagicLink(body.token);
  }
```

Replace with:

```ts
  async verifyMagicLink(
    @Body() body: { token: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.authClient.verifyMagicLink(body.token);
    const csrfToken = generateCsrfToken();
    setAuthCookies(res, { refreshToken: session.refreshToken, csrfToken, isProd: this.isProd() });
    return { accessToken: session.accessToken, user: session.user };
  }
```

- [ ] **Step 6: Enable CORS in `main.ts`**

In `apps/api/src/main.ts`, find `app.use(cookieParser());` and add directly after it:

```ts
  app.enableCors({
    origin: process.env['CLIENT_ORIGIN'] ?? 'http://localhost:4200',
    credentials: true,
  });
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `yarn nx test api -t "AuthController .gateway. — magic-link"`
Expected: PASS — all 6 tests.

- [ ] **Step 8: Run the full `api` suite to check for regressions**

Run: `yarn nx test api`
Expected: PASS — other tests that call `login`/`register`/`verifyMagicLink` without a `res` argument will now fail to compile/run; fix each by adding `makeRes()` as the second argument, matching Step 1's pattern. Search the whole test file for other call sites of these three methods first (`grep -n "controller.login(\|controller.register(\|controller.verifyMagicLink(" apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts`) and update every one found.

- [ ] **Step 9: Format, lint, build**

```bash
npx prettier --write apps/api/src/app/auth/auth.controller.ts apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts apps/api/src/main.ts
yarn nx lint api
yarn nx build api
```

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/app/auth/auth.controller.ts apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts apps/api/src/main.ts
git commit -m "feat(auth): issue httpOnly refresh cookie on login/register/magic-link-verify; enable CORS"
```

---

### Task 5: `compliance` — cookie-driven, CSRF-protected `/auth/refresh`

**Files:**
- Modify: `apps/api/src/app/auth/auth.controller.ts`
- Test: `apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts`

**Interfaces:**
- Consumes: `readRefreshToken`, `verifyCsrf`, `setAuthCookies`, `generateCsrfToken` (Task 2).
- `POST /auth/refresh` no longer takes `refreshToken` in the body.

- [ ] **Step 1: Write the failing tests**

Add a new `describe` block in `apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts`, directly after the (now-updated) `describe('AuthController (gateway) — magic-link', ...)` block:

```ts
describe('AuthController (gateway) — refresh', () => {
  it('rejects when the CSRF header does not match the CSRF cookie', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}));
    const req = {
      cookies: { icore_rt: 'rt-1', icore_csrf: 'csrf-1' },
      headers: { 'x-csrf-token': 'wrong' },
    } as unknown as import('express').Request;
    const res = makeRes();
    await expect(
      controller.refresh(req, res as unknown as import('express').Response),
    ).rejects.toThrow(ForbiddenException);
    expect(client.refresh).not.toHaveBeenCalled();
  });

  it('rejects when there is no refresh cookie', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}));
    const req = {
      cookies: {},
      headers: {},
    } as unknown as import('express').Request;
    const res = makeRes();
    await expect(
      controller.refresh(req, res as unknown as import('express').Response),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('on success, calls refresh with the cookie token and re-issues both cookies', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}));
    const req = {
      cookies: { icore_rt: 'rt-1', icore_csrf: 'csrf-1' },
      headers: { 'x-csrf-token': 'csrf-1' },
    } as unknown as import('express').Request;
    const res = makeRes();
    const result = await controller.refresh(req, res as unknown as import('express').Response);
    expect(client.refresh).toHaveBeenCalledWith('rt-1');
    expect(result).toEqual({ accessToken: 'at', user: { id: 'u1', email: 'a@x.com' } });
    expect(res.cookies['icore_rt']).toBe('rt');
    expect(res.cookies['icore_csrf']).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `yarn nx test api -t "AuthController .gateway. — refresh"`
Expected: FAIL — `refresh` still reads `body.refreshToken`, doesn't check CSRF, doesn't set cookies.

- [ ] **Step 3: Rewire `refresh`**

Find:

```ts
  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Exchange a refresh token for a fresh access token' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['refreshToken'],
      properties: { refreshToken: { type: 'string' } },
    },
  })
  refresh(@Body() body: { refreshToken: string }) {
    return this.authClient.refresh(body.refreshToken);
  }
```

Replace with:

```ts
  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Exchange the httpOnly refresh cookie for a fresh access token' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!verifyCsrf(req)) throw new ForbiddenException('csrf_mismatch');
    const refreshToken = readRefreshToken(req);
    if (!refreshToken) throw new UnauthorizedException('invalid_refresh_token');
    const session = await this.authClient.refresh(refreshToken);
    const csrfToken = generateCsrfToken();
    setAuthCookies(res, { refreshToken: session.refreshToken, csrfToken, isProd: this.isProd() });
    return { accessToken: session.accessToken, user: session.user };
  }
```

Add `readRefreshToken` and `verifyCsrf` to the `@icore/shared` import added in Task 4 (extend that same import line to `{ setAuthCookies, generateCsrfToken, readRefreshToken, verifyCsrf }`).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `yarn nx test api -t "AuthController .gateway. — refresh"`
Expected: PASS — all 3 tests.

- [ ] **Step 5: Run the full `api` suite for regressions**

Run: `yarn nx test api`
Expected: PASS. Any other test calling `controller.refresh(...)` with the old `{refreshToken}` body signature needs updating to the new `(req, res)` signature — search and fix as in Task 4 Step 8.

- [ ] **Step 6: Format, lint, build**

```bash
npx prettier --write apps/api/src/app/auth/auth.controller.ts apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts
yarn nx lint api
yarn nx build api
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/app/auth/auth.controller.ts apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts
git commit -m "feat(auth): make /auth/refresh cookie-driven and CSRF-protected"
```

---

### Task 6: `compliance` — `POST /auth/logout`

**Files:**
- Modify: `apps/api/src/app/auth/auth.controller.ts`
- Test: `apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts`

**Interfaces:**
- Consumes: `AuthClientService.revokeSession` (Task 3), `clearAuthCookies` (Task 2).
- Produces: `POST /auth/logout` — Bearer-authenticated (not `@Public()`), no request body.

- [ ] **Step 1: Write the failing tests**

Add a new `describe` block directly after the `describe('AuthController (gateway) — refresh', ...)` block:

```ts
describe('AuthController (gateway) — logout', () => {
  it('revokes the session using the caller access token and clears both cookies', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}));
    const req = {
      headers: { authorization: 'Bearer access-token-1' },
    } as unknown as import('express').Request;
    const res = makeRes();
    await controller.logout(req, res as unknown as import('express').Response);
    expect(client.revokeSession).toHaveBeenCalledWith('access-token-1');
    expect(res.cookieCleared).toBe(true);
  });

  it('is idempotent when there is no Authorization header', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}));
    const req = { headers: {} } as unknown as import('express').Request;
    const res = makeRes();
    await expect(
      controller.logout(req, res as unknown as import('express').Response),
    ).resolves.toEqual({ ok: true });
    expect(client.revokeSession).not.toHaveBeenCalled();
  });
});
```

Add `revokeSession: vi.fn().mockResolvedValue(undefined),` to the `makeAuthClient()` factory's returned object.

Check `makeRes()`'s existing `cookieCleared` getter (already present per the file's current `oauthCallback` tests) tracks calls to `clearCookie` generically — if it only flips true on a SPECIFIC cookie name today, verify it also fires for `icore_rt`/`icore_csrf`, not just `oauth_state`; read the current `makeRes()` implementation before relying on this assertion, and adjust the test to check `res.clearCookie` was called with `'icore_rt'` and `'icore_csrf'` directly via `vi.fn()` call inspection instead, if `cookieCleared` turns out to be a single shared boolean flag that doesn't distinguish cookie names (the safer, more precise assertion either way).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `yarn nx test api -t "AuthController .gateway. — logout"`
Expected: FAIL — `controller.logout` doesn't exist.

- [ ] **Step 3: Implement `logout`**

Find the `@Post('refresh')` route block (now ending after Task 5's rewritten `refresh` method) and add this new route directly after it:

```ts
  @Post('logout')
  @ApiOperation({ summary: 'Revoke this session and clear the refresh cookie' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const authHeader = req.headers.authorization;
    const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    if (accessToken) {
      await this.authClient.revokeSession(accessToken);
    }
    clearAuthCookies(res, { isProd: this.isProd() });
    return { ok: true };
  }
```

Add `clearAuthCookies` to the `@icore/shared` import.

Note: this route is intentionally NOT `@Public()` in the sense of skipping the standard auth guard's token verification — but it must tolerate a missing/invalid token gracefully rather than 401ing, since "logout" should always succeed from the client's point of view even if the access token already expired. Verify how the existing `@Public()` decorator / global auth guard interacts here: if the guard normally throws before the handler runs for a route without `@Public()`, either mark this route `@Public()` too (reading the token manually as shown above, which is what the code above already assumes) or confirm the guard tolerates an expired/missing token and still invokes the handler. Check `apps/api/src/app/auth/auth.guard.ts` (or wherever the global guard lives) before finalizing — if it does NOT tolerate a missing token, add `@Public()` to this route so the manual header-parsing above is reachable at all.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `yarn nx test api -t "AuthController .gateway. — logout"`
Expected: PASS.

- [ ] **Step 5: Format, lint, build**

```bash
npx prettier --write apps/api/src/app/auth/auth.controller.ts apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts
yarn nx lint api
yarn nx build api
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/app/auth/auth.controller.ts apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts
git commit -m "feat(auth): add POST /auth/logout"
```

---

### Task 7: `compliance` — cookie-issuing on the OAuth callback

**Files:**
- Modify: `apps/api/src/app/auth/auth.controller.ts`
- Test: `apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts`

**Interfaces:**
- The OAuth callback's redirect fragment drops `refreshToken`.

- [ ] **Step 1: Write the failing test**

Find the existing test `'oauthCallback exchanges + redirects to the client with a fragment'` in `describe('AuthController (gateway) — OAuth', ...)` and replace it:

```ts
  it('oauthCallback exchanges, sets auth cookies, and redirects with accessToken only in the fragment', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({ CLIENT_ORIGIN: 'http://client' }));
    const res = makeRes();
    const req = { cookies: { oauth_state: 'abc' } } as unknown as import('express').Request;
    await controller.oauthCallback(
      'google',
      'code-xyz',
      'abc',
      req,
      res as unknown as import('express').Response,
    );
    expect(client.completeOAuth).toHaveBeenCalledWith('google', 'code-xyz', 'abc');
    expect(res.cookieCleared).toBe(true);
    expect(res.cookies['icore_rt']).toBe('rt');
    expect(res.redirectedTo).toContain('http://client/auth/oauth/callback#');
    expect(res.redirectedTo).toContain('accessToken=at');
    expect(res.redirectedTo).not.toContain('refreshToken=');
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn nx test api -t "oauthCallback exchanges"`
Expected: FAIL — the fragment still includes `refreshToken=rt` and no `icore_rt` cookie is set.

- [ ] **Step 3: Rewire `oauthCallback`**

Find:

```ts
    const session = await this.authClient.completeOAuth(provider, code, state);
    res.clearCookie('oauth_state');
    const origin = this.cfg.get<string>('CLIENT_ORIGIN') ?? 'http://localhost:4200';
    const fragment = new URLSearchParams({
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      userId: session.user.id,
      email: session.user.email,
    });
    return res.redirect(`${origin}/auth/oauth/callback#${fragment.toString()}`);
```

Replace with:

```ts
    const session = await this.authClient.completeOAuth(provider, code, state);
    res.clearCookie('oauth_state');
    const csrfToken = generateCsrfToken();
    setAuthCookies(res, { refreshToken: session.refreshToken, csrfToken, isProd: this.isProd() });
    const origin = this.cfg.get<string>('CLIENT_ORIGIN') ?? 'http://localhost:4200';
    const fragment = new URLSearchParams({
      accessToken: session.accessToken,
      userId: session.user.id,
      email: session.user.email,
    });
    return res.redirect(`${origin}/auth/oauth/callback#${fragment.toString()}`);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn nx test api -t "oauthCallback exchanges"`
Expected: PASS.

- [ ] **Step 5: Run the full `api` suite for regressions**

Run: `yarn nx test api`
Expected: PASS.

- [ ] **Step 6: Format, lint, build**

```bash
npx prettier --write apps/api/src/app/auth/auth.controller.ts apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts
yarn nx lint api
yarn nx build api
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/app/auth/auth.controller.ts apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts
git commit -m "feat(auth): issue httpOnly refresh cookie on OAuth callback; drop refreshToken from redirect fragment"
```

---

### Task 8: `compliance` — access-token + CSRF + shared silent-refresh modules

All three modules live in `libs/template-shared`, not `apps/client` — `create-api.ts` and `fetch-with-refresh.ts` (Task 9) both live in `template-shared` and both need these, and Nx's dependency graph does not allow a `libs/*` package to import from `apps/client`. `useAuthStore` already sets this precedent (a client-auth primitive living in `template-shared`, consumed by `apps/client`) — these three follow it.

**Files:**
- Create: `libs/template-shared/src/lib/api/access-token.ts`
- Create: `libs/template-shared/src/lib/api/csrf.ts`
- Create: `libs/template-shared/src/lib/api/silent-refresh.ts`
- Test: `libs/template-shared/src/lib/api/__tests__/access-token.unit.test.ts`
- Test: `libs/template-shared/src/lib/api/__tests__/csrf.unit.test.ts`
- Test: `libs/template-shared/src/lib/api/__tests__/silent-refresh.unit.test.ts`
- Modify: `libs/template-shared/src/index.ts` (public exports for all three — every later task that imports `setAccessToken`/`performSilentRefresh`/etc. from `@icore/template-shared` depends on this)
- Modify: `package.json` (bump `@idevconn/api-client` to the version published in Task 1)

**Interfaces:**
- Produces: `getAccessToken(): string | null`, `setAccessToken(token: string | null): void`
- Produces: `readCsrfCookie(): string | null`
- Produces: `performSilentRefresh(baseUrl: string): Promise<{ accessToken: string; user: { id: string; email: string } } | null>` — calls `setAccessToken` on success itself.

- [ ] **Step 1: Write the failing access-token test**

Create `libs/template-shared/src/lib/api/__tests__/access-token.unit.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { getAccessToken, setAccessToken } from '../access-token.js';

describe('access-token', () => {
  beforeEach(() => {
    setAccessToken(null);
  });

  it('starts as null', () => {
    expect(getAccessToken()).toBeNull();
  });

  it('returns whatever was last set', () => {
    setAccessToken('token-1');
    expect(getAccessToken()).toBe('token-1');
    setAccessToken('token-2');
    expect(getAccessToken()).toBe('token-2');
  });

  it('can be cleared back to null', () => {
    setAccessToken('token-1');
    setAccessToken(null);
    expect(getAccessToken()).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `yarn nx test template-shared -t "access-token"`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement `access-token.ts`**

Create `libs/template-shared/src/lib/api/access-token.ts`:

```ts
let currentToken: string | null = null;

export function getAccessToken(): string | null {
  return currentToken;
}

export function setAccessToken(token: string | null): void {
  currentToken = token;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `yarn nx test template-shared -t "access-token"`
Expected: PASS.

- [ ] **Step 5: Write the failing CSRF test**

Create `libs/template-shared/src/lib/api/__tests__/csrf.unit.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { readCsrfCookie } from '../csrf.js';

describe('readCsrfCookie', () => {
  afterEach(() => {
    document.cookie = 'icore_csrf=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/';
  });

  it('returns null when the cookie is not present', () => {
    expect(readCsrfCookie()).toBeNull();
  });

  it('reads the value when present among other cookies', () => {
    document.cookie = 'other=1';
    document.cookie = 'icore_csrf=abc123';
    expect(readCsrfCookie()).toBe('abc123');
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `yarn nx test template-shared -t "readCsrfCookie"`
Expected: FAIL — module doesn't exist.

- [ ] **Step 7: Implement `csrf.ts`**

Create `libs/template-shared/src/lib/api/csrf.ts`. This is the ONE place this regex lives — `silent-refresh.ts` (Step 11 below) and `create-api.ts` (Task 9) both import it rather than each re-implementing their own copy:

```ts
export function readCsrfCookie(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)icore_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}
```

- [ ] **Step 8: Run it to verify it passes**

Run: `yarn nx test template-shared -t "readCsrfCookie"`
Expected: PASS.

- [ ] **Step 9: Write the failing `performSilentRefresh` tests**

Create `libs/template-shared/src/lib/api/__tests__/silent-refresh.unit.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { performSilentRefresh } from '../silent-refresh.js';

const BASE = 'http://test/api';

function jsonResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('performSilentRefresh', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    document.cookie = 'icore_csrf=csrf-abc';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    document.cookie = 'icore_csrf=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/';
  });

  it('sends credentials and the CSRF header, returns the session on success', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { accessToken: 'fresh', user: { id: 'u1', email: 'u@x.com' } }),
    );

    const result = await performSilentRefresh(BASE);

    expect(result).toEqual({ accessToken: 'fresh', user: { id: 'u1', email: 'u@x.com' } });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${BASE}/auth/refresh`);
    expect(init?.credentials).toBe('include');
    expect(new Headers(init?.headers).get('X-CSRF-Token')).toBe('csrf-abc');
  });

  it('returns null on a non-ok response', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401));
    expect(await performSilentRefresh(BASE)).toBeNull();
  });

  it('returns null on a network failure', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    expect(await performSilentRefresh(BASE)).toBeNull();
  });

  it('serializes two concurrent calls through navigator.locks when available', async () => {
    const lockRequest = vi.fn(async (_name: string, fn: () => Promise<unknown>) => fn());
    vi.stubGlobal('navigator', { locks: { request: lockRequest } });

    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { accessToken: 'a', user: { id: 'u1', email: 'e' } }))
      .mockResolvedValueOnce(jsonResponse(200, { accessToken: 'b', user: { id: 'u1', email: 'e' } }));

    await Promise.all([performSilentRefresh(BASE), performSilentRefresh(BASE)]);

    expect(lockRequest).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 10: Run the tests to verify they fail**

Run: `yarn nx test template-shared -t "performSilentRefresh"`
Expected: FAIL — module doesn't exist.

- [ ] **Step 11: Implement `silent-refresh.ts`**

Create `libs/template-shared/src/lib/api/silent-refresh.ts`:

```ts
import { readCsrfCookie } from './csrf.js';
import { setAccessToken } from './access-token.js';

interface SilentRefreshResult {
  accessToken: string;
  user: { id: string; email: string };
}

async function doRefresh(baseUrl: string): Promise<SilentRefreshResult | null> {
  const csrf = readCsrfCookie();
  try {
    const res = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: csrf ? { 'X-CSRF-Token': csrf } : {},
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<SilentRefreshResult>;
    if (typeof data.accessToken !== 'string' || !data.user) return null;
    return { accessToken: data.accessToken, user: data.user };
  } catch {
    return null;
  }
}

/**
 * Serializes the actual refresh network call across browser tabs via the
 * Web Locks API. The refresh token itself is never held in JS — only in the
 * httpOnly cookie the browser manages — so a tab that waited for the lock
 * sends whatever cookie value is current by the time it runs, not a stale
 * one it cached itself. Falls back to an unguarded call where Web Locks
 * isn't available (pre-15.4 Safari): the rare cross-tab race in that one
 * case is an accepted edge case, not worth a polyfill.
 */
export async function performSilentRefresh(baseUrl: string): Promise<SilentRefreshResult | null> {
  const locks = (globalThis as { navigator?: { locks?: LockManager } }).navigator?.locks;
  const result = locks
    ? await locks.request('icore-auth-refresh', () => doRefresh(baseUrl))
    : await doRefresh(baseUrl);
  if (result) setAccessToken(result.accessToken);
  return result;
}
```

- [ ] **Step 12: Run the tests to verify they pass**

Run: `yarn nx test template-shared -t "performSilentRefresh"`
Expected: PASS — all 4 tests.

- [ ] **Step 13: Export all three from the package's public entry point**

In `libs/template-shared/src/index.ts`, find the existing export line for `stores/auth.store` (or the nearest analogous one) and add directly after it:

```ts
export * from './lib/api/access-token';
export * from './lib/api/csrf';
export * from './lib/api/silent-refresh';
```

- [ ] **Step 14: Bump `@idevconn/api-client`**

In `package.json`, find the `"@idevconn/api-client"` dependency line and bump it to the version published in Task 1's Step 7 (e.g. `"^0.3.3"`). Run `yarn install` to update the lockfile.

- [ ] **Step 15: Format, lint, build**

```bash
npx prettier --write libs/template-shared/src/lib/api/access-token.ts libs/template-shared/src/lib/api/csrf.ts libs/template-shared/src/lib/api/silent-refresh.ts libs/template-shared/src/lib/api/__tests__/access-token.unit.test.ts libs/template-shared/src/lib/api/__tests__/csrf.unit.test.ts libs/template-shared/src/lib/api/__tests__/silent-refresh.unit.test.ts libs/template-shared/src/index.ts
yarn nx lint template-shared
yarn nx build template-shared
```

- [ ] **Step 16: Commit**

```bash
git add libs/template-shared/src/lib/api/access-token.ts libs/template-shared/src/lib/api/csrf.ts libs/template-shared/src/lib/api/silent-refresh.ts libs/template-shared/src/lib/api/__tests__/access-token.unit.test.ts libs/template-shared/src/lib/api/__tests__/csrf.unit.test.ts libs/template-shared/src/lib/api/__tests__/silent-refresh.unit.test.ts libs/template-shared/src/index.ts package.json yarn.lock
git commit -m "feat(template-shared): add in-memory access-token store, CSRF cookie reader, shared silent-refresh helper"
```

---

### Task 9: `compliance` — rewire `create-api.ts` and `fetch-with-refresh.ts`

**Files:**
- Modify: `libs/template-shared/src/lib/api/create-api.ts`
- Modify: `libs/template-shared/src/lib/api/fetch-with-refresh.ts`
- Test: `libs/template-shared/src/lib/api/__tests__/fetch-with-refresh.unit.test.ts`

**Interfaces:**
- Consumes: `getAccessToken`/`setAccessToken` (Task 8, `libs/template-shared/src/lib/api/access-token.ts`).
- Consumes: `performSilentRefresh` (Task 8).
- Consumes: `readCsrfCookie` (Task 8, `libs/template-shared/src/lib/api/csrf.ts`).

- [ ] **Step 1: Write the failing `fetch-with-refresh` tests**

Replace the entire contents of `libs/template-shared/src/lib/api/__tests__/fetch-with-refresh.unit.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAccessToken, setAccessToken } from '../access-token.js';
import { fetchWithRefresh } from '../fetch-with-refresh.js';
import * as silentRefresh from '../silent-refresh.js';

const BASE = 'http://test/api';

function jsonResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('fetchWithRefresh', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    setAccessToken('live');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    fetchMock.mockReset();
    setAccessToken(null);
  });

  it('attaches Authorization from the in-memory token and passes through non-401 responses', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    const res = await fetchWithRefresh(BASE, '/ai/chat', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${BASE}/ai/chat`);
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer live');
  });

  it('on 401: calls performSilentRefresh, retries with the new token', async () => {
    vi.spyOn(silentRefresh, 'performSilentRefresh').mockResolvedValueOnce({
      accessToken: 'fresh',
      user: { id: 'u1', email: 'u@x.com' },
    });
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401)) // original request
      .mockResolvedValueOnce(jsonResponse(200, { ok: true })); // retry

    const res = await fetchWithRefresh(BASE, '/ai/chat', { method: 'POST' });

    expect(res.status).toBe(200);
    const retryInit = fetchMock.mock.calls[1]![1];
    expect(new Headers(retryInit?.headers).get('Authorization')).toBe('Bearer fresh');
    expect(getAccessToken()).toBe('fresh');
  });

  it('on refresh rejection: returns the original 401 and clears the in-memory token', async () => {
    vi.spyOn(silentRefresh, 'performSilentRefresh').mockResolvedValueOnce(null);
    fetchMock.mockResolvedValueOnce(jsonResponse(401));

    const res = await fetchWithRefresh(BASE, '/ai/chat');

    expect(res.status).toBe(401);
    expect(getAccessToken()).toBeNull();
  });

  it('without an access token: still attempts the request (no Authorization header)', async () => {
    setAccessToken(null);
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    await fetchWithRefresh(BASE, '/ai/chat');
    const init = fetchMock.mock.calls[0]![1];
    expect(new Headers(init?.headers).has('Authorization')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `yarn nx test template-shared -t "fetchWithRefresh"`
Expected: FAIL — `fetchWithRefresh` still reads `useAuthStore`, not `access-token.ts`, and doesn't call `performSilentRefresh`.

- [ ] **Step 3: Rewrite `fetch-with-refresh.ts`**

Replace the entire contents of `libs/template-shared/src/lib/api/fetch-with-refresh.ts`:

```ts
import { getAccessToken, setAccessToken } from './access-token.js';
import { performSilentRefresh } from './silent-refresh.js';

/**
 * fetch with Authorization from the in-memory access token and a single
 * 401 → refresh → retry pass. For raw/streaming requests (e.g. SSE) that
 * cannot go through the JSON api client — mirrors its refresh behavior
 * against the same shared `performSilentRefresh` helper.
 */
export async function fetchWithRefresh(
  baseUrl: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const doFetch = (token: string | null) => {
    const headers = new Headers(init.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(`${baseUrl}${path}`, { ...init, headers });
  };

  let res = await doFetch(getAccessToken());
  if (res.status === 401) {
    const refreshed = await performSilentRefresh(baseUrl);
    if (refreshed) {
      res = await doFetch(refreshed.accessToken);
    } else {
      setAccessToken(null);
    }
  }
  return res;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `yarn nx test template-shared -t "fetchWithRefresh"`
Expected: PASS — all 4 tests.

- [ ] **Step 5: Rewire `create-api.ts`**

Read the current `libs/template-shared/src/lib/api/create-api.ts` first (it may have drifted from what Task 8/9's design assumed) and replace its contents with:

```ts
import { createApiClient } from '@idevconn/api-client';
import { getAccessToken, setAccessToken } from './access-token.js';
import { readCsrfCookie } from './csrf.js';

export function createIcoreApi(opts: { baseUrl: string; onUnauthorized?: () => void }) {
  return createApiClient({
    baseUrl: opts.baseUrl,
    credentials: 'include',
    getAccessToken: () => getAccessToken(),
    getRefreshToken: () => 'cookie', // real token lives only in the httpOnly cookie; this is just a truthy guard
    getRefreshHeaders: () => {
      const csrf = readCsrfCookie();
      return csrf ? { 'X-CSRF-Token': csrf } : {};
    },
    onTokenRefreshed: ({ accessToken }) => setAccessToken(accessToken),
    onUnauthorized: () => {
      setAccessToken(null);
      opts.onUnauthorized?.();
    },
    refreshPath: '/auth/refresh',
  });
}

export { ApiError } from '@idevconn/api-client';
```

Note: this does NOT route through `performSilentRefresh`/Web Locks — the underlying `@idevconn/api-client` library still owns its own refresh call internally (Task 1 only added `credentials`/`getRefreshHeaders` passthrough, not a pluggable refresh implementation). This means the main JSON API client and `fetchWithRefresh` have two independent refresh code paths that could still race across tabs against each other specifically (both hitting `/auth/refresh` at once from different code paths in the same tab is already deduped by the library's own `inFlightRefresh`, but a `fetchWithRefresh` call in one tab racing the library's own refresh in another tab is not covered by Web Locks here). **This is a known residual gap versus the spec's "fixed via Web Locks" intent for this one call path — flag it in the task's self-review and decide whether to accept it (the race's consequence is just an extra login-again for one tab, same as the original documented limitation) or take on a larger follow-up patching `@idevconn/api-client` itself to accept a pluggable refresh function instead of two config fields, before merging this task.**

- [ ] **Step 6: Run the full `template-shared` and `client` suites for regressions**

Run: `yarn nx test template-shared` then `yarn nx test client`
Expected: PASS. Any test that stubbed `useAuthStore`'s `accessToken`/`refreshToken` fields directly (rather than `access-token.ts`) will fail — fix each to use `setAccessToken`/`getAccessToken` instead, per this task's new contract.

- [ ] **Step 7: Format, lint, build**

```bash
npx prettier --write libs/template-shared/src/lib/api/create-api.ts libs/template-shared/src/lib/api/fetch-with-refresh.ts libs/template-shared/src/lib/api/__tests__/fetch-with-refresh.unit.test.ts
yarn nx lint template-shared && yarn nx lint client
yarn nx build template-shared && yarn nx build client
```

- [ ] **Step 8: Commit**

```bash
git add libs/template-shared/src/lib/api/create-api.ts libs/template-shared/src/lib/api/fetch-with-refresh.ts libs/template-shared/src/lib/api/__tests__/fetch-with-refresh.unit.test.ts
git commit -m "feat(client): rewire create-api.ts and fetch-with-refresh.ts onto the in-memory access token + shared silent refresh"
```

---

### Task 10: `compliance` — trim `useAuthStore`, rewire callback routes

**Files:**
- Modify: `libs/template-shared/src/lib/stores/auth.store.ts`
- Modify: `apps/client/src/routes/auth.callback.tsx`
- Modify: `apps/client/src/routes/auth.oauth.callback.tsx`
- Modify: `apps/client/src/routes/login.tsx`
- Test: `apps/client/src/routes/__tests__/auth.callback.unit.test.tsx`
- Test: `apps/client/src/routes/__tests__/login.unit.test.tsx`

**Interfaces:**
- `useAuthStore.setAuth` signature changes from `{accessToken, refreshToken, user}` to `{user}`.
- Consumes: `setAccessToken` (Task 8/9, from `libs/template-shared/src/lib/api/access-token.ts`).

- [ ] **Step 1: Rewrite `auth.store.ts`**

Replace the entire contents of `libs/template-shared/src/lib/stores/auth.store.ts`:

```ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AuthUser {
  id: string;
  email: string;
  role?: string;
}

export interface AuthState {
  user: AuthUser | null;
  setUser: (user: AuthUser) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      setUser: (user) => set({ user }),
      logout: () => set({ user: null }),
    }),
    { name: 'icore-auth' },
  ),
);

export function useIsAdmin(): boolean {
  return useAuthStore((s) => s.user?.role === 'admin') ?? false;
}
```

Note: `setAuth` is renamed to `setUser` and no longer takes token fields — every call site across the codebase must be updated in this same task (grep for `useAuthStore.*setAuth\|\.setAuth(` across `apps/client/src` before finishing this task and fix every hit, not just the 3 files listed above if more exist).

- [ ] **Step 2: Rewire `auth.callback.tsx`**

Read the current file (it has the `resolveHashSession`/`resolveToken` logic from an earlier, already-merged fix). Replace the `useEffect` body's two `setAuth(hashSession)` / `setAuth(session)` calls: each now becomes `setAccessToken(session.accessToken); setUser(session.user);` (import `setAccessToken` from `libs/template-shared`'s `access-token.ts` re-export, and destructure `setUser` from `useAuthStore` instead of `setAuth`). The existing best-effort `/auth/me` role-backfill block's `setAuth({...hashSession, user: {...}})` call becomes `setUser({ ...hashSession.user, role: me.role })`.

- [ ] **Step 3: Update `auth.callback.unit.test.tsx`**

No changes needed if the existing tests only exercise the pure `resolveHashSession` function (they do, per the file's current content) — confirm this remains true after Step 2's edit; the pure function itself is untouched by this task.

- [ ] **Step 4: Rewire `auth.oauth.callback.tsx`**

Replace its `setAuth({ accessToken, refreshToken, user: { id: userId, email } })` call with `setAccessToken(accessToken); setUser({ id: userId, email });`. Its best-effort role-backfill `setAuth({...})` call becomes `setUser({ id: userId, email, role: me.role })`. Remove the now-unused `refreshToken` variable if nothing else in the file reads it after this change (check — the fragment parsing itself can stay, since the OAuth callback route from Task 7 still doesn't send a `refreshToken` param in the fragment anymore, so `params.get('refresh_token') ?? params.get('refreshToken')` will simply always resolve `null`; leave the parsing code as dead-but-harmless or remove it — prefer removing it, since the cookie makes it genuinely unreachable now, not just currently-empty).

- [ ] **Step 5: Rewire `login.tsx`**

In `handlePasswordSubmit` and `handleRegisterSubmit`, both currently do:

```ts
      const session = await api<{
        accessToken: string;
        refreshToken: string;
        user: { id: string; email: string; role?: string };
      }>('/auth/login', { ... });
      setAuth(session);
```

Change the inline response type to drop `refreshToken` (`{accessToken: string; user: {...}}`), and replace `setAuth(session)` with `setAccessToken(session.accessToken); setUser(session.user);` in both handlers. Import `setAccessToken` and `useAuthStore`'s `setUser` selector at the top (the file already imports `useAuthStore` — just also destructure `setUser` instead of `setAuth`).

- [ ] **Step 6: Update `login.unit.test.tsx`**

Confirm the existing tests only exercise the pure `isSafeReturnTo` function (they do) — no changes needed, same reasoning as Step 3.

- [ ] **Step 7: Run the full `client` and `template-shared` suites**

Run: `yarn nx test client` then `yarn nx test template-shared`
Expected: PASS. Fix any remaining `setAuth`/`accessToken`/`refreshToken` store references this task's grep in Step 1 turned up but weren't explicitly listed here.

- [ ] **Step 8: Format, lint, build**

```bash
npx prettier --write libs/template-shared/src/lib/stores/auth.store.ts apps/client/src/routes/auth.callback.tsx apps/client/src/routes/auth.oauth.callback.tsx apps/client/src/routes/login.tsx
yarn nx lint client && yarn nx lint template-shared
yarn nx build client && yarn nx build template-shared
```

- [ ] **Step 9: Commit**

```bash
git add libs/template-shared/src/lib/stores/auth.store.ts apps/client/src/routes/auth.callback.tsx apps/client/src/routes/auth.oauth.callback.tsx apps/client/src/routes/login.tsx
git commit -m "feat(client): trim useAuthStore to user-only, rewire callback routes onto in-memory access token"
```

---

### Task 11: `compliance` — `AuthBootstrap` silent-refresh-on-boot

**Files:**
- Create: `apps/client/src/app/auth-bootstrap.tsx`
- Test: `apps/client/src/app/__tests__/auth-bootstrap.unit.test.tsx`
- Modify: `apps/client/src/main.tsx`

**Interfaces:**
- Consumes: `performSilentRefresh` (Task 8), `useAuthStore.setUser` (Task 10).

- [ ] **Step 1: Write the failing test**

Create `apps/client/src/app/__tests__/auth-bootstrap.unit.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import * as silentRefresh from '@icore/template-shared';
import { useAuthStore } from '@icore/template-shared';
import { AuthBootstrap } from '../auth-bootstrap';

vi.mock('@icore/template-shared', async () => {
  const actual = await vi.importActual<typeof import('@icore/template-shared')>(
    '@icore/template-shared',
  );
  return { ...actual, performSilentRefresh: vi.fn() };
});

describe('AuthBootstrap', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null });
  });

  it('shows a loading state, then renders children once the refresh resolves', async () => {
    vi.mocked(silentRefresh.performSilentRefresh).mockResolvedValueOnce({
      accessToken: 'at',
      user: { id: 'u1', email: 'u@x.com' },
    });

    render(
      <AuthBootstrap>
        <div>protected content</div>
      </AuthBootstrap>,
    );

    expect(screen.queryByText('protected content')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('protected content')).toBeInTheDocument());
    expect(useAuthStore.getState().user).toEqual({ id: 'u1', email: 'u@x.com' });
  });

  it('renders children even when the refresh fails (unauthenticated state, not an error)', async () => {
    vi.mocked(silentRefresh.performSilentRefresh).mockResolvedValueOnce(null);

    render(
      <AuthBootstrap>
        <div>protected content</div>
      </AuthBootstrap>,
    );

    await waitFor(() => expect(screen.getByText('protected content')).toBeInTheDocument());
    expect(useAuthStore.getState().user).toBeNull();
  });
});
```

Check this repo's existing React-component test conventions first (look at an existing `apps/client/src/**/__tests__/*.unit.test.tsx` file that renders a component, e.g. one of the dialog component tests referenced in prior sessions) and align imports/setup (e.g. does it need a `QueryClientProvider`/router wrapper, or is a bare `render()` sufficient for a component this simple with no routing/query dependencies?) — adjust the test scaffold to match if `render()` alone isn't this repo's pattern.

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn nx test client -t "AuthBootstrap"`
Expected: FAIL — component doesn't exist.

- [ ] **Step 3: Implement `AuthBootstrap`**

Create `apps/client/src/app/auth-bootstrap.tsx`:

```tsx
import { useEffect, useState, type ReactNode } from 'react';
import { performSilentRefresh, useAuthStore } from '@icore/template-shared';
import { Loader2 } from 'lucide-react';

export function AuthBootstrap({ children }: { children: ReactNode }) {
  const [booted, setBooted] = useState(false);
  const setUser = useAuthStore((s) => s.setUser);

  useEffect(() => {
    let cancelled = false;
    void performSilentRefresh(import.meta.env.VITE_API_URL ?? '/api').then((result) => {
      if (cancelled) return;
      if (result) setUser(result.user);
      setBooted(true);
    });
    return () => {
      cancelled = true;
    };
  }, [setUser]);

  if (!booted) {
    return (
      <main className="bg-background flex min-h-screen items-center justify-center">
        <Loader2 className="text-muted-foreground size-8 animate-spin" />
      </main>
    );
  }

  return <>{children}</>;
}
```

`performSilentRefresh` is already re-exported from `@icore/template-shared`'s public index via Task 8 Step 13.

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn nx test client -t "AuthBootstrap"`
Expected: PASS — both tests.

- [ ] **Step 5: Wire into `main.tsx`**

In `apps/client/src/main.tsx`, find:

```tsx
createRoot(rootElement).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <AbilityProvider>
          <RouterProvider router={router} />
          <Toaster richColors />
        </AbilityProvider>
      </QueryClientProvider>
    </I18nextProvider>
  </StrictMode>,
);
```

Replace with:

```tsx
import { AuthBootstrap } from './app/auth-bootstrap';

createRoot(rootElement).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <AbilityProvider>
          <AuthBootstrap>
            <RouterProvider router={router} />
            <Toaster richColors />
          </AuthBootstrap>
        </AbilityProvider>
      </QueryClientProvider>
    </I18nextProvider>
  </StrictMode>,
);
```

(Add the `import` line near the file's other local imports, not inline where shown above — shown adjacent here only for clarity about which import it is.)

- [ ] **Step 6: Format, lint, build**

```bash
npx prettier --write apps/client/src/app/auth-bootstrap.tsx apps/client/src/app/__tests__/auth-bootstrap.unit.test.tsx apps/client/src/main.tsx
yarn nx lint client
yarn nx build client
```

- [ ] **Step 7: Commit**

```bash
git add apps/client/src/app/auth-bootstrap.tsx apps/client/src/app/__tests__/auth-bootstrap.unit.test.tsx apps/client/src/main.tsx
git commit -m "feat(client): add AuthBootstrap silent-refresh-on-boot wrapper"
```

---

### Task 12: `compliance` — wire logout to the new endpoint

**Files:**
- Modify: `apps/client/src/components/layout/LayoutHeader.tsx`
- Test: existing/new test file for `LayoutHeader` — check `apps/client/src/components/layout/__tests__/` for an existing file first; create one if none exists, following this repo's component-test conventions (same check as Task 11 Step 1).

**Interfaces:**
- Consumes: `api` (existing `POST` call), `setAccessToken` (Task 8/9).

- [ ] **Step 1: Write the failing test**

Check for an existing `LayoutHeader.unit.test.tsx`; if present, add a new test there matching its existing setup. If absent, create
`apps/client/src/components/layout/__tests__/LayoutHeader.unit.test.tsx` with a test asserting: clicking the logout menu item calls `POST /auth/logout` (mock the `api` module), then clears `useAuthStore`'s `user` and the in-memory access token, then navigates to `/login`. Model the mocking approach on however this repo's other component tests mock `@/lib/api` (grep an existing example first — e.g. a component test that already asserts an `api()` call was made — before writing this from scratch).

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn nx test client -t "LayoutHeader"` (or `-t "logout"`, whichever matches the new test's description)
Expected: FAIL.

- [ ] **Step 3: Rewire `handleLogout`**

In `apps/client/src/components/layout/LayoutHeader.tsx`, find:

```ts
  function handleLogout() {
    logout();
    void navigate({ to: '/login' });
  }
```

Replace with:

```ts
  async function handleLogout() {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      // Best-effort: clear local state and navigate regardless — an already-
      // expired/invalid session shouldn't block the user from reaching /login.
    }
    setAccessToken(null);
    logout();
    void navigate({ to: '/login' });
  }
```

Update the `onClick={handleLogout}` call site (currently `onClick={handleLogout}` on a plain function — confirm it still works being `async` now; React's `onClick` accepts a function returning `void | Promise<void>` fine, but if this codebase's lint rules flag unawaited promises in JSX handlers, wrap the call site as `onClick={() => void handleLogout()}` instead, matching the pattern already used for `onClick={() => void navigate(...)}` elsewhere in this same file).

Add the `import { api } from '@/lib/api';` and `import { setAccessToken } from '@icore/template-shared';` (`setAccessToken` is already re-exported per Task 8 Step 13) imports at the top of the file if not already present.

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn nx test client -t "LayoutHeader"` (or the matching filter from Step 2)
Expected: PASS.

- [ ] **Step 5: Format, lint, build**

```bash
npx prettier --write apps/client/src/components/layout/LayoutHeader.tsx apps/client/src/components/layout/__tests__/LayoutHeader.unit.test.tsx
yarn nx lint client
yarn nx build client
```

- [ ] **Step 6: Commit**

```bash
git add apps/client/src/components/layout/LayoutHeader.tsx apps/client/src/components/layout/__tests__/LayoutHeader.unit.test.tsx
git commit -m "feat(client): call POST /auth/logout before clearing local session state"
```

---

### Task 13: Full regression pass + live Playwright verification

**Files:** none (verification only)

- [ ] **Step 1: Run every affected project's full test suite**

```bash
yarn nx test shared
yarn nx test auth-client
yarn nx test api
yarn nx test client
yarn nx test template-shared
```

(Confirm exact project names for `libs/auth-strategies/supabase` and any others touched via `yarn nx show projects` if any of the above don't match — run those too.)

Expected: all PASS, zero regressions.

- [ ] **Step 2: Full lint + build**

```bash
yarn nx lint shared && yarn nx lint auth-client && yarn nx lint api && yarn nx lint client && yarn nx lint template-shared
yarn nx build shared && yarn nx build auth-client && yarn nx build api && yarn nx build client && yarn nx build template-shared
```

Expected: all green.

- [ ] **Step 3: Live Playwright verification (mandatory per `AGENTS.md` — this is a UI/auth-behavior change)**

With `yarn dev` running against real `.env` files (copy them into whatever worktree this plan executes in, per this session's own earlier discovery that fresh worktrees don't inherit gitignored `.env` files):

1. Log in via the password form. Confirm `localStorage.getItem('icore-auth')` contains only `{state: {user: {...}}, version: 0}` — no `accessToken`/`refreshToken` fields anywhere in it.
2. Confirm `document.cookie` contains `icore_csrf` but does NOT expose `icore_rt` (httpOnly cookies are invisible to `document.cookie` by design — absence here is the expected, correct result, not a bug).
3. Reload the page. Confirm the dashboard renders after a brief loading state (the silent refresh), without being redirected to `/login`.
4. Make an ordinary authenticated API call (e.g. navigate to any data-backed page) and confirm it still succeeds — the `Authorization: Bearer` header path is unchanged.
5. Log out. Confirm `icore_csrf` is cleared from `document.cookie`, and reloading the page now redirects to `/login` (the refresh cookie no longer works).
6. Open two tabs, log in in one; confirm the second tab, once reloaded, also lands authenticated (cookies are shared across tabs on the same origin).

- [ ] **Step 4: No commit for this task**

Verification only — nothing to commit.

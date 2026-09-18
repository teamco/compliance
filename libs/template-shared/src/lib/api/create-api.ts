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
      const headers: Record<string, string> = {};
      if (csrf) headers['X-CSRF-Token'] = csrf;
      return headers;
    },
    onTokenRefreshed: ({ accessToken }) => setAccessToken(accessToken),
    onUnauthorized: () => {
      setAccessToken(null);
      opts.onUnauthorized?.();
    },
    refreshPath: '/auth/refresh',
    // The gateway's real POST /auth/refresh response is `{ accessToken, user }`
    // — camelCase, and with NO refresh-token field at all (the real refresh
    // token lives only in the httpOnly cookie, never in a JSON body). The
    // library's internal doRefresh() defaults to reading `access_token` /
    // `refresh_token` and returns null (forcing onUnauthorized()) if either is
    // missing, so both fields must be remapped onto the one field the gateway
    // actually sends. Pointing refreshTokenField at 'accessToken' too is a
    // deliberate trick, not a bug: it only needs to satisfy doRefresh()'s
    // `typeof nextRefresh !== 'string'` guard with *some* string — the value
    // is never used, since onTokenRefreshed above destructures only
    // `accessToken` and ignores `refreshToken` entirely. No real refresh
    // token or new data is ever exposed in a JSON body by doing this.
    accessTokenField: 'accessToken',
    refreshTokenField: 'accessToken',
  });
}

// NOTE: this does NOT route through performSilentRefresh/Web Locks — the
// underlying @idevconn/api-client library still owns its own refresh call
// internally (it exposes credentials/getRefreshHeaders passthrough, not a
// pluggable refresh implementation). This means the main JSON API client and
// fetchWithRefresh have two independent refresh code paths that could race
// across tabs against each other specifically (both hitting /auth/refresh at
// once from different code paths in the same tab is already deduped by the
// library's own inFlightRefresh, but a fetchWithRefresh call in one tab
// racing this client's own refresh in another tab is not covered by Web
// Locks here). This is a known, accepted residual gap versus the spec's
// "fixed via Web Locks" intent for this one call path — the race's
// consequence is just an extra login-again for one tab, same as the
// original documented limitation. Not patched here; would require
// @idevconn/api-client itself to accept a pluggable refresh function instead
// of two config fields.

export { ApiError } from '@idevconn/api-client';

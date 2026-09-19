import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createIcoreApi } from '../create-api.js';
import { getAccessToken, setAccessToken } from '../access-token.js';

const BASE = 'http://test/api';

function jsonResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('createIcoreApi', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    document.cookie = 'icore_csrf=csrf-abc';
    setAccessToken('live');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    document.cookie = 'icore_csrf=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/';
    setAccessToken(null);
  });

  it('on 401: refreshes via the gateway real response shape ({accessToken, user}, no snake_case fields) and retries with the new token', async () => {
    // This is the exact regression Critical Issue #1 in task-9-review.md describes:
    // @idevconn/api-client's internal doRefresh() defaults to reading
    // data['access_token'] / data['refresh_token'], but the gateway's real
    // POST /auth/refresh response is camelCase-only ({ accessToken, user })
    // with no refresh-token field at all (it lives in the httpOnly cookie).
    // Without accessTokenField/refreshTokenField mapped onto 'accessToken',
    // doRefresh() always returns null and this test fails with a forced
    // onUnauthorized() logout instead of a successful retry.
    const onUnauthorized = vi.fn();
    const api = createIcoreApi({ baseUrl: BASE, onUnauthorized });

    fetchMock
      .mockResolvedValueOnce(jsonResponse(401)) // original request
      .mockResolvedValueOnce(
        jsonResponse(200, { accessToken: 'fresh', user: { id: 'u1', email: 'u@x.com' } }),
      ) // refresh — real gateway shape, no access_token/refresh_token fields
      .mockResolvedValueOnce(jsonResponse(200, { ok: true })); // retry

    const result = await api('/things');

    expect(result).toEqual({ ok: true });
    expect(onUnauthorized).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const [refreshUrl, refreshInit] = fetchMock.mock.calls[1]!;
    expect(refreshUrl).toBe(`${BASE}/auth/refresh`);
    expect(refreshInit?.credentials).toBe('include');
    expect(new Headers(refreshInit?.headers).get('X-CSRF-Token')).toBe('csrf-abc');

    const [retryUrl, retryInit] = fetchMock.mock.calls[2]!;
    expect(retryUrl).toBe(`${BASE}/things`);
    expect(new Headers(retryInit?.headers).get('Authorization')).toBe('Bearer fresh');

    expect(getAccessToken()).toBe('fresh');
  });
});

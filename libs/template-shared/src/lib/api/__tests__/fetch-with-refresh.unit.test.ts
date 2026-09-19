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

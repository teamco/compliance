import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../../stores/auth.store.js';
import { fetchWithRefresh } from '../fetch-with-refresh.js';

const BASE = 'http://test/api';
const USER = { id: 'u1', email: 'u@x.com' };

function jsonResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('fetchWithRefresh', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    useAuthStore.setState({ accessToken: 'live', refreshToken: 'rt', user: USER });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('attaches Authorization and passes through non-401 responses', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    const res = await fetchWithRefresh(BASE, '/ai/chat', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/ai/chat`);
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer live');
  });

  it('on 401: refreshes, stores the new session, retries with the new token', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401)) // original request
      .mockResolvedValueOnce(jsonResponse(200, { accessToken: 'fresh', refreshToken: 'rt2' })) // refresh
      .mockResolvedValueOnce(jsonResponse(200, { ok: true })); // retry

    const res = await fetchWithRefresh(BASE, '/ai/chat', { method: 'POST' });

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toBe(`${BASE}/auth/refresh`);
    const retryInit = fetchMock.mock.calls[2][1];
    expect(new Headers(retryInit?.headers).get('Authorization')).toBe('Bearer fresh');
    expect(useAuthStore.getState().accessToken).toBe('fresh');
    expect(useAuthStore.getState().refreshToken).toBe('rt2');
  });

  it('on refresh rejection: logs out and returns the original 401', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401)) // original request
      .mockResolvedValueOnce(jsonResponse(401)); // refresh rejected

    const res = await fetchWithRefresh(BASE, '/ai/chat');

    expect(res.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('without a refresh token: returns the 401 without calling refresh', async () => {
    useAuthStore.setState({ refreshToken: null });
    fetchMock.mockResolvedValueOnce(jsonResponse(401));

    const res = await fetchWithRefresh(BASE, '/ai/chat');

    expect(res.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('on refresh network failure: keeps the session and returns the original 401', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401))
      .mockRejectedValueOnce(new Error('network down'));

    const res = await fetchWithRefresh(BASE, '/ai/chat');

    expect(res.status).toBe(401);
    expect(useAuthStore.getState().refreshToken).toBe('rt');
  });
});

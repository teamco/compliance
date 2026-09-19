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
      // performSilentRefresh's real implementation already persists this, but
      // set it explicitly too so the token is current even when a caller (or
      // a test) mocks performSilentRefresh's own side effects away.
      setAccessToken(refreshed.accessToken);
      res = await doFetch(refreshed.accessToken);
    } else {
      setAccessToken(null);
    }
  }
  return res;
}

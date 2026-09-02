import { useAuthStore } from '../stores/auth.store.js';

/**
 * fetch with Authorization from the auth store and a single 401 → refresh → retry
 * pass. For raw/streaming requests (e.g. SSE) that cannot go through the JSON
 * api client — mirrors its refresh behavior against POST {baseUrl}/auth/refresh.
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

  let res = await doFetch(useAuthStore.getState().accessToken);
  if (res.status === 401) {
    const nextToken = await refreshSession(baseUrl);
    if (nextToken) res = await doFetch(nextToken);
  }
  return res;
}

async function refreshSession(baseUrl: string): Promise<string | null> {
  const { refreshToken, user, setAuth, logout } = useAuthStore.getState();
  if (!refreshToken) return null;
  try {
    const res = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) {
      // Refresh token rejected — session is dead, clear it.
      logout();
      return null;
    }
    const data = (await res.json()) as { accessToken?: unknown; refreshToken?: unknown };
    if (typeof data.accessToken !== 'string' || typeof data.refreshToken !== 'string') {
      return null;
    }
    if (user) {
      setAuth({ accessToken: data.accessToken, refreshToken: data.refreshToken, user });
    }
    return data.accessToken;
  } catch {
    // Network failure — keep the session; caller surfaces the original 401.
    return null;
  }
}

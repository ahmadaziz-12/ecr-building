export const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:5080";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// The access token cookie is short-lived (15 min) by design; a rotating refresh-token cookie
// (14 days) is meant to silently renew it. Shared across all callers so N requests failing at
// once (a page mounting several queries) trigger exactly one refresh, not N racing ones — the
// backend revokes the old refresh token when it issues a new one, so concurrent refresh calls
// would otherwise have all-but-one fail and log the user out.
let refreshPromise: Promise<boolean> | null = null;
function refreshSession(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE}/api/auth/refresh`, { method: "POST", credentials: "include" })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

// AuthProvider (auth.tsx) listens for this to clear the cached user immediately instead of
// waiting for the next incidental refetch of /api/auth/me (window refocus, reconnect, etc.),
// which could otherwise leave a "logged in" UI showing for a long time after the session
// actually died.
function notifySessionExpired() {
  window.dispatchEvent(new Event("auth:expired"));
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const isAuthEndpoint = path.startsWith("/api/auth/");
  const doFetch = () =>
    fetch(`${API_BASE}${path}`, {
      ...options,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

  let res = await doFetch();

  if (res.status === 401 && !isAuthEndpoint) {
    const refreshed = await refreshSession();
    if (refreshed) {
      res = await doFetch();
    } else {
      notifySessionExpired();
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { error?: string });
    throw new ApiError(res.status, body.error ?? res.statusText);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const apiGet = <T,>(path: string) => apiFetch<T>(path);
export const apiPost = <T,>(path: string, body?: unknown) =>
  apiFetch<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
export const apiPut = <T,>(path: string, body?: unknown) =>
  apiFetch<T>(path, { method: "PUT", body: body === undefined ? undefined : JSON.stringify(body) });
export const apiDelete = <T,>(path: string) => apiFetch<T>(path, { method: "DELETE" });

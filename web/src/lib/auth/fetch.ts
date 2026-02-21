/**
 * Authenticated fetch wrapper that automatically handles token refresh on 401 responses.
 *
 * - Makes the original request with credentials included
 * - If the response is 401, attempts to refresh the access token via POST /api/auth/refresh
 * - If refresh succeeds, retries the original request once
 * - If refresh fails (e.g. refresh token expired), redirects to /login
 * - A shared promise prevents multiple concurrent refresh attempts (thundering herd)
 *
 * Drop-in replacement for the global `fetch` function.
 */

let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "include",
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, { ...init, credentials: "include" });

  if (response.status !== 401) {
    return response;
  }

  // Deduplicate concurrent refresh attempts
  if (!refreshPromise) {
    refreshPromise = refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
  }

  const refreshed = await refreshPromise;

  if (refreshed) {
    // Retry the original request with fresh tokens
    return fetch(input, { ...init, credentials: "include" });
  }

  // Refresh failed — session is truly expired
  if (typeof window !== "undefined") {
    window.location.href = "/login";
  }

  throw new Error("Session expired");
}

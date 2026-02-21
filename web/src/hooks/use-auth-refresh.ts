"use client";

import { useEffect, useRef } from "react";

/**
 * Proactively refreshes the access token before it expires.
 *
 * - Fires a refresh request every `intervalMs` (default 12 min, well before the 15-min expiry)
 * - Pauses the timer when the tab is hidden
 * - Immediately refreshes when the tab becomes visible again after being hidden
 * - Redirects to /login if the refresh token itself is expired/invalid
 */

const DEFAULT_REFRESH_INTERVAL = 12 * 60 * 1000; // 12 minutes

async function refreshToken(): Promise<boolean> {
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

export function useAuthRefresh(intervalMs: number = DEFAULT_REFRESH_INTERVAL) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const doRefresh = async () => {
      const ok = await refreshToken();
      if (!ok && typeof window !== "undefined") {
        window.location.href = "/login";
      }
    };

    const start = () => {
      stop();
      intervalRef.current = setInterval(doRefresh, intervalMs);
    };

    const stop = () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    const handleVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        // Tab became visible — refresh immediately, then restart the timer
        doRefresh();
        start();
      }
    };

    // Start the periodic timer (no immediate call — the token is still fresh on mount)
    start();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [intervalMs]);
}

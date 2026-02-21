"use client";

import { useEffect, useRef, type DependencyList } from "react";

/**
 * Calls `callback` immediately and then every `intervalMs` milliseconds.
 * Pauses when the browser tab is hidden (Page Visibility API).
 * Resumes with an immediate call when the tab becomes visible again.
 *
 * @param callback  Async function to invoke on each tick.
 * @param intervalMs  Polling interval in milliseconds.
 * @param deps  Optional dependency list — when any dep changes the effect
 *              re-runs, triggering an immediate fetch and restarting the interval.
 */
export function usePolling(callback: () => void, intervalMs: number, deps: DependencyList = []) {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      stop();
      savedCallback.current();
      id = setInterval(() => savedCallback.current(), intervalMs);
    };

    const stop = () => {
      if (id !== null) {
        clearInterval(id);
        id = null;
      }
    };

    const handleVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        start();
      }
    };

    start();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, ...deps]);
}

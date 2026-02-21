"use client";

import { useEffect, useRef } from "react";

/**
 * Calls `callback` immediately and then every `intervalMs` milliseconds.
 * Pauses when the browser tab is hidden (Page Visibility API).
 * Resumes with an immediate call when the tab becomes visible again.
 */
export function usePolling(callback: () => void, intervalMs: number) {
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
  }, [intervalMs]);
}

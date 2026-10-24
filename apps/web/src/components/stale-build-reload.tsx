"use client";

import { useEffect } from "react";

// A tab opened before a deploy keeps asking for that build's chunks, which the new deploy no longer serves (404,
// "Failed to fetch dynamically imported module"). Vite reports the failed import as `vite:preloadError`; reloading
// gets the current build. Once per failing URL, so a chunk that is really gone can't reload the page forever.
export function StaleBuildReload() {
  useEffect(() => {
    const onPreloadError = (event: Event) => {
      const failed = String((event as Event & { payload?: unknown }).payload ?? "");
      const key = `stale-build:${failed || location.pathname}`;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
      event.preventDefault();
      location.reload();
    };
    window.addEventListener("vite:preloadError", onPreloadError);
    return () => window.removeEventListener("vite:preloadError", onPreloadError);
  }, []);
  return null;
}

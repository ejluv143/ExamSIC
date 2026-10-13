import { useEffect, useState, useSyncExternalStore } from "react";
import type { TakeMode } from "./types";

function subscribeFullscreen(onChange: () => void) {
  document.addEventListener("fullscreenchange", onChange);
  return () => document.removeEventListener("fullscreenchange", onChange);
}

// Students take it in full screen when the rules say so. Browsers without it (iPhone Safari) or that refuse it just
// carry on (`refused`).
export function useFullscreen({ take, required }: { take: TakeMode | undefined; required: boolean }) {
  const canFullscreen = !!take && required && typeof document !== "undefined" && document.fullscreenEnabled;
  const isFullscreen = useSyncExternalStore(
    subscribeFullscreen,
    () => !!document.fullscreenElement,
    () => false,
  );
  const [refused, setRefused] = useState(false);
  // Must run inside a click: browsers only allow full screen in response to the user.
  function enter() {
    const root = take?.fullscreenRoot.current;
    if (!canFullscreen || !root || document.fullscreenElement) return;
    root.requestFullscreen().catch(() => setRefused(true));
  }
  // Leave full screen once the attempt is over (submitting moves on to the result page).
  const taking = !!take;
  useEffect(() => {
    if (!taking) return;
    return () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, [taking]);
  return { canFullscreen, isFullscreen, refused, enter };
}

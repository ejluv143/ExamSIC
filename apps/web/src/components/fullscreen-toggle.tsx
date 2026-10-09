"use client";

import { useSyncExternalStore, type RefObject } from "react";
import { Maximize, Minimize } from "lucide-react";

const noSubscribe = () => () => {};
const subscribeFullscreen = (onChange: () => void) => {
  document.addEventListener("fullscreenchange", onChange);
  return () => document.removeEventListener("fullscreenchange", onChange);
};

// Puts `target` (the page by default) in full screen. Browsers only grant it from a tap, so it's a button rather
// than automatic. Hidden where full screen isn't available (iPhones, iframes).
export function FullscreenToggle({ target }: { target?: RefObject<HTMLElement | null> }) {
  const supported = useSyncExternalStore(noSubscribe, () => document.fullscreenEnabled, () => false);
  const active = useSyncExternalStore(subscribeFullscreen, () => !!document.fullscreenElement, () => false);
  if (!supported) return null;
  const element = () => target?.current ?? document.documentElement;
  return (
    <button
      type="button"
      className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted hover:bg-surface-muted"
      onClick={() => (active ? document.exitFullscreen() : element().requestFullscreen()).catch(() => {})}
      aria-label={active ? "Leave full screen" : "Full screen"}
    >
      {active ? <Minimize className="size-4" aria-hidden /> : <Maximize className="size-4" aria-hidden />}
      {active ? "Leave full screen" : "Full screen"}
    </button>
  );
}

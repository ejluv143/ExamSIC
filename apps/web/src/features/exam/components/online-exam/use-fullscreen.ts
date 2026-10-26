import { useEffect, useState, useSyncExternalStore } from "react";
import { enterFullscreen, fullscreenAvailable, leaveFullscreen } from "@/lib/fullscreen";
import type { WebTakeMode } from "./types";

function subscribeFullscreen(onChange: () => void) {
  document.addEventListener("fullscreenchange", onChange);
  return () => document.removeEventListener("fullscreenchange", onChange);
}

// Every session opens in full screen when the student presses Start. When the rules require it (`required`),
// leaving is `enforced`: the overlay asks them back and the integrity guard records it. Browsers without full
// screen (iPhone Safari) or that refuse it just carry on (`refused`).
export function useFullscreen({ take, required }: { take: WebTakeMode | undefined; required: boolean }) {
  const supported = !!take && fullscreenAvailable();
  const isFullscreen = useSyncExternalStore(
    subscribeFullscreen,
    () => !!document.fullscreenElement,
    () => false,
  );
  const [refused, setRefused] = useState(false);
  const enforced = supported && required && !refused;
  // Must run inside a click: browsers only allow full screen in response to the user.
  function enter() {
    const root = take?.fullscreenRoot.current;
    if (!supported || !root) return;
    void enterFullscreen(root).then((entered) => {
      if (!entered) setRefused(true);
    });
  }
  // Leave full screen once the attempt is over (submitting moves on to the result page).
  const taking = !!take;
  useEffect(() => {
    if (!taking) return;
    return leaveFullscreen;
  }, [taking]);
  return { enforced, isFullscreen, refused, enter };
}

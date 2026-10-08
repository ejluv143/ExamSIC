"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type Bar = { width: number; visible: boolean };

// Starts, trickles and finishes the bar. Made once per mount, so the timers live outside React state.
function progressController(setBar: (update: Bar | ((bar: Bar) => Bar)) => void) {
  let running = false;
  let trickle: ReturnType<typeof setInterval> | undefined;
  let timers: ReturnType<typeof setTimeout>[] = [];

  const clear = () => {
    clearInterval(trickle);
    timers.forEach(clearTimeout);
    timers = [];
  };

  const done = () => {
    if (!running) return;
    running = false;
    clear();
    setBar({ width: 100, visible: true });
    timers.push(
      setTimeout(() => setBar((b) => ({ ...b, visible: false })), 250),
      setTimeout(() => setBar({ width: 0, visible: false }), 600),
    );
  };

  const start = () => {
    if (running) return;
    running = true;
    clear();
    setBar({ width: 10, visible: true });
    // Slows down as it nears 90%, so a slow page never looks finished.
    trickle = setInterval(() => setBar((b) => ({ ...b, width: b.width + (90 - b.width) * 0.1 })), 200);
    timers.push(setTimeout(done, 10_000));
  };

  return { start, done, clear };
}

// A thin bar across the top while a link's page loads. It starts on a click of a link to another page of this
// site and finishes when the URL changes. Links that never navigate (a handler that cancels them) end after
// a timeout instead of leaving the bar stuck.
export function RouteProgress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [bar, setBar] = useState<Bar>({ width: 0, visible: false });
  const [progress] = useState(() => progressController(setBar));

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as Element | null)?.closest?.("a");
      if (!link?.href || link.hasAttribute("download")) return;
      if (link.target && link.target !== "_self") return;
      const url = new URL(link.href, location.href);
      if (url.origin !== location.origin) return;
      // Same page, or only a #section on it.
      if (url.pathname === location.pathname && url.search === location.search) return;
      progress.start();
    };

    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      progress.clear();
    };
  }, [progress]);

  useEffect(() => progress.done(), [progress, pathname, search]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 print:hidden">
      <div
        className="h-full bg-primary shadow-[0_0_8px_var(--primary)]"
        style={{
          width: `${bar.width}%`,
          opacity: bar.visible ? 1 : 0,
          transition: bar.visible ? "width 200ms ease-out, opacity 300ms" : "opacity 300ms",
        }}
      />
    </div>
  );
}

"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useReducedMotion } from "./reduced-motion";

// Marks its children hidden until they scroll into view, then shown, for `group/reveal` variants to animate.
// Without JavaScript, or with reduced motion, it never hides anything.
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"idle" | "hidden" | "shown">("idle");

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setState("shown");
          observer.disconnect();
        } else setState((s) => (s === "idle" ? "hidden" : s));
      },
      { threshold: 0.2 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [reduced]);

  return (
    <div ref={ref} data-state={state} className={`group/reveal ${className ?? ""}`}>
      {children}
    </div>
  );
}

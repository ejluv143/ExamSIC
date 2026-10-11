"use client";

import { useEffect } from "react";

// Marks each [data-reveal] element of the landing page with data-shown the first time it scrolls into view; the
// fade and rise are in globals.css. The page itself stays static: without this (or with reduced motion), CSS shows
// everything at once.
export function ScrollEffects() {
  useEffect(() => {
    const items = document.querySelectorAll<HTMLElement>("[data-reveal]:not([data-shown])");
    const show = (el: Element) => el.setAttribute("data-shown", "");
    if (!("IntersectionObserver" in window)) {
      items.forEach(show);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          show(entry.target);
          observer.unobserve(entry.target);
        }
      },
      // A little before the element is fully up, so it is already moving as it arrives.
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    items.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
  return null;
}

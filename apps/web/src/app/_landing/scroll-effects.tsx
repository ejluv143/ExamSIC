"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useReducedMotion } from "./reduced-motion";

// Text-like blocks animate as one piece; containers are searched for their own blocks.
const BLOCK_TAGS = new Set(["H1", "H2", "H3", "P", "PRE", "TABLE", "DETAILS", "IMG", "A", "BUTTON", "LABEL", "DL"]);

// The blocks of a section that should animate: headings, paragraphs, and each item of a grid or row of cards.
// Skips decoration (absolutely positioned glows and photos), sticky bars, and blocks a <Reveal> already animates
// (those carry `group-data-[state=hidden]/reveal:` classes).
function collect(root: Element, depth = 0, out: HTMLElement[] = []) {
  const parentStyle = getComputedStyle(root);
  const isGroup =
    root.children.length > 1 && (parentStyle.display.includes("grid") || (parentStyle.display.includes("flex") && parentStyle.flexWrap === "wrap"));
  for (const child of Array.from(root.children)) {
    if (!(child instanceof HTMLElement)) continue;
    const style = getComputedStyle(child);
    if (style.position === "absolute" || style.position === "fixed" || style.position === "sticky" || style.display === "none") continue;
    if (child.className.toString().includes("group-data-[state=hidden]")) continue;
    if (child.matches("[data-state]") || child.querySelector("[data-state]")) {
      collect(child, depth + 1, out);
      continue;
    }
    // Anything taller than the screen is split into its own blocks, so it never waits to be "mostly visible".
    if (child.offsetHeight > window.innerHeight * 0.9 && child.children.length > 0) {
      collect(child, depth + 1, out);
      continue;
    }
    const leaf =
      isGroup ||
      BLOCK_TAGS.has(child.tagName) ||
      child.getAttribute("aria-hidden") === "true" ||
      child.children.length === 0 ||
      depth >= 4;
    if (leaf) out.push(child);
    else collect(child, depth + 1, out);
  }
  return out;
}

// Scroll animations for the public pages: blocks rise in from below or drop in from above (and leave the same way),
// a progress line across the top, and smooth in-page links. All off for people who prefer reduced motion.
export function ScrollEffects() {
  const reduced = useReducedMotion();
  const pathname = usePathname();
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (reduced) return;
    document.documentElement.classList.add("smooth-scroll");
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? window.scrollY / max : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.documentElement.classList.remove("smooth-scroll");
    };
  }, [reduced]);

  useEffect(() => {
    if (reduced) return;
    const roots = [...document.querySelectorAll("main > section, main > div, footer")];
    const blocks = roots.flatMap((r) => collect(r));
    const seen = new Map<Element, number>();
    // A short stagger between neighbours, so a row of cards arrives one after another.
    for (const el of blocks) {
      const siblings = blocks.filter((b) => b.parentElement === el.parentElement);
      const i = siblings.indexOf(el);
      el.style.setProperty("--sr-delay", `${Math.min(i, 5) * 70}ms`);
      seen.set(el, 0);
    }
    // States (styles in globals.css): what's on screen at load stays put ("shown"); the rest waits hidden
    // ("hidden-above"/"hidden-below"), comes in from the side it's on ("in-below"/"in-above"), and leaves the
    // same way ("out-above"/"out-below"). Keyframe animations, so cards keep their own hover transitions.
    const vh = window.innerHeight;
    for (const el of blocks) {
      const r = el.getBoundingClientRect();
      el.dataset.sr = r.top < vh && r.bottom > 0 ? "shown" : r.bottom <= 0 ? "hidden-above" : "hidden-below";
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const el = e.target as HTMLElement;
          const above = e.boundingClientRect.top < 0;
          const state = el.dataset.sr ?? "";
          if (e.isIntersecting) {
            // Come back in from the side it left by.
            if (state.startsWith("hidden") || state.startsWith("out")) el.dataset.sr = state.endsWith("above") ? "in-above" : "in-below";
          } else if (!state.startsWith("hidden") && !state.startsWith("out")) {
            el.dataset.sr = above ? "out-above" : "out-below";
          }
        }
      },
      // Any pixel on screen (past a small margin at the bottom) counts, whatever the block's height.
      { rootMargin: "0px 0px -6% 0px", threshold: 0 },
    );
    blocks.forEach((el) => observer.observe(el));
    return () => {
      observer.disconnect();
      for (const el of blocks) {
        delete el.dataset.sr;
        el.style.removeProperty("--sr-delay");
      }
    };
  }, [reduced, pathname]);

  if (reduced) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5">
      <div
        className="h-full origin-left bg-gradient-to-r from-[#c0c1ff] via-[#d0bcff] to-[#4edea3] shadow-[0_0_10px_rgba(78,222,163,0.6)]"
        style={{ transform: `scaleX(${progress})` }}
      />
    </div>
  );
}

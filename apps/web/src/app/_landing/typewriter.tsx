"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "./reduced-motion";

// Types each phrase, holds it, deletes it, and moves on. Starts fully typed, so the server render reads well,
// and the longest phrase reserves the space so nothing below jumps.
export function Typewriter({ phrases, className }: { phrases: string[]; className?: string }) {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [length, setLength] = useState(phrases[0].length);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (reduced) return;
    const phrase = phrases[index];
    const full = !deleting && length === phrase.length;
    const empty = deleting && length === 0;
    const delay = full ? 2200 : empty ? 350 : deleting ? 35 : 75;
    const timer = setTimeout(() => {
      if (full) setDeleting(true);
      else if (empty) {
        setDeleting(false);
        setIndex((i) => (i + 1) % phrases.length);
      } else setLength((n) => n + (deleting ? -1 : 1));
    }, delay);
    return () => clearTimeout(timer);
  }, [reduced, phrases, index, length, deleting]);

  const longest = phrases.reduce((a, b) => (b.length > a.length ? b : a));
  return (
    <>
      <span className="sr-only">{phrases.join(" ")}</span>
      <span aria-hidden className="grid">
        <span className="invisible col-start-1 row-start-1">{longest}</span>
        <span className="col-start-1 row-start-1">
          <span className={className}>{reduced ? phrases[0] : phrases[index].slice(0, length)}</span>
          <span className="ml-1 inline-block h-[0.85em] w-[0.08em] translate-y-[0.1em] animate-caret rounded-full bg-[#4edea3]" />
        </span>
      </span>
    </>
  );
}

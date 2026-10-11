import type { CSSProperties } from "react";

// Inline style that delays a [data-reveal] block's entrance, so neighbours arrive one after another (globals.css).
// React's style type has no custom properties, hence the cast.
export const revealDelay = (ms: number) => ({ "--reveal-delay": `${ms}ms` }) as CSSProperties;

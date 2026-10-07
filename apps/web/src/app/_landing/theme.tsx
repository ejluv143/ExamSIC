import type { ReactNode } from "react";

// Colors for this page only; it's always dark, like a product page.
export const c = {
  bg: "bg-[#0b1326]",
  low: "bg-[#131b2e]",
  mid: "bg-[#171f33]",
  high: "bg-[#222a3d]",
  lowest: "bg-[#060e20]",
  line: "border-[#464554]/40",
  text: "text-[#dae2fd]",
  muted: "text-[#c7c4d7]",
  primary: "text-[#c0c1ff]",
  green: "text-[#4edea3]",
  violet: "text-[#d0bcff]",
};

// The top of an app window: three dots and where in Examora it is.
export function WindowBar({ path }: { path: string }) {
  return (
    <div className={`flex items-center gap-3 border-b ${c.line} bg-[#0b1326]/60 px-4 py-2.5`}>
      <span className="flex gap-1.5" aria-hidden>
        <span className="size-2.5 rounded-full bg-[#f2716b]/70" />
        <span className="size-2.5 rounded-full bg-[#ffb68a]/70" />
        <span className="size-2.5 rounded-full bg-[#4edea3]/70" />
      </span>
      <span className={`flex-1 truncate rounded-md bg-white/5 px-2.5 py-0.5 text-center font-mono text-[10.5px] ${c.muted}`}>
        examora · {path}
      </span>
    </div>
  );
}

export function Eyebrow({ children, tone = c.primary }: { children: ReactNode; tone?: string }) {
  return <span className={`text-[11px] font-bold tracking-[0.18em] uppercase ${tone}`}>{children}</span>;
}

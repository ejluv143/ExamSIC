"use client";

import clsx from "clsx";
import { Lock } from "lucide-react";
import { useId, type ReactNode } from "react";

// Small drawings of what each rule does. They use currentColor for the outline (muted when the rule is off, the
// primary color when it is on) and the theme's tokens for fills, so they read in light and dark mode.
export type Art =
  | "fullscreen"
  | "focus"
  | "screens"
  | "rightClick"
  | "copy"
  | "paste"
  | "pasteCode"
  | "print"
  | "clipboard"
  | "watermark"
  | "autoSubmit"
  | "oneAtATime"
  | "questionTime"
  | "computers"
  | "network";

const danger = "var(--danger)";
const fill = "var(--surface)";
const soft = "var(--surface-muted)";

// The "not allowed" mark: a circle with a slash.
function Ban({ x, y, r = 11 }: { x: number; y: number; r?: number }) {
  const d = r * 0.7;
  return (
    <g stroke={danger} strokeWidth="2.5" fill="none" strokeLinecap="round">
      <circle cx={x} cy={y} r={r} fill={fill} fillOpacity="0.85" />
      <line x1={x - d} y1={y + d} x2={x + d} y2={y - d} />
    </g>
  );
}

function Drawing({ art }: { art: Art }) {
  switch (art) {
    case "fullscreen":
      return (
        <>
          <rect x="8" y="6" width="80" height="52" rx="4" fill={fill} />
          <rect x="34" y="21" width="28" height="22" rx="2" fill={soft} />
          <path d="M40 28h16M40 34h10" />
          <path d="M14 20v-8h8M74 12h8v8M82 44v8h-8M22 52h-8v-8" />
        </>
      );
    case "focus":
      return (
        <>
          <rect x="6" y="10" width="52" height="36" rx="3" fill={soft} />
          <path d="M6 18h52" />
          <rect x="38" y="24" width="52" height="34" rx="3" fill={fill} />
          <path d="M38 32h52" />
          <path d="M24 6c10-5 24-3 32 6" stroke={danger} />
          <path d="M50 8l6 4-2 7" stroke={danger} />
        </>
      );
    case "screens":
      return (
        <>
          <rect x="6" y="12" width="38" height="28" rx="2" fill={fill} />
          <path d="M25 40v8M16 48h18" />
          <rect x="52" y="12" width="38" height="28" rx="2" fill={soft} strokeDasharray="3 3" />
          <path d="M71 40v8M62 48h18" strokeDasharray="3 3" />
          <Ban x={71} y={26} />
        </>
      );
    case "rightClick":
      return (
        <>
          <rect x="6" y="6" width="84" height="52" rx="4" fill={fill} />
          <rect x="44" y="20" width="36" height="30" rx="3" fill={soft} />
          <path d="M50 28h22M50 35h22M50 42h14" />
          <path d="M30 14l0 18 5-4 4 9 4-2-4-9 7 0z" fill="currentColor" />
          <Ban x={62} y={36} r={13} />
        </>
      );
    case "copy":
      return (
        <>
          <rect x="22" y="8" width="34" height="42" rx="3" fill={soft} />
          <rect x="38" y="16" width="34" height="42" rx="3" fill={fill} />
          <path d="M45 28h20M45 35h20M45 42h12" />
          <Ban x={68} y={46} />
        </>
      );
    case "paste":
      return (
        <>
          <rect x="30" y="12" width="36" height="44" rx="4" fill={soft} />
          <rect x="40" y="8" width="16" height="8" rx="2" fill={fill} />
          <path d="M48 24v14m-6-6l6 6 6-6" />
          <Ban x={70} y={46} />
        </>
      );
    case "pasteCode":
      return (
        <>
          <rect x="8" y="8" width="80" height="48" rx="4" fill={fill} />
          <path d="M8 18h80" />
          <path d="M34 30l-8 7 8 7M62 30l8 7-8 7M52 28l-8 18" />
          <circle cx="76" cy="46" r="9" fill={soft} stroke="var(--success)" />
          <path d="M72 46l3 3 5-6" stroke="var(--success)" />
        </>
      );
    case "print":
      return (
        <>
          <rect x="28" y="6" width="40" height="18" rx="2" fill={soft} />
          <rect x="14" y="22" width="68" height="26" rx="4" fill={fill} />
          <rect x="30" y="38" width="36" height="20" rx="2" fill={soft} />
          <path d="M36 45h24M36 51h16" />
          <circle cx="72" cy="30" r="2" fill="currentColor" />
          <Ban x={78} y={46} />
        </>
      );
    case "clipboard":
      return (
        <>
          <rect x="28" y="10" width="40" height="48" rx="4" fill={fill} />
          <rect x="38" y="5" width="20" height="10" rx="3" fill={soft} />
          <path d="M42 32l12 12M54 32L42 44" stroke={danger} strokeWidth="3" />
        </>
      );
    case "watermark":
      return (
        <>
          <rect x="20" y="5" width="56" height="54" rx="3" fill={fill} />
          <path d="M28 14h40M28 22h40M28 44h40M28 51h24" />
          <text
            x="48"
            y="37"
            textAnchor="middle"
            fontSize="13"
            fontWeight="700"
            fill="currentColor"
            stroke="none"
            opacity="0.55"
            transform="rotate(-20 48 34)"
          >
            Juan D.
          </text>
        </>
      );
    case "autoSubmit":
      return (
        <>
          <circle cx="26" cy="14" r="6" fill="currentColor" />
          <circle cx="48" cy="14" r="6" fill="currentColor" />
          <circle cx="70" cy="14" r="6" fill={fill} strokeDasharray="3 3" stroke={danger} />
          <rect x="24" y="30" width="48" height="26" rx="4" fill={soft} />
          <path d="M38 43l7 7 13-14" />
        </>
      );
    case "oneAtATime":
      return (
        <>
          <rect x="26" y="6" width="50" height="38" rx="3" fill={soft} />
          <rect x="20" y="10" width="50" height="38" rx="3" fill={fill} />
          <path d="M28 20h30" />
          <circle cx="30" cy="30" r="3" />
          <circle cx="30" cy="40" r="3" />
          <path d="M38 30h20M38 40h14" />
          <path d="M60 56l-12 0m4-4l-4 4 4 4" stroke={danger} />
          <path d="M66 52h14m-4-4l4 4-4 4" />
        </>
      );
    case "questionTime":
      return (
        <>
          <path d="M42 5h12" />
          <circle cx="48" cy="35" r="22" fill={fill} />
          <path d="M48 35V22M48 35l9 6" />
          <path d="M70 15l5-5" />
        </>
      );
    case "computers":
      return (
        <>
          <rect x="12" y="12" width="48" height="32" rx="3" fill={fill} />
          <path d="M6 50h60" />
          <rect x="68" y="18" width="18" height="34" rx="3" fill={soft} strokeDasharray="3 3" />
          <Ban x={77} y={35} r={9} />
        </>
      );
    case "network":
      return (
        <>
          <rect x="12" y="8" width="72" height="26" rx="6" fill={soft} />
          <text x="48" y="25" textAnchor="middle" fontSize="11" fontWeight="600" fill="currentColor" stroke="none">
            10.0.4.0/24
          </text>
          <path d="M30 34v10M66 34v10M30 44h36" />
          <rect x="22" y="48" width="16" height="10" rx="2" fill={fill} />
          <rect x="58" y="48" width="16" height="10" rx="2" fill={fill} strokeDasharray="3 3" />
        </>
      );
  }
}

export function Illustration({ art }: { art: Art }) {
  return (
    <svg
      viewBox="0 0 96 64"
      className="h-16 w-24 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      <Drawing art={art} />
    </svg>
  );
}

// One anti-cheating rule as a card: icon, name, a line about what it does and a drawing of it. The head of the card is
// the switch (click, Space or Enter); `children` holds an extra setting (a number, a list) shown below it while on.
export function RuleCard({
  art,
  icon,
  title,
  description,
  checked,
  onChange,
  locked,
  disabled,
  disabledHint,
  children,
}: {
  art: Art;
  icon: ReactNode;
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  // Required by the session's type: shown on and can't be turned off.
  locked?: boolean;
  // Not available right now (needs another rule first).
  disabled?: boolean;
  disabledHint?: string;
  children?: ReactNode;
}) {
  const off = locked || disabled;
  const descId = useId();
  return (
    <div
      className={clsx(
        "flex flex-col rounded-xl border transition-colors",
        checked ? "border-primary bg-primary-soft/60" : "border-border bg-surface",
        disabled && "opacity-60",
      )}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        aria-describedby={descId}
        disabled={off}
        onClick={() => onChange(!checked)}
        className={clsx(
          "flex flex-1 flex-col gap-3 rounded-xl p-4 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
          off ? "cursor-not-allowed" : "cursor-pointer hover:bg-surface-muted/60",
        )}
      >
        <span className="flex items-start justify-between gap-3">
          <span className="flex items-center gap-2.5">
            <span
              className={clsx(
                "grid size-8 shrink-0 place-items-center rounded-lg",
                checked ? "bg-primary text-primary-foreground" : "bg-surface-muted text-muted",
              )}
              aria-hidden
            >
              {icon}
            </span>
            <span className="text-sm font-semibold leading-tight">{title}</span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            {locked && <Lock className="size-3.5 text-muted" aria-label="Required for exams" />}
            <span
              aria-hidden
              className={clsx(
                "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                checked ? "bg-primary" : "bg-border",
              )}
            >
              <span
                className={clsx(
                  "block size-4 rounded-full bg-white shadow transition-transform",
                  checked ? "translate-x-[1.1rem]" : "translate-x-0.5",
                )}
              />
            </span>
          </span>
        </span>
        <span className="flex items-center gap-3">
          <span className={clsx("rounded-lg bg-surface/70 p-1", checked ? "text-primary" : "text-muted")}>
            <Illustration art={art} />
          </span>
          <span id={descId} className="text-xs text-muted">
            {description}
            {disabled && disabledHint && <span className="mt-1 block font-medium">{disabledHint}</span>}
          </span>
        </span>
      </button>
      {checked && children && <div className="border-t border-border/70 px-4 py-3">{children}</div>}
    </div>
  );
}

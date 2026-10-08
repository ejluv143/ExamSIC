"use client";

import { useEffect, useState } from "react";
import { Camera, Copy, Download, Keyboard, Layers, Maximize, Mic, MonitorX, ScanSearch, Video, type LucideIcon } from "lucide-react";
import { useReducedMotion } from "./reduced-motion";
import { c } from "./theme";

type Kind = "fullscreen" | "switch" | "screen" | "copy";

const features: { kind?: Kind; icon: LucideIcon; title: string; text: string }[] = [
  { kind: "fullscreen", icon: Maximize, title: "Full screen, with chances", text: "Leaving full screen is a warning. Students see how many chances are left before the exam submits itself." },
  { kind: "switch", icon: Layers, title: "Tab and app switches", text: "Switching tabs, Alt+Tab and leaving the window are logged with the time, for the teacher to review." },
  { kind: "screen", icon: MonitorX, title: "One screen only", text: "In Chrome and Edge, a second monitor has to be disconnected before the exam starts." },
  { kind: "copy", icon: Copy, title: "No copy and paste", text: "Copy, paste, drag-and-drop, right-click and printing are blocked, and the clipboard is cleared at the start." },
];

const codeFeatures: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Keyboard, title: "Typing replay", text: "Watch how a code answer was written; pasted blocks and robot-fast typing are flagged." },
  { icon: ScanSearch, title: "Similarity check", text: "Code answers are compared ignoring names and comments, so a renamed copy still shows up." },
];

// What Examora doesn't use.
const never: [LucideIcon, string][] = [
  [Camera, "Webcam"],
  [Mic, "Microphone"],
  [Download, "Software to install"],
  [Video, "Screen recording"],
];

// Labels as the teacher sees them (src/lib/integrity.ts).
const events: { time: string; kind: Kind; text: string; tone: "warn" | "alert" }[] = [
  { time: "09:12:37", kind: "copy", text: "Tried to paste", tone: "warn" },
  { time: "09:14:02", kind: "copy", text: "Tried to right-click", tone: "warn" },
  { time: "09:18:10", kind: "switch", text: "Switched apps (Alt+Tab)", tone: "alert" },
  { time: "09:18:10", kind: "fullscreen", text: "Exited full screen", tone: "alert" },
  { time: "09:24:51", kind: "switch", text: "Switched tabs or minimized the browser", tone: "alert" },
  { time: "09:31:06", kind: "screen", text: "Connected a second screen", tone: "alert" },
  { time: "09:40:19", kind: "switch", text: "Moved the mouse off the exam", tone: "warn" },
];

const toneDot = { warn: "bg-[#ffb68a]", alert: "bg-[#ffb4ab]" };
const toneText = { warn: "text-[#ffb68a]", alert: "text-[#ffb4ab]" };

// `promise` (what's never used) and `codeChecks` can be hidden where a page shows them on its own.
export function Integrity({ promise = true, codeChecks = true }: { promise?: boolean; codeChecks?: boolean }) {
  const reduced = useReducedMotion();
  const [active, setActive] = useState<Kind | null>(null);
  // How many log rows have streamed in; a few extra steps hold the full log before it starts over.
  const [shown, setShown] = useState(events.length);

  useEffect(() => {
    if (reduced) return;
    const timer = setTimeout(() => setShown((n) => (n >= events.length + 4 ? 1 : n + 1)), shown === events.length ? 1200 : 900);
    return () => clearTimeout(timer);
  }, [reduced, shown]);

  const visible = reduced ? events.length : Math.min(shown, events.length);
  const warnings = events.slice(0, visible).filter((e) => e.text === "Exited full screen").length;
  const alerts = events.slice(0, visible).filter((e) => e.tone === "alert").length;

  return (
    <div className="grid items-start gap-10 lg:grid-cols-[1fr_1.05fr]">
      <div>
        {promise && (
        <ul className="flex flex-wrap gap-2" aria-label="Never used">
          {never.map(([Icon, label]) => (
            <li
              key={label}
              className={`flex items-center gap-1.5 rounded-full border ${c.line} bg-white/[0.03] px-3 py-1 text-xs ${c.muted}`}
            >
              <Icon className="size-3.5 text-[#ffb4ab]/80" aria-hidden />
              <span className="line-through decoration-[#ffb4ab]/70">{label}</span>
            </li>
          ))}
        </ul>
        )}

        <p className={`${promise ? "mt-8" : ""} text-[11px] font-bold tracking-[0.16em] uppercase ${c.violet}`}>Every exam</p>
        <ul className="mt-3 space-y-2">
          {features.map((f) => (
            <li
              key={f.title}
              onMouseEnter={() => setActive(f.kind ?? null)}
              onMouseLeave={() => setActive(null)}
              className={`flex gap-4 rounded-2xl border p-4 transition-colors duration-200 ${
                active === f.kind ? "border-[#d0bcff]/40 bg-[#d0bcff]/[0.07]" : `${c.line} bg-transparent`
              }`}
            >
              <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${c.high} ${c.violet}`}>
                <f.icon className="size-5" aria-hidden />
              </span>
              <div>
                <h3 className="font-display font-semibold">{f.title}</h3>
                <p className={`mt-0.5 text-sm leading-relaxed ${c.muted}`}>{f.text}</p>
              </div>
            </li>
          ))}
        </ul>

        {codeChecks && (
          <>
        <p className={`mt-6 text-[11px] font-bold tracking-[0.16em] uppercase ${c.green}`}>For code answers</p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {codeFeatures.map((f) => (
            <li key={f.title} className={`rounded-2xl border ${c.line} p-4`}>
              <f.icon className={`size-5 ${c.green}`} aria-hidden />
              <h3 className="mt-2 font-display text-sm font-semibold">{f.title}</h3>
              <p className={`mt-0.5 text-xs leading-relaxed ${c.muted}`}>{f.text}</p>
            </li>
          ))}
        </ul>
          </>
        )}
      </div>

      {/* The teacher's view of one student's exam. */}
      <div aria-hidden className="lg:sticky lg:top-24">
        <div className="rounded-3xl bg-gradient-to-b from-[#d0bcff]/40 to-white/[0.03] p-px shadow-[0_30px_80px_-30px_rgba(208,188,255,0.35)]">
          <div className={`overflow-hidden rounded-[23px] ${c.low}`}>
            <div className={`flex items-center justify-between border-b ${c.line} px-5 py-4`}>
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-full bg-[#d0bcff]/15 font-display text-sm font-bold text-[#d0bcff]">HR</span>
                <div>
                  <p className="text-sm font-semibold">Ramos, Hannah</p>
                  <p className={`text-[11px] ${c.muted}`}>ENG 101 Midterm · activity log</p>
                </div>
              </div>
              <span className="flex items-center gap-1.5 rounded-full bg-[#4edea3]/10 px-2.5 py-1 text-[11px] font-semibold text-[#4edea3]">
                <span className="size-1.5 animate-pulse rounded-full bg-[#4edea3]" /> Live
              </span>
            </div>

            <div className={`flex items-center justify-between border-b ${c.line} px-5 py-3 text-xs`}>
              <span className={c.muted}>Full-screen chances</span>
              <span className="flex items-center gap-2">
                <span className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className={`h-2 w-7 rounded-full transition-colors duration-500 ${i < 3 - warnings ? "bg-[#d0bcff]" : "bg-[#ffb4ab]/60"}`}
                    />
                  ))}
                </span>
                <span className="font-semibold tabular-nums">{3 - warnings} left</span>
              </span>
            </div>

            <ol className="h-[300px] space-y-1.5 overflow-hidden p-4 font-mono text-[12px]">
              {events.slice(0, visible).map((e, i) => {
                const dim = active !== null && active !== e.kind;
                const lit = active !== null && active === e.kind;
                return (
                  <li
                    key={i}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-all duration-300 motion-safe:animate-[fade-in_0.35s_ease-out] ${
                      lit ? "bg-[#d0bcff]/10 ring-1 ring-[#d0bcff]/40" : "bg-white/[0.03]"
                    } ${dim ? "opacity-30" : "opacity-100"}`}
                  >
                    <span className={`size-1.5 shrink-0 rounded-full ${toneDot[e.tone]}`} />
                    <span className="text-[#c7c4d7]/60 tabular-nums">{e.time}</span>
                    <span className={toneText[e.tone]}>{e.text}</span>
                  </li>
                );
              })}
            </ol>

            <div className={`flex items-center justify-between gap-3 border-t ${c.line} bg-[#0b1326]/60 px-5 py-3.5 text-xs`}>
              <span className={c.muted}>
                <span className="font-semibold text-[#ffb4ab]">
                  {alerts} {alerts === 1 ? "alert" : "alerts"}
                </span>{" "}
                · flags, not accusations
              </span>
              <span className="rounded-lg bg-[#d0bcff] px-2.5 py-1 font-bold text-[#21005d]">You decide</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

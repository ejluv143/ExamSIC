"use client";

import { useState } from "react";
import { AlertTriangle, Check, Copy, Layers, Maximize, MonitorX, RotateCcw, Send, Stamp, type LucideIcon } from "lucide-react";
import { c } from "../_landing/theme";

// Try it: leave full screen and watch the chances run out, with the limit the teacher chose.
export function ChancesSimulator() {
  const [limit, setLimit] = useState<number | null>(3);
  const [exits, setExits] = useState(0);
  const submitted = limit !== null && exits >= limit;
  const left = limit === null ? null : Math.max(0, limit - exits);

  return (
    <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
      {/* Teacher's side */}
      <div className="rounded-3xl border border-white/10 bg-[#131b2e] p-6">
        <p className="text-[11px] font-bold tracking-[0.16em] text-[#c0c1ff] uppercase">Teacher sets</p>
        <p className="mt-2 font-display text-lg font-semibold">Submit automatically after…</p>
        <div role="radiogroup" aria-label="Chances" className="mt-4 grid grid-cols-4 gap-1.5">
          {[1, 2, 3, null].map((n) => (
            <button
              key={String(n)}
              type="button"
              role="radio"
              aria-checked={limit === n}
              onClick={() => {
                setLimit(n);
                setExits(0);
              }}
              className={`rounded-xl border py-2.5 text-sm font-semibold transition-colors ${
                limit === n ? "border-[#c0c1ff] bg-[#c0c1ff] text-[#1000a9]" : "border-white/10 text-[#c7c4d7] hover:bg-white/5"
              }`}
            >
              {n === null ? "Never" : `${n}×`}
            </button>
          ))}
        </div>
        <p className={`mt-4 text-sm leading-relaxed ${c.muted}`}>
          Leaving the page or full screen counts. With &ldquo;Never&rdquo;, every exit is still logged for you to review.
        </p>
      </div>

      {/* Student's side */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#060e20] p-6">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-bold tracking-[0.16em] text-[#4edea3] uppercase">Student sees</p>
          {left !== null && (
            <span className="flex items-center gap-1.5 text-xs">
              {Array.from({ length: limit ?? 0 }, (_, i) => (
                <span key={i} className={`h-2 w-7 rounded-full transition-colors duration-300 ${i < left ? "bg-[#d0bcff]" : "bg-[#ffb4ab]/50"}`} />
              ))}
              <span className="ml-1 font-semibold tabular-nums">{left} left</span>
            </span>
          )}
        </div>

        <div className="mt-5 min-h-44 rounded-2xl border border-white/10 bg-[#131b2e] p-5">
          {submitted ? (
            <div className="text-center motion-safe:animate-[fade-in_0.3s_ease-out]">
              <span className="mx-auto grid size-12 place-items-center rounded-full bg-[#ffb4ab]/15 text-[#ffb4ab]">
                <Send className="size-5" aria-hidden />
              </span>
              <p className="mt-3 font-display text-lg font-semibold">Submitted automatically</p>
              <p className={`mt-1 text-sm ${c.muted}`}>Too many exits from full screen. The teacher sees why.</p>
            </div>
          ) : exits > 0 ? (
            <div key={exits} className="motion-safe:animate-[fade-in_0.3s_ease-out]">
              <p className="flex items-center gap-2 font-semibold text-[#ffb68a]">
                <AlertTriangle className="size-5" aria-hidden /> You left full screen
              </p>
              <p className={`mt-2 text-sm ${c.muted}`}>
                {left === null
                  ? `Warning ${exits}. It's logged for your teacher.`
                  : `Warning ${exits} of ${limit}: you can come back ${left} more ${left === 1 ? "time" : "times"}.`}
              </p>
              <span className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#c0c1ff] px-3 py-1.5 text-sm font-bold text-[#1000a9]">
                <Maximize className="size-4" aria-hidden /> Back to full screen
              </span>
            </div>
          ) : (
            <div>
              <p className="flex items-center gap-2 font-semibold text-[#4edea3]">
                <Check className="size-5" aria-hidden /> In full screen
              </p>
              <p className={`mt-2 text-sm ${c.muted}`}>Neither the students nor the teacher ___ late.</p>
              <div className="mt-3 w-32 rounded-lg border border-[#4edea3]/40 bg-[#4edea3]/10 px-3 py-1.5 font-semibold text-[#4edea3]">was</div>
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setExits((n) => n + 1)}
            disabled={submitted}
            className="inline-flex items-center gap-2 rounded-xl bg-[#ffb4ab]/15 px-4 py-2 text-sm font-semibold text-[#ffb4ab] ring-1 ring-[#ffb4ab]/30 hover:bg-[#ffb4ab]/25 disabled:opacity-40"
          >
            <Layers className="size-4" aria-hidden /> Leave full screen
          </button>
          <button
            type="button"
            onClick={() => setExits(0)}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold ${c.muted} ring-1 ring-white/10 hover:bg-white/5`}
          >
            <RotateCcw className="size-4" aria-hidden /> Start over
          </button>
        </div>
      </div>
    </div>
  );
}

type Rule = { key: string; icon: LucideIcon; title: string; text: string; quiz: boolean; exam: boolean };

// The defaults from src/lib/integrity.ts: exams get everything, quizzes stay light. Every switch can be changed.
const rules: Rule[] = [
  { key: "fullscreen", icon: Maximize, title: "Require full screen", text: "Leaving it is a warning.", quiz: true, exam: true },
  { key: "focus", icon: Layers, title: "Log tab and app switches", text: "Alt+Tab, other tabs, the mouse leaving the exam.", quiz: true, exam: true },
  { key: "screen", icon: MonitorX, title: "One screen only", text: "Chrome and Edge: won't start with a second monitor, pauses if one is added.", quiz: false, exam: true },
  { key: "copy", icon: Copy, title: "Block copy and paste", text: "Also drag, right-click and printing; clears the clipboard; flags pasted blocks.", quiz: false, exam: true },
  { key: "watermark", icon: Stamp, title: "Name watermark", text: "Faint name and student number across the screen.", quiz: false, exam: true },
];

export function SettingsDemo() {
  const [kind, setKind] = useState<"quiz" | "exam">("exam");
  return (
    <div className="rounded-3xl bg-gradient-to-b from-[#d0bcff]/35 to-white/[0.03] p-px">
      <div className="rounded-[23px] bg-[#131b2e] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-display text-lg font-semibold">Anti-cheating</p>
          <div role="radiogroup" aria-label="Kind" className="flex rounded-xl border border-white/10 bg-white/[0.03] p-1 text-sm font-semibold">
            {(["quiz", "exam"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                onClick={() => setKind(k)}
                className={`rounded-lg px-4 py-1.5 capitalize transition-colors ${kind === k ? "bg-[#d0bcff] text-[#21005d]" : "text-[#c7c4d7] hover:text-white"}`}
              >
                {k}
              </button>
            ))}
          </div>
        </div>
        <ul className="mt-5 space-y-2">
          {rules.map((r) => {
            const on = r[kind];
            return (
              <li key={r.key} className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.02] p-3">
                <span className={`grid size-9 shrink-0 place-items-center rounded-xl transition-colors ${on ? "bg-[#d0bcff]/15 text-[#d0bcff]" : "bg-white/5 text-[#c7c4d7]/50"}`}>
                  <r.icon className="size-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{r.title}</span>
                  <span className={`block text-xs ${c.muted}`}>{r.text}</span>
                </span>
                <span
                  aria-label={on ? "On" : "Off"}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-300 ${on ? "bg-[#4edea3]" : "bg-white/10"}`}
                >
                  <span className={`absolute top-1 size-4 rounded-full bg-white shadow transition-all duration-300 ${on ? "left-6" : "left-1"}`} />
                </span>
              </li>
            );
          })}
        </ul>
        <p className={`mt-4 text-xs ${c.muted}`}>Defaults for a new {kind}. Every switch can be changed per quiz or exam.</p>
      </div>
    </div>
  );
}

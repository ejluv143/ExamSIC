"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { BookOpen, FileSpreadsheet, GraduationCap, ListChecks, type LucideIcon } from "lucide-react";
import { useReducedMotion } from "./reduced-motion";

const questionTypes = ["Multiple choice", "Identification", "Enumeration", "Fill in the blank", "True/false", "Essay", "Numeric", "Code", "SQL"];
const subjects = ["General", "English", "Mathematics", "Science", "Programming"];

// Counts from 0 to `to` once the tiles scroll into view.
function useCountUp(to: number, start: boolean, reduced: boolean) {
  const [n, setN] = useState(to);
  useEffect(() => {
    if (!start || reduced) return;
    let raf = 0;
    const begin = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - begin) / 1100);
      setN(Math.round(to * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, start, reduced]);
  return n;
}

function Tile({
  icon: Icon,
  tone,
  glow,
  value,
  label,
  children,
}: {
  icon: LucideIcon;
  tone: string;
  glow: string;
  value: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="group relative overflow-hidden bg-[#0c1428]/90 p-4 transition-colors hover:bg-[#111a31]/95 sm:p-6">
      {/* Colored light in the corner, brighter on hover. */}
      <div className={`pointer-events-none absolute -top-16 -right-16 size-40 rounded-full opacity-40 transition-opacity group-hover:opacity-80 ${glow}`} />
      <div className="relative flex items-center gap-2.5">
        <span className={`grid size-8 place-items-center rounded-lg bg-white/5 ring-1 ring-white/10 ${tone}`}>
          <Icon className="size-4" aria-hidden />
        </span>
        <span className="text-[11px] leading-tight font-semibold tracking-wider text-[#c7c4d7] uppercase">{label}</span>
      </div>
      <p className={`relative mt-3 font-display text-[26px] leading-none font-bold tracking-tight tabular-nums sm:mt-4 sm:text-[40px] ${tone}`}>
        {value}
      </p>
      {/* The details are left out on phones, to keep the page short. */}
      <div className="relative mt-4 hidden sm:block">{children}</div>
    </div>
  );
}

// What's inside, in numbers that are simply true.
export function HeroStats() {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && setSeen(true), { threshold: 0.4 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const types = useCountUp(9, seen, reduced);
  const presets = useCountUp(5, seen, reduced);

  return (
    <div
      ref={ref}
      className="relative w-full rounded-2xl bg-gradient-to-r from-[#c0c1ff]/40 via-[#464554]/40 to-[#4edea3]/40 p-px shadow-[0_20px_60px_-25px_rgba(192,193,255,0.35)] lg:col-span-2"
    >
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[15px] bg-white/[0.06] lg:grid-cols-4">
        <Tile icon={ListChecks} tone="text-[#4edea3]" glow="bg-[radial-gradient(closest-side,#4edea3,transparent)]" value={types} label="Question types">
          <ul className="flex flex-wrap gap-1" aria-label="Question types">
            {questionTypes.map((t) => (
              <li key={t} className="rounded-md bg-white/5 px-1.5 py-0.5 text-[10.5px] text-[#c7c4d7]">
                {t}
              </li>
            ))}
          </ul>
        </Tile>

        <Tile icon={BookOpen} tone="text-[#c0c1ff]" glow="bg-[radial-gradient(closest-side,#c0c1ff,transparent)]" value={presets} label="Subject presets">
          <ul className="flex flex-wrap gap-1" aria-label="Subjects">
            {subjects.map((name) => (
              <li key={name} className="rounded-md border border-[#c0c1ff]/20 bg-[#c0c1ff]/5 px-1.5 py-0.5 text-[10.5px] text-[#dae2fd]">
                {name}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-[#c7c4d7]">Each one offers the question types that fit it.</p>
        </Tile>

        <Tile icon={GraduationCap} tone="text-[#d0bcff]" glow="bg-[radial-gradient(closest-side,#d0bcff,transparent)]" value="1.00–5.00" label="Transmuted grades, done for you">
          {/* The grading scale: 1.00 is the top grade, 3.00 passes, 5.00 fails. */}
          <div aria-hidden>
            <div className="relative h-1.5 rounded-full bg-gradient-to-r from-[#4edea3] via-[#d0bcff] to-[#f2716b]">
              <span className="absolute top-1/2 left-[22%] size-3 -translate-y-1/2 rounded-full border-2 border-[#0c1428] bg-white shadow" />
            </div>
            <div className="mt-1.5 flex justify-between font-mono text-[10px] text-[#c7c4d7]">
              <span>1.00</span>
              <span>3.00 pass</span>
              <span>5.00</span>
            </div>
          </div>
        </Tile>

        <Tile icon={FileSpreadsheet} tone="text-[#dae2fd]" glow="bg-[radial-gradient(closest-side,#f2716b,transparent)]" value="0" label="Spreadsheets to fill in by hand">
          <div className="space-y-1.5 text-[12px] text-[#c7c4d7]">
            <span className="inline-block rounded-md bg-white/5 px-1.5 py-0.5 font-mono text-[10.5px] whitespace-nowrap text-[#c7c4d7]/70 line-through decoration-[#f2716b]">
              CLASS-RECORD.xlsm
            </span>
            <p>Scores land in the class record by themselves.</p>
          </div>
        </Tile>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

// The five steps as a sticky bar: the line fills up to the step being read.
export function Stepper({ steps }: { steps: { id: string; title: string; you: boolean }[] }) {
  const [current, setCurrent] = useState(-1);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setCurrent(steps.findIndex((s) => s.id === e.target.id));
      },
      { rootMargin: "-40% 0px -55% 0px" },
    );
    steps.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [steps]);

  const progress = current < 0 ? 0 : (current / (steps.length - 1)) * 100;

  return (
    <nav aria-label="Steps" className="sticky top-(--header-h,76px) z-30 px-4 transition-[top] duration-300 lg:px-10">
      <div className="mx-auto max-w-5xl rounded-2xl border border-white/10 bg-[#0b1326]/80 px-4 py-3 backdrop-blur-xl sm:px-6">
        <ol className="relative flex items-center justify-between">
          <div aria-hidden className="absolute top-4 right-4 left-4 h-0.5 rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#c0c1ff] via-[#c0c1ff] via-40% to-[#4edea3] transition-[width] duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          {steps.map((s, i) => {
            const done = i <= current;
            const color = s.you ? "#c0c1ff" : "#4edea3";
            return (
              <li key={s.id} className="relative">
                <a href={`#${s.id}`} className="flex flex-col items-center gap-1.5">
                  <span
                    className="grid size-8 place-items-center rounded-full border-2 font-display text-xs font-bold transition-all duration-300"
                    style={{
                      borderColor: done ? color : "rgba(255,255,255,0.15)",
                      background: i === current ? color : "#0b1326",
                      color: i === current ? "#0b1326" : done ? color : "#c7c4d7",
                      transform: i === current ? "scale(1.1)" : "scale(1)",
                    }}
                  >
                    {i + 1}
                  </span>
                  <span className={`hidden text-xs font-semibold sm:block ${i === current ? "text-white" : "text-[#c7c4d7]"}`}>{s.title}</span>
                </a>
              </li>
            );
          })}
        </ol>
      </div>
    </nav>
  );
}

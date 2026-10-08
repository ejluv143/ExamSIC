"use client";

import { useState, type ReactNode } from "react";
import { Check, Play } from "lucide-react";
import { c } from "../_landing/theme";
import { questionTypes } from "./data";

const answer = "rounded-md border border-[#4edea3]/40 bg-[#4edea3]/10 px-2 py-0.5 font-semibold text-[#4edea3]";

// What each question type looks like to a student, already answered.
const previews: Record<string, ReactNode> = {
  "Multiple choice": (
    <ul className="grid gap-2 sm:grid-cols-2">
      {["Ribosome", "Mitochondrion", "Golgi apparatus", "Nucleus"].map((o) => (
        <li key={o} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${o === "Mitochondrion" ? "border-[#4edea3]/50 bg-[#4edea3]/10 text-[#4edea3]" : `${c.line} ${c.muted}`}`}>
          <span className={`grid size-3.5 place-items-center rounded-full border ${o === "Mitochondrion" ? "border-[#4edea3]" : "border-[#464554]"}`}>
            {o === "Mitochondrion" && <span className="size-1.5 rounded-full bg-[#4edea3]" />}
          </span>
          {o}
        </li>
      ))}
    </ul>
  ),
  Identification: (
    <p className="flex flex-wrap items-center gap-2 text-sm">
      Answer: <span className={answer}>Photosynthesis</span>
    </p>
  ),
  Enumeration: (
    <ol className="space-y-2 text-sm">
      {["Executive", "Legislative", "Judicial"].map((b, i) => (
        <li key={b} className="flex items-center gap-2">
          <span className={c.muted}>{i + 1}.</span> <span className={answer}>{b}</span>
        </li>
      ))}
    </ol>
  ),
  "Fill in the blanks": (
    <p className="text-[15px] leading-loose">
      Neither the students nor the teacher <span className={answer}>was</span> late.
    </p>
  ),
  "True or false": (
    <div className="flex gap-2">
      <span className="rounded-lg border border-[#4edea3]/50 bg-[#4edea3]/10 px-4 py-2 text-sm font-semibold text-[#4edea3]">True</span>
      <span className={`rounded-lg border ${c.line} px-4 py-2 text-sm ${c.muted}`}>False</span>
    </div>
  ),
  Essay: (
    <div>
      <p className="rounded-lg border border-white/10 bg-[#060e20]/70 p-3 text-sm leading-relaxed text-[#dae2fd]">
        The story shows that courage is not the absence of fear, but choosing to act anyway. When the narrator…
      </p>
      <p className={`mt-2 text-xs ${c.muted}`}>148 / 150 words · graded by the teacher with comments</p>
    </div>
  ),
  Numeric: (
    <div className="space-y-3">
      <p className="font-serif text-2xl italic">
        2x<sup className="text-sm">2</sup> − 18 = 0
      </p>
      <p className="flex items-center gap-2 text-sm">
        <span className={c.muted}>x =</span> <span className={`${answer} font-mono`}>3</span>
      </p>
    </div>
  ),
  Code: (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-[#060e20]">
      <pre className="p-3 font-mono text-[12.5px] leading-relaxed text-[#dae2fd]">
        <span className="text-[#d0bcff]">def</span> <span className="text-[#4edea3]">sum_even</span>(nums):{"\n"}
        {"    "}
        <span className="text-[#d0bcff]">return</span> sum(n <span className="text-[#d0bcff]">for</span> n <span className="text-[#d0bcff]">in</span> nums{" "}
        <span className="text-[#d0bcff]">if</span> n % <span className="text-[#ffb68a]">2</span> == <span className="text-[#ffb68a]">0</span>)
      </pre>
      <div className="flex items-center justify-between border-t border-white/10 px-3 py-2 text-xs">
        <span className="flex items-center gap-1.5 text-[#4edea3]">
          <Check className="size-3.5" /> 2 of 2 sample tests passed
        </span>
        <span className="flex items-center gap-1 rounded-md bg-[#c0c1ff] px-2 py-0.5 font-bold text-[#1000a9]">
          <Play className="size-3" /> Run
        </span>
      </div>
    </div>
  ),
  "SQL query": (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-[#060e20]">
      <pre className="p-3 font-mono text-[12.5px] text-[#dae2fd]">
        <span className="text-[#d0bcff]">SELECT</span> name, absences <span className="text-[#d0bcff]">FROM</span> students{"\n"}
        <span className="text-[#d0bcff]">WHERE</span> absences {">"} <span className="text-[#ffb68a]">3</span>;
      </pre>
      <table className="w-full border-t border-white/10 text-xs">
        <tbody>
          {[
            ["Cruz, Bea", 5],
            ["Lim, Paolo", 4],
          ].map(([n, a]) => (
            <tr key={n} className="border-b border-white/5">
              <td className="px-3 py-1.5">{n}</td>
              <td className="px-3 py-1.5 text-right font-mono text-[#7cc4ff]">{a}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="flex items-center gap-1.5 px-3 py-2 text-xs text-[#4edea3]">
        <Check className="size-3.5" /> Rows match your answer query
      </p>
    </div>
  ),
};

// Pick a question type on the left; the right shows it answered.
export function TypePreview() {
  const [picked, setPicked] = useState(0);
  const t = questionTypes[picked];
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <ul role="tablist" aria-label="Question types" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-1">
        {questionTypes.map((q, i) => (
          <li key={q.name}>
            <button
              type="button"
              role="tab"
              aria-selected={i === picked}
              onClick={() => setPicked(i)}
              onMouseEnter={() => setPicked(i)}
              className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                i === picked ? "border-[#c0c1ff]/40 bg-[#c0c1ff]/10" : `${c.line} hover:bg-white/[0.03]`
              }`}
            >
              <span className={`font-mono text-xs ${i === picked ? "text-[#c0c1ff]" : "text-[#464554]"}`}>{String(i + 1).padStart(2, "0")}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{q.name}</span>
                <span className={`hidden truncate text-[11px] lg:block ${q.subjects === "Every subject" ? "text-[#4edea3]/80" : c.muted}`}>{q.subjects}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div className="rounded-3xl bg-gradient-to-b from-[#c0c1ff]/35 to-white/[0.03] p-px transition-[top] duration-300 lg:sticky lg:top-[calc(var(--header-h,76px)+100px)] lg:self-start">
        <div role="tabpanel" aria-label={t.name} className={`rounded-[23px] ${c.low} p-6`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold tracking-[0.16em] text-[#c0c1ff] uppercase">{t.name}</span>
            <span className={`rounded-full border border-white/10 px-2.5 py-0.5 text-[11px] ${c.muted}`}>{t.subjects}</span>
          </div>
          <p className="mt-4 font-display text-lg font-semibold">{t.example}</p>
          <div key={t.name} className="mt-5 motion-safe:animate-[fade-in_0.3s_ease-out]">
            {previews[t.name]}
          </div>
        </div>
      </div>
    </div>
  );
}

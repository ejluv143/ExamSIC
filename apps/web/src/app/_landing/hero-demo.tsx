"use client";

import { useEffect, useState } from "react";
import { Check, ClipboardList, Maximize2, PenLine } from "lucide-react";
import { useReducedMotion } from "./reduced-motion";

type Demo = {
  subject: string;
  exam: string;
  kind: string;
  prompt: string;
  answer: string;
  code?: boolean;
  // [what was checked, result, whether it waits for the teacher]
  results: [string, string, boolean?][];
  record: string;
  score: string;
};

// One question per subject: the answer types itself, it's checked, and the score lands in the class record.
const demos: Demo[] = [
  {
    subject: "English",
    exam: "ENG 101 · Quiz 2",
    kind: "Fill in the blank",
    prompt: "Neither the students nor the teacher ____ late.",
    answer: "was",
    results: [
      ["Q1 · True or false", "correct"],
      ["Q4 · Fill in the blank", "correct"],
      ["Q6 · Essay", "teacher grades", true],
    ],
    record: "BSED 1-A",
    score: "8/10 so far",
  },
  {
    subject: "Mathematics",
    exam: "MATH 102 · Long quiz",
    kind: "Numeric",
    prompt: "Solve for x > 0:  2x² − 18 = 0",
    answer: "3",
    results: [
      ["Q1 · Multiple choice", "correct"],
      ["Q2 · Numeric", "correct"],
      ["Q3 · Numeric", "correct"],
    ],
    record: "BSA 1-B",
    score: "15/15",
  },
  {
    subject: "Science",
    exam: "SCI 101 · Midterm",
    kind: "Identification",
    prompt: "Which organelle makes most of a cell's ATP?",
    answer: "Mitochondrion",
    results: [
      ["Q1 · Identification", "correct"],
      ["Q2 · Enumeration", "3 of 3"],
      ["Q3 · True or false", "correct"],
    ],
    record: "BSN 1-A",
    score: "38/40",
  },
  {
    subject: "Programming",
    exam: "IT 302 · Practice exam",
    kind: "Code · Python",
    prompt: "Return the sum of the even numbers in nums.",
    answer: "def sum_even(nums):\n    return sum(n for n in nums\n               if n % 2 == 0)",
    code: true,
    results: [
      ["sum_even([1, 2, 3, 4])", "6"],
      ["sum_even([])", "0"],
      ["hidden test", "passed"],
    ],
    record: "BSIT 3-A",
    score: "10/10",
  },
];

// Frames per demo: typing, then one result at a time, then the score, then a pause.
const framesFor = (d: Demo) => d.answer.length + d.results.length * 8 + 30;

export function HeroDemo() {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [frame, setFrame] = useState(() => framesFor(demos[0]) - 1);
  const demo = demos[index];
  const typed = demo.answer.length;

  useEffect(() => {
    if (reduced) return;
    const last = frame >= framesFor(demo) - 1;
    const timer = setTimeout(
      () => {
        if (last) {
          setIndex((i) => (i + 1) % demos.length);
          setFrame(0);
        } else setFrame((f) => f + 1);
      },
      frame < typed ? (demo.code ? 30 : 90) : 110,
    );
    return () => clearTimeout(timer);
  }, [reduced, frame, demo, typed]);

  const f = reduced ? framesFor(demo) - 1 : frame;
  const shown = demo.answer.slice(0, Math.min(f, typed));
  const checked = f < typed ? 0 : Math.min(demo.results.length, Math.floor((f - typed) / 8));
  const scored = checked === demo.results.length && f >= typed + demo.results.length * 8 + 4;

  return (
    <div aria-hidden className="relative mx-auto w-full max-w-md select-none">
      {/* Subjects, the current one lit up. */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {demos.map((d, i) => (
          <span
            key={d.subject}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors duration-300 ${
              i === index
                ? "border-[#4edea3]/50 bg-[#4edea3]/15 text-[#4edea3]"
                : "border-white/10 bg-[#0e1529]/70 text-[#c7c4d7]/70"
            }`}
          >
            {d.subject}
          </span>
        ))}
      </div>

      {/* Exam window */}
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0e1529]/95 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] ring-1 ring-[#c0c1ff]/10">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5 text-[11px]">
          <span className="flex items-center gap-2 font-semibold text-[#dae2fd]">
            <span className="size-2 rounded-full bg-[#4edea3]" /> {demo.exam}
          </span>
          <span className="rounded-full bg-white/5 px-2 py-0.5 font-mono text-[#c7c4d7]">24:05 left</span>
        </div>
        <div className="px-4 pt-3">
          <p className="text-[10px] font-bold tracking-[0.14em] text-[#c0c1ff] uppercase">{demo.kind}</p>
          <p className="mt-1 text-[13.5px] text-[#dae2fd]">{demo.prompt}</p>
        </div>
        <div className="m-4 mb-3 h-[96px] overflow-hidden rounded-lg bg-[#060e20] p-3">
          {demo.code ? (
            <pre className="font-mono text-[12px] leading-[1.55] text-[#dae2fd]">
              {shown}
              {f < typed && <Caret />}
            </pre>
          ) : (
            <div className="flex h-full flex-col justify-center">
              <span className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-[#c7c4d7]/70 uppercase">
                <PenLine className="size-3" /> Your answer
              </span>
              <span className="mt-1.5 border-b-2 border-[#c0c1ff]/40 pb-1 font-display text-xl font-semibold text-[#dae2fd]">
                {shown}
                {f < typed && <Caret />}
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-white/10 px-4 py-2.5">
          <span className="text-[11px] font-semibold tracking-wider text-[#c7c4d7] uppercase">
            {demo.code ? "Tests" : "Checked automatically"}
          </span>
        </div>
        <ul className="space-y-1.5 px-4 pb-4 text-[11.5px]">
          {demo.results.map(([what, result, teacher], i) => (
            <li
              key={what}
              className={`flex items-center gap-2 transition-all duration-300 ${i < checked ? "translate-x-0 opacity-100" : "-translate-x-1 opacity-0"}`}
            >
              {teacher ? <PenLine className="size-3.5 text-[#d0bcff]" /> : <Check className="size-3.5 text-[#4edea3]" />}
              <span className={`text-[#dae2fd] ${demo.code ? "font-mono" : ""}`}>{what}</span>
              <span className={`ml-auto ${teacher ? "text-[#d0bcff]" : "text-[#4edea3]"}`}>{result}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Anti-cheating status */}
      <div className="absolute -top-12 right-0 flex animate-float items-center gap-2 rounded-full border border-white/10 bg-[#131b2e]/90 px-3 py-1.5 text-[11px] font-semibold text-[#dae2fd] shadow-lg">
        <Maximize2 className="size-3.5 text-[#c0c1ff]" /> Full screen · 0 alerts
      </div>

      {/* Class record */}
      <div
        className={`absolute -bottom-24 -left-3 w-64 rounded-xl border border-white/10 bg-[#131b2e]/95 p-3 shadow-2xl transition-all duration-500 ${scored ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}
      >
        <div className="flex items-center gap-2 text-[10px] font-bold tracking-[0.16em] text-[#c0c1ff] uppercase">
          <ClipboardList className="size-3.5" /> Class record · {demo.record}
        </div>
        <div className="mt-2 flex items-end justify-between">
          <div>
            <p className="text-sm font-semibold text-[#dae2fd]">{demo.exam.split(" · ")[1]}</p>
            <p className="text-[11px] text-[#c7c4d7]">{demo.subject} · scored for you</p>
          </div>
          <p className="font-display text-2xl font-bold text-[#4edea3]">{demo.score}</p>
        </div>
      </div>
    </div>
  );
}

function Caret() {
  return <span className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[0.15em] animate-caret bg-[#4edea3]" />;
}

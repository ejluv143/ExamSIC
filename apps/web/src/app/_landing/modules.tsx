"use client";

import type { MouseEvent, ReactNode } from "react";
import {
  ArrowRight,
  BookOpen,
  Calculator,
  Check,
  ClipboardList,
  Code2,
  Download,
  FlaskConical,
  Layers,
  Monitor,
  Printer,
  ShieldCheck,
  Sheet,
  type LucideIcon,
} from "lucide-react";
import { SwipeRow } from "./swipe-row";
import { c, Eyebrow, swipeItem } from "./theme";

// A light that follows the pointer across the card.
function track(e: MouseEvent<HTMLElement>) {
  const rect = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--x", `${e.clientX - rect.left}px`);
  e.currentTarget.style.setProperty("--y", `${e.clientY - rect.top}px`);
}

function Card({
  n,
  icon: Icon,
  tone,
  glow,
  label,
  title,
  text,
  points,
  next,
  visual,
  className,
}: {
  n: string;
  icon: LucideIcon;
  tone: string;
  glow: string;
  label: string;
  title: string;
  text: string;
  points: string[];
  next: string;
  visual: ReactNode;
  className: string;
}) {
  return (
    <article
      onMouseMove={track}
      className={`group relative flex flex-col overflow-hidden rounded-3xl border ${c.line} ${c.low} p-5 transition sm:p-6 ${swipeItem.sm} duration-700 hover:border-white/20 group-data-[state=hidden]/reveal:translate-y-8 group-data-[state=hidden]/reveal:opacity-0 ${className}`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: `radial-gradient(420px circle at var(--x, 50%) var(--y, 0%), ${glow}, transparent 60%)` }}
      />
      {/* Big outlined step number. */}
      <span
        aria-hidden
        className="pointer-events-none absolute right-5 -bottom-4 font-display text-[88px] leading-none font-extrabold text-transparent [-webkit-text-stroke:1px_rgba(192,193,255,0.14)]"
      >
        {n}
      </span>

      <div className="relative">{visual}</div>

      <div className="relative mt-6 flex items-center gap-2.5">
        <span className={`grid size-9 place-items-center rounded-xl bg-white/5 ring-1 ring-white/10 ${tone}`}>
          <Icon className="size-[18px]" aria-hidden />
        </span>
        <Eyebrow tone={tone}>{label}</Eyebrow>
      </div>
      <h3 className="relative mt-3 font-display text-xl font-semibold">{title}</h3>
      <p className={`relative mt-2 text-sm leading-relaxed ${c.muted}`}>{text}</p>
      <ul className={`relative mt-4 flex flex-wrap gap-1.5 text-xs ${c.muted}`}>
        {points.map((p) => (
          <li key={p} className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1">
            <Check className="size-3.5 text-[#4edea3]" aria-hidden /> {p}
          </li>
        ))}
      </ul>
      <p className={`relative mt-auto flex items-center gap-1.5 pt-4 text-xs font-semibold sm:pt-6 ${tone}`}>
        {next} <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" aria-hidden />
      </p>
    </article>
  );
}

// The inset panel each card's illustration sits in.
function Stage({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      aria-hidden
      className={`relative h-44 overflow-hidden rounded-2xl border border-white/5 ${c.lowest} [background-image:radial-gradient(rgba(192,193,255,0.08)_1px,transparent_1px)] [background-size:16px_16px] ${className}`}
    >
      {children}
    </div>
  );
}

function ExamVisual() {
  return (
    <Stage className="flex items-center justify-center gap-3 px-4 sm:gap-6 sm:px-6">
      {/* Online */}
      <div className="w-36 shrink-0 -rotate-3 rounded-xl sm:w-48 border border-white/10 bg-[#171f33] p-3 shadow-xl transition-transform duration-500 group-hover:-rotate-6">
        <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold text-[#c7c4d7]">
          <Monitor className="size-3 text-[#c0c1ff]" /> Online · 24:05
        </div>
        <div className="mb-2 h-1.5 w-3/4 rounded bg-white/20" />
        {[true, false, false].map((on, i) => (
          <div key={i} className="mb-1.5 flex items-center gap-1.5">
            <span className={`size-2.5 rounded-full border ${on ? "border-[#4edea3] bg-[#4edea3]" : "border-white/30"}`} />
            <span className={`h-1.5 rounded ${on ? "w-20 bg-[#4edea3]/60" : "w-16 bg-white/10"}`} />
          </div>
        ))}
      </div>
      {/* On paper */}
      <div className="w-32 shrink-0 rotate-3 rounded-md sm:w-40 bg-[#f4f1ea] p-3 shadow-xl transition-transform duration-500 group-hover:rotate-6">
        <div className="mb-1 flex items-center gap-1.5 text-[9px] font-bold tracking-wide text-[#1b2a4a] uppercase">
          <Printer className="size-3" /> On paper
        </div>
        <div className="mb-2 h-px bg-[#1b2a4a]/30" />
        {["w-3/4", "w-full", "w-2/3", "w-3/4"].map((w, i) => (
          <div key={i} className="mb-1.5 flex items-center gap-1.5">
            <span className="text-[8px] font-bold text-[#1b2a4a]/70">{i + 1}.</span>
            <span className={`h-1 rounded bg-[#1b2a4a]/25 ${w}`} />
          </div>
        ))}
      </div>
    </Stage>
  );
}

function SubjectsVisual() {
  const subjects: [LucideIcon, string, string][] = [
    [BookOpen, "English", "Essay"],
    [Calculator, "Math", "Numeric"],
    [FlaskConical, "Science", "Choice"],
    [Code2, "Programming", "Code · SQL"],
  ];
  return (
    <Stage className="grid grid-cols-2 gap-2 p-3">
      {subjects.map(([Icon, name, type], i) => (
        <div
          key={name}
          style={{ transitionDelay: `${i * 60}ms` }}
          className="flex flex-col justify-between rounded-xl border border-white/10 bg-[#171f33] p-2.5 transition-transform duration-300 group-hover:-translate-y-0.5"
        >
          <Icon className="size-4 text-[#4edea3]" />
          <div>
            <p className="text-[11px] font-semibold text-[#dae2fd]">{name}</p>
            <p className="text-[10px] text-[#c7c4d7]">{type}</p>
          </div>
        </div>
      ))}
    </Stage>
  );
}

function IntegrityVisual() {
  return (
    <Stage className="flex flex-col justify-center gap-3 px-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold tracking-wider text-[#c7c4d7] uppercase">Chances left</span>
        <span className="flex gap-1">
          {[true, true, false].map((left, i) => (
            <span key={i} className={`h-2 w-6 rounded-full ${left ? "bg-[#d0bcff]" : "bg-white/10"}`} />
          ))}
        </span>
      </div>
      <ul className="space-y-1.5 font-mono text-[10.5px]">
        {[
          ["10:02", "Left full screen", "text-[#ffb4ab]"],
          ["10:02", "Came back", "text-[#4edea3]"],
          ["10:15", "Paste blocked", "text-[#ffb68a]"],
        ].map(([time, what, tone]) => (
          <li key={what} className="flex items-center gap-2 rounded-md bg-white/[0.04] px-2 py-1">
            <span className="text-[#c7c4d7]/60">{time}</span>
            <span className={tone}>{what}</span>
          </li>
        ))}
      </ul>
    </Stage>
  );
}

function GradesVisual() {
  const chain: [string, string, string][] = [
    ["Quizzes", "80%", "text-[#4edea3]"],
    ["Exam", "64%", "text-[#c0c1ff]"],
    ["RS", "74.5", "text-[#dae2fd]"],
    ["Grade", "2.25", "text-[#d0bcff]"],
    ["Remark", "Passed", "text-[#4edea3]"],
  ];
  return (
    <Stage className="flex flex-col justify-center gap-4 px-5">
      <div className="flex flex-wrap items-center gap-1.5">
        {chain.map(([label, value, tone], i) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className="rounded-lg border border-white/10 bg-[#171f33] px-2.5 py-1.5 text-center">
              <p className="text-[9px] font-semibold tracking-wider text-[#c7c4d7] uppercase">{label}</p>
              <p className={`font-display text-sm font-bold tabular-nums ${tone}`}>{value}</p>
            </div>
            {i < chain.length - 1 && <ArrowRight className="size-3.5 text-[#464554]" />}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#c0c1ff] px-2.5 py-1 text-[11px] font-bold text-[#1000a9]">
          <Printer className="size-3.5" /> Print grade sheet
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-[11px] font-semibold text-[#dae2fd]">
          <Download className="size-3.5" /> Excel
        </span>
      </div>
    </Stage>
  );
}

// Exams, subjects, integrity and grades, as a bento grid where each card feeds the next; swiped on phones.
export function Modules() {
  return (
    <SwipeRow label="What Examinus does" className="sm:grid sm:grid-cols-1 sm:gap-4 lg:grid-cols-5">
      <Card
        n="01"
        icon={ClipboardList}
        tone={c.primary}
        glow="rgba(192,193,255,0.12)"
        label="Exams"
        title="Online and on paper"
        text="Build once from your question bank or an Excel sheet. Students take it online, or print a test paper and answer sheet with your school's header."
        points={["9 question types, math with LaTeX", "Timer, schedules and retakes", "Printed paper and answer sheet"]}
        next="Feeds: the right questions for each subject"
        visual={<ExamVisual />}
        className="lg:col-span-3"
      />
      <Card
        n="02"
        icon={Layers}
        tone={c.green}
        glow="rgba(78,222,163,0.12)"
        label="Every subject"
        title="The right questions for each subject"
        text="Pick the subject and Examinus offers the question types that fit: fill in the blanks and essays for English, numeric answers for math, code and SQL for programming."
        points={["5 subject presets", "Essays graded with your comments", "Code runs in a sandbox"]}
        next="Feeds: an exam that stays honest"
        visual={<SubjectsVisual />}
        className="lg:col-span-2"
      />
      <Card
        n="03"
        icon={ShieldCheck}
        tone={c.violet}
        glow="rgba(208,188,255,0.12)"
        label="Integrity"
        title="Anti-cheating that stays fair"
        text="Full screen with a set number of chances, a log when students switch tabs or apps, blocked copy and paste, and a watermark with the student's name."
        points={["Activity log per student", "Auto-submit after the last chance", "Flags, not accusations"]}
        next="Feeds: the grade, once it's submitted"
        visual={<IntegrityVisual />}
        className="lg:col-span-2"
      />
      <Card
        n="04"
        icon={Sheet}
        tone={c.primary}
        glow="rgba(192,193,255,0.12)"
        label="Grades"
        title="A class record that fills itself in"
        text="Laid out like your school's Excel class record. Quizzes, exams and attendance score themselves, with RS, transmuted grades and remarks computed for you."
        points={["Collegiate grade sheet to print", "Summary report per teacher", "Excel download any time"]}
        next="Ready to print at the end of the term"
        visual={<GradesVisual />}
        className="lg:col-span-3"
      />
    </SwipeRow>
  );
}

"use client";

import { useState, type ReactNode } from "react";
import { AlertTriangle, CalendarCheck, Check, Clock, GraduationCap, HardDrive, RotateCcw } from "lucide-react";
import { c } from "./theme";

type Standing = {
  subject: string;
  course: string;
  grade: string;
  color: string;
  categories: [string, number, number][]; // name, weight %, score %
  absences: number;
};

// 1.00 is the top grade and 3.00 passes, as in the class record.
const standings: Standing[] = [
  {
    subject: "English",
    course: "ENG 101",
    grade: "1.75",
    color: "#4edea3",
    categories: [["Quizzes", 20, 88], ["Activities", 25, 91], ["Attendance", 15, 100], ["Major exam", 40, 84]],
    absences: 0,
  },
  {
    subject: "Mathematics",
    course: "MATH 102",
    grade: "2.25",
    color: "#c0c1ff",
    categories: [["Quizzes", 20, 76], ["Activities", 25, 80], ["Attendance", 15, 85], ["Major exam", 40, 72]],
    absences: 3,
  },
  {
    subject: "Science",
    course: "SCI 101",
    grade: "1.50",
    color: "#d0bcff",
    categories: [["Quizzes", 20, 94], ["Activities", 25, 90], ["Attendance", 15, 100], ["Major exam", 40, 89]],
    absences: 1,
  },
  {
    subject: "Programming",
    course: "IT 302",
    grade: "2.00",
    color: "#7cc4ff",
    categories: [["Quizzes", 20, 82], ["Activities", 25, 86], ["Attendance", 15, 95], ["Major exam", 40, 78]],
    absences: 1,
  },
];

const limit = 4;

function Ring({ grade, color, size = 64 }: { grade: string; color: string; size?: number }) {
  // How far along the scale from 5.00 to 1.00.
  const fill = (5 - Number(grade)) / 4;
  const r = 26;
  const circumference = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden className="-rotate-90">
      <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - fill)}
        className="transition-[stroke-dashoffset] duration-1000 ease-out group-data-[state=hidden]/reveal:[stroke-dashoffset:164]"
      />
    </svg>
  );
}

function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={`relative overflow-hidden rounded-3xl border ${c.line} ${c.low} p-5 transition duration-700 group-data-[state=hidden]/reveal:translate-y-8 group-data-[state=hidden]/reveal:opacity-0 sm:p-6 ${className}`}
    >
      {children}
    </div>
  );
}

function Heading({ icon: Icon, title, text, tone }: { icon: typeof Check; title: string; text: string; tone: string }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <Icon className={`size-5 ${tone}`} aria-hidden />
        <h3 className="font-display text-lg font-semibold">{title}</h3>
      </div>
      <p className={`mt-1 text-sm leading-relaxed ${c.muted}`}>{text}</p>
    </div>
  );
}

export function StudentDashboard() {
  const [picked, setPicked] = useState(1);
  const s = standings[picked];
  const nearLimit = s.absences >= limit - 1;

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      {/* Standing per subject */}
      <Card className="flex flex-col lg:col-span-7 lg:row-span-3">
        <div className="pointer-events-none absolute -top-24 -right-24 size-64 rounded-full blur-3xl transition-colors duration-500" style={{ background: `${s.color}22` }} />
        <Heading
          icon={GraduationCap}
          tone={c.primary}
          title="Standing per subject"
          text="The grade so far in every subject, with how each category adds up, and a warning when absences get close to the limit."
        />
        <div role="tablist" aria-label="Subject" className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {standings.map((x, i) => (
            <button
              key={x.subject}
              type="button"
              role="tab"
              aria-selected={i === picked}
              onClick={() => setPicked(i)}
              className={`flex flex-col items-center rounded-2xl border p-3 transition-colors ${
                i === picked ? "border-white/25 bg-white/[0.06]" : `${c.line} hover:bg-white/[0.03]`
              }`}
            >
              <span className="relative grid place-items-center">
                <Ring grade={x.grade} color={x.color} />
                <span className="absolute font-display text-sm font-bold">{x.grade}</span>
              </span>
              <span className="mt-2 text-xs font-semibold">{x.subject}</span>
              <span className={`text-[10.5px] ${c.muted}`}>{x.course}</span>
            </button>
          ))}
        </div>

        <div role="tabpanel" aria-label={s.subject} key={s.subject} className="mt-5 rounded-2xl border border-white/5 bg-[#060e20]/70 p-4 motion-safe:animate-[fade-in_0.35s_ease-out]">
          <div className="mb-3 flex items-center justify-between text-xs">
            <span className="font-semibold">{s.course} · Midterm so far</span>
            <span className={c.muted}>
              Grade <span className="font-display text-base font-bold" style={{ color: s.color }}>{s.grade}</span>
            </span>
          </div>
          <ul className="space-y-2.5">
            {s.categories.map(([name, weight, score]) => (
              <li key={name}>
                <div className="mb-1 flex justify-between text-xs">
                  <span>
                    {name} <span className={c.muted}>· {weight}%</span>
                  </span>
                  <span className="font-mono tabular-nums">{score}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${score}%`, background: s.color }} />
                </div>
              </li>
            ))}
          </ul>
          <div
            className={`mt-4 flex items-center gap-2 rounded-xl px-3 py-2 text-xs ${
              nearLimit ? "bg-[#ffb68a]/10 text-[#ffb68a]" : "bg-white/[0.04] text-[#c7c4d7]"
            }`}
          >
            {nearLimit ? <AlertTriangle className="size-4 shrink-0" aria-hidden /> : <CalendarCheck className="size-4 shrink-0" aria-hidden />}
            {s.absences} of {limit} absences used{nearLimit ? " · one more and you're flagged for dropping" : ""}
          </div>
        </div>
        <p className={`mt-auto flex items-center gap-2 pt-5 text-xs ${c.muted}`}>
          <Check className="size-4 shrink-0 text-[#4edea3]" aria-hidden />
          Computed with the class record&apos;s own weights and transmutation table, so it matches what the teacher sees.
        </p>
      </Card>

      {/* Open now */}
      <Card className="lg:col-span-5">
        <Heading
          icon={CalendarCheck}
          tone={c.green}
          title="Schedule and retakes"
          text="What opens and closes when, how many retakes are left, and results as soon as the teacher releases them."
        />
        <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-[#4edea3]/25 bg-[#4edea3]/[0.06] p-3.5">
          <div>
            <p className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.14em] text-[#4edea3] uppercase">
              <span className="size-1.5 animate-pulse rounded-full bg-[#4edea3]" /> Open now
            </p>
            <p className="mt-1 text-sm font-semibold">SCI 101 · Quiz 3</p>
            <p className={`mt-0.5 flex items-center gap-1 text-xs ${c.muted}`}>
              <Clock className="size-3.5" aria-hidden /> Closes today, 5:00 PM
            </p>
          </div>
          <div className="text-right">
            <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-[#dae2fd]">
              <RotateCcw className="size-3" aria-hidden /> 1 of 2 retakes left
            </span>
            <span className="mt-2 block rounded-lg bg-[#4edea3] px-3 py-1.5 text-center text-xs font-bold text-[#003824]">Start</span>
          </div>
        </div>
      </Card>

      {/* This week */}
      <Card className="lg:col-span-5">
        <p className={`text-[11px] font-bold tracking-[0.16em] uppercase ${c.muted}`}>This week</p>
        <ol className="mt-3 grid grid-cols-5 gap-1.5 text-center">
          {[
            ["Mon", "5", null],
            ["Tue", "6", ["ENG 101", "Essay", "#4edea3"]],
            ["Wed", "7", null],
            ["Thu", "8", ["MATH 102", "Long quiz", "#c0c1ff"]],
            ["Fri", "9", ["IT 302", "Midterm", "#7cc4ff"]],
          ].map(([day, date, item]) => {
            const due = item as [string, string, string] | null;
            return (
              <li key={String(day)} className={`rounded-xl border p-2 ${due ? "border-white/15 bg-white/[0.04]" : `${c.line}`}`}>
                <p className={`text-[10px] ${c.muted}`}>{String(day)}</p>
                <p className="font-display text-base font-bold">{String(date)}</p>
                {due ? (
                  <p className="mt-1 truncate text-[9.5px] font-semibold" style={{ color: due[2] }} title={`${due[0]} ${due[1]}`}>
                    {due[1]}
                  </p>
                ) : (
                  <p className="mt-1 text-[9.5px] text-[#464554]">—</p>
                )}
              </li>
            );
          })}
        </ol>
      </Card>

      {/* Saved answers */}
      <Card className="lg:col-span-5">
        <div className="flex items-start justify-between gap-4">
          <Heading
            icon={HardDrive}
            tone={c.violet}
            title="Answers that don't get lost"
            text="Answers are saved on the device as students go, so reloading the page loses nothing, and the timer keeps time on the server."
          />
        </div>
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-[#060e20]/70 p-3 text-xs">
          <span className="flex-1 truncate font-mono text-[#dae2fd]">Q7 · The mitochondrion is the…</span>
          <span className="flex shrink-0 items-center gap-1 text-[#4edea3]">
            <Check className="size-3.5" aria-hidden /> Saved
          </span>
        </div>
      </Card>
    </div>
  );
}

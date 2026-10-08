"use client";

import { useState } from "react";
import { AlertTriangle, ArrowRight, Minus, Plus } from "lucide-react";
import { attendancePolicy } from "@/lib/attendance";
import { passingGrade, remark, transmutationTable, transmute } from "@/lib/grading";
import { c } from "../_landing/theme";

const categories = [
  { name: "Quizzes", weight: 20, color: "#4edea3", exam: false },
  { name: "Activities", weight: 25, color: "#c0c1ff", exam: false },
  { name: "Attendance / Participation", weight: 15, color: "#d0bcff", exam: false },
  { name: "Midterm exam", weight: 40, color: "#7cc4ff", exam: true },
];

const remarkStyle: Record<string, string> = {
  P: "bg-[#4edea3]/15 text-[#4edea3]",
  F: "bg-[#ffb4ab]/15 text-[#ffb4ab]",
  FA: "bg-[#ffb4ab]/15 text-[#ffb4ab]",
  DR: "bg-white/10 text-[#c7c4d7]",
};

// Move the scores and watch the term grade come out of the same math and TRANSMU table as the class record.
export function GradeCalculator() {
  const [scores, setScores] = useState([80, 72, 92, 64]);
  const weighted = categories.map((cat, i) => (scores[i] / 100) * cat.weight);
  const rs = Math.round(weighted.reduce((a, b) => a + b, 0) * 100) / 100;
  const grade = transmute(rs);
  const mark = remark(grade, 0, false);
  const row = transmutationTable.findIndex(([min]) => rs >= min);

  return (
    <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
      <div className="rounded-3xl border border-white/10 bg-[#131b2e] p-6">
        <p className="text-[11px] font-bold tracking-[0.16em] text-[#4edea3] uppercase">Try it · one student, midterm</p>
        <ul className="mt-5 space-y-5">
          {categories.map((cat, i) => (
            <li key={cat.name}>
              <div className="mb-2 flex items-center justify-between text-sm">
                <label htmlFor={`cat-${i}`} className="font-semibold">
                  {cat.name} <span className={`font-normal ${c.muted}`}>· {cat.weight}%</span>
                </label>
                <span className="font-mono tabular-nums">
                  {scores[i]}% <span className={c.muted}>→</span>{" "}
                  <span style={{ color: cat.color }}>{weighted[i].toFixed(2)}</span>
                </span>
              </div>
              <input
                id={`cat-${i}`}
                type="range"
                min={0}
                max={100}
                value={scores[i]}
                onChange={(e) => setScores((s) => s.map((v, j) => (j === i ? Number(e.target.value) : v)))}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10"
                style={{ accentColor: cat.color, background: `linear-gradient(to right, ${cat.color} ${scores[i]}%, rgba(255,255,255,0.08) ${scores[i]}%)` }}
              />
            </li>
          ))}
        </ul>

        {/* The pipeline, left to right */}
        <div className="mt-7 flex flex-wrap items-center gap-2" aria-live="polite">
          {[
            ["ADW", (weighted[0] + weighted[1] + weighted[2]).toFixed(2), "#c0c1ff"],
            ["Exam", weighted[3].toFixed(2), "#7cc4ff"],
            ["RS", rs.toFixed(2), "#ffffff"],
            ["Grade", grade.toFixed(2), grade <= passingGrade ? "#4edea3" : "#ffb4ab"],
          ].map(([label, value, color], i) => (
            <div key={label} className="flex items-center gap-2">
              <div className="rounded-xl border border-white/10 bg-[#060e20] px-3.5 py-2 text-center">
                <p className="text-[10px] font-semibold tracking-wider text-[#c7c4d7] uppercase">{label}</p>
                <p className="font-display text-lg font-bold tabular-nums" style={{ color }}>
                  {value}
                </p>
              </div>
              {i < 3 && <ArrowRight className="size-4 text-[#464554]" aria-hidden />}
            </div>
          ))}
          <ArrowRight className="size-4 text-[#464554]" aria-hidden />
          <span className={`rounded-xl px-4 py-3 font-display text-lg font-bold ${remarkStyle[mark]}`}>{mark}</span>
        </div>
        <p className={`mt-4 text-xs ${c.muted}`}>
          Activities and daily work (ADW) never go above their weight; extra credit is cut off. The major exam isn&apos;t capped.
        </p>
      </div>

      {/* TRANSMU table with the current row lit */}
      <div className="rounded-3xl border border-white/10 bg-[#131b2e] p-6">
        <p className="text-[11px] font-bold tracking-[0.16em] text-[#c0c1ff] uppercase">TRANSMU table</p>
        <ol className="mt-4 grid grid-cols-2 gap-1 font-mono text-[12px] tabular-nums">
          {transmutationTable.map(([min, g], i) => (
            <li
              key={min}
              className={`flex items-center justify-between rounded-lg px-2.5 py-1 transition-colors duration-200 ${
                i === row ? "bg-[#c0c1ff] font-bold text-[#1000a9]" : g <= passingGrade ? "bg-[#4edea3]/[0.06]" : "bg-white/[0.03] text-[#c7c4d7]"
              }`}
            >
              <span>{min}+</span>
              <span>{g.toFixed(2)}</span>
            </li>
          ))}
        </ol>
        <p className={`mt-3 text-xs ${c.muted}`}>
          Like Excel&apos;s VLOOKUP: a score takes the grade of the highest row it reaches. {passingGrade.toFixed(2)} and better passes.
        </p>
      </div>
    </div>
  );
}

// Tap lates and absences for one student and watch the rules apply.
export function AttendanceCounter() {
  const [late, setLate] = useState(5);
  const [absent, setAbsent] = useState(2);
  const effective = absent + Math.floor(late / attendancePolicy.latesPerAbsence);
  const flagged = effective >= attendancePolicy.dropAtAbsences;
  const toNextAbsence = attendancePolicy.latesPerAbsence - (late % attendancePolicy.latesPerAbsence);

  const counter = (label: string, value: number, set: (n: number) => void, color: string) => (
    <div className="rounded-2xl border border-white/10 bg-[#060e20] p-4">
      <p className={`text-xs font-semibold ${c.muted}`}>{label}</p>
      <div className="mt-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => set(Math.max(0, value - 1))}
          aria-label={`One less ${label.toLowerCase()}`}
          className="grid size-8 place-items-center rounded-lg bg-white/5 hover:bg-white/10"
        >
          <Minus className="size-4" />
        </button>
        <span className="font-display text-3xl font-bold tabular-nums" style={{ color }}>
          {value}
        </span>
        <button
          type="button"
          onClick={() => set(value + 1)}
          aria-label={`One more ${label.toLowerCase()}`}
          className="grid size-8 place-items-center rounded-lg bg-white/5 hover:bg-white/10"
        >
          <Plus className="size-4" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="rounded-3xl border border-white/10 bg-[#131b2e]/90 p-6 backdrop-blur-xl">
      <p className="text-[11px] font-bold tracking-[0.16em] text-[#ffb68a] uppercase">Try it · one student&apos;s term</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {counter("Lates", late, setLate, "#ffb68a")}
        {counter("Absences", absent, setAbsent, "#ffb4ab")}
      </div>
      <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4" aria-live="polite">
        <div className="flex items-center justify-between text-sm">
          <span className={c.muted}>Counted absences</span>
          <span className="font-display text-xl font-bold tabular-nums">
            {effective} <span className={`text-sm font-normal ${c.muted}`}>/ {attendancePolicy.dropAtAbsences}</span>
          </span>
        </div>
        <div className="mt-2 flex gap-1">
          {Array.from({ length: attendancePolicy.dropAtAbsences }, (_, i) => (
            <span key={i} className={`h-2 flex-1 rounded-full transition-colors duration-300 ${i < effective ? (flagged ? "bg-[#ffb4ab]" : "bg-[#ffb68a]") : "bg-white/10"}`} />
          ))}
        </div>
        <p className={`mt-3 text-xs ${flagged ? "text-[#ffb4ab]" : c.muted}`}>
          {flagged ? (
            <span className="flex items-center gap-1.5">
              <AlertTriangle className="size-3.5" aria-hidden /> Drop flagged. The teacher confirms before it becomes DR.
            </span>
          ) : (
            `${absent} absent + ${Math.floor(late / attendancePolicy.latesPerAbsence)} from lates. ${toNextAbsence} more ${toNextAbsence === 1 ? "late" : "lates"} make another absence.`
          )}
        </p>
      </div>
    </div>
  );
}

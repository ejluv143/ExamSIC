"use client";

import { useState } from "react";
import { AlertTriangle, CalendarCheck, ChevronsLeftRight, RefreshCw } from "lucide-react";
import { c } from "./theme";

type Row = { name: string; quiz: number; exam: number; abs: number; rs: number; mg: string; remark: "P" | "F" };

const rows: Row[] = [
  { name: "Bautista, Carlo", quiz: 16, exam: 30.4, abs: 1, rs: 82.3, mg: "2.00", remark: "P" },
  { name: "Castillo, Kyle", quiz: 18, exam: 34, abs: 1, rs: 88.9, mg: "1.50", remark: "P" },
  { name: "Cruz, Bea", quiz: 12, exam: 24, abs: 5, rs: 57.9, mg: "3.25", remark: "F" },
  { name: "Ramos, Hannah", quiz: 15, exam: 28.8, abs: 2, rs: 74.5, mg: "2.25", remark: "P" },
  { name: "Santos, Mia", quiz: 19, exam: 37.2, abs: 0, rs: 94.1, mg: "1.25", remark: "P" },
];

const columns = ["Name", "Quiz", "Exam", "Abs", "RS", "MG", "Remarks"];

// Both tables share these widths and row heights, so the wipe swaps cell for cell.
function Cols() {
  return (
    <colgroup>
      <col className="w-6" />
      <col className="w-[30%]" />
      {columns.slice(1).map((col) => (
        <col key={col} />
      ))}
    </colgroup>
  );
}

// The workbook the way it usually looks mid-term: typed by hand, a few cells missing or broken.
function Spreadsheet() {
  const broken: Record<string, string> = { "2-rs": "#REF!", "3-mg": "#DIV/0!" };
  const empty = new Set(["1-exam", "4-quiz"]);
  return (
    <div className="h-full bg-[#f3f4f1] font-[Arial,sans-serif] text-[#1f2937]">
      <div className="flex h-8 items-center gap-2 bg-[#1e7145] px-3 text-[11px] font-semibold text-white">
        <span className="rounded-sm bg-white px-1 text-[10px] font-bold text-[#1e7145]">X</span>
        CLASS-RECORD-2026.xlsm
      </div>
      <div className="flex h-6 items-center gap-2 border-b border-[#d1d5db] bg-white px-2 font-mono text-[10.5px]">
        <span className="border-r border-[#d1d5db] pr-2 text-[#6b7280]">G4</span>
        <span className="truncate text-[#374151]">=ROUND(IF(F4=&quot;&quot;,&quot;&quot;,VLOOKUP(F4,TRANSMU!$A$2:$B$41,2)),2)</span>
      </div>
      <table className="w-full table-fixed border-collapse text-[11px] tabular-nums">
        <Cols />
        <thead>
          <tr className="h-5 bg-[#e5e7eb] text-[10px] text-[#6b7280]">
            <th className="w-6 border border-[#d1d5db]" />
            {["A", "B", "C", "D", "E", "F", "G"].map((l) => (
              <th key={l} className="border border-[#d1d5db] font-normal">
                {l}
              </th>
            ))}
          </tr>
          <tr className="h-7 bg-[#c6efce] text-[10px] font-bold text-[#14532d]">
            <td className="border border-[#d1d5db] bg-[#e5e7eb] text-center font-normal text-[#6b7280]">1</td>
            {columns.map((col) => (
              <td key={col} className="truncate border border-[#d1d5db] px-1.5">
                {col === "Remarks" ? "REM." : col.toUpperCase()}
              </td>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const cell = (key: string, value: string | number) =>
              broken[`${i}-${key}`] ? (
                <td className="border border-[#d1d5db] truncate px-1.5 font-semibold text-[#b91c1c]">{broken[`${i}-${key}`]}</td>
              ) : empty.has(`${i}-${key}`) ? (
                <td className="border border-[#d1d5db] bg-[#fef08a] px-1.5" />
              ) : (
                <td className="border border-[#d1d5db] px-1.5">{value}</td>
              );
            return (
              <tr key={r.name} className="h-7 bg-white">
                <td className="border border-[#d1d5db] bg-[#e5e7eb] text-center text-[10px] text-[#6b7280]">{i + 2}</td>
                <td className="truncate border border-[#d1d5db] px-1.5">{r.name}</td>
                {cell("quiz", r.quiz)}
                {cell("exam", r.exam)}
                {cell("abs", r.abs)}
                {cell("rs", r.rs)}
                {cell("mg", r.mg)}
                <td className="border border-[#d1d5db] px-1.5 text-[#9ca3af]">?</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex gap-px px-2 pt-2 text-[10px]">
        {["MIDTERM", "FINALS", "TRANSMU", "ATTENDANCE"].map((tab, i) => (
          <span key={tab} className={`rounded-t px-2 py-0.5 ${i === 0 ? "bg-white font-semibold text-[#1e7145]" : "bg-[#e5e7eb] text-[#6b7280]"}`}>
            {tab}
          </span>
        ))}
      </div>
    </div>
  );
}

// The same record in Examinus: scores linked from quizzes, exams and attendance, grades and remarks computed.
function ExamoraRecord() {
  return (
    <div className={`h-full ${c.low}`}>
      <div className={`flex h-8 items-center justify-between border-b ${c.line} px-3 text-[11px]`}>
        <span className="font-semibold text-[#dae2fd]">ENG 101 · BSED 1-A · Midterm</span>
        <span className="flex items-center gap-1 text-[#4edea3]">
          <RefreshCw className="size-3" /> Up to date
        </span>
      </div>
      {/* Same height as the workbook's formula bar and column letters. */}
      <div className={`flex h-11 items-center gap-3 border-b ${c.line} px-3 text-[10.5px] ${c.muted}`}>
        <span>Quizzes 20%</span>
        <span>Activities 25%</span>
        <span>Attendance 15%</span>
        <span>Exam 40%</span>
      </div>
      <table className="w-full table-fixed text-[11px] tabular-nums">
        <Cols />
        <thead className="bg-[#2d3449] text-[10px] tracking-wide text-[#dae2fd] uppercase">
          <tr className="h-7">
            <th />
            {columns.map((col, i) => (
              <th key={col} className={`truncate px-1.5 font-semibold ${i === 0 ? "text-left" : "text-center"}`}>
                {col === "Remarks" ? "Rem." : col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="h-7 border-t border-[#464554]/40 bg-[#0d2a45]/50">
              <td />
              <td className="truncate px-1.5 text-[#dae2fd]">{r.name}</td>
              <td className="text-center text-[#7cc4ff]">{r.quiz}</td>
              <td className="text-center text-[#7cc4ff]">{r.exam}</td>
              <td className="text-center">
                <span className={`inline-flex items-center gap-0.5 ${r.abs >= 4 ? "font-bold text-[#ffb68a]" : "text-[#7cc4ff]"}`}>
                  {r.abs}
                  {r.abs >= 4 && <AlertTriangle className="size-3" />}
                </span>
              </td>
              <td className="text-center font-bold text-[#dae2fd]">{r.rs}</td>
              <td className={`text-center font-semibold ${r.remark === "F" ? "bg-[#93000a]/40 text-[#ffb4ab]" : "text-[#dae2fd]"}`}>{r.mg}</td>
              <td className="text-center">
                <span
                  className={`rounded px-1.5 py-px text-[10px] font-bold ${r.remark === "P" ? "bg-[#4edea3]/15 text-[#4edea3]" : "bg-[#ffb4ab]/15 text-[#ffb4ab]"}`}
                >
                  {r.remark}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={`px-3 pt-2.5 text-[10.5px] ${c.muted}`}>
        <span className="text-[#7cc4ff]">Blue</span> fills in from Examinus · <AlertTriangle className="inline size-3 text-[#ffb68a]" /> 4+
        absences flags a drop for you to confirm
      </p>
    </div>
  );
}

// Drag the handle to wipe from the workbook to Examinus.
export function RecordCompare() {
  const [pos, setPos] = useState(55);
  return (
    <div className="relative">
      <div className="mb-3 flex justify-between text-[11px] font-bold tracking-[0.16em] uppercase">
        <span className="text-[#ffb68a]">Before · the workbook</span>
        <span className={c.green}>After · Examinus</span>
      </div>
      <div className="rounded-3xl bg-gradient-to-r from-[#ffb68a]/40 via-white/10 to-[#4edea3]/40 p-px shadow-2xl">
        <div className="relative h-[300px] overflow-hidden rounded-[23px] select-none">
          <div className="absolute inset-0">
            <ExamoraRecord />
          </div>
          <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }} aria-hidden>
            <Spreadsheet />
          </div>
          {/* Handle */}
          <div aria-hidden className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_12px_rgba(255,255,255,0.6)]" style={{ left: `${pos}%` }}>
            <span className="absolute top-1/2 left-1/2 grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-[#0b1326] shadow-lg">
              <ChevronsLeftRight className="size-4" />
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={pos}
            onChange={(e) => setPos(Number(e.target.value))}
            aria-label="Compare the spreadsheet with Examinus's class record"
            className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
          />
        </div>
      </div>
    </div>
  );
}

const roll: { name: string; mark: "P" | "L" | "A" | "E"; lates: number; abs: number }[] = [
  { name: "Bautista, Carlo", mark: "P", lates: 2, abs: 1 },
  { name: "Cruz, Bea", mark: "A", lates: 1, abs: 5 },
  { name: "Ramos, Hannah", mark: "L", lates: 6, abs: 2 },
  { name: "Santos, Mia", mark: "P", lates: 0, abs: 0 },
];

const markStyle = { P: "bg-[#4edea3] text-[#003824]", L: "bg-[#ffb68a] text-[#4a2000]", A: "bg-[#ffb4ab] text-[#690005]", E: "bg-[#7cc4ff] text-[#002f4a]" };

// Roll call as it looks on a teacher's phone.
export function RollCallPhone() {
  return (
    <div aria-hidden className="mx-auto w-[260px] rounded-[2.2rem] border border-white/15 bg-[#060e20] p-2 shadow-[0_30px_70px_-20px_rgba(0,0,0,0.9)]">
      <div className={`overflow-hidden rounded-[1.8rem] ${c.low}`}>
        <div className="mx-auto mt-2 h-1.5 w-16 rounded-full bg-white/15" />
        <div className="px-4 pt-3 pb-2">
          <p className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.14em] text-[#4edea3] uppercase">
            <CalendarCheck className="size-3.5" /> Roll call
          </p>
          <p className="mt-0.5 text-sm font-semibold text-[#dae2fd]">ENG 101 · Mon, Oct 5</p>
        </div>
        <ul className="space-y-1.5 px-3 pb-3">
          {roll.map((s) => (
            <li key={s.name} className="rounded-xl bg-white/[0.04] p-2">
              <div className="flex items-center justify-between">
                <span className="text-[11.5px] font-medium text-[#dae2fd]">{s.name}</span>
                <span className="flex gap-0.5">
                  {(["P", "L", "A", "E"] as const).map((m) => (
                    <span
                      key={m}
                      className={`grid size-5 place-items-center rounded-md text-[9.5px] font-bold ${s.mark === m ? markStyle[m] : "bg-white/5 text-[#c7c4d7]/60"}`}
                    >
                      {m}
                    </span>
                  ))}
                </span>
              </div>
              {(s.lates >= 6 || s.abs >= 4) && (
                <p className={`mt-1 text-[10px] ${s.abs >= 4 ? "text-[#ffb4ab]" : "text-[#ffb68a]"}`}>
                  {s.abs >= 4 ? `${s.abs} absences · drop flagged` : `${s.lates} of 7 lates · next one counts as an absence`}
                </p>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

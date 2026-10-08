import Image from "next/image";
import type { ReactNode } from "react";
import { AlertTriangle, Check, ChevronDown, Clock, FileSpreadsheet, Maximize2, PenLine, Printer, Users } from "lucide-react";
import { c } from "../_landing/theme";

// A tilted Unsplash photo behind a mock of the screen, so each step has a person and a product in it.
export function Stage({ photo, alt, flip = false, children }: { photo: string; alt: string; flip?: boolean; children: ReactNode }) {
  return (
    <div className="relative mx-auto w-full max-w-xl py-6">
      <div
        className={`relative aspect-[4/3] w-[78%] overflow-hidden rounded-3xl border border-white/10 shadow-2xl ${flip ? "ml-auto rotate-2" : "-rotate-2"}`}
      >
        <Image src={`https://images.unsplash.com/photo-${photo}`} alt={alt} fill sizes="(min-width: 1024px) 35vw, 80vw" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b1326]/70 to-transparent" />
      </div>
      {/* On phones the screen sits under the photo; on wider screens it overlaps the photo's corner. */}
      <div className={`relative -mt-20 w-[88%] sm:absolute sm:bottom-0 sm:mt-0 sm:w-[70%] ${flip ? "sm:left-0" : "ml-auto sm:right-0"}`}>{children}</div>
    </div>
  );
}

function Window({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div aria-hidden className="overflow-hidden rounded-2xl border border-white/15 bg-[#131b2e]/95 shadow-[0_30px_70px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl">
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <span className="flex gap-1">
          <span className="size-2 rounded-full bg-[#f2716b]/70" />
          <span className="size-2 rounded-full bg-[#ffb68a]/70" />
          <span className="size-2 rounded-full bg-[#4edea3]/70" />
        </span>
        <span className={`truncate font-mono text-[10px] ${c.muted}`}>{title}</span>
      </div>
      <div className="p-3.5 text-[12px]">{children}</div>
    </div>
  );
}

export function CreateVisual() {
  return (
    <Window title="examinus · new exam">
      <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5">
        <span className={c.muted}>Subject</span>
        <span className="flex items-center gap-1 font-semibold">
          English <ChevronDown className="size-3.5" />
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {["Multiple choice", "Fill in the blanks", "True or false", "Essay"].map((t) => (
          <span key={t} className="rounded-md bg-[#c0c1ff]/10 px-1.5 py-0.5 text-[10.5px] text-[#c0c1ff]">
            {t}
          </span>
        ))}
      </div>
      <ul className="mt-3 space-y-1.5">
        {["Q1 · Choose the correct verb", "Q2 · Neither the students nor…", "Q3 · Explain the theme"].map((q) => (
          <li key={q} className="flex items-center gap-2 rounded-md bg-white/[0.03] px-2 py-1.5">
            <Check className="size-3.5 text-[#4edea3]" /> {q}
          </li>
        ))}
      </ul>
      <p className={`mt-2.5 flex items-center gap-1.5 text-[11px] ${c.muted}`}>
        <FileSpreadsheet className="size-3.5" /> or import from Excel · pick from the bank
      </p>
    </Window>
  );
}

export function AssignVisual() {
  return (
    <Window title="examinus · assign">
      <p className={`text-[10.5px] font-bold tracking-wider uppercase ${c.muted}`}>Class</p>
      <div className="mt-1 flex items-center gap-2 rounded-lg border border-[#c0c1ff]/40 bg-[#c0c1ff]/10 px-2.5 py-1.5 font-semibold">
        <Users className="size-3.5 text-[#c0c1ff]" /> ENG 101 · BSED 1-A
        <span className={`ml-auto text-[11px] font-normal ${c.muted}`}>40 students</span>
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        {[
          ["Opens", "Fri, 9:00 AM"],
          ["Closes", "Fri, 10:30 AM"],
          ["Time limit", "60 minutes"],
          ["Retakes", "1"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg bg-white/[0.04] px-2.5 py-1.5">
            <p className={`text-[10px] ${c.muted}`}>{k}</p>
            <p className="font-semibold">{v}</p>
          </div>
        ))}
      </div>
      <p className="mt-2.5 flex items-center gap-1.5 text-[11px] text-[#4edea3]">
        <Check className="size-3.5" /> Counts in the class record
      </p>
    </Window>
  );
}

export function TakeVisual() {
  return (
    <Window title="examinus · ENG 101 Midterm">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] text-[#4edea3]">
          <Maximize2 className="size-3.5" /> Full screen
        </span>
        <span className="flex items-center gap-1 rounded-full bg-[#c0c1ff]/15 px-2 py-0.5 font-mono text-[11px] text-[#c0c1ff]">
          <Clock className="size-3" /> 38:12
        </span>
      </div>
      <p className="mt-3 font-semibold">Neither the students nor the teacher ___ late.</p>
      <div className="mt-2 rounded-lg border border-[#4edea3]/40 bg-[#4edea3]/10 px-2.5 py-1.5 font-semibold text-[#4edea3]">was</div>
      <div className="mt-3 grid grid-cols-7 gap-1">
        {Array.from({ length: 14 }, (_, i) => (
          <span
            key={i}
            className={`grid h-5 place-items-center rounded text-[10px] font-bold ${i < 9 ? "bg-[#4edea3]/90 text-[#003824]" : i === 9 ? "bg-[#c0c1ff] text-[#1000a9]" : "bg-white/5 text-[#c7c4d7]"}`}
          >
            {i + 1}
          </span>
        ))}
      </div>
      <p className={`mt-2 text-right text-[10.5px] ${c.muted}`}>● Saved on this device</p>
    </Window>
  );
}

export function GradeVisual() {
  return (
    <Window title="examinus · review answers">
      <ul className="space-y-1.5">
        {[
          ["Multiple choice", "18 / 20", "text-[#4edea3]"],
          ["Fill in the blanks", "9 / 10", "text-[#4edea3]"],
          ["True or false", "10 / 10", "text-[#4edea3]"],
        ].map(([k, v, tone]) => (
          <li key={k} className="flex items-center justify-between rounded-md bg-white/[0.03] px-2 py-1.5">
            <span className="flex items-center gap-1.5">
              <Check className="size-3.5 text-[#4edea3]" /> {k}
            </span>
            <span className={`font-mono font-semibold ${tone}`}>{v}</span>
          </li>
        ))}
      </ul>
      <div className="mt-2 rounded-lg border border-[#ffb68a]/30 bg-[#ffb68a]/10 px-2.5 py-1.5">
        <p className="flex items-center gap-1.5 text-[11px] text-[#ffb68a]">
          <AlertTriangle className="size-3.5" /> Near-miss: &ldquo;photosynthesys&rdquo;
        </p>
        <span className="mt-1 inline-block rounded bg-[#4edea3] px-2 py-0.5 text-[10.5px] font-bold text-[#003824]">Accept</span>
      </div>
      <div className="mt-2 flex items-center justify-between rounded-lg border border-[#d0bcff]/30 bg-[#d0bcff]/10 px-2.5 py-1.5">
        <span className="flex items-center gap-1.5 text-[#d0bcff]">
          <PenLine className="size-3.5" /> Essay · add a comment
        </span>
        <span className="font-mono font-semibold">8 / 10</span>
      </div>
    </Window>
  );
}

export function RecordVisual() {
  return (
    <Window title="examinus · class record · BSED 1-A">
      <table className="w-full text-[11px] tabular-nums">
        <thead className={`text-[10px] uppercase ${c.muted}`}>
          <tr>
            <th className="pb-1 text-left font-semibold">Name</th>
            <th className="pb-1 font-semibold">Exam</th>
            <th className="pb-1 font-semibold">RS</th>
            <th className="pb-1 font-semibold">MG</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["Ramos, Hannah", "28.8", "74.5", "2.25", true],
            ["Santos, Mia", "37.2", "94.1", "1.25", false],
          ].map(([n, e, rs, mg, fresh]) => (
            <tr key={String(n)} className={`border-t border-white/5 ${fresh ? "bg-[#4edea3]/10" : ""}`}>
              <td className="py-1.5">{n}</td>
              <td className={`text-center ${fresh ? "font-bold text-[#4edea3]" : "text-[#7cc4ff]"}`}>{e}</td>
              <td className="text-center font-bold">{rs}</td>
              <td className="text-center">{mg}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-md bg-[#c0c1ff] px-2 py-1 text-[10.5px] font-bold text-[#1000a9]">
          <Printer className="size-3" /> Grade sheet
        </span>
        <span className="inline-flex items-center gap-1 rounded-md border border-white/15 px-2 py-1 text-[10.5px] font-semibold">
          <FileSpreadsheet className="size-3" /> Excel
        </span>
      </div>
    </Window>
  );
}

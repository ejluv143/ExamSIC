"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { ArrowRight, BookOpen, Calculator, CheckCircle2, Code2, FlaskConical, MonitorX, PenLine, Play, Printer, Timer, type LucideIcon } from "lucide-react";
import { c, Eyebrow, WindowBar } from "./theme";

type Check = { label: string; result: string; tone: "pass" | "partial" | "teacher" | "later" };

type Subject = {
  id: string;
  name: string;
  icon: LucideIcon;
  course: string;
  section: string;
  exam: string;
  question: string;
  meta: string;
  answerTitle: string;
  answer: ReactNode;
  checksTitle: string;
  checks: Check[];
};

const keyword = "text-[#d0bcff]";
const fn = "text-[#4edea3]";
const num = "text-[#ffb68a]";
const name = "text-[#c0c1ff]";

const subjects: Subject[] = [
  {
    id: "english",
    name: "English",
    icon: BookOpen,
    course: "ENG 101",
    section: "BSED 1-A",
    exam: "ENG 101 Midterm",
    question: "Choose the verb that agrees with the subject.",
    meta: "Fill in the blank · 2 pts",
    answerTitle: "Q4 · Fill in the blank",
    answer: (
      <p className="text-[15px] leading-loose">
        Neither the students nor the teacher{" "}
        <span className="rounded-md border border-[#4edea3]/40 bg-[#4edea3]/10 px-2 py-0.5 font-semibold text-[#4edea3]">was</span>{" "}
        late for the program.
        <span className={`mt-2 block text-xs ${c.muted}`}>Accepted answers: was</span>
      </p>
    ),
    checksTitle: "Checked against your key",
    checks: [
      { label: "Q1 · True or false", result: "Correct", tone: "pass" },
      { label: "Q4 · Fill in the blank", result: "Correct", tone: "pass" },
      { label: "Q6 · Essay", result: "You grade it", tone: "teacher" },
    ],
  },
  {
    id: "math",
    name: "Mathematics",
    icon: Calculator,
    course: "MATH 102",
    section: "BSA 1-B",
    exam: "MATH 102 Long Quiz",
    question: "Solve for the positive value of x.",
    meta: "Numeric · 5 pts",
    answerTitle: "Q2 · Numeric",
    answer: (
      <div className="space-y-3">
        <p className="font-serif text-2xl text-[#dae2fd] italic">
          2x<sup className="text-sm">2</sup> − 18 = 0
        </p>
        <p className="flex items-center gap-2 text-sm">
          <span className={c.muted}>x =</span>
          <span className="rounded-md border border-[#4edea3]/40 bg-[#4edea3]/10 px-3 py-0.5 font-mono font-semibold text-[#4edea3]">3</span>
        </p>
      </div>
    ),
    checksTitle: "Checked against your key",
    checks: [
      { label: "Q1 · Multiple choice", result: "Correct", tone: "pass" },
      { label: "Q2 · Numeric", result: "Correct", tone: "pass" },
      { label: "Q3 · Enumeration", result: "2 of 3", tone: "partial" },
    ],
  },
  {
    id: "science",
    name: "Science",
    icon: FlaskConical,
    course: "SCI 101",
    section: "BSN 1-A",
    exam: "SCI 101 Quiz 3",
    question: "Which organelle produces most of a cell's ATP?",
    meta: "Multiple choice · 1 pt",
    answerTitle: "Q5 · Multiple choice",
    answer: (
      <ul className="grid grid-cols-2 gap-2 text-sm">
        {["Ribosome", "Mitochondrion", "Golgi apparatus", "Nucleus"].map((option) => {
          const picked = option === "Mitochondrion";
          return (
            <li
              key={option}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${picked ? "border-[#4edea3]/50 bg-[#4edea3]/10 text-[#4edea3]" : `${c.line} ${c.muted}`}`}
            >
              <span className={`grid size-3.5 place-items-center rounded-full border ${picked ? "border-[#4edea3]" : "border-[#464554]"}`}>
                {picked && <span className="size-1.5 rounded-full bg-[#4edea3]" />}
              </span>
              {option}
            </li>
          );
        })}
      </ul>
    ),
    checksTitle: "Checked against your key",
    checks: [
      { label: "Q1 · Identification", result: "Correct", tone: "pass" },
      { label: "Q3 · Enumeration", result: "Correct", tone: "pass" },
      { label: "Q5 · Multiple choice", result: "Correct", tone: "pass" },
    ],
  },
  {
    id: "programming",
    name: "Programming",
    icon: Code2,
    course: "IT302",
    section: "BSIT 3-A",
    exam: "IT302 Practice Exam",
    question: "Read n, then n numbers. Print the sum of the even ones.",
    meta: "Python 3 · 10 pts",
    answerTitle: "answer.py",
    answer: (
      <pre className="flex overflow-x-auto font-mono text-[12.5px] leading-relaxed">
        <span aria-hidden className="mr-4 text-right text-[#464554] select-none">
          {"1\n2\n3\n4\n5\n6"}
        </span>
        <code>
          <span className={name}>n</span> = <span className={fn}>int</span>(<span className={fn}>input</span>()){"\n"}
          <span className={name}>total</span> = <span className={num}>0</span>{"\n"}
          <span className={keyword}>for</span> _ <span className={keyword}>in</span> <span className={fn}>range</span>(n):{"\n"}
          {"    "}x = <span className={fn}>int</span>(<span className={fn}>input</span>()){"\n"}
          {"    "}<span className={keyword}>if</span> x % <span className={num}>2</span> == <span className={num}>0</span>: total += x{"\n"}
          <span className={fn}>print</span>(total)
        </code>
      </pre>
    ),
    checksTitle: "Run sample tests",
    checks: [
      { label: "Test 1 · 5 numbers", result: "Passed", tone: "pass" },
      { label: "Test 2 · no even numbers", result: "Passed", tone: "pass" },
      { label: "2 hidden tests", result: "after submitting", tone: "later" },
    ],
  },
];

const checkStyle: Record<Check["tone"], { icon: LucideIcon; icon_: string; result: string }> = {
  pass: { icon: CheckCircle2, icon_: "text-[#4edea3]", result: "rounded bg-[#4edea3]/10 px-1.5 font-semibold text-[#4edea3]" },
  partial: { icon: CheckCircle2, icon_: "text-[#ffb68a]", result: "rounded bg-[#ffb68a]/10 px-1.5 font-semibold text-[#ffb68a]" },
  teacher: { icon: PenLine, icon_: "text-[#d0bcff]", result: "rounded bg-[#d0bcff]/10 px-1.5 font-semibold text-[#d0bcff]" },
  later: { icon: Play, icon_: "text-[#c7c4d7]", result: c.muted },
};

// The exam a student is taking and the class record it fills, for a subject picked from the tabs.
export function Showcase() {
  const [id, setId] = useState(subjects[0].id);
  const s = subjects.find((x) => x.id === id) ?? subjects[0];

  return (
    <>
      <div role="tablist" aria-label="Subject" className="mx-auto mt-10 flex w-fit max-w-full flex-wrap justify-center gap-1 rounded-2xl border border-white/10 bg-[#0b1326]/70 p-1 backdrop-blur">
        {subjects.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={x.id === id}
            onClick={() => setId(x.id)}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
              x.id === id ? "bg-[#c0c1ff] text-[#1000a9] shadow-[0_0_24px_rgba(192,193,255,0.25)]" : `${c.muted} hover:bg-white/5 hover:text-white`
            }`}
          >
            <x.icon className="size-4" aria-hidden /> {x.name}
          </button>
        ))}
      </div>

      <div role="tabpanel" aria-label={s.name} className="relative mt-8 grid grid-cols-1 items-stretch gap-6 lg:grid-cols-12">
        {/* The score on its way from the exam to the record. */}
        <div aria-hidden className="absolute top-1/2 left-[58.33%] z-10 hidden -translate-x-1/2 -translate-y-1/2 lg:block">
          <div className="animate-float rounded-full bg-gradient-to-br from-[#c0c1ff] to-[#4edea3] p-px shadow-[0_10px_40px_-5px_rgba(78,222,163,0.55)]">
            <span className="flex size-12 flex-col items-center justify-center rounded-full bg-[#0b1326] leading-none">
              <span className={`text-[11px] font-bold ${c.green}`}>Score</span>
              <ArrowRight className={`mt-0.5 size-3.5 ${c.primary}`} />
            </span>
          </div>
        </div>

        {/* Exam in progress */}
        <div className="rounded-2xl bg-gradient-to-b from-white/15 to-white/[0.03] p-px shadow-2xl transition duration-700 group-data-[state=hidden]/reveal:translate-y-8 group-data-[state=hidden]/reveal:opacity-0 lg:col-span-7">
          <div className={`relative h-full overflow-hidden rounded-[15px] ${c.low}`}>
            <WindowBar path={`student / exam / ${s.course}`} />
            <div key={s.id} className="p-5 motion-safe:animate-[fade-in_0.35s_ease-out]">
              <div className="pointer-events-none absolute -top-20 -right-20 h-60 w-60 rounded-full bg-[#c0c1ff]/10 blur-3xl" />
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span className="size-2.5 animate-pulse rounded-full bg-[#4edea3]" /> {s.exam}
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#c0c1ff]/15 px-2.5 py-1 text-xs font-semibold text-[#c0c1ff] tabular-nums">
                  <Timer className="size-3.5" aria-hidden /> 38:12 left
                </span>
              </div>
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-[#ffb4ab]/20 bg-[#ffb4ab]/10 px-3 py-2 text-xs text-[#ffb4ab]">
                <MonitorX className="size-4 shrink-0" aria-hidden />
                You left full screen. Warning 1 of 3: you can come back 2 more times.
              </div>
              <p className="mb-2 text-sm font-medium">
                {s.question} <span className={`text-xs ${c.muted}`}>· {s.meta}</span>
              </p>
              <div className={`overflow-hidden rounded-xl border ${c.line} ${c.lowest}`}>
                <div className={`flex items-center justify-between border-b ${c.line} px-4 py-1.5 font-mono text-[11px] ${c.muted}`}>
                  <span>{s.answerTitle}</span>
                  <span className="text-[#4edea3]">● saved</span>
                </div>
                <div className="flex min-h-[150px] flex-col justify-center p-4">{s.answer}</div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className={`rounded-xl border ${c.line} ${c.mid} p-4`}>
                  <span className={`text-[11px] font-semibold tracking-wider uppercase ${c.muted}`}>{s.checksTitle}</span>
                  <ul className="mt-2 space-y-1.5 text-xs">
                    {s.checks.map((check) => {
                      const style = checkStyle[check.tone];
                      return (
                        <li key={check.label} className="flex items-center justify-between gap-2">
                          <span className={`flex items-center gap-1.5 ${check.tone === "later" ? c.muted : ""}`}>
                            <style.icon className={`size-4 ${style.icon_}`} aria-hidden /> {check.label}
                          </span>
                          <span className={style.result}>{check.result}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <div className={`rounded-xl border ${c.line} ${c.mid} p-4`}>
                  <div className="flex items-center justify-between">
                    <span className={`text-[11px] font-semibold tracking-wider uppercase ${c.muted}`}>Questions</span>
                    <span className="text-[11px] font-semibold text-[#4edea3]">11 / 14 answered</span>
                  </div>
                  <div className="mt-2.5 grid grid-cols-7 gap-1.5">
                    {Array.from({ length: 14 }, (_, i) => (
                      <span
                        key={i}
                        className={`flex h-6 items-center justify-center rounded-md text-[11px] font-bold ${
                          i < 11
                            ? "bg-[#4edea3]/90 text-[#003824]"
                            : i === 11
                              ? "bg-[#c0c1ff] text-[#1000a9] ring-2 ring-[#c0c1ff]/40 ring-offset-2 ring-offset-[#171f33]"
                              : `${c.high} ${c.muted}`
                        }`}
                      >
                        {i + 1}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Class record */}
        <div
          className="rounded-2xl bg-gradient-to-b from-[#4edea3]/30 to-white/[0.03] p-px shadow-2xl transition delay-150 duration-700 group-data-[state=hidden]/reveal:translate-y-8 group-data-[state=hidden]/reveal:opacity-0 lg:col-span-5"
        >
          <div className={`relative h-full overflow-hidden rounded-[15px] ${c.low}`}>
            <WindowBar path={`teacher / class record / ${s.section}`} />
            <div className="p-5">
              <div className="pointer-events-none absolute -bottom-20 -left-20 h-60 w-60 rounded-full bg-[#4edea3]/10 blur-3xl" />
              <div className="mb-4 flex items-center justify-between">
                <Eyebrow>Class record · Midterm</Eyebrow>
                <span className={`rounded-full border ${c.line} ${c.high} px-2.5 py-0.5 text-[11px] ${c.muted}`}>
                  {s.course} · {s.section}
                </span>
              </div>
              <div className={`overflow-hidden rounded-xl border ${c.line} text-[11.5px]`}>
                <table className="w-full">
                  <thead className="bg-[#2d3449] text-[10.5px] tracking-wide uppercase">
                    <tr>
                      <th className="px-2 py-1.5 text-left">Name</th>
                      <th className="px-1">Abs</th>
                      <th className="px-1">Quiz</th>
                      <th className="px-1">Exam</th>
                      <th className="px-1">RS</th>
                      <th className="px-1">MG</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {(
                      [
                        ["Bautista, Carlo", 1, 16, 30.4, 82.3, "2.00", false, false],
                        ["Castillo, Kyle", 1, 18, 34.0, 88.9, "1.50", false, false],
                        ["Cruz, Bea", 5, 12, 24.0, 57.9, "3.25", true, false],
                        ["Ramos, Hannah", 2, 15, 28.8, 74.5, "2.25", false, true],
                      ] as const
                    ).map(([student, abs, quiz, exam, rs, mg, fail, fresh]) => (
                      <tr
                        key={student}
                        className={`border-t border-[#464554]/40 ${fresh ? "bg-[#4edea3]/10 shadow-[inset_3px_0_0_#4edea3]" : "bg-[#0d2a45]/60"}`}
                      >
                        <td className="px-2 py-1.5 whitespace-nowrap">
                          {student}
                          {fresh && (
                            <span className="ml-1.5 hidden rounded bg-[#4edea3]/20 px-1 py-px text-[9px] font-bold tracking-wide text-[#4edea3] uppercase sm:inline">
                              Just now
                            </span>
                          )}
                        </td>
                        <td className="px-1 text-center text-[#7cc4ff]">{abs}</td>
                        <td className="px-1 text-center text-[#7cc4ff]">{quiz}</td>
                        <td className={`px-1 text-center ${fresh ? "font-bold text-[#4edea3]" : "text-[#7cc4ff]"}`}>{exam}</td>
                        <td className="px-1 text-center font-bold">{rs}</td>
                        <td className={`px-1.5 text-center font-semibold ${fail ? "bg-[#93000a]/50 text-[#ffb4ab]" : ""}`}>{mg}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className={`mt-3 text-xs ${c.muted}`}>
                <span className="text-[#7cc4ff]">Blue</span> scores fill in by themselves from Examora quizzes, exams and attendance.
              </p>
              <div className="mt-4 space-y-3">
                {(
                  [
                    ["Quizzes", 20, "80%", "from-[#4edea3] to-[#4edea3]/60"],
                    ["Activities", 25, "72%", "from-[#c0c1ff] to-[#c0c1ff]/60"],
                    ["Attendance / Participation", 15, "92%", "from-[#d0bcff] to-[#d0bcff]/60"],
                    ["Midterm exam", 40, "64%", "from-[#4edea3] to-[#c0c1ff]"],
                  ] as const
                ).map(([category, weight, width, color], i) => (
                  <div key={category}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span>{category}</span>
                      <span className={`font-mono ${c.muted}`}>{weight}%</span>
                    </div>
                    <div className={`h-2 overflow-hidden rounded-full ${c.mid}`}>
                      {/* Fills in when the section scrolls into view. */}
                      <div
                        style={{ "--w": width, transitionDelay: `${300 + i * 120}ms` } as CSSProperties}
                        className={`h-full w-(--w) rounded-full bg-gradient-to-r transition-[width] duration-1000 ease-out group-data-[state=hidden]/reveal:w-0 ${color}`}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className={`mt-5 flex flex-wrap items-center justify-between gap-2 rounded-xl border ${c.line} ${c.high} p-3 text-xs`}>
                <span className="flex items-center gap-2">
                  <Printer className={`size-4 ${c.violet}`} aria-hidden /> Collegiate grade sheet and summary report
                </span>
                <span className="rounded bg-[#4edea3]/10 px-2 py-1 font-bold text-[#4edea3]">Ready to print</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

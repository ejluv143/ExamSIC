import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import { Result } from "effect";
import {
  ArrowRight,
  CalendarCheck,
  Check,
  CheckCircle2,
  ClipboardList,
  Code2,
  Copy,
  Database,
  FileSpreadsheet,
  GraduationCap,
  Keyboard,
  Layers,
  Maximize,
  MonitorX,
  PenLine,
  Play,
  Printer,
  ScanSearch,
  ShieldCheck,
  Sheet,
  Sparkles,
  Timer,
  Users,
  type LucideIcon,
} from "lucide-react";
import { homeFor } from "@examora/contract";
import { callApi, forwardedHeaders } from "@/lib/api/client";

const display = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-display" });
const body = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-body" });

export const metadata: Metadata = {
  title: { absolute: "Examora · Quizzes, exams and class records" },
  description:
    "Online and printed quizzes and exams for colleges: nine question types, code and SQL graded automatically, anti-cheating, and a class record that fills itself in.",
};

// Colors for this page only; it's always dark, like a product page.
const c = {
  bg: "bg-[#0b1326]",
  low: "bg-[#131b2e]",
  mid: "bg-[#171f33]",
  high: "bg-[#222a3d]",
  lowest: "bg-[#060e20]",
  line: "border-[#464554]/40",
  text: "text-[#dae2fd]",
  muted: "text-[#c7c4d7]",
  primary: "text-[#c0c1ff]",
  green: "text-[#4edea3]",
  violet: "text-[#d0bcff]",
};

function Eyebrow({ children, tone = c.primary }: { children: React.ReactNode; tone?: string }) {
  return <span className={`text-[11px] font-bold tracking-[0.18em] uppercase ${tone}`}>{children}</span>;
}

function SectionTitle({ eyebrow, title, text, tone }: { eyebrow: string; title: string; text: string; tone?: string }) {
  return (
    <div className="mx-auto mb-14 max-w-3xl text-center">
      <Eyebrow tone={tone}>{eyebrow}</Eyebrow>
      <h2 className="mt-2 font-[family-name:var(--font-display)] text-[28px] leading-9 font-bold tracking-tight sm:text-[32px] sm:leading-10">
        {title}
      </h2>
      <p className={`mt-3 ${c.muted}`}>{text}</p>
    </div>
  );
}

const modules: { icon: LucideIcon; tone: string; ring: string; label: string; title: string; text: string; points: string[] }[] = [
  {
    icon: ClipboardList,
    tone: c.primary,
    ring: "bg-[#c0c1ff]/10 border-[#c0c1ff]/20",
    label: "Exams",
    title: "Online and on paper",
    text: "Build once from your question bank or an Excel sheet. Students take it online, or print a test paper and answer sheet with your school's header.",
    points: ["9 question types, math with LaTeX", "Timer, schedules and retakes", "Printed paper and answer sheet"],
  },
  {
    icon: Code2,
    tone: c.green,
    ring: "bg-[#4edea3]/10 border-[#4edea3]/20",
    label: "Programming",
    title: "Code and SQL, graded",
    text: "Python, Java, C, C++, JavaScript and PHP (with Laravel's database layer) run against your test cases in a sandbox. SQL queries are checked row by row.",
    points: ["Hidden test cases", "Students run code before submitting", "Typing replay and similarity check"],
  },
  {
    icon: ShieldCheck,
    tone: c.violet,
    ring: "bg-[#d0bcff]/10 border-[#d0bcff]/20",
    label: "Integrity",
    title: "Anti-cheating that stays fair",
    text: "Full screen with a set number of chances, logs when students switch tabs or apps, blocked copy and paste, and a watermark with the student's name.",
    points: ["Activity log per student", "Auto-submit after the last chance", "Flags, not accusations"],
  },
  {
    icon: Sheet,
    tone: c.primary,
    ring: "bg-[#c0c1ff]/10 border-[#c0c1ff]/20",
    label: "Grades",
    title: "A class record that fills itself in",
    text: "Laid out like your school's Excel class record. Quizzes, exams and attendance score themselves, with RS, transmuted grades and remarks computed for you.",
    points: ["Collegiate grade sheet to print", "Summary report per teacher", "Excel download any time"],
  },
];

const steps = [
  { icon: FileSpreadsheet, title: "Create", text: "Write questions, pick them from the bank, or import an Excel sheet. The subject decides which question types you get." },
  { icon: Users, title: "Assign", text: "Choose the class and when it opens. Students see it on their dashboard; you can also print it." },
  { icon: Timer, title: "Take", text: "Students answer in full screen with a timer. Answers save as they go, even if the page reloads." },
  { icon: PenLine, title: "Grade", text: "Everything but essays is scored automatically. Review typed answers and accept a near-miss in one click." },
  { icon: GraduationCap, title: "Record", text: "Scores land in the class record by themselves, then the grade sheet and summary report." },
];

const integrity: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Maximize, title: "Full screen, with chances", text: "Leaving full screen is a warning. Students see how many chances are left before the exam submits itself." },
  { icon: Layers, title: "Tab and app switches", text: "Switching tabs, Alt+Tab and leaving the window are logged with the time, for the teacher to review." },
  { icon: MonitorX, title: "One screen only", text: "In Chrome and Edge, a second monitor has to be disconnected before the exam starts." },
  { icon: Copy, title: "No copy and paste", text: "Copy, paste, drag-and-drop, right-click and printing are blocked, and the clipboard is cleared at the start." },
  { icon: Keyboard, title: "Typing replay", text: "Watch how a code answer was written. Pasted blocks, robot-fast typing and edited histories are flagged." },
  { icon: ScanSearch, title: "Similarity check", text: "Code answers are compared after ignoring names and comments, so a renamed copy still shows up." },
];

export default async function Landing() {
  // Signed in already? Offer the way back in instead of the sign-in button.
  const session = await callApi((api) => api["auth.session"](), forwardedHeaders(await headers()));
  const home = Result.isSuccess(session) ? homeFor(session.success.user.role) : null;
  const cta = home ? { href: home, label: "Open Examora" } : { href: "/login", label: "Sign in" };

  return (
    <div className={`${display.variable} ${body.variable} ${c.bg} ${c.text} min-h-full font-[family-name:var(--font-body)] antialiased`}>
      {/* Announcement */}
      <div className={`border-b ${c.line} bg-gradient-to-r from-[#222a3d] via-[#2d3449] to-[#222a3d] px-4 py-2 text-center text-xs ${c.muted}`}>
        <span className="mr-2 inline-flex items-center gap-1.5 rounded-full bg-[#c0c1ff]/15 px-2 py-0.5 text-[10px] font-bold tracking-wider text-[#c0c1ff] uppercase">
          <span className="size-1.5 animate-pulse rounded-full bg-[#c0c1ff]" /> New
        </span>
        <span className={c.text}>Class records with attendance, laid out like your school&apos;s Excel sheet.</span>{" "}
        <a href="#class-record" className="font-semibold text-[#c0c1ff] underline hover:text-white">
          See how
        </a>
      </div>

      {/* Header */}
      <header className={`sticky top-0 z-40 border-b ${c.line} bg-[#0b1326]/85 backdrop-blur-xl`}>
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 lg:px-10">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-lg border border-[#464554]/60 bg-[#222a3d] font-[family-name:var(--font-display)] text-lg font-extrabold text-[#c0c1ff]">
              E
            </span>
            <span className="flex flex-col leading-none">
              <span className="font-[family-name:var(--font-display)] text-lg font-bold tracking-tight">Examora</span>
              <span className="mt-0.5 text-[9px] font-semibold tracking-[0.2em] text-[#c0c1ff] uppercase">Quizzes · Exams · Records</span>
            </span>
          </Link>
          <nav className={`hidden items-center gap-1 rounded-lg border ${c.line} bg-[#131b2e]/60 p-1 text-[13px] font-semibold lg:flex`}>
            {[
              ["#features", "Features"],
              ["#how", "How it works"],
              ["#integrity", "Anti-cheating"],
              ["#class-record", "Class record"],
              ["#students", "For students"],
            ].map(([href, label]) => (
              <a key={href} href={href} className={`rounded px-3 py-1.5 ${c.muted} hover:bg-[#222a3d] hover:text-white`}>
                {label}
              </a>
            ))}
          </nav>
          <Link
            href={cta.href}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#c0c1ff] px-4 py-2 text-[13px] font-bold text-[#1000a9] shadow-[0_0_24px_rgba(192,193,255,0.25)] hover:bg-[#e1e0ff]"
          >
            {cta.label} <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </header>

      <main className="overflow-x-hidden">
        {/* Hero */}
        <section className="relative mx-auto flex max-w-7xl flex-col items-center px-4 pt-14 pb-20 text-center lg:px-10 lg:pt-20 lg:pb-28">
          <div className="pointer-events-none absolute top-1/2 left-1/2 -z-0 h-[360px] w-[680px] max-w-full -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#c0c1ff]/10 blur-[140px]" />
          <div className="pointer-events-none absolute -top-10 right-10 h-72 w-72 rounded-full bg-[#4edea3]/10 blur-[120px]" />
          <div className={`relative mb-6 inline-flex flex-wrap items-center justify-center gap-2 rounded-full border ${c.line} bg-[#222a3d]/90 px-3 py-1.5`}>
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#4edea3] opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-[#4edea3]" />
            </span>
            <span className="text-[11px] font-semibold tracking-wider uppercase">For colleges and universities</span>
          </div>
          <h1 className="relative max-w-5xl font-[family-name:var(--font-display)] text-[34px] leading-[42px] font-extrabold tracking-tight sm:text-[48px] sm:leading-[56px]">
            Quizzes, exams and class records,{" "}
            <span className="bg-gradient-to-r from-[#c0c1ff] via-[#d0bcff] to-[#4edea3] bg-clip-text text-transparent">
              graded and recorded for you.
            </span>
          </h1>
          <p className={`relative mt-5 max-w-3xl text-base leading-relaxed sm:text-lg ${c.muted}`}>
            Give exams online or on paper. Examora scores them, including code and SQL, keeps the exam honest, and
            puts every score in a class record laid out like the one your school already uses.
          </p>
          <div className="relative mt-9 flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row">
            <Link
              href={cta.href}
              className="group flex w-full items-center justify-center gap-2 rounded-xl bg-[#c0c1ff] px-8 py-3.5 text-sm font-bold text-[#1000a9] shadow-xl hover:bg-[#e1e0ff] sm:w-auto"
            >
              {cta.label}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
            </Link>
            <a
              href="#features"
              className={`flex w-full items-center justify-center gap-2 rounded-xl border ${c.line} bg-[#222a3d] px-6 py-3.5 text-sm font-semibold hover:bg-[#2d3449] sm:w-auto`}
            >
              <Sparkles className={`size-4 ${c.green}`} aria-hidden /> See what it does
            </a>
          </div>

          {/* What's inside, in numbers that are simply true */}
          <div className={`relative mt-14 grid w-full grid-cols-2 gap-4 rounded-2xl border ${c.line} bg-[#131b2e]/70 p-5 backdrop-blur-xl md:grid-cols-4`}>
            {[
              ["9", "question types", c.green],
              ["6 + SQL", "languages graded automatically", c.primary],
              ["1.00–5.00", "transmuted grades, done for you", c.violet],
              ["0", "spreadsheets to fill in by hand", c.text],
            ].map(([n, label, tone]) => (
              <div key={label} className="flex flex-col items-center p-2">
                <span className={`font-[family-name:var(--font-display)] text-[26px] font-bold tracking-tight sm:text-[32px] ${tone}`}>{n}</span>
                <span className={`mt-1 text-[11px] font-semibold tracking-wider uppercase ${c.muted}`}>{label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Product showcase */}
        <section className={`border-y ${c.line} bg-[#060e20]/60 px-4 py-16 lg:px-10`} id="showcase">
          <div className="mx-auto max-w-7xl">
            <div className="mb-8 flex flex-col justify-between gap-2 md:flex-row md:items-end">
              <div>
                <Eyebrow>Inside Examora</Eyebrow>
                <h2 className="mt-1 font-[family-name:var(--font-display)] text-[28px] font-bold tracking-tight">From the exam to the grade</h2>
              </div>
              <p className={`max-w-md text-sm ${c.muted}`}>
                What a student sees while taking a programming exam, and where their score ends up.
              </p>
            </div>
            <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-12">
              {/* Exam in progress */}
              <div className={`relative overflow-hidden rounded-2xl border ${c.line} ${c.low} p-5 shadow-xl lg:col-span-7`}>
                <div className="pointer-events-none absolute -top-20 -right-20 h-60 w-60 rounded-full bg-[#c0c1ff]/10 blur-3xl" />
                <div className={`mb-4 flex items-center justify-between border-b ${c.line} pb-4`}>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <span className="size-2.5 animate-pulse rounded-full bg-[#4edea3]" /> IT302 Practice Exam
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#c0c1ff]/15 px-2.5 py-1 text-xs font-semibold text-[#c0c1ff] tabular-nums">
                    <Timer className="size-3.5" aria-hidden /> 38:12 left
                  </span>
                </div>
                <div className="mb-4 rounded-lg bg-[#ffb4ab]/10 px-3 py-2 text-xs text-[#ffb4ab]">
                  You left full screen. Warning 1 of 3: you can come back 2 more times.
                </div>
                <p className="mb-2 text-sm font-medium">
                  Read n, then n numbers. Print the sum of the even ones. <span className={`text-xs ${c.muted}`}>· Python 3 · 10 pts</span>
                </p>
                <pre className={`overflow-x-auto rounded-xl border ${c.line} ${c.lowest} p-4 font-mono text-[12.5px] leading-relaxed`}>
                  <code>
                    <span className="text-[#c0c1ff]">n</span> = <span className="text-[#4edea3]">int</span>(<span className="text-[#4edea3]">input</span>()){"\n"}
                    <span className="text-[#c0c1ff]">total</span> = <span className="text-[#ffb68a]">0</span>{"\n"}
                    <span className="text-[#d0bcff]">for</span> _ <span className="text-[#d0bcff]">in</span> <span className="text-[#4edea3]">range</span>(n):{"\n"}
                    {"    "}x = <span className="text-[#4edea3]">int</span>(<span className="text-[#4edea3]">input</span>()){"\n"}
                    {"    "}<span className="text-[#d0bcff]">if</span> x % <span className="text-[#ffb68a]">2</span> == <span className="text-[#ffb68a]">0</span>: total += x{"\n"}
                    <span className="text-[#4edea3]">print</span>(total)
                  </code>
                </pre>
                <div className={`mt-4 grid gap-3 rounded-xl border ${c.line} ${c.mid} p-4 md:grid-cols-2`}>
                  <div>
                    <span className={`text-[11px] font-semibold tracking-wider uppercase ${c.muted}`}>Run sample tests</span>
                    <ul className="mt-2 space-y-1.5 text-xs">
                      {["Test 1 · 5 numbers", "Test 2 · no even numbers"].map((t) => (
                        <li key={t} className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <CheckCircle2 className="size-4 text-[#4edea3]" aria-hidden /> {t}
                          </span>
                          <span className="font-semibold text-[#4edea3]">Passed</span>
                        </li>
                      ))}
                      <li className={`flex items-center justify-between ${c.muted}`}>
                        <span className="flex items-center gap-1.5">
                          <Play className="size-4" aria-hidden /> 2 hidden tests
                        </span>
                        <span>after submitting</span>
                      </li>
                    </ul>
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <span className={`text-[11px] font-semibold tracking-wider uppercase ${c.muted}`}>Questions</span>
                      <span className="text-[11px] font-semibold text-[#4edea3]">11 / 14 answered</span>
                    </div>
                    <div className="mt-2.5 grid grid-cols-7 gap-1.5">
                      {Array.from({ length: 14 }, (_, i) => (
                        <span
                          key={i}
                          className={`flex h-6 items-center justify-center rounded text-[11px] font-bold ${
                            i < 11 ? "bg-[#4edea3] text-[#003824]" : i === 11 ? "bg-[#c0c1ff] text-[#1000a9] ring-2 ring-[#c0c1ff]" : `${c.high} ${c.muted}`
                          }`}
                        >
                          {i + 1}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Class record */}
              <div className={`relative overflow-hidden rounded-2xl border ${c.line} ${c.low} p-5 shadow-xl lg:col-span-5`} id="class-record">
                <div className="pointer-events-none absolute -bottom-20 -left-20 h-60 w-60 rounded-full bg-[#4edea3]/10 blur-3xl" />
                <div className="mb-4 flex items-center justify-between">
                  <Eyebrow>Class record · Midterm</Eyebrow>
                  <span className={`rounded-full border ${c.line} ${c.high} px-2.5 py-0.5 text-[11px] ${c.muted}`}>IT302 · BSIT 3-A</span>
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
                      {[
                        ["Bautista, Carlo", 1, 16, 30.4, 82.3, "2.00", false],
                        ["Castillo, Kyle", 1, 18, 34.0, 88.9, "1.50", false],
                        ["Cruz, Bea", 5, 12, 24.0, 57.9, "3.25", true],
                        ["Ramos, Hannah", 2, 15, 28.8, 74.5, "2.25", false],
                      ].map(([name, abs, quiz, exam, rs, mg, fail]) => (
                        <tr key={String(name)} className="border-t border-[#464554]/40 bg-[#0d2a45]/60">
                          <td className="px-2 py-1.5">{name}</td>
                          <td className="text-center text-[#7cc4ff]">{abs}</td>
                          <td className="text-center text-[#7cc4ff]">{quiz}</td>
                          <td className="text-center text-[#7cc4ff]">{exam}</td>
                          <td className="text-center font-bold">{rs}</td>
                          <td className={`text-center font-semibold ${fail ? "bg-[#93000a]/50 text-[#ffb4ab]" : ""}`}>{mg}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className={`mt-3 text-xs ${c.muted}`}>
                  <span className="text-[#7cc4ff]">Blue</span> scores fill in by themselves from Examora quizzes, exams and attendance.
                </p>
                <div className="mt-4 space-y-3">
                  {[
                    ["Quizzes", 20, "w-[80%]", "bg-[#4edea3]"],
                    ["Laboratory activities", 25, "w-[72%]", "bg-[#c0c1ff]"],
                    ["Attendance / Participation", 15, "w-[92%]", "bg-[#d0bcff]"],
                    ["Midterm exam", 40, "w-[64%]", "bg-[#4edea3]"],
                  ].map(([name, weight, width, color]) => (
                    <div key={String(name)}>
                      <div className="mb-1 flex justify-between text-xs">
                        <span>{name}</span>
                        <span className={c.muted}>{weight}%</span>
                      </div>
                      <div className={`h-2 overflow-hidden rounded-full ${c.mid}`}>
                        <div className={`h-full rounded-full ${width} ${color}`} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className={`mt-5 flex flex-wrap items-center justify-between gap-2 rounded-xl border ${c.line} ${c.high} p-3 text-xs`}>
                  <span className="flex items-center gap-2">
                    <Printer className={`size-4 ${c.violet}`} aria-hidden /> Collegiate grade sheet and summary report
                  </span>
                  <span className="rounded bg-[#171f33] px-2 py-1 font-bold text-[#4edea3]">Ready to print</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Modules */}
        <section className="mx-auto max-w-7xl px-4 py-24 lg:px-10" id="features">
          <SectionTitle
            eyebrow="Everything in one place"
            tone={c.green}
            title="Four things teachers do every term, done in Examora"
            text="Each part works on its own and feeds the next: the exam is graded, the grade lands in the class record, the class record prints."
          />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {modules.map((m) => (
              <div key={m.title} className={`group flex flex-col justify-between rounded-2xl border ${c.line} ${c.low} p-6 transition-colors hover:border-[#c0c1ff]/50`}>
                <div>
                  <div className={`mb-5 grid size-12 place-items-center rounded-xl border ${m.ring} ${m.tone} transition-transform group-hover:scale-105`}>
                    <m.icon className="size-6" aria-hidden />
                  </div>
                  <Eyebrow tone={m.tone}>{m.label}</Eyebrow>
                  <h3 className="mt-1 mb-2 font-[family-name:var(--font-display)] text-xl font-semibold">{m.title}</h3>
                  <p className={`mb-4 text-sm leading-relaxed ${c.muted}`}>{m.text}</p>
                </div>
                <ul className={`space-y-2 border-t ${c.line} pt-4 text-xs ${c.muted}`}>
                  {m.points.map((p) => (
                    <li key={p} className="flex items-center gap-2">
                      <Check className="size-4 text-[#4edea3]" aria-hidden /> {p}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className={`border-t ${c.line} ${c.lowest} px-4 py-24 lg:px-10`} id="how">
          <div className="mx-auto max-w-7xl">
            <SectionTitle
              eyebrow="How it works"
              title="From a blank exam to the grade sheet"
              text="Five steps, and only the first two need you."
            />
            <ol className="grid grid-cols-1 gap-4 md:grid-cols-5">
              {steps.map((s, i) => (
                <li key={s.title} className={`relative rounded-2xl border ${c.line} ${c.low} p-5`}>
                  <span className="absolute top-4 right-4 font-[family-name:var(--font-display)] text-3xl font-extrabold text-[#2d3449]">
                    {i + 1}
                  </span>
                  <s.icon className={`mb-4 size-6 ${i < 2 ? c.primary : c.green}`} aria-hidden />
                  <h3 className="font-[family-name:var(--font-display)] text-lg font-semibold">{s.title}</h3>
                  <p className={`mt-1.5 text-sm leading-relaxed ${c.muted}`}>{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Integrity */}
        <section className="mx-auto max-w-7xl px-4 py-24 lg:px-10" id="integrity">
          <SectionTitle
            eyebrow="Anti-cheating"
            tone={c.violet}
            title="Keeps exams honest without spying on students"
            text="No webcam, no microphone, nothing installed. Examora watches what happens on the exam page, logs it, and leaves the judgment to the teacher."
          />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {integrity.map((f) => (
              <div key={f.title} className={`rounded-2xl border ${c.line} ${c.low} p-6`}>
                <div className={`mb-4 grid size-10 place-items-center rounded-lg ${c.high} ${c.violet}`}>
                  <f.icon className="size-5" aria-hidden />
                </div>
                <h3 className="mb-2 font-[family-name:var(--font-display)] text-lg font-semibold">{f.title}</h3>
                <p className={`text-sm leading-relaxed ${c.muted}`}>{f.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Class record and attendance */}
        <section className={`border-t ${c.line} bg-[#131b2e]/40 px-4 py-20 lg:px-10`}>
          <div className={`mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 rounded-3xl border ${c.line} ${c.mid} p-6 shadow-2xl lg:grid-cols-2 lg:p-10`}>
            <div>
              <Eyebrow tone={c.green}>Class record and attendance</Eyebrow>
              <h2 className="mt-2 font-[family-name:var(--font-display)] text-[28px] leading-9 font-bold tracking-tight">
                Your school&apos;s class record, without the spreadsheet
              </h2>
              <p className={`mt-3 leading-relaxed ${c.muted}`}>
                Same columns, same weights, same transmutation table. Activities and daily work, the major exam, RS and
                MG for each term, and the course grade with P, F, FA and DR remarks.
              </p>
              <ul className="mt-6 space-y-3 text-sm">
                {[
                  "Quizzes and exams link themselves and score as students submit",
                  "Roll call on your phone: 7 lates count as 1 absence, 4 absences flag a drop",
                  "Absences and an attendance score feed the record automatically",
                  "Print the collegiate grade sheet, download Excel by term or by month",
                ].map((p) => (
                  <li key={p} className="flex items-start gap-2.5">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#4edea3]" aria-hidden /> {p}
                  </li>
                ))}
              </ul>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {[
                { icon: CalendarCheck, tone: c.green, title: "Attendance", big: "26", text: "meetings taken this term, from the class schedule" },
                { icon: Sheet, tone: c.primary, title: "Weights", big: "60 / 40", text: "activities and daily work, then the major exam" },
                { icon: FileSpreadsheet, tone: c.violet, title: "Excel", big: "1 click", text: "class record, grade sheet and monthly attendance" },
                { icon: Database, tone: c.text, title: "Linked", big: "Auto", text: "quiz and exam scores, no copying between sheets" },
              ].map((k) => (
                <div key={k.title} className={`rounded-2xl border ${c.line} ${c.high} p-5`}>
                  <div className={`mb-2 flex items-center gap-2 ${k.tone}`}>
                    <k.icon className="size-5" aria-hidden />
                    <span className="text-[11px] font-semibold tracking-wider uppercase">{k.title}</span>
                  </div>
                  <span className="font-[family-name:var(--font-display)] text-[28px] font-extrabold">{k.big}</span>
                  <p className={`mt-1 text-xs ${c.muted}`}>{k.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* For students */}
        <section className="mx-auto max-w-7xl px-4 py-24 lg:px-10" id="students">
          <SectionTitle
            eyebrow="For students"
            title="Students always know where they stand"
            text="A dashboard of what's open, a schedule, their scores, and their standing in each subject, computed the same way as the class record."
          />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {[
              { icon: GraduationCap, title: "Standing per subject", text: "The grade so far in every subject, with how each category adds up, and a warning when absences get close to the limit." },
              { icon: Play, title: "Run code before submitting", text: "Python and JavaScript run right in the browser; other languages on the server. Only the sample tests, so the real check stays fair." },
              { icon: CalendarCheck, title: "Schedule and retakes", text: "What opens and closes when, how many retakes are left, and results as soon as the teacher releases them." },
            ].map((f) => (
              <div key={f.title} className={`rounded-2xl border ${c.line} ${c.low} p-6`}>
                <f.icon className={`mb-4 size-6 ${c.primary}`} aria-hidden />
                <h3 className="mb-2 font-[family-name:var(--font-display)] text-lg font-semibold">{f.title}</h3>
                <p className={`text-sm leading-relaxed ${c.muted}`}>{f.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Call to action */}
        <section className={`${c.lowest} px-4 py-20 lg:px-10`}>
          <div className={`relative mx-auto max-w-5xl overflow-hidden rounded-3xl border ${c.line} bg-gradient-to-b from-[#222a3d] to-[#171f33] p-8 text-center shadow-2xl lg:p-12`}>
            <div className="pointer-events-none absolute -top-32 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-[#c0c1ff]/20 blur-[100px]" />
            <h2 className="relative font-[family-name:var(--font-display)] text-[30px] leading-[38px] font-bold tracking-tight sm:text-[40px] sm:leading-[48px]">
              Ready for your next exam?
            </h2>
            <p className={`relative mx-auto mt-3 max-w-2xl ${c.muted}`}>
              Sign in with your school account. Accounts are set up by your school&apos;s Examora admin.
            </p>
            <Link
              href={cta.href}
              className="relative mt-8 inline-flex items-center gap-2 rounded-xl bg-[#c0c1ff] px-8 py-3.5 text-sm font-bold text-[#1000a9] shadow-lg hover:bg-[#e1e0ff]"
            >
              {cta.label} <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </section>
      </main>

      <footer className={`border-t ${c.line} ${c.lowest} px-4 py-10 lg:px-10`}>
        <div className={`mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 text-sm md:flex-row ${c.muted}`}>
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-lg border border-[#464554]/60 bg-[#222a3d] font-[family-name:var(--font-display)] font-extrabold text-[#c0c1ff]">
              E
            </span>
            <span>
              <span className="font-semibold text-[#dae2fd]">Examora</span> · San Isidro College · School of Information
              Technology
            </span>
          </div>
          <nav className="flex flex-wrap items-center gap-5">
            <a href="#features" className="hover:text-white">
              Features
            </a>
            <a href="#integrity" className="hover:text-white">
              Anti-cheating
            </a>
            <a href="#class-record" className="hover:text-white">
              Class record
            </a>
            <Link href={cta.href} className="hover:text-white">
              {cta.label}
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

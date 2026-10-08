import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { Result } from "effect";
import { ArrowRight, CheckCircle2, ChevronDown, GraduationCap, ShieldCheck, Sparkles, Users } from "lucide-react";
import { homeFor } from "@examora/contract";
import { callApi, forwardedHeaders } from "@/lib/api/client";
import { Reveal } from "../_landing/reveal";
import { SiteFooter } from "../_landing/site-footer";
import { SiteHeader } from "../_landing/site-header";
import { Backdrop, c, Eyebrow } from "../_landing/theme";
import { Stepper } from "./stepper";
import { AssignVisual, CreateVisual, GradeVisual, RecordVisual, Stage, TakeVisual } from "./visuals";

export const metadata: Metadata = {
  title: "How it works",
  description: "From a blank exam to the grade sheet in five steps: create, assign, take, grade and record. Only the first two need the teacher.",
};

type Step = {
  id: string;
  title: string;
  who: "You" | "Students" | "Examinus";
  heading: string;
  text: string;
  points: string[];
  photo: string;
  alt: string;
  visual: ReactNode;
};

const steps: Step[] = [
  {
    id: "create",
    title: "Create",
    who: "You",
    heading: "Write the exam once",
    text: "Pick the subject and Examinus offers the question types that fit it. Write questions, pick them from your bank, or import a spreadsheet.",
    points: ["Nine question types; math written in LaTeX", "Question bank and Excel import", "A test paper layout tab for printing, with your school's header"],
    photo: "1513258496099-48168024aec0",
    alt: "A teacher preparing an exam on a laptop",
    visual: <CreateVisual />,
  },
  {
    id: "assign",
    title: "Assign",
    who: "You",
    heading: "Choose the class and the time",
    text: "Students see it on their dashboard when it opens. Set it up once, and every rule applies to every student the same way.",
    points: ["Opens, closes and a time limit", "Shuffling, retakes and when results are released", "Anti-cheating settings per quiz or exam", "“Count in the class record”, on by default"],
    photo: "1501504905252-473c47e087f8",
    alt: "A laptop and an open notebook on a desk",
    visual: <AssignVisual />,
  },
  {
    id: "take",
    title: "Take",
    who: "Students",
    heading: "Students answer in full screen",
    text: "Nothing to install. The exam opens in the browser, in full screen, with a timer kept on the server.",
    points: ["A set number of chances for leaving full screen", "Answers saved on the device, so a reload loses nothing", "For code: Run against the sample tests before submitting"],
    photo: "1571260899304-425eee4c7efc",
    alt: "College students answering at their desks",
    visual: <TakeVisual />,
  },
  {
    id: "grade",
    title: "Grade",
    who: "Examinus",
    heading: "Examinus scores it",
    text: "Everything but essays is checked against your answer key the moment a student submits. You review only what needs a person.",
    points: ["Code and SQL run against your tests", "Accept a near-miss typed answer in one click", "Grade essays with comments", "Review each student's anti-cheating log"],
    photo: "1456513080510-7bf3a84b82f8",
    alt: "Open books and a notebook",
    visual: <GradeVisual />,
  },
  {
    id: "record",
    title: "Record",
    who: "Examinus",
    heading: "The class record fills itself in",
    text: "Scores land in the class record laid out like your school's spreadsheet, with the grades computed for you.",
    points: ["RS, transmuted grades and P, F, FA and DR remarks", "Attendance feeds the record too", "Print the grade sheet and summary report, or download Excel"],
    photo: "1554224155-6726b3ff858f",
    alt: "Papers and a calculator on a desk",
    visual: <RecordVisual />,
  },
];

const roles: { icon: typeof Users; title: string; tone: string; items: string[] }[] = [
  {
    icon: ShieldCheck,
    title: "Admins",
    tone: "#d0bcff",
    items: ["Create, edit, suspend and remove accounts", "Reset passwords"],
  },
  {
    icon: Users,
    title: "Teachers",
    tone: "#c0c1ff",
    items: ["Create and assign quizzes and exams", "Review essays and flagged answers", "Take attendance on a phone", "Print grade sheets and reports"],
  },
  {
    icon: GraduationCap,
    title: "Students",
    tone: "#4edea3",
    items: ["See what's open and what's next", "Take quizzes and exams", "Check scores and standing per subject"],
  },
];

const faq: [string, string][] = [
  ["Do students need to install anything?", "No. Examinus runs in the browser. The one-screen check works in Chrome and Edge."],
  ["What if the page reloads in the middle of an exam?", "Answers are saved on the device as students go, and the timer is kept on the server, so they pick up where they left off."],
  ["Can I still give exams on paper?", "Yes. The same exam prints as a test paper with your school's header, with an optional separate answer sheet."],
  ["Which subjects does it work for?", "Any. The General, English, Mathematics, Science and Programming / IT presets choose the question types the editor offers, and “Show all question types” lifts the limit."],
  ["Are essays graded automatically?", "No. Essays wait for the teacher, who grades them with comments. Everything else is scored as soon as a student submits."],
  ["What happens if a student leaves full screen?", "It counts as a warning, and they see how many chances are left. After the last one the exam submits itself. Every exit is logged for the teacher to review."],
  ["How do accounts get created?", "Students and teachers sign up with Google or any email and can start right away. Admins can also create accounts directly."],
];

export default async function HowItWorksPage() {
  const session = await callApi((api) => api["auth.session"](), forwardedHeaders(await headers()));
  const home = Result.isSuccess(session) ? homeFor(session.success.user.role) : null;
  const cta = home ? { href: home, label: "Open Examinus" } : { href: "/login", label: "Sign in" };

  return (
    <div id="top" className={`${c.bg} ${c.text} min-h-full antialiased`}>
      <SiteHeader cta={cta} signedIn={home !== null} />

      <main className="overflow-x-clip">
        {/* Hero */}
        <section className="relative isolate px-4 pt-14 pb-14 text-center lg:px-10 lg:pt-20">
          <Backdrop
            photo="1524178232363-1fb2b075b655"
            className="inset-x-0 -top-24 h-[640px]"
            shade="bg-[#0b1326]/70"
            mask="linear-gradient(to bottom, black 0%, black 35%, transparent 100%)"
          />
          <div className="mx-auto max-w-3xl">
            <Eyebrow>How it works</Eyebrow>
            <h1 className="mt-3 font-display text-[36px] leading-tight font-extrabold tracking-tight sm:text-[56px]">
              From a blank exam{" "}
              <span className="bg-gradient-to-r from-[#c0c1ff] via-[#d0bcff] to-[#4edea3] bg-clip-text text-transparent">to the grade sheet</span>
            </h1>
            <p className={`mx-auto mt-5 max-w-2xl text-lg leading-relaxed ${c.muted}`}>
              Five steps, and only the <span className="font-semibold text-[#c0c1ff]">first two</span> need you. After that, students take
              it and Examinus does the rest.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-2 text-xs font-semibold">
              <span className="rounded-full border border-[#c0c1ff]/30 bg-[#c0c1ff]/10 px-3 py-1 text-[#c0c1ff]">1–2 · You</span>
              <span className="rounded-full border border-[#4edea3]/30 bg-[#4edea3]/10 px-3 py-1 text-[#4edea3]">3 · Students</span>
              <span className="flex items-center gap-1 rounded-full border border-[#4edea3]/30 bg-[#4edea3]/10 px-3 py-1 text-[#4edea3]">
                <Sparkles className="size-3.5" aria-hidden /> 4–5 · Automatic
              </span>
            </div>
          </div>
        </section>

        {/* The steps, with the step bar stuck to the top only while they're on screen */}
        <div className="pb-24">
          <Stepper steps={steps.map((s) => ({ id: s.id, title: s.title, you: s.who === "You" }))} />
          <div className="mt-8 space-y-8 px-4 lg:px-10">
            {steps.map((s, i) => {
              const flip = i % 2 === 1;
              const tone = s.who === "You" ? "#c0c1ff" : "#4edea3";
              return (
                <section key={s.id} id={s.id} className="scroll-mt-48">
                  <Reveal className="mx-auto grid max-w-7xl items-center gap-10 py-12 lg:grid-cols-2 lg:gap-16">
                    <div
                      className={`transition duration-700 group-data-[state=hidden]/reveal:translate-y-8 group-data-[state=hidden]/reveal:opacity-0 ${flip ? "lg:order-2" : ""}`}
                    >
                      <div className="flex items-center gap-4">
                        <span className="font-display text-7xl leading-none font-extrabold text-transparent" style={{ WebkitTextStroke: `1.5px ${tone}` }}>
                          {i + 1}
                        </span>
                        <div>
                          <span
                            className="rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-wider uppercase"
                            style={{ background: `${tone}1f`, color: tone }}
                          >
                            {s.who === "Examinus" ? "Automatic" : s.who}
                          </span>
                          <p className={`mt-1 text-sm font-semibold ${c.muted}`}>{s.title}</p>
                        </div>
                      </div>
                      <h2 className="mt-5 font-display text-3xl font-bold tracking-tight sm:text-4xl">{s.heading}</h2>
                      <p className={`mt-3 text-lg leading-relaxed ${c.muted}`}>{s.text}</p>
                      <ul className="mt-6 space-y-2.5">
                        {s.points.map((p) => (
                          <li key={p} className="flex items-start gap-2.5">
                            <CheckCircle2 className="mt-0.5 size-5 shrink-0" style={{ color: tone }} aria-hidden />
                            <span className="text-[#dae2fd]">{p}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="transition delay-150 duration-700 group-data-[state=hidden]/reveal:translate-y-8 group-data-[state=hidden]/reveal:opacity-0">
                      <Stage photo={s.photo} alt={s.alt} flip={flip}>
                        {s.visual}
                      </Stage>
                    </div>
                  </Reveal>
                </section>
              );
            })}
          </div>
        </div>

        {/* Who does what */}
        <section className={`border-t ${c.line} ${c.lowest} px-4 py-24 lg:px-10`}>
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto mb-12 max-w-2xl text-center">
              <Eyebrow tone={c.green}>Who does what</Eyebrow>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Three roles, each with its own space</h2>
              <p className={`mt-3 ${c.muted}`}>Everyone signs in at the same place and lands in their own part of Examinus.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {roles.map((r) => (
                <div key={r.title} className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#131b2e] p-6">
                  <div className="pointer-events-none absolute -top-16 -right-16 size-40 rounded-full" style={{ background: `radial-gradient(closest-side, ${r.tone}33, transparent)` }} />
                  <span className="relative grid size-11 place-items-center rounded-xl" style={{ background: `${r.tone}1f`, color: r.tone }}>
                    <r.icon className="size-5" aria-hidden />
                  </span>
                  <h3 className="relative mt-4 font-display text-xl font-semibold">{r.title}</h3>
                  <ul className="relative mt-4 space-y-2 text-sm">
                    {r.items.map((item) => (
                      <li key={item} className="flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0" style={{ color: r.tone }} aria-hidden />
                        <span className={c.muted}>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Questions */}
        <section className="px-4 py-24 lg:px-10">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1fr_1.6fr]">
            <div>
              <Eyebrow>Questions</Eyebrow>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Good to know</h2>
              <p className={`mt-3 ${c.muted}`}>
                Anything else?{" "}
                <Link href="/features" className="font-semibold text-[#c0c1ff] hover:underline">
                  See every feature
                </Link>
                .
              </p>
            </div>
            <div className="space-y-2">
              {faq.map(([q, a]) => (
                <details key={q} className="group rounded-2xl border border-white/10 bg-[#131b2e] open:border-[#c0c1ff]/30 open:bg-[#171f33]">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 font-semibold [&::-webkit-details-marker]:hidden">
                    {q}
                    <ChevronDown className="size-5 shrink-0 text-[#c7c4d7] transition-transform group-open:rotate-180" aria-hidden />
                  </summary>
                  <p className={`-mt-1 px-5 pb-5 leading-relaxed ${c.muted}`}>{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Call to action */}
        <section className="px-4 pb-24 lg:px-10">
          <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 rounded-3xl border border-white/10 bg-gradient-to-r from-[#1b2338] to-[#11192c] p-8 sm:flex-row sm:items-center lg:p-10">
            <div>
              <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Ready for step one?</h2>
              <p className={`mt-2 ${c.muted}`}>Sign in, or create an account with Google or any email.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={cta.href}
                className="inline-flex items-center gap-2 rounded-xl bg-[#c0c1ff] px-6 py-3 text-sm font-bold text-[#1000a9] hover:bg-[#e1e0ff]"
              >
                {cta.label} <ArrowRight className="size-4" aria-hidden />
              </Link>
              {!home && (
                <Link href="/register" className="inline-flex items-center rounded-xl border border-white/15 px-6 py-3 text-sm font-semibold hover:bg-white/[0.06]">
                  Create an account
                </Link>
              )}
            </div>
          </div>
        </section>
      </main>

      <SiteFooter cta={cta} signedIn={home !== null} />
    </div>
  );
}

import type { Metadata } from "next";
import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { Result } from "effect";
import {
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  GraduationCap,
  Maximize,
  PenLine,
  Sheet,
  ShieldCheck,
  Sparkles,
  Timer,
  Users,
  type LucideIcon,
} from "lucide-react";
import { homeFor } from "@examora/contract";
import { GoogleMark } from "@/components/google-button";
import { callApi, forwardedHeaders } from "@/lib/api/client";
import { HeroDemo } from "./_landing/hero-demo";
import { HeroStats } from "./_landing/hero-stats";
import { RecordCompare, RollCallPhone } from "./_landing/class-record";
import { Integrity } from "./_landing/integrity";
import { StudentDashboard } from "./_landing/students";
import { Modules } from "./_landing/modules";
import { SwipeRow } from "./_landing/swipe-row";
import { Reveal } from "./_landing/reveal";
import { Showcase } from "./_landing/showcase";
import { SiteFooter } from "./_landing/site-footer";
import { SiteHeader } from "./_landing/site-header";
import { Backdrop, c, Eyebrow, swipeItem } from "./_landing/theme";
import { Typewriter } from "./_landing/typewriter";


export const metadata: Metadata = {
  title: { absolute: "Examinus · Quizzes, exams and class records" },
  description:
    "Online and printed quizzes and exams for every subject in college: nine question types graded automatically, anti-cheating, and a class record that fills itself in.",
};

// `result` is what each step leaves behind.
const steps = [
  { icon: FileSpreadsheet, title: "Create", result: "14 questions", text: "Write questions, pick them from the bank, or import an Excel sheet. The subject decides which question types you get." },
  { icon: Users, title: "Assign", result: "BSED 1-A · Fri 9:00", text: "Choose the class and when it opens. Students see it on their dashboard; you can also print it." },
  { icon: Timer, title: "Take", result: "38 of 40 in", text: "Students answer in full screen with a timer. Answers save as they go, even if the page reloads." },
  { icon: PenLine, title: "Grade", result: "3 essays to read", text: "Everything but essays is scored automatically. Review typed answers and accept a near-miss in one click." },
  { icon: GraduationCap, title: "Record", result: "2.25 · Passed", text: "Scores land in the class record by themselves, then the grade sheet and summary report." },
];

// On phones the big demos are left out to keep the page short; this links to the page that has them.
function MoreLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <div className="mt-6 text-center sm:hidden">
      <Link
        href={href}
        className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.03] px-5 py-2.5 text-sm font-semibold hover:bg-white/[0.07]"
      >
        {children} <ArrowRight className="size-4" aria-hidden />
      </Link>
    </div>
  );
}

export default async function Landing() {
  // Signed in already? Offer the way back in instead of the sign-in button.
  const session = await callApi((api) => api["auth.session"](), forwardedHeaders(await headers()));
  const home = Result.isSuccess(session) ? homeFor(session.success.user.role) : null;
  const cta = home ? { href: home, label: "Open Examinus" } : { href: "/login", label: "Sign in" };

  return (
    <div id="top" className={`${c.bg} ${c.text} min-h-full antialiased`}>
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

      <SiteHeader cta={cta} signedIn={home !== null} />

      {/* Sections below the hero aren't drawn, or animated, until they come near the screen. */}
      <main className="overflow-x-hidden [&>section+section]:[contain-intrinsic-size:auto_600px] sm:[&>section+section]:[contain-intrinsic-size:auto_900px] [&>section+section]:[content-visibility:auto]">
        {/* Hero */}
        <section className="relative isolate">
          {/* Photo from Unsplash: blurred and dark behind the text on the left, clearing toward the right. */}
          <Image
            src="https://images.unsplash.com/photo-1522202176988-66273c2fd55f"
            alt=""
            fill
            preload
            sizes="100vw"
            className="-z-20 object-cover"
          />
          {/* A small, blurred copy of the photo, fading out to the right. Drawn once; a backdrop blur would be redrawn
              on every frame of the animations above it. */}
          <Image
            src="https://images.unsplash.com/photo-1522202176988-66273c2fd55f"
            alt=""
            fill
            sizes="25vw"
            quality={40}
            className="-z-20 scale-110 object-cover blur-xl [mask-image:linear-gradient(to_right,black_30%,transparent_80%)]"
          />
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#0b1326]/95 via-[#0b1326]/75 to-[#0b1326]/25" />
          <div className="absolute inset-x-0 bottom-0 -z-10 h-1/3 bg-gradient-to-b from-transparent to-[#0b1326]" />
          {/* A faint grid over the photo, fading out from the top left. */}
          <div className="absolute inset-0 -z-10 [background-image:linear-gradient(rgba(192,193,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(192,193,255,0.06)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_at_top_left,black_20%,transparent_70%)]" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-x-12 gap-y-10 px-4 sm:gap-y-16 pt-10 pb-14 sm:pt-14 sm:pb-20 lg:grid-cols-[1.15fr_0.85fr] lg:px-10 lg:pt-20 lg:pb-28">
            <div className="pointer-events-none absolute top-1/3 left-0 -z-0 h-[360px] w-[680px] max-w-full -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(192,193,255,0.18),transparent)]" />
            <div className="pointer-events-none absolute -top-10 right-10 h-72 w-72 rounded-full bg-[radial-gradient(closest-side,rgba(78,222,163,0.18),transparent)]" />
            <div className="relative">
              <div className={`mb-6 inline-flex flex-wrap items-center gap-2 rounded-full border ${c.line} bg-[#222a3d]/90 px-3 py-1.5`}>
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#4edea3] opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-[#4edea3]" />
                </span>
                <span className="text-[11px] font-semibold tracking-wider uppercase">For teachers · Free to start</span>
              </div>
              <h1 className="font-display text-[34px] leading-[42px] font-extrabold tracking-tight sm:text-[52px] sm:leading-[60px]">
                Every quiz, exam and class record,
                <Typewriter
                  phrases={["graded for you.", "kept honest.", "recorded for you.", "ready in Excel."]}
                  className="bg-gradient-to-r from-[#c0c1ff] via-[#d0bcff] to-[#4edea3] bg-clip-text text-transparent"
                />
              </h1>
              <p className={`mt-5 max-w-xl text-base leading-relaxed sm:text-lg ${c.muted}`}>
                Give exams in any subject, online or on paper. Examinus scores them, keeps the exam honest, and
                puts every score in a class record laid out like the one your school already uses.
              </p>
              <div className="mt-7 flex w-full flex-col gap-3 sm:mt-9 sm:w-auto sm:flex-row">
                <Link
                  href={home ? cta.href : "/register?role=teacher"}
                  className="group flex w-full items-center justify-center gap-2 rounded-xl bg-[#c0c1ff] px-8 py-3.5 text-sm font-bold text-[#1000a9] shadow-xl hover:bg-[#e1e0ff] sm:w-auto"
                >
                  {home ? cta.label : "Sign up free as a teacher"}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
                </Link>
                <a
                  href="#features"
                  className={`flex w-full items-center justify-center gap-2 rounded-xl border ${c.line} bg-[#222a3d] px-6 py-3.5 text-sm font-semibold hover:bg-[#2d3449] sm:w-auto`}
                >
                  <Sparkles className={`size-4 ${c.green}`} aria-hidden /> See what it does
                </a>
              </div>
              {!home && (
                <p className={`mt-4 text-sm ${c.muted}`}>
                  A student?{" "}
                  <Link href="/register?role=student" className="font-semibold text-[#c0c1ff] hover:text-white hover:underline">
                    Sign up and join your class with its code
                  </Link>
                </p>
              )}
              <ul className={`mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[13px] sm:mt-8 ${c.muted}`}>
                {["Every subject, nine question types", "Anti-cheating built in", "Works on paper too"].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <CheckCircle2 className={`size-4 ${c.green}`} aria-hidden /> {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="relative hidden pt-10 pb-24 sm:block">
              <HeroDemo />
            </div>

            <HeroStats />
          </div>
        </section>

        {/* Product showcase */}
        <section className={`relative isolate overflow-hidden border-y ${c.line} bg-[#060e20]/60 px-4 py-14 sm:py-20 lg:px-10 lg:py-24`} id="showcase">
          {/* Dotted backdrop with a soft light in the middle. */}
          <div className="absolute inset-0 -z-10 [background-image:radial-gradient(rgba(192,193,255,0.12)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_center,black_10%,transparent_70%)]" />
          <div className="absolute top-1/2 left-1/2 -z-10 h-[420px] w-[900px] max-w-full -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(192,193,255,0.126),transparent)]" />
          <Reveal className="mx-auto max-w-7xl">
            <div className="mx-auto max-w-2xl text-center">
              <span className={`inline-flex items-center gap-2 rounded-full border ${c.line} bg-[#222a3d]/70 px-3 py-1`}>
                <Sparkles className={`size-3.5 ${c.green}`} aria-hidden />
                <Eyebrow>Inside Examinus</Eyebrow>
              </span>
              <h2 className="mt-4 font-display text-[32px] leading-tight font-bold tracking-tight sm:text-[40px]">
                From the exam{" "}
                <span className="bg-gradient-to-r from-[#c0c1ff] via-[#d0bcff] to-[#4edea3] bg-clip-text text-transparent">to the grade</span>
              </h2>
              <p className={`mt-3 text-[15px] ${c.muted}`}>
                Pick a subject: what a student sees while taking the exam, and where their score ends up.
              </p>
            </div>

            {/* The three steps, joined by a line with light running along it. */}
            <ol className="relative mx-auto mt-10 grid max-w-4xl gap-3 sm:grid-cols-3 sm:gap-6">
              <div aria-hidden className="absolute top-5 right-[16%] left-[16%] hidden h-px bg-[#464554]/60 sm:block">
                <div className="h-full animate-flow bg-gradient-to-r from-transparent via-[#4edea3] to-transparent bg-[length:40%_100%] bg-no-repeat" />
              </div>
              {[
                [Maximize, "The student answers", "in full screen, with the timer running"],
                [CheckCircle2, "Examinus checks it", "against your answer key, or by running the code"],
                [Sheet, "The record fills in", "score, grade and remarks, by themselves"],
              ].map(([Icon, title, sub], i) => {
                const StepIcon = Icon as LucideIcon;
                return (
                  <li key={String(title)} className="relative flex items-center gap-3 sm:flex-col sm:text-center">
                    <span className="relative grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#c0c1ff] to-[#4edea3] p-px">
                      <span className="grid size-full place-items-center rounded-full bg-[#0b1326]">
                        <StepIcon className={`size-4 ${i === 2 ? c.green : c.primary}`} aria-hidden />
                      </span>
                    </span>
                    <span>
                      <span className="block text-sm font-semibold">
                        <span className={`mr-1.5 font-mono text-xs ${c.muted}`}>0{i + 1}</span>
                        {String(title)}
                      </span>
                      <span className={`block text-xs ${c.muted}`}>{String(sub)}</span>
                    </span>
                  </li>
                );
              })}
            </ol>

            <div className="hidden sm:block">
              <Showcase />
            </div>
            <MoreLink href="/how-it-works">See it step by step</MoreLink>
          </Reveal>
        </section>

        {/* Modules */}
        <section className="relative mx-auto max-w-7xl px-4 py-14 sm:py-24 lg:px-10" id="features">
          <Reveal>
            <div className="mb-8 grid gap-4 sm:mb-12 sm:gap-6 lg:grid-cols-[1.2fr_1fr] lg:items-end">
              <div>
                <Eyebrow tone={c.green}>Everything in one place</Eyebrow>
                <h2 className="mt-2 font-display text-[30px] leading-tight font-bold tracking-tight sm:text-[40px]">
                  Four things teachers do every term,{" "}
                  <span className="bg-gradient-to-r from-[#c0c1ff] to-[#4edea3] bg-clip-text text-transparent">done in Examinus</span>
                </h2>
              </div>
              <div>
                <p className={c.muted}>
                  Each part works on its own and feeds the next: the exam is graded, the grade lands in the class record, the class
                  record prints.
                </p>
                {/* The chain, with light running along it. */}
                <div className="relative mt-5 flex flex-wrap items-center gap-2 text-xs font-semibold sm:gap-7">
                  <div aria-hidden className="absolute top-1/2 right-4 left-4 -z-10 hidden h-px bg-[#464554]/60 sm:block">
                    <div className="h-full animate-flow bg-gradient-to-r from-transparent via-[#4edea3] to-transparent bg-[length:40%_100%] bg-no-repeat" />
                  </div>
                  {["Exam", "Graded", "Class record", "Printed"].map((step, i) => (
                    <span key={step} className="flex items-center gap-2">
                      <span className={`rounded-full border ${c.line} ${c.bg} px-3 py-1 ${i === 3 ? c.green : c.text}`}>{step}</span>
                      {i < 3 && <ArrowRight className={`size-3.5 ${c.muted} sm:hidden`} aria-hidden />}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <Modules />
            <div className="mt-10 text-center">
              <Link
                href="/features"
                className="group inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.03] px-5 py-2.5 text-sm font-semibold hover:bg-white/[0.07]"
              >
                See every feature <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
              </Link>
            </div>
          </Reveal>
        </section>

        {/* How it works */}
        <section className={`relative isolate overflow-hidden border-t ${c.line} ${c.lowest} px-4 py-14 sm:py-24 lg:px-10`} id="how">
          <Backdrop
            photo="1524178232363-1fb2b075b655"
            className="inset-x-0 top-0 h-[560px]"
            shade="bg-[#060e20]/55"
            mask="linear-gradient(to bottom, black 0%, black 35%, transparent 100%)"
          />
          <div className="absolute top-0 left-1/4 -z-10 h-72 w-[600px] max-w-full rounded-full bg-[radial-gradient(closest-side,rgba(192,193,255,0.108),transparent)]" />
          <div className="absolute right-0 bottom-0 -z-10 h-72 w-[600px] max-w-full rounded-full bg-[radial-gradient(closest-side,rgba(78,222,163,0.108),transparent)]" />
          <Reveal className="mx-auto max-w-7xl">
            <div className="mx-auto mb-8 max-w-3xl text-center sm:mb-16">
              <Eyebrow>How it works</Eyebrow>
              <h2 className="mt-2 font-display text-[30px] leading-tight font-bold tracking-tight sm:text-[40px]">
                From a blank exam to the grade sheet
              </h2>
              <p className={`mt-3 text-lg ${c.muted}`}>
                Five steps, and only the <span className="font-semibold text-[#c0c1ff]">first two</span> need you.
              </p>
            </div>

            {/* Who does what: you for two steps, then students and Examinus. */}
            <div aria-hidden className="mb-6 hidden grid-cols-5 gap-4 md:grid">
              <div className="col-span-2 flex items-center gap-3">
                <span className="h-px flex-1 bg-gradient-to-r from-transparent to-[#c0c1ff]/50" />
                <span className="rounded-full border border-[#c0c1ff]/30 bg-[#c0c1ff]/10 px-3 py-1 text-xs font-bold text-[#c0c1ff]">You</span>
                <span className="h-px flex-1 bg-gradient-to-l from-transparent to-[#c0c1ff]/50" />
              </div>
              <div className="col-span-3 flex items-center gap-3">
                <span className="h-px flex-1 bg-gradient-to-r from-transparent to-[#4edea3]/50" />
                <span className="flex items-center gap-1.5 rounded-full border border-[#4edea3]/30 bg-[#4edea3]/10 px-3 py-1 text-xs font-bold text-[#4edea3]">
                  <Sparkles className="size-3.5" /> Then it runs itself
                </span>
                <span className="h-px flex-1 bg-gradient-to-l from-transparent to-[#4edea3]/50" />
              </div>
            </div>

            <SwipeRow as="ol" until="md" label="The five steps" className="relative md:grid md:grid-cols-5 md:gap-4">
              {/* The track: fills in from left to right when it scrolls into view (top to bottom on phones). */}
              <div aria-hidden className="absolute top-5 right-[10%] left-[10%] hidden h-0.5 rounded-full bg-[#222a3d] md:block">
                <div className="h-full w-full origin-left rounded-full bg-gradient-to-r from-[#c0c1ff] via-[#c0c1ff] via-40% to-[#4edea3] transition-transform duration-[1600ms] ease-out group-data-[state=hidden]/reveal:scale-x-0" />
                <div className="absolute inset-0 animate-flow bg-gradient-to-r from-transparent via-white/70 to-transparent bg-[length:15%_100%] bg-no-repeat" />
              </div>
              {steps.map((s, i) => {
                const you = i < 2;
                return (
                  <li
                    key={s.title}
                    style={{ transitionDelay: `${i * 120}ms` }}
                    className={`group relative flex flex-col transition duration-700 group-data-[state=hidden]/reveal:translate-y-6 group-data-[state=hidden]/reveal:opacity-0 ${swipeItem.md}`}
                  >
                    {/* Node on the track */}
                    <span
                      className={`relative z-10 grid size-10 shrink-0 place-items-center rounded-full p-px ml-3 md:mx-auto ${you ? "bg-[#c0c1ff]" : "bg-[#4edea3]"}`}
                    >
                      <span className={`grid size-full place-items-center rounded-full font-display text-sm font-bold ${c.lowest} ${you ? c.primary : c.green}`}>
                        {i + 1}
                      </span>
                      {!you && <span className="absolute inset-0 -z-10 animate-ping rounded-full bg-[#4edea3]/20 [animation-duration:2.5s]" />}
                    </span>
                    <div
                      className={`relative flex flex-1 flex-col rounded-2xl border ${c.line} ${c.low} mt-4 p-4 transition-colors duration-300 group-hover:border-white/20 sm:p-5 md:mt-6`}
                    >
                      <div className="flex items-center justify-between">
                        <s.icon className={`size-5 ${you ? c.primary : c.green}`} aria-hidden />
                        <span className={`text-[10px] font-bold tracking-wider uppercase ${you ? "text-[#c0c1ff]/70" : "text-[#4edea3]/70"}`}>
                          {you ? "You" : i === 2 ? "Students" : "Automatic"}
                        </span>
                      </div>
                      <h3 className="mt-3 font-display text-lg font-semibold">{s.title}</h3>
                      <p className={`mt-1.5 mb-4 text-sm leading-relaxed ${c.muted}`}>{s.text}</p>
                      <p
                        className={`mt-auto flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-[11px] whitespace-nowrap ${
                          you ? "border-[#c0c1ff]/20 bg-[#c0c1ff]/5 text-[#c0c1ff]" : "border-[#4edea3]/20 bg-[#4edea3]/5 text-[#4edea3]"
                        }`}
                      >
                        <CheckCircle2 className="size-3.5 shrink-0" aria-hidden /> {s.result}
                      </p>
                    </div>
                  </li>
                );
              })}
            </SwipeRow>
          </Reveal>
        </section>

        {/* Integrity */}
        <section className="relative isolate mx-auto max-w-7xl px-4 py-14 sm:py-24 lg:px-10" id="integrity">
          <div className="absolute top-1/3 right-0 -z-10 h-96 w-96 rounded-full bg-[radial-gradient(closest-side,rgba(208,188,255,0.126),transparent)]" />
          <div className="mb-6 grid gap-4 sm:mb-12 sm:gap-6 lg:grid-cols-[1fr_1.05fr] lg:items-end">
            <div>
              <span className={`inline-flex items-center gap-2 rounded-full border border-[#d0bcff]/30 bg-[#d0bcff]/10 px-3 py-1`}>
                <ShieldCheck className={`size-3.5 ${c.violet}`} aria-hidden />
                <Eyebrow tone={c.violet}>Anti-cheating</Eyebrow>
              </span>
              <h2 className="mt-4 font-display text-[30px] leading-tight font-bold tracking-tight sm:text-[40px]">
                Keeps exams honest{" "}
                <span className="bg-gradient-to-r from-[#d0bcff] to-[#c0c1ff] bg-clip-text text-transparent">without spying on students</span>
              </h2>
            </div>
            <p className={`text-lg ${c.muted}`}>
              No webcam, no microphone, nothing installed. Examinus watches what happens on the exam page, logs it, and leaves the
              judgment to the teacher.
            </p>
          </div>
          <div className="hidden sm:block">
            <Integrity />
          </div>
          <MoreLink href="/anti-cheating">See how it works</MoreLink>
        </section>

        {/* Class record and attendance */}
        <section className={`relative isolate overflow-hidden border-t ${c.line} bg-[#131b2e]/40 px-4 py-14 sm:py-24 lg:px-10`} id="class-record">
          <Backdrop
            photo="1606761568499-6d2451b23c66"
            className="inset-y-0 right-0 w-full lg:w-2/3"
            mask="linear-gradient(to left, rgba(0,0,0,0.85), rgba(0,0,0,0.35) 50%, transparent 90%)"
          />
          <div className="absolute -top-20 left-1/3 -z-10 h-80 w-[700px] max-w-full rounded-full bg-[radial-gradient(closest-side,rgba(78,222,163,0.108),transparent)]" />
          <Reveal className="mx-auto max-w-7xl">
            <div className="mb-6 grid gap-4 sm:mb-12 sm:gap-6 lg:grid-cols-[1.1fr_1fr] lg:items-end">
              <div>
                <Eyebrow tone={c.green}>Class record and attendance</Eyebrow>
                <h2 className="mt-2 font-display text-[30px] leading-tight font-bold tracking-tight sm:text-[40px]">
                  Your school&apos;s class record,{" "}
                  without{" "}
                  <span className="relative whitespace-nowrap text-[#c7c4d7]/50">
                    the spreadsheet
                    {/* Struck through by hand, in green. */}
                    <svg aria-hidden viewBox="0 0 300 20" preserveAspectRatio="none" className="absolute top-1/2 left-0 h-4 w-full -translate-y-1/2">
                      <path d="M2 14 C 80 4, 200 18, 298 6" fill="none" stroke="#4edea3" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                  </span>
                </h2>
              </div>
              <p className={`text-lg leading-relaxed ${c.muted}`}>
                Same columns, same weights, same transmutation table. Activities and daily work, the major exam, RS and MG for each
                term, and the course grade with P, F, FA and DR remarks.
              </p>
            </div>

            <div className="hidden items-center gap-10 sm:grid lg:grid-cols-[1.5fr_1fr]">
              <div className="transition duration-700 group-data-[state=hidden]/reveal:translate-y-8 group-data-[state=hidden]/reveal:opacity-0">
                <RecordCompare />
                <p className={`mt-3 text-center text-xs ${c.muted}`}>Drag the handle to compare.</p>
              </div>
              <div className="relative transition delay-150 duration-700 group-data-[state=hidden]/reveal:translate-y-8 group-data-[state=hidden]/reveal:opacity-0">
                <RollCallPhone />
                {/* The attendance rules, pinned beside the phone. */}
                <div className="absolute top-10 -left-2 hidden animate-float rounded-xl border border-white/10 bg-[#171f33]/95 px-3 py-2 text-xs shadow-xl sm:block lg:-left-6">
                  <span className="font-bold text-[#ffb68a]">7 lates</span> = 1 absence
                </div>
                <div className="absolute -right-2 bottom-16 hidden animate-float rounded-xl border border-white/10 bg-[#171f33]/95 px-3 py-2 text-xs shadow-xl [animation-delay:1.5s] sm:block lg:-right-4">
                  <span className="font-bold text-[#ffb4ab]">4 absences</span> = drop flag
                </div>
              </div>
            </div>

            <SwipeRow as="ul" label="What the class record does" className="text-sm sm:mt-12 sm:grid sm:grid-cols-2 sm:gap-3 lg:grid-cols-4">
              {[
                [Sheet, "Quizzes and exams link themselves and score as students submit"],
                [CalendarCheck, "Roll call on your phone, with meetings from the class schedule"],
                [Database, "Absences and an attendance score feed the record automatically"],
                [FileSpreadsheet, "Print the grade sheet; download Excel by term or by month"],
              ].map(([Icon, text]) => {
                const ItemIcon = Icon as LucideIcon;
                return (
                  <li key={String(text)} className={`flex items-start gap-3 rounded-2xl border ${c.line} bg-white/[0.02] p-4 ${swipeItem.sm}`}>
                    <ItemIcon className={`mt-0.5 size-5 shrink-0 ${c.green}`} aria-hidden />
                    <span className={c.muted}>{String(text)}</span>
                  </li>
                );
              })}
            </SwipeRow>
            <MoreLink href="/class-record">See the class record</MoreLink>
          </Reveal>
        </section>

        {/* For students */}
        <section className="relative isolate mx-auto max-w-7xl px-4 py-14 sm:py-24 lg:px-10" id="students">
          <div className="absolute top-1/4 left-0 -z-10 h-96 w-96 rounded-full bg-[radial-gradient(closest-side,rgba(124,196,255,0.108),transparent)]" />
          <Reveal>
            <div className="mb-6 grid gap-4 sm:mb-12 sm:gap-6 lg:grid-cols-[1.1fr_1fr] lg:items-end">
              <div>
                <span className={`inline-flex items-center gap-2 rounded-full border ${c.line} bg-[#222a3d]/70 px-3 py-1`}>
                  <GraduationCap className={`size-3.5 ${c.primary}`} aria-hidden />
                  <Eyebrow>For students</Eyebrow>
                </span>
                <h2 className="mt-4 font-display text-[30px] leading-tight font-bold tracking-tight sm:text-[40px]">
                  Students always know{" "}
                  <span className="bg-gradient-to-r from-[#7cc4ff] via-[#c0c1ff] to-[#4edea3] bg-clip-text text-transparent">where they stand</span>
                </h2>
                <p className={`mt-4 text-lg leading-relaxed ${c.muted}`}>
                  A dashboard of what&apos;s open, a schedule, their scores, and their standing in each subject, computed the same way as
                  the class record.
                </p>
              </div>
              <div className="relative h-44 overflow-hidden rounded-3xl border border-white/10 shadow-2xl sm:h-64">
                <Image
                  src="https://images.unsplash.com/photo-1571260899304-425eee4c7efc"
                  alt="College students working at their desks"
                  fill
                  sizes="(min-width: 1024px) 45vw, 100vw"
                  className="object-cover object-[50%_35%]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0b1326]/90 via-[#0b1326]/20 to-transparent" />
                <span className="absolute bottom-4 left-4 flex items-center gap-2 rounded-full border border-white/15 bg-[#0b1326]/70 px-3 py-1.5 text-xs font-semibold backdrop-blur">
                  <span className="size-1.5 rounded-full bg-[#4edea3]" /> Their standing, updated as they submit
                </span>
              </div>
            </div>
            <div className="hidden sm:block">
              <StudentDashboard />
            </div>
            <MoreLink href="/for-students">See the student side</MoreLink>
          </Reveal>
        </section>

        {/* Call to action */}
        <section className={`relative isolate overflow-hidden ${c.lowest} px-4 py-14 sm:py-24 lg:px-10`}>
          <Backdrop
            photo="1562774053-701939374585"
            className="inset-0"
            shade="bg-[#060e20]/50"
            mask="linear-gradient(to bottom, transparent, black 25%, black 75%, transparent)"
          />
          <div className="absolute inset-0 -z-10 [background-image:linear-gradient(rgba(192,193,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(192,193,255,0.05)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]" />
          <div className="relative mx-auto max-w-4xl">
            {/* Around the card: small pieces of what's inside. */}
            {[
              ["-top-6 -left-10", "0s", <><span className="size-1.5 animate-pulse rounded-full bg-[#4edea3]" /> Quiz 3 opens Fri 9:00</>],
              ["top-1/3 -right-16", "1.2s", <><span className="font-bold text-[#4edea3]">2.25</span> · Passed</>],
              ["-bottom-5 left-12", "2.1s", <><CheckCircle2 className="size-3.5 text-[#4edea3]" /> Answer saved</>],
              ["-bottom-7 right-6", "0.6s", <><ShieldCheck className="size-3.5 text-[#d0bcff]" /> 0 alerts</>],
            ].map(([at, delay, body]) => (
              <div
                key={String(at)}
                aria-hidden
                style={{ animationDelay: String(delay) }}
                className={`absolute z-10 hidden animate-float items-center gap-1.5 rounded-full border border-white/10 bg-[#171f33]/95 px-3 py-1.5 text-xs shadow-xl lg:flex ${at}`}
              >
                {body}
              </div>
            ))}

            {/* A light that travels around the border. */}
            <div className="relative overflow-hidden rounded-[28px] p-px shadow-[0_40px_100px_-40px_rgba(192,193,255,0.5)]">
              <div className="absolute inset-[-60%] animate-[spin_9s_linear_infinite] bg-[conic-gradient(from_0deg,transparent_0deg,transparent_250deg,#c0c1ff_300deg,#4edea3_340deg,transparent_360deg)] motion-reduce:animate-none" />
              <div className="absolute inset-0 rounded-[28px] bg-white/10" />
              <div className="relative overflow-hidden rounded-[27px] bg-gradient-to-b from-[#1b2338]/95 to-[#11192c]/95 px-6 py-10 text-center sm:px-12 sm:py-14">
                <div className="pointer-events-none absolute -top-32 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(192,193,255,0.36),transparent)]" />
                <div className="pointer-events-none absolute -bottom-40 left-1/4 h-80 w-80 rounded-full bg-[radial-gradient(closest-side,rgba(78,222,163,0.18),transparent)]" />
                <h2 className="relative font-display text-[32px] leading-tight font-bold tracking-tight sm:text-[48px]">
                  Ready for your next
                  <Typewriter
                    phrases={["exam?", "quiz?", "long quiz?", "midterm?", "finals?"]}
                    className="bg-gradient-to-r from-[#c0c1ff] via-[#d0bcff] to-[#4edea3] bg-clip-text text-transparent"
                  />
                </h2>
                <p className={`relative mx-auto mt-4 max-w-xl text-lg ${c.muted}`}>
                  {home
                    ? "You're signed in. Pick up where you left off."
                    : "Teachers start free. Students join their class with a code. Sign up with Google or any email."}
                </p>
                <div className="relative mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <Link
                    href={cta.href}
                    className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#c0c1ff] px-8 py-3.5 text-sm font-bold text-[#1000a9] shadow-[0_0_30px_rgba(192,193,255,0.35)] hover:bg-[#e1e0ff] sm:w-auto"
                  >
                    {cta.label} <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
                  </Link>
                  {!home && (
                    <Link
                      href="/register?role=teacher"
                      className={`inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-6 py-3.5 text-sm font-semibold hover:bg-white/[0.08] sm:w-auto`}
                    >
                      <GoogleMark /> Sign up free
                    </Link>
                  )}
                </div>
                <p className={`relative mt-6 text-xs ${c.muted}`}>
                  Free for students, free to start for teachers.{" "}
                  <Link href="/pricing" className="underline hover:text-white">
                    See pricing
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

<SiteFooter cta={cta} signedIn={home !== null} />
    </div>
  );
}

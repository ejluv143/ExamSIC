import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { Result } from "effect";
import {
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  GraduationCap,
  HardDrive,
  LayoutDashboard,
  ListChecks,
  Maximize2,
  Play,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { homeFor } from "@examora/contract";
import { GoogleMark } from "@/components/google-button";
import { callApi, forwardedHeaders } from "@/lib/api/client";
import { Reveal } from "../_landing/reveal";
import { SiteFooter } from "../_landing/site-footer";
import { SiteHeader } from "../_landing/site-header";
import { StudentDashboard } from "../_landing/students";
import { Backdrop, c, Eyebrow } from "../_landing/theme";

export const metadata: Metadata = {
  title: "For students",
  description:
    "What Examinus looks like for students: a dashboard of what's open, a schedule, scores, standing in every subject, and exams in full screen with answers saved as you go.",
};

const photo = (id: string) => `https://images.unsplash.com/photo-${id}`;

// A student's day, as small screens in a row you can scroll sideways.
const day: { time: string; icon: typeof Clock; title: string; tone: string; body: ReactNode }[] = [
  {
    time: "7:30 AM",
    icon: LayoutDashboard,
    title: "Check the dashboard",
    tone: "#c0c1ff",
    body: (
      <ul className="space-y-1.5">
        <li className="flex items-center justify-between rounded-lg bg-[#4edea3]/10 px-2.5 py-1.5 text-[#4edea3]">
          SCI 101 · Quiz 3 <span className="text-[10px] font-bold uppercase">Open now</span>
        </li>
        <li className="flex items-center justify-between rounded-lg bg-white/[0.04] px-2.5 py-1.5">
          ENG 101 · Essay <span className={`text-[10px] ${c.muted}`}>Tue</span>
        </li>
        <li className="flex items-center justify-between rounded-lg bg-white/[0.04] px-2.5 py-1.5">
          MATH 102 · Long quiz <span className={`text-[10px] ${c.muted}`}>Thu</span>
        </li>
      </ul>
    ),
  },
  {
    time: "9:00 AM",
    icon: Maximize2,
    title: "Take the quiz",
    tone: "#4edea3",
    body: (
      <div>
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-[#4edea3]">● Full screen</span>
          <span className="rounded-full bg-[#c0c1ff]/15 px-2 py-0.5 font-mono text-[#c0c1ff]">24:05</span>
        </div>
        <p className="mt-2 font-semibold">Which organelle makes most of a cell&apos;s ATP?</p>
        <p className="mt-2 rounded-lg border border-[#4edea3]/40 bg-[#4edea3]/10 px-2.5 py-1.5 font-semibold text-[#4edea3]">● Mitochondrion</p>
      </div>
    ),
  },
  {
    time: "9:32 AM",
    icon: ListChecks,
    title: "See the score",
    tone: "#4edea3",
    body: (
      <div className="text-center">
        <p className={`text-[11px] ${c.muted}`}>SCI 101 · Quiz 3</p>
        <p className="mt-1 font-display text-4xl font-bold text-[#4edea3]">9 / 10</p>
        <p className={`mt-1 text-[11px] ${c.muted}`}>Shown when your teacher releases results</p>
      </div>
    ),
  },
  {
    time: "1:00 PM",
    icon: CalendarDays,
    title: "Plan the week",
    tone: "#7cc4ff",
    body: (
      <ol className="grid grid-cols-5 gap-1 text-center">
        {[
          ["M", null],
          ["T", "#4edea3"],
          ["W", null],
          ["T", "#c0c1ff"],
          ["F", "#7cc4ff"],
        ].map(([d, dot], i) => (
          <li key={i} className="rounded-lg bg-white/[0.04] py-2">
            <p className={`text-[10px] ${c.muted}`}>{d}</p>
            <span className="mx-auto mt-1.5 block size-1.5 rounded-full" style={{ background: dot ?? "transparent" }} />
          </li>
        ))}
      </ol>
    ),
  },
  {
    time: "8:00 PM",
    icon: GraduationCap,
    title: "Check your standing",
    tone: "#d0bcff",
    body: (
      <div className="space-y-2">
        {[
          ["English", "1.75", "#4edea3", "w-[81%]"],
          ["Mathematics", "2.25", "#c0c1ff", "w-[69%]"],
          ["Science", "1.50", "#d0bcff", "w-[88%]"],
        ].map(([s, g, color, w]) => (
          <div key={s}>
            <div className="flex justify-between text-[11px]">
              <span>{s}</span>
              <span className="font-bold" style={{ color }}>
                {g}
              </span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-white/10">
              <div className={`h-full rounded-full ${w}`} style={{ background: color }} />
            </div>
          </div>
        ))}
      </div>
    ),
  },
];

const faq: [string, string][] = [
  ["What if the page reloads in the middle of an exam?", "Your answers are saved on your device as you go, and the timer runs on the server, so you pick up where you left off."],
  ["Why does joining a class ask for my student number?", "Your teacher's class record and grade sheet list you by it. You enter it once, the first time you join a class."],
  ["When do I see my score and the answer key?", "When your teacher releases them: right after you submit, after the exam closes, or later. The result page tells you which."],
  ["Can I retake a quiz?", "If your teacher allows it. You'll see which attempt you're on (for example, attempt 1 of 2), and the Try again button appears only when you have one left."],
  ["What counts as leaving full screen?", "Pressing Esc, switching to another app or tab, or minimizing the browser. Each one is logged, and you'll see a warning with how many chances are left."],
];

export default async function ForStudentsPage() {
  const session = await callApi((api) => api["auth.session"](), forwardedHeaders(await headers()));
  const home = Result.isSuccess(session) ? homeFor(session.success.user.role) : null;
  const cta = home ? { href: home, label: "Open Examinus" } : { href: "/login", label: "Sign in" };

  return (
    <div id="top" className={`${c.bg} ${c.text} min-h-full antialiased`}>
      <SiteHeader cta={cta} signedIn={home !== null} />

      <main className="overflow-x-clip">
        {/* Hero: text and a photo collage */}
        <section className="relative isolate px-4 pt-12 pb-20 lg:px-10 lg:pt-16">
          <div className="absolute top-10 left-0 -z-10 h-96 w-96 rounded-full bg-[radial-gradient(closest-side,rgba(124,196,255,0.18),transparent)]" />
          <div className="absolute right-0 bottom-0 -z-10 h-96 w-96 rounded-full bg-[radial-gradient(closest-side,rgba(78,222,163,0.144),transparent)]" />
          <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[1fr_1.05fr]">
            <div>
              <span className={`inline-flex items-center gap-2 rounded-full border ${c.line} bg-[#222a3d]/70 px-3 py-1`}>
                <GraduationCap className={`size-3.5 ${c.primary}`} aria-hidden />
                <Eyebrow>For students</Eyebrow>
              </span>
              <h1 className="mt-5 font-display text-[36px] leading-tight font-extrabold tracking-tight sm:text-[56px]">
                Always know{" "}
                <span className="bg-gradient-to-r from-[#7cc4ff] via-[#c0c1ff] to-[#4edea3] bg-clip-text text-transparent">where you stand</span>
              </h1>
              <p className={`mt-5 max-w-xl text-lg leading-relaxed ${c.muted}`}>
                What&apos;s open, what&apos;s next, your scores, and your grade so far in every subject, worked out the same way as your
                teacher&apos;s class record.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                {!home ? (
                  <Link
                    href="/register"
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#c0c1ff] px-6 py-3.5 text-sm font-bold text-[#1000a9] shadow-[0_0_30px_rgba(192,193,255,0.3)] hover:bg-[#e1e0ff]"
                  >
                    <GoogleMark /> Create your account
                  </Link>
                ) : null}
                <Link
                  href={cta.href}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-6 py-3.5 text-sm font-semibold hover:bg-white/[0.08]"
                >
                  {cta.label} <ArrowRight className="size-4" aria-hidden />
                </Link>
              </div>
              <ul className={`mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[13px] ${c.muted}`}>
                {["Nothing to install", "Answers saved as you go", "Every subject"].map((t) => (
                  <li key={t} className="flex items-center gap-2">
                    <CheckCircle2 className={`size-4 ${c.green}`} aria-hidden /> {t}
                  </li>
                ))}
              </ul>
            </div>

            {/* Collage */}
            <div aria-hidden className="relative mx-auto h-[440px] w-full max-w-xl sm:h-[500px]">
              <div className="absolute top-0 left-0 h-[62%] w-[58%] -rotate-3 overflow-hidden rounded-3xl border border-white/10 shadow-2xl">
                <Image src={photo("1523240795612-9a054b0db644")} alt="" fill sizes="(min-width: 1024px) 25vw, 60vw" className="object-cover" />
              </div>
              <div className="absolute top-8 right-0 h-[46%] w-[40%] rotate-3 overflow-hidden rounded-3xl border border-white/10 shadow-2xl">
                <Image src={photo("1541339907198-e08756dedf3f")} alt="" fill sizes="(min-width: 1024px) 18vw, 40vw" className="object-cover" />
              </div>
              <div className="absolute right-6 bottom-0 h-[48%] w-[62%] rotate-1 overflow-hidden rounded-3xl border border-white/10 shadow-2xl">
                <Image src={photo("1517486808906-6ca8b3f04846")} alt="" fill sizes="(min-width: 1024px) 26vw, 62vw" className="object-cover object-[50%_60%]" />
              </div>
              <div className="absolute top-[52%] left-2 animate-float rounded-2xl border border-white/10 bg-[#131b2e]/95 px-4 py-3 shadow-2xl backdrop-blur">
                <p className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.14em] text-[#4edea3] uppercase">
                  <span className="size-1.5 animate-pulse rounded-full bg-[#4edea3]" /> Open now
                </p>
                <p className="mt-1 text-sm font-semibold">SCI 101 · Quiz 3</p>
              </div>
              <div className="absolute top-[40%] right-2 animate-float rounded-2xl border border-white/10 bg-[#131b2e]/95 px-4 py-3 shadow-2xl backdrop-blur [animation-delay:1.5s]">
                <p className={`text-[11px] ${c.muted}`}>English so far</p>
                <p className="font-display text-2xl font-bold text-[#4edea3]">1.75</p>
              </div>
              <div className="absolute bottom-6 left-6 flex animate-float items-center gap-1.5 rounded-full border border-white/10 bg-[#131b2e]/95 px-3 py-1.5 text-xs font-semibold shadow-xl backdrop-blur [animation-delay:0.8s]">
                <Check className="size-3.5 text-[#4edea3]" /> Answer saved
              </div>
            </div>
          </div>
        </section>

        {/* A day with Examinus */}
        <section className={`border-y ${c.line} ${c.lowest} py-24`}>
          <div className="mx-auto mb-10 flex max-w-7xl flex-wrap items-end justify-between gap-4 px-4 lg:px-10">
            <div className="max-w-2xl">
              <Eyebrow tone={c.green}>A day with Examinus</Eyebrow>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">From the morning check to tonight&apos;s standing</h2>
            </div>
            <p className={`text-sm ${c.muted}`}>Scroll sideways →</p>
          </div>
          <ol className="mx-auto flex max-w-7xl snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 [scrollbar-width:thin] lg:px-10">
            {day.map((d, i) => (
              <li key={d.time} className="w-72 shrink-0 snap-start sm:w-80">
                <div className="mb-3 flex items-center gap-3">
                  <span className="grid size-9 place-items-center rounded-full" style={{ background: `${d.tone}22`, color: d.tone }}>
                    <d.icon className="size-4" aria-hidden />
                  </span>
                  <div>
                    <p className="font-mono text-xs" style={{ color: d.tone }}>
                      {d.time}
                    </p>
                    <p className="text-sm font-semibold">{d.title}</p>
                  </div>
                  {i < day.length - 1 && <span aria-hidden className="ml-2 h-px flex-1 bg-gradient-to-r from-white/20 to-transparent" />}
                </div>
                <div aria-hidden className="h-44 rounded-3xl border border-white/10 bg-[#131b2e] p-4 text-[12.5px]">
                  {d.body}
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Standing: the interactive dashboard */}
        <section className="px-4 py-24 lg:px-10">
          <Reveal className="mx-auto max-w-7xl">
            <div className="mb-10 max-w-2xl">
              <Eyebrow>Your dashboard</Eyebrow>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Your grade so far, in every subject</h2>
              <p className={`mt-3 text-lg ${c.muted}`}>Pick a subject to see how it adds up, and how many absences you have left.</p>
            </div>
            <StudentDashboard />
          </Reveal>
        </section>

        {/* Taking an exam */}
        <section className={`relative isolate overflow-hidden border-t ${c.line} px-4 py-24 lg:px-10`}>
          <Backdrop
            photo="1531482615713-2afd69097998"
            className="inset-0"
            shade="bg-[#0b1326]/85"
            mask="linear-gradient(to bottom, transparent, black 20%, black 80%, transparent)"
          />
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto mb-12 max-w-2xl text-center">
              <Eyebrow tone={c.green}>Taking an exam</Eyebrow>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Focused, fair, and nothing gets lost</h2>
            </div>
            <div className="grid items-center gap-8 lg:grid-cols-[1fr_1.4fr_1fr]">
              <ul className="space-y-4">
                {[
                  [Maximize2, "Full screen", "Leaving it is a warning, and you always see how many chances are left."],
                  [Clock, "A fair timer", "Kept on the server, the same for everyone."],
                ].map(([Icon, t, d]) => {
                  const I = Icon as typeof Clock;
                  return (
                    <li key={String(t)} className="rounded-2xl border border-white/10 bg-[#131b2e]/90 p-4 backdrop-blur">
                      <p className="flex items-center gap-2 font-semibold">
                        <I className="size-4 text-[#4edea3]" aria-hidden /> {String(t)}
                      </p>
                      <p className={`mt-1 text-sm ${c.muted}`}>{String(d)}</p>
                    </li>
                  );
                })}
              </ul>

              {/* Laptop */}
              <div aria-hidden className="mx-auto w-full max-w-md">
                <div className="rounded-t-2xl border border-b-0 border-white/15 bg-[#060e20] p-2.5 shadow-2xl">
                  <div className="rounded-lg bg-[#131b2e] p-4 text-[12px]">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">ENG 101 · Midterm</span>
                      <span className="flex items-center gap-2">
                        <span className="flex gap-0.5">
                          <span className="h-1.5 w-4 rounded-full bg-[#d0bcff]" />
                          <span className="h-1.5 w-4 rounded-full bg-[#d0bcff]" />
                          <span className="h-1.5 w-4 rounded-full bg-[#d0bcff]" />
                        </span>
                        <span className="rounded-full bg-[#c0c1ff]/15 px-2 py-0.5 font-mono text-[#c0c1ff]">38:12</span>
                      </span>
                    </div>
                    <p className="mt-4 text-[13px] font-semibold">Neither the students nor the teacher ___ late.</p>
                    <p className="mt-2 w-28 rounded-lg border border-[#4edea3]/40 bg-[#4edea3]/10 px-2.5 py-1.5 font-semibold text-[#4edea3]">was</p>
                    <div className="mt-4 grid grid-cols-10 gap-1">
                      {Array.from({ length: 20 }, (_, i) => (
                        <span key={i} className={`h-4 rounded ${i < 12 ? "bg-[#4edea3]/80" : i === 12 ? "bg-[#c0c1ff]" : "bg-white/10"}`} />
                      ))}
                    </div>
                    <p className={`mt-3 text-right text-[10.5px] ${c.muted}`}>● Saved on this device</p>
                  </div>
                </div>
                <div className="mx-auto h-3 w-[112%] -translate-x-[5.5%] rounded-b-xl bg-gradient-to-b from-[#2d3449] to-[#171f33]" />
              </div>

              <ul className="space-y-4">
                {[
                  [HardDrive, "Saved as you go", "On your device, so a reload loses nothing."],
                  [Play, "Run your code", "For code questions, run the sample tests before you submit."],
                ].map(([Icon, t, d]) => {
                  const I = Icon as typeof Clock;
                  return (
                    <li key={String(t)} className="rounded-2xl border border-white/10 bg-[#131b2e]/90 p-4 backdrop-blur">
                      <p className="flex items-center gap-2 font-semibold">
                        <I className="size-4 text-[#4edea3]" aria-hidden /> {String(t)}
                      </p>
                      <p className={`mt-1 text-sm ${c.muted}`}>{String(d)}</p>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </section>

        {/* Getting started */}
        <section className={`${c.lowest} px-4 py-24 lg:px-10`}>
          <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
            <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-white/10 shadow-2xl">
              <Image
                src={photo("1562774053-701939374585")}
                alt="A college campus building on a sunny day"
                fill
                sizes="(min-width: 1024px) 45vw, 100vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#060e20]/80 to-transparent" />
            </div>
            <div>
              <Eyebrow tone={c.green}>Getting started</Eyebrow>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Three steps to your classes</h2>
              <ol className="mt-8 space-y-4">
                {[
                  [UserPlus, "Create your account", "With Google or any email."],
                  [ShieldCheck, "You're in right away", "No waiting: you're signed in as soon as you sign up."],
                  [LayoutDashboard, "Open your dashboard", "Your classes, quizzes and exams are already there."],
                ].map(([Icon, t, d], i) => {
                  const I = Icon as typeof Clock;
                  return (
                    <li key={String(t)} className="flex gap-4 rounded-2xl border border-white/10 bg-[#131b2e] p-4">
                      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#4edea3]/15 font-display font-bold text-[#4edea3]">{i + 1}</span>
                      <div>
                        <p className="flex items-center gap-2 font-semibold">
                          <I className="size-4 text-[#4edea3]" aria-hidden /> {String(t)}
                        </p>
                        <p className={`mt-0.5 text-sm ${c.muted}`}>{String(d)}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        </section>

        {/* Questions */}
        <section className="px-4 py-24 lg:px-10">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1fr_1.6fr]">
            <div>
              <Eyebrow>Questions</Eyebrow>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Good to know</h2>
            </div>
            <div className="space-y-2">
              {faq.map(([q, a]) => (
                <details key={q} className="group rounded-2xl border border-white/10 bg-[#131b2e] open:border-[#7cc4ff]/30 open:bg-[#171f33]">
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
          <div className="relative isolate mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 overflow-hidden rounded-3xl border border-white/10 p-8 sm:flex-row sm:items-center lg:p-12">
            <Image src={photo("1522202176988-66273c2fd55f")} alt="" fill sizes="100vw" className="-z-20 object-cover object-[50%_30%]" />
            <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#0b1326]/95 via-[#11192c]/85 to-[#11192c]/40" />
            <div>
              <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">See your classes in Examinus</h2>
              <p className={`mt-2 ${c.muted}`}>Sign up with Google or any email, then join your class with its code.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {!home && (
                <Link
                  href="/register"
                  className="inline-flex items-center gap-2 rounded-xl bg-[#c0c1ff] px-6 py-3 text-sm font-bold text-[#1000a9] hover:bg-[#e1e0ff]"
                >
                  Create your account <ArrowRight className="size-4" aria-hidden />
                </Link>
              )}
              <Link href={cta.href} className="inline-flex items-center rounded-xl border border-white/15 px-6 py-3 text-sm font-semibold hover:bg-white/[0.06]">
                {cta.label}
              </Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter cta={cta} signedIn={home !== null} />
    </div>
  );
}

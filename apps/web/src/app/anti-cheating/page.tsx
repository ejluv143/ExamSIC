import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { Result } from "effect";
import { ArrowRight, Camera, ChevronDown, Download, Eye, Flag, Mic, SlidersHorizontal, UserCheck, Video, type LucideIcon } from "lucide-react";
import { homeFor } from "@examora/contract";
import { callApi, forwardedHeaders } from "@/lib/api/client";
import { Integrity } from "../_landing/integrity";
import { Reveal } from "../_landing/reveal";
import { SiteFooter } from "../_landing/site-footer";
import { SiteHeader } from "../_landing/site-header";
import { Backdrop, c, Eyebrow } from "../_landing/theme";
import { SimilarityCheck, TypingReplay } from "./code-checks";
import { ChancesSimulator, SettingsDemo } from "./simulators";

export const metadata: Metadata = {
  title: "Anti-cheating",
  description:
    "How Examinus keeps exams honest without a webcam, microphone or software to install: full screen with chances, a log of tab and app switches, one screen only, blocked copy and paste, a name watermark, typing replay and a similarity check.",
};

const never: [LucideIcon, string][] = [
  [Camera, "Webcam"],
  [Mic, "Microphone"],
  [Download, "Software to install"],
  [Video, "Screen recording"],
];

const principles: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Flag, title: "Flags, not accusations", text: "Examinus shows what happened and when. The teacher decides what it means." },
  { icon: Eye, title: "Students see the rules", text: "They see how many chances are left, and every warning says why." },
  { icon: SlidersHorizontal, title: "You choose the strictness", text: "Each rule is a switch per quiz or exam. A practice quiz doesn't need exam rules." },
  { icon: UserCheck, title: "Only the exam page", text: "Nothing outside the exam tab is watched, recorded or uploaded." },
];

const faq: [string, string][] = [
  ["Does Examinus use the webcam or microphone?", "No. It only watches what happens on the exam page itself: leaving full screen, switching tabs or apps, copying and pasting."],
  ["Does a student fail for switching tabs once?", "No. Each switch is logged as a flag with the time. The exam only submits itself if you set a number of chances and the student uses them all."],
  ["What does the one-screen check need?", "Chrome or Edge, which can tell when a second monitor is connected. The exam won't start with one, and pauses if one is added."],
  ["Can a student just reload to reset the warnings?", "No. Answers are saved on the device and the timer runs on the server, so a reload neither loses work nor resets anything."],
  ["Are quizzes as strict as exams?", "Not by default. New quizzes only require full screen and log switches; new exams turn on everything. You can change either."],
];

export default async function AntiCheatingPage() {
  const session = await callApi((api) => api["auth.session"](), forwardedHeaders(await headers()));
  const home = Result.isSuccess(session) ? homeFor(session.success.user.role) : null;
  const cta = home ? { href: home, label: "Open Examinus" } : { href: "/login", label: "Sign in" };

  return (
    <div id="top" className={`${c.bg} ${c.text} min-h-full antialiased`}>
      <SiteHeader cta={cta} signedIn={home !== null} />

      <main className="overflow-x-clip">
        {/* Hero */}
        <section className="relative isolate px-4 pt-14 pb-20 lg:px-10 lg:pt-20">
          <Backdrop
            photo="1606761568499-6d2451b23c66"
            className="inset-x-0 -top-24 h-[680px]"
            shade="bg-[#0b1326]/70"
            mask="linear-gradient(to bottom, black 0%, black 35%, transparent 100%)"
          />
          <div className="absolute top-20 left-1/2 -z-10 h-80 w-[700px] max-w-full -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(208,188,255,0.18),transparent)]" />
          <div className="mx-auto max-w-4xl text-center">
            <Eyebrow tone={c.violet}>Anti-cheating</Eyebrow>
            <h1 className="mt-3 font-display text-[36px] leading-tight font-extrabold tracking-tight sm:text-[56px]">
              Keeps exams honest{" "}
              <span className="bg-gradient-to-r from-[#d0bcff] via-[#c0c1ff] to-[#4edea3] bg-clip-text text-transparent">without spying on students</span>
            </h1>
            <p className={`mx-auto mt-5 max-w-2xl text-lg leading-relaxed ${c.muted}`}>
              Examinus watches what happens on the exam page, logs it with the time, and leaves the judgment to the teacher.
            </p>
            <ul className="mt-8 flex flex-wrap justify-center gap-2" aria-label="Never used">
              {never.map(([Icon, label]) => (
                <li key={label} className="flex items-center gap-2 rounded-full border border-white/10 bg-[#0b1326]/70 px-4 py-2 text-sm backdrop-blur">
                  <Icon className="size-4 text-[#ffb4ab]" aria-hidden />
                  <span className="text-[#c7c4d7] line-through decoration-[#ffb4ab]/80 decoration-2">{label}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* What's checked, with the teacher's live log */}
        <section className="px-4 pb-24 lg:px-10">
          <div className="mx-auto max-w-7xl">
            <Integrity promise={false} codeChecks={false} />
          </div>
        </section>

        {/* Chances */}
        <section className={`relative isolate overflow-hidden border-y ${c.line} ${c.lowest} px-4 py-24 lg:px-10`}>
          <Backdrop
            photo="1513258496099-48168024aec0"
            className="inset-y-0 right-0 w-full lg:w-3/5"
            shade="bg-[#060e20]/60"
            mask="linear-gradient(to left, black 10%, rgba(0,0,0,0.5) 50%, transparent 95%)"
          />
          <div className="absolute top-0 right-0 -z-10 h-96 w-96 rounded-full bg-[radial-gradient(closest-side,rgba(255,180,171,0.108),transparent)]" />
          <Reveal className="mx-auto max-w-6xl">
            <div className="mb-10 max-w-2xl">
              <Eyebrow tone="text-[#ffb68a]">Try it</Eyebrow>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">A set number of chances</h2>
              <p className={`mt-3 text-lg ${c.muted}`}>
                Pick a limit, then leave full screen as a student would. Each exit is a warning; after the last one, the exam submits itself.
              </p>
            </div>
            <div className="transition duration-700 group-data-[state=hidden]/reveal:translate-y-8 group-data-[state=hidden]/reveal:opacity-0">
              <ChancesSimulator />
            </div>
          </Reveal>
        </section>

        {/* Per quiz or exam */}
        <section className="px-4 py-24 lg:px-10">
          <Reveal className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
            <div>
              <Eyebrow tone={c.violet}>Your rules</Eyebrow>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Strict for exams, light for quizzes</h2>
              <p className={`mt-3 text-lg leading-relaxed ${c.muted}`}>
                Every rule is a switch on each quiz or exam. New exams start with all of them on; new quizzes only ask for full screen and log
                switches. Flip between them to see.
              </p>
              <div className="relative mt-8 aspect-[16/10] overflow-hidden rounded-3xl border border-white/10 shadow-2xl">
                <Image
                  src="https://images.unsplash.com/photo-1580582932707-520aed937b7b"
                  alt="An empty classroom set up for an exam"
                  fill
                  sizes="(min-width: 1024px) 45vw, 100vw"
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0b1326]/90 via-[#0b1326]/20 to-transparent" />
                <p className="absolute bottom-4 left-4 rounded-full border border-white/15 bg-[#0b1326]/70 px-3 py-1.5 text-xs font-semibold backdrop-blur">
                  The same rules for every student in the class
                </p>
              </div>
            </div>
            <div className="transition duration-700 group-data-[state=hidden]/reveal:translate-y-8 group-data-[state=hidden]/reveal:opacity-0">
              <SettingsDemo />
            </div>
          </Reveal>
        </section>

        {/* Code answers */}
        <section className={`relative isolate overflow-hidden border-t ${c.line} px-4 py-24 lg:px-10`}>
          <Backdrop
            photo="1498050108023-c5249f4df085"
            className="inset-x-0 top-0 h-[460px]"
            shade="bg-[#0b1326]/65"
            mask="linear-gradient(to bottom, black 0%, rgba(0,0,0,0.6) 40%, transparent 100%)"
          />
          <Reveal className="mx-auto max-w-6xl">
            <div className="mb-10 max-w-2xl">
              <Eyebrow tone={c.green}>For code answers</Eyebrow>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Two more checks for programming</h2>
              <p className={`mt-3 text-lg ${c.muted}`}>Code is easy to copy and easy to paste, so it gets a closer look.</p>
            </div>
            <div className="grid gap-4 transition duration-700 group-data-[state=hidden]/reveal:translate-y-8 group-data-[state=hidden]/reveal:opacity-0 lg:grid-cols-2">
              <TypingReplay />
              <SimilarityCheck />
            </div>
          </Reveal>
        </section>

        {/* Fair by design */}
        <section className={`${c.lowest} px-4 py-24 lg:px-10`}>
          <div className="mx-auto max-w-6xl">
            <div className="relative isolate mb-10 overflow-hidden rounded-3xl border border-white/10">
              <Image
                src="https://images.unsplash.com/photo-1523240795612-9a054b0db644"
                alt="Students working together at a table"
                fill
                sizes="(min-width: 1024px) 70vw, 100vw"
                className="-z-10 object-cover object-[50%_30%]"
              />
              <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#060e20] via-[#060e20]/80 to-[#060e20]/20" />
              <div className="max-w-xl px-6 py-14 sm:px-10 sm:py-20">
                <Eyebrow>Fair by design</Eyebrow>
                <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Honest exams, without treating students as suspects</h2>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {principles.map((p, i) => (
                <div key={p.title} className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#131b2e] p-6">
                  <span
                    aria-hidden
                    className="absolute -top-2 right-3 font-display text-6xl font-extrabold text-transparent [-webkit-text-stroke:1px_rgba(208,188,255,0.18)]"
                  >
                    {i + 1}
                  </span>
                  <span className="grid size-10 place-items-center rounded-xl bg-[#d0bcff]/15 text-[#d0bcff]">
                    <p.icon className="size-5" aria-hidden />
                  </span>
                  <h3 className="mt-4 font-display font-semibold">{p.title}</h3>
                  <p className={`mt-1.5 text-sm leading-relaxed ${c.muted}`}>{p.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Questions */}
        <section className="px-4 py-24 lg:px-10">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1fr_1.6fr]">
            <div>
              <Eyebrow tone={c.violet}>Questions</Eyebrow>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Good to know</h2>
              <p className={`mt-3 ${c.muted}`}>
                See the rest in{" "}
                <Link href="/how-it-works" className="font-semibold text-[#c0c1ff] hover:underline">
                  How it works
                </Link>
                .
              </p>
            </div>
            <div className="space-y-2">
              {faq.map(([q, a]) => (
                <details key={q} className="group rounded-2xl border border-white/10 bg-[#131b2e] open:border-[#d0bcff]/30 open:bg-[#171f33]">
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
            <Image
              src="https://images.unsplash.com/photo-1541339907198-e08756dedf3f"
              alt=""
              fill
              sizes="100vw"
              className="-z-20 object-cover object-[50%_40%]"
            />
            <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#1f1a38]/95 via-[#11192c]/85 to-[#11192c]/40" />
            <div>
              <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Give your next exam with confidence</h2>
              <p className={`mt-2 ${c.muted}`}>Sign in, or create an account with Google or any email.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={cta.href}
                className="inline-flex items-center gap-2 rounded-xl bg-[#d0bcff] px-6 py-3 text-sm font-bold text-[#21005d] hover:bg-[#e9ddff]"
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

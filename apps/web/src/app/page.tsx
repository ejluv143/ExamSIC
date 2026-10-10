import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  BarChart3,
  Check,
  ClipboardList,
  DoorOpen,
  FileSpreadsheet,
  GraduationCap,
  Library,
  PenLine,
  Timer,
  TrendingDown,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";
import { formatPeso, planNames, plans } from "@examora/contract";
import { SiteFooter } from "./_landing/site-footer";
import { SiteHeader } from "./_landing/site-header";
import { StartLink } from "./_landing/start-link";

export const metadata: Metadata = {
  title: { absolute: "Examinus · Quizzes, exams and class records" },
  description: "Online and printed quizzes and exams for college, graded automatically, with anti-cheating and a class record that fills itself in.",
};

// Built once at build time; the signed-in parts (header and start button) are filled in by the browser.
export const dynamic = "force-static";

// Each feature with a screenshot of the real app, taken from the seeded demo data in light and dark mode
// (public/landing/<shot>-light.webp and -dark.webp); the one matching the visitor's mode is shown.
const features: { shot: string; size: [number, number]; eyebrow: string; title: string; text: string; points: string[] }[] = [
  {
    shot: "editor",
    size: [1400, 948],
    eyebrow: "Quiz editor",
    title: "Write any kind of question",
    text: "The subject decides which question types you get, from multiple choice to code and SQL.",
    points: ["Matching, hotspot, drawing, essay and more", "Question bank and Excel import", "AI drafts questions from a topic or your notes"],
  },
  {
    shot: "modes",
    size: [1400, 985],
    eyebrow: "Sessions",
    title: "Run it as a quiz, an exam, practice or a game",
    text: "Each run gets its own 7-character join key, schedule and rules.",
    points: ["Exam mode with an honor pledge", "Mastery: wrong answers come back until right", "Live games with a leaderboard"],
  },
  {
    shot: "exam",
    size: [1161, 976],
    eyebrow: "For students",
    title: "A clear screen to answer on",
    text: "Students take it in full screen with a timer, and every answer saves as they type.",
    points: ["Picks up where they left off after a reload", "Mark questions for review", "A review screen before submitting"],
  },
  {
    shot: "anticheat",
    size: [1400, 985],
    eyebrow: "Anti-cheating",
    title: "Keeps exams honest, no webcam needed",
    text: "Turn on the rules you want; Examinus logs what happens and you decide.",
    points: ["Full screen and a log of tab and app switches", "Block right-click, copy, paste and printing", "A watermark with the student's name"],
  },
  {
    shot: "live",
    size: [1400, 948],
    eyebrow: "Live view",
    title: "Watch the room while they answer",
    text: "Progress, scores and alerts for every student, updated as they work.",
    points: ["Pause, add time or end the session", "Warn, lock or force-submit one student", "Approve a switch to another device"],
  },
  {
    shot: "grading",
    size: [1400, 948],
    eyebrow: "Grading",
    title: "Only the essays are left for you",
    text: "Everything else is scored automatically. Accept a near-miss in one click.",
    points: ["Rubrics and feedback for essays", "Typing replay of code answers", "Results export to Excel"],
  },
  {
    shot: "record",
    size: [1400, 948],
    eyebrow: "Class record",
    title: "Your school's class record, filled in",
    text: "Same columns, weights and transmutation table. Scores land as students submit.",
    points: ["Course grade with P, F, FA and DR remarks", "Printable grade sheet", "Download in Excel"],
  },
  {
    shot: "attendance",
    size: [1400, 948],
    eyebrow: "Attendance",
    title: "Roll call that counts itself",
    text: "Meetings come from the class schedule; absences feed the class record.",
    points: ["7 lates count as 1 absence", "4 absences flag a drop", "Excel per month plus a semester summary"],
  },
  {
    shot: "paper",
    size: [1400, 985],
    eyebrow: "Test papers",
    title: "Print it with your school's header",
    text: "The same quiz prints as a test paper, with a live preview as you set it up.",
    points: ["School and department logos", "Points per part", "Optional separate answer sheet"],
  },
  {
    shot: "standing",
    size: [1400, 948],
    eyebrow: "Student standing",
    title: "Students always know where they stand",
    text: "Their grade so far in each subject, computed the same way as your class record.",
    points: ["Scores per category and term", "Absences used out of the limit", "A dashboard of what's open and coming up"],
  },
];

// A screenshot in a rounded frame, in the visitor's mode (data-theme on <html>, see lib/theme.ts).
function Screenshot({ shot, size: [width, height], alt }: { shot: string; size: [number, number]; alt: string }) {
  const sizes = "(min-width: 1024px) 640px, 100vw";
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-xl shadow-black/5">
      <Image src={`/landing/${shot}-light.webp`} alt={alt} width={width} height={height} sizes={sizes} className="w-full dark:hidden" />
      <Image src={`/landing/${shot}-dark.webp`} alt={alt} width={width} height={height} sizes={sizes} className="hidden w-full dark:block" />
    </div>
  );
}

const steps: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: FileSpreadsheet, title: "Create", text: "Write questions or import a sheet." },
  { icon: Users, title: "Assign", text: "Pick the class and when it opens." },
  { icon: Timer, title: "Take", text: "Students answer with a timer." },
  { icon: PenLine, title: "Grade", text: "Scored automatically; read the essays." },
  { icon: GraduationCap, title: "Record", text: "Scores land in the class record." },
];

// The analytics section's sample student, by topic (the topics of the seeded IT302 demo class).
const topicScores: { topic: string; percent: number }[] = [
  { topic: "SQL joins", percent: 94 },
  { topic: "Keys", percent: 88 },
  { topic: "Normalization", percent: 71 },
  { topic: "SQL aggregates", percent: 52 },
  { topic: "Transactions", percent: 38 },
];

const topicTone = (percent: number) =>
  percent >= 80 ? { bar: "bg-success", text: "text-success" } : percent >= 60 ? { bar: "bg-warning", text: "text-warning" } : { bar: "bg-danger", text: "text-danger" };

const insightCards: { icon: LucideIcon; eyebrow: string; title: string; text: string; stats: [string, string][] }[] = [
  {
    icon: Library,
    eyebrow: "Questions",
    title: "Every question, tagged and reusable",
    text: "Tag each question with a topic, then filter by it in the question bank and the editor.",
    stats: [
      ["13", "question types"],
      ["Q7", "hardest item · 38% earned"],
    ],
  },
  {
    icon: ClipboardList,
    eyebrow: "Exams",
    title: "Every exam, summed up as it closes",
    text: "Average, highest and lowest score, plus results by part and by question.",
    stats: [
      ["78%", "class average"],
      ["4", "modes: quiz, exam, mastery, game"],
    ],
  },
];

function SectionTitle({ id, eyebrow, title }: { id: string; eyebrow: string; title: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-xs font-bold tracking-[0.18em] text-primary uppercase">{eyebrow}</p>
      <h2 id={id} className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
        {title}
      </h2>
    </div>
  );
}

function EnterRoomLink() {
  return (
    <Link
      href="/join"
      className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-6 text-sm font-semibold hover:bg-surface-muted"
    >
      <DoorOpen className="size-4" aria-hidden />
      Enter a room
    </Link>
  );
}

export default function Landing() {
  return (
    <div className="flex min-h-full flex-col bg-background text-foreground">
      <SiteHeader />
      <main className="flex-1">
        <section className="relative isolate overflow-hidden px-4 pt-20 pb-24 text-center sm:pt-28 sm:pb-32">
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 -z-10 h-[480px] bg-[radial-gradient(ellipse_at_top,color-mix(in_oklab,var(--primary)_22%,transparent),transparent_70%)]"
          />
          <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-muted">
            <span className="size-1.5 rounded-full bg-primary" /> For teachers · Free to start
          </p>
          <h1 className="mx-auto mt-6 max-w-3xl font-display text-4xl leading-tight font-extrabold tracking-tight sm:text-6xl">
            Quizzes, exams and class records, <span className="text-primary">graded for you.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-muted">
            Give exams online or on paper. Examinus scores them and fills in your class record.
          </p>
          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <StartLink />
            <EnterRoomLink />
          </div>
          <p className="mt-4 text-sm text-muted">Students with a room key can enter without an account.</p>
        </section>

        <section aria-labelledby="features" className="scroll-mt-16 px-4 py-20">
          <SectionTitle id="features" eyebrow="Features" title="Everything an exam needs" />
          <div className="mx-auto mt-16 max-w-6xl space-y-24">
            {features.map(({ shot, size, eyebrow, title, text, points }, i) => (
              <article
                key={shot}
                className={`grid items-center gap-8 lg:gap-14 ${i % 2 ? "lg:grid-cols-[3fr_2fr]" : "lg:grid-cols-[2fr_3fr]"}`}
              >
                <div className={i % 2 ? "lg:order-last" : undefined}>
                  <p className="text-xs font-bold tracking-[0.18em] text-primary uppercase">{eyebrow}</p>
                  <h3 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">{title}</h3>
                  <p className="mt-3 text-muted">{text}</p>
                  <ul className="mt-5 space-y-2 text-sm">
                    {points.map((point) => (
                      <li key={point} className="flex gap-2.5">
                        <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
                <Screenshot shot={shot} size={size} alt={`${eyebrow} in Examinus`} />
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="analytics" className="scroll-mt-16 px-4 pb-20">
          <SectionTitle id="analytics" eyebrow="Analytics" title="See what each student knows" />
          <p className="mx-auto mt-4 max-w-xl text-center text-muted">
            Scores add up by topic, so you see where a student is strong, where they struggle and what to teach again.
          </p>
          <div className="mx-auto mt-12 grid max-w-6xl gap-6 lg:grid-cols-[3fr_2fr]">
            <article className="rounded-2xl border border-border bg-surface p-6 shadow-xl shadow-black/5 sm:p-8">
              <div className="flex flex-wrap items-center gap-3">
                <span className="grid size-10 place-items-center rounded-full bg-primary-soft text-primary">
                  <BarChart3 className="size-5" aria-hidden />
                </span>
                <div className="mr-auto">
                  <h3 className="font-display text-lg font-semibold">Ana Cruz · IT302</h3>
                  <p className="text-sm text-muted">Percent of points earned, by topic</p>
                </div>
                <span className="rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-muted">Sample data</span>
              </div>
              <ul className="mt-6 space-y-4">
                {topicScores.map(({ topic, percent }) => {
                  const tone = topicTone(percent);
                  return (
                    <li key={topic}>
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="font-medium">{topic}</span>
                        <span className={`font-semibold tabular-nums ${tone.text}`}>{percent}%</span>
                      </div>
                      <div
                        role="meter"
                        aria-label={topic}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={percent}
                        className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-muted"
                      >
                        <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${percent}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <p className="flex gap-2.5 rounded-xl bg-success-soft p-3 text-sm text-success">
                  <TrendingUp className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    <span className="font-semibold">Strong in</span> SQL joins and keys
                  </span>
                </p>
                <p className="flex gap-2.5 rounded-xl bg-danger-soft p-3 text-sm text-danger">
                  <TrendingDown className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    <span className="font-semibold">Needs work on</span> transactions
                  </span>
                </p>
              </div>
            </article>
            <div className="grid gap-6">
              {insightCards.map(({ icon: Icon, eyebrow, title, text, stats }) => (
                <article key={eyebrow} className="rounded-2xl border border-border bg-surface p-6">
                  <p className="flex items-center gap-2 text-xs font-bold tracking-[0.18em] text-primary uppercase">
                    <Icon className="size-4" aria-hidden />
                    {eyebrow}
                  </p>
                  <h3 className="mt-2 font-display text-xl font-bold tracking-tight">{title}</h3>
                  <p className="mt-2 text-sm text-muted">{text}</p>
                  <dl className="mt-4 grid grid-cols-2 gap-3">
                    {stats.map(([value, label]) => (
                      <div key={label} className="rounded-xl bg-surface-muted p-3">
                        <dt className="sr-only">{label}</dt>
                        <dd className="font-display text-2xl font-extrabold tabular-nums">{value}</dd>
                        <dd className="mt-0.5 text-xs text-muted">{label}</dd>
                      </div>
                    ))}
                  </dl>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="how" className="scroll-mt-16 border-y border-border bg-surface px-4 py-20">
          <SectionTitle id="how" eyebrow="How it works" title="Five steps, two of them yours" />
          <ol className="mx-auto mt-12 grid max-w-5xl gap-6 sm:grid-cols-5">
            {steps.map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="flex items-start gap-4 sm:flex-col sm:items-center sm:text-center">
                <span
                  className={`grid size-12 shrink-0 place-items-center rounded-full ${i < 2 ? "bg-primary text-primary-foreground" : "bg-primary-soft text-primary"}`}
                >
                  <Icon className="size-5" aria-hidden />
                </span>
                <span>
                  <span className="block font-semibold">
                    {i + 1}. {title}
                  </span>
                  <span className="mt-1 block text-sm text-muted">{text}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="pricing" className="scroll-mt-16 px-4 py-20">
          <SectionTitle id="pricing" eyebrow="Pricing" title="Free to start" />
          <ul className="mx-auto mt-12 grid max-w-5xl gap-4 md:grid-cols-3">
            {planNames.map((id) => {
              const plan = plans[id];
              const featured = id === "pro";
              return (
                <li
                  key={id}
                  className={`flex flex-col rounded-2xl border bg-surface p-6 ${featured ? "border-primary ring-1 ring-primary" : "border-border"}`}
                >
                  <h3 className="font-display text-lg font-semibold">{plan.name}</h3>
                  <p className="mt-3">
                    <span className="font-display text-3xl font-extrabold">{plan.monthly === 0 ? "₱0" : formatPeso(plan.monthly)}</span>
                    <span className="ml-1 text-sm text-muted">{plan.monthly === 0 ? "forever" : "/ month"}</span>
                  </p>
                  <p className="mt-3 text-sm text-muted">{plan.tagline}</p>
                </li>
              );
            })}
          </ul>
          <p className="mt-6 text-center text-sm text-muted">Students are always free. Paid plans are coming soon.</p>
        </section>

        <section className="px-4 pb-24">
          <div className="mx-auto max-w-4xl rounded-3xl bg-primary-soft px-6 py-14 text-center">
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Ready for your next exam?</h2>
            <p className="mt-3 text-muted">Sign up with Google or any email.</p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <StartLink />
              <EnterRoomLink />
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

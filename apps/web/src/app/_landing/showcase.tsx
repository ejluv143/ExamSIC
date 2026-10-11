import { Brain, Check, Gauge, Sparkles, Timer, TrendingDown, TrendingUp } from "lucide-react";
import { revealDelay } from "./reveal";
import { SectionHeading } from "./section-heading";

// The analytics section: what a student sees after a quiz (the AI coach, topics, pace) on a tinted stage. The data
// is a made-up sample student, labelled as such.
const topics: { topic: string; percent: number; badge: string; tone: string }[] = [
  { topic: "SQL joins", percent: 94, badge: "Strength", tone: "bg-success" },
  { topic: "Keys", percent: 88, badge: "Strength", tone: "bg-success" },
  { topic: "Normalization", percent: 71, badge: "Hesitation zone", tone: "bg-warning" },
  { topic: "Transactions", percent: 38, badge: "Needs review", tone: "bg-danger" },
];

// Seconds spent on each question, and whether it was right: the pace strip.
const pace: [number, boolean][] = [
  [14, true], [9, true], [22, true], [18, true], [71, false], [35, true], [12, true], [64, false], [28, true], [83, false], [20, true], [16, true],
];
const maxPace = Math.max(...pace.map(([s]) => s));

const points: { icon: typeof Brain; title: string; text: string }[] = [
  { icon: Brain, title: "An AI coach for every result", text: "A short, honest read of how they worked, and three things to practise next." },
  { icon: Gauge, title: "Mastery by topic", text: "Strengths, hesitation zones and topics to review, from the tags on your questions." },
  { icon: Timer, title: "Pace and fatigue", text: "Time on every question shows rushed misses, time sinks and a tired second half." },
];

export function AnalyticsShowcase() {
  return (
    <section aria-labelledby="analytics" className="px-4 py-24">
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          id="analytics"
          eyebrow="Analytics"
          title="Every result explains itself"
          text="When a quiz closes, each student gets more than a score: what they know, where they hesitate and what to do next. You get the same picture for the whole class."
        />
        <div className="mt-14 grid gap-10 lg:grid-cols-[1fr_1.35fr] lg:items-center">
          <ul className="space-y-6">
            {points.map(({ icon: Icon, title, text }, i) => (
              <li key={title} data-reveal style={revealDelay(i * 120)} className="flex gap-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span>
                  <span className="block font-display text-lg font-semibold">{title}</span>
                  <span className="mt-1 block text-muted">{text}</span>
                </span>
              </li>
            ))}
          </ul>

          <div
            data-reveal="zoom"
            className="relative rounded-3xl border border-border bg-[color-mix(in_oklab,var(--primary)_7%,var(--surface))] p-4 sm:p-6"
          >
            <div aria-hidden className="bg-dots absolute inset-0 -z-0 rounded-3xl opacity-60 [mask-image:linear-gradient(to_bottom,black,transparent)]" />
            <div className="relative grid gap-4 sm:grid-cols-2">
              <article className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:col-span-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary">
                    <Sparkles className="size-3.5" aria-hidden /> AI coach
                  </span>
                  <span className="ml-auto rounded-full border border-border px-2.5 py-0.5 text-xs text-muted">Sample student</span>
                </div>
                <h3 className="mt-3 font-display text-xl font-bold tracking-tight">Strong base, hesitant on transactions</h3>
                <p className="mt-2 text-sm text-muted">
                  You recalled joins and keys quickly and accurately. Transactions took you long and still went wrong, which points
                  to a gap rather than a slip.
                </p>
                <ul className="mt-3 space-y-1.5 text-sm">
                  {["Drill isolation levels until they feel as quick as joins", "Reread the questions you spent longest on"].map((t) => (
                    <li key={t} className="flex gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> {t}
                    </li>
                  ))}
                </ul>
              </article>

              <article className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
                <h3 className="text-sm font-semibold">Topic mastery</h3>
                <ul className="mt-3 space-y-3">
                  {topics.map(({ topic, percent, badge, tone }) => (
                    <li key={topic}>
                      <div className="flex items-baseline justify-between gap-2 text-xs">
                        <span className="font-medium">{topic}</span>
                        <span className="text-muted">
                          {badge} · <span className="font-semibold text-foreground tabular-nums">{percent}%</span>
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                        <div data-grow className={`h-full rounded-full ${tone}`} style={{ width: `${percent}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              </article>

              <article className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
                <h3 className="text-sm font-semibold">Pace, question by question</h3>
                <div aria-hidden className="mt-4 flex h-28 items-end gap-1.5">
                  {pace.map(([s, right], i) => (
                    <span
                      key={i}
                      className={`flex-1 rounded-t ${right ? "bg-success" : "bg-danger"}`}
                      style={{ height: `${Math.max(8, (s / maxPace) * 100)}%` }}
                    />
                  ))}
                </div>
                <div className="mt-3 flex justify-between text-xs text-muted">
                  <span className="inline-flex items-center gap-1">
                    <TrendingUp className="size-3.5 text-success" aria-hidden /> 9 fluent
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <TrendingDown className="size-3.5 text-danger" aria-hidden /> 3 time sinks
                  </span>
                </div>
              </article>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

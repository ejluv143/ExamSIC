import { Check, Clock, Radio, ShieldCheck, Sparkles } from "lucide-react";
import { EnterRoomLink } from "./enter-room-link";
import { revealDelay } from "./reveal";
import { StartLink } from "./start-link";

const promises = ["No webcam needed", "Works on phones and laptops", "Students are always free"];

// The first screen: the promise on the left, and on the right a stack of the app's own screens (drawn, not
// screenshots) floating over a dotted grid, so the product is the hero image.
export function Hero() {
  return (
    <section className="relative isolate overflow-hidden px-4 pt-14 pb-20 sm:pt-20 lg:pb-28">
      <HeroBackdrop />
      <div className="mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-[1.05fr_1fr] lg:gap-10">
        <div className="text-center lg:text-left">
          <a
            href="#analytics"
            data-reveal
            className="group inline-flex items-center gap-2 rounded-full border border-border bg-surface/80 py-1 pr-3 pl-1 text-xs font-medium backdrop-blur hover:border-primary"
          >
            <span className="rounded-full bg-primary px-2 py-0.5 font-semibold text-primary-foreground">New</span>
            An AI coach on every student&apos;s result
            <span aria-hidden className="text-muted transition-transform group-hover:translate-x-0.5">
              →
            </span>
          </a>
          <h1
            data-reveal
            style={revealDelay(100)}
            className="mt-6 font-display text-5xl leading-[1.05] font-extrabold tracking-tight text-balance sm:text-6xl lg:text-7xl"
          >
            Give the exam.
            <br />
            <span className="text-gradient">We&apos;ll do the grading.</span>
          </h1>
          <p data-reveal style={revealDelay(200)} className="mx-auto mt-6 max-w-xl text-lg text-pretty text-muted lg:mx-0">
            Quizzes, exams and live games for college classes, online or on paper. Examinus scores them, keeps them honest and
            fills in your class record.
          </p>
          <div data-reveal style={revealDelay(300)} className="mt-9 flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
            <StartLink />
            <EnterRoomLink />
          </div>
          <ul
            data-reveal
            style={revealDelay(400)}
            className="mt-8 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-muted lg:justify-start"
          >
            {promises.map((p) => (
              <li key={p} className="flex items-center gap-1.5">
                <Check className="size-4 text-success" aria-hidden /> {p}
              </li>
            ))}
          </ul>
        </div>
        <ProductStack />
      </div>
    </section>
  );
}

// A dotted grid fading out at the edges, with two soft glows in the accent colour that drift as the page scrolls.
function HeroBackdrop() {
  return (
    <div aria-hidden className="absolute inset-0 -z-10">
      <div className="bg-dots absolute inset-0 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_30%,black,transparent)]" />
      <div className="scroll-drift absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-[color-mix(in_oklab,var(--primary)_22%,transparent)] blur-3xl" />
      <div className="absolute top-40 -right-40 h-80 w-80 rounded-full bg-[color-mix(in_oklab,var(--success)_14%,transparent)] blur-3xl" />
    </div>
  );
}

// The exam a student sees, with the teacher's live view and the AI coach floating around it.
function ProductStack() {
  return (
    <div aria-hidden data-reveal="zoom" style={revealDelay(250)} className="relative mx-auto w-full max-w-lg text-xs lg:max-w-none">
      <div className="relative rounded-2xl border border-border bg-surface shadow-2xl shadow-black/10 [transform:perspective(1600px)_rotateY(-6deg)_rotateX(3deg)]">
        <div className="flex items-center gap-1.5 border-b border-border px-4 py-3">
          <span className="size-2.5 rounded-full bg-danger/70" />
          <span className="size-2.5 rounded-full bg-warning/70" />
          <span className="size-2.5 rounded-full bg-success/70" />
          <span className="ml-3 truncate rounded-md bg-surface-muted px-3 py-1 font-mono text-[11px] text-muted">examinus.app/exam</span>
        </div>
        <div className="space-y-4 p-5">
          <div className="flex items-center justify-between">
            <p className="font-display text-base font-semibold">IT302 Midterm Exam</p>
            <span className="inline-flex items-center gap-1 rounded-md bg-surface-muted px-2 py-1 font-semibold tabular-nums">
              <Clock className="size-3.5" /> 38:12
            </span>
          </div>
          <div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
              <div data-grow className="h-full rounded-full bg-primary" style={{ width: "58%" }} />
            </div>
            <p className="mt-1.5 text-muted">7 of 12 answered · saved just now</p>
          </div>
          <div className="rounded-xl border border-border p-4">
            <p className="text-muted">Question 8 · Multiple choice · 2 pts</p>
            <p className="mt-1.5 text-sm font-medium">Which normal form removes partial dependencies on a composite key?</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {["1NF", "2NF", "3NF", "BCNF"].map((choice, i) => (
                <span
                  key={choice}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${i === 1 ? "border-primary bg-primary-soft font-semibold text-primary" : "border-border"}`}
                >
                  <span className={`size-3.5 rounded-full border-2 ${i === 1 ? "border-primary bg-primary" : "border-border"}`} />
                  {choice}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="animate-float absolute -top-6 -right-3 w-52 rounded-xl border border-border bg-surface/95 p-3 shadow-xl backdrop-blur sm:-right-8">
        <p className="flex items-center gap-1.5 font-semibold">
          <Radio className="size-3.5 text-success" /> Live · 28 taking it
        </p>
        {[92, 70, 46].map((w, i) => (
          <div key={w} className="mt-2 flex items-center gap-2">
            <span className="size-5 shrink-0 rounded-full bg-surface-muted" />
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
              <div data-grow className={`h-full rounded-full ${i === 2 ? "bg-danger" : "bg-success"}`} style={{ width: `${w}%` }} />
            </div>
          </div>
        ))}
      </div>

      <div className="animate-float absolute -bottom-10 -left-3 w-64 rounded-xl border border-border bg-surface/95 p-3.5 shadow-xl backdrop-blur [animation-delay:-3s] sm:-left-10">
        <p className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 font-semibold text-primary">
          <Sparkles className="size-3" /> AI coach
        </p>
        <p className="mt-2 font-semibold">Strong on SQL, slow on transactions</p>
        <p className="mt-1 text-muted">You know the ideas; drill recall on isolation levels.</p>
      </div>

      <div className="absolute -bottom-5 right-6 hidden items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 font-semibold shadow-lg sm:inline-flex">
        <ShieldCheck className="size-3.5 text-success" /> Full screen · tab switches logged
      </div>
    </div>
  );
}

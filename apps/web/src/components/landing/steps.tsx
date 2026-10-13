import { FileSpreadsheet, GraduationCap, PenLine, Timer, Users, type LucideIcon } from "lucide-react";
import { revealDelay } from "./reveal";
import { SectionHeading } from "./section-heading";

// The five steps of a quiz, joined by a line; the first two are the teacher's, the rest happen by themselves.
const steps: { icon: LucideIcon; title: string; text: string; yours: boolean }[] = [
  { icon: FileSpreadsheet, title: "Create", text: "Write questions, import a sheet or let AI draft them.", yours: true },
  { icon: Users, title: "Assign", text: "Pick the class, the mode and when it opens.", yours: true },
  { icon: Timer, title: "Take", text: "Students answer with a timer, on any device.", yours: false },
  { icon: PenLine, title: "Grade", text: "Scored on submit; you read only the essays.", yours: false },
  { icon: GraduationCap, title: "Record", text: "Scores land in the class record and reports.", yours: false },
];

export function Steps() {
  return (
    <section aria-labelledby="how" className="border-y border-border bg-surface px-4 py-24">
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          id="how"
          eyebrow="How it works"
          title="Five steps. Two of them are yours."
          text="Set it up once; Examinus runs the session, scores every answer and keeps the record."
        />
        <ol className="relative mt-16 grid gap-8 sm:grid-cols-5 sm:gap-4">
          {/* The line through the step markers, solid for the teacher's part and dashed for the rest. */}
          <span aria-hidden className="absolute top-6 right-[10%] left-[10%] hidden h-px bg-[linear-gradient(90deg,var(--primary)_40%,var(--border)_40%)] sm:block" />
          {steps.map(({ icon: Icon, title, text, yours }, i) => (
            <li key={title} data-reveal style={revealDelay(i * 100)} className="relative flex items-start gap-4 sm:flex-col sm:items-center sm:text-center">
              <span
                className={`relative grid size-12 shrink-0 place-items-center rounded-2xl ring-8 ring-surface ${yours ? "bg-primary text-primary-foreground" : "border border-border bg-background text-primary"}`}
              >
                <Icon className="size-5" aria-hidden />
              </span>
              <span>
                <span className="block text-xs font-semibold tracking-wider text-muted uppercase">
                  Step {i + 1} · {yours ? "You" : "Examinus"}
                </span>
                <span className="mt-1 block font-display text-lg font-semibold">{title}</span>
                <span className="mt-1 block text-sm text-muted">{text}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

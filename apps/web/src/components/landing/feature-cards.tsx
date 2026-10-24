import type { ReactNode } from "react";
import {
  AlertTriangle,
  CalendarCheck,
  Check,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  Gamepad2,
  Gauge,
  GraduationCap,
  KeyRound,
  LayoutGrid,
  ListChecks,
  MonitorSmartphone,
  PenLine,
  Printer,
  Radio,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Table2,
  type LucideIcon,
} from "lucide-react";
import { revealDelay } from "./reveal";

// The landing page's features as cards. Each card draws a small sketch of the screen it describes, made of the
// same colour tokens as the app, so it follows the visitor's light or dark mode and the accent they picked. The
// sketches are decoration (aria-hidden); the title, text and points carry the meaning.

type Feature = {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  text: string;
  points: string[];
  // Columns out of 6 on wide screens.
  span: "lg:col-span-2" | "lg:col-span-3" | "lg:col-span-4";
  visual: ReactNode;
  // The sketch lifts off the card: tilted, with a deep shadow, poking past the card's right edge and drifting
  // gently. Only on cards that end their row on wide screens, so it never covers a neighbour.
  floating?: boolean;
  // A notification that hovers over the top of the sketch.
  chip?: { icon: LucideIcon; text: string; tone: keyof typeof chipTones };
};

const chipTones = {
  primary: "text-primary",
  success: "text-success",
  warning: "text-warning",
} as const;

// A little card floating above a sketch, out of step with its neighbours (`delay`, in seconds back into the cycle).
function FloatingChip({ icon: Icon, text, tone, delay }: NonNullable<Feature["chip"]> & { delay: number }) {
  return (
    <div
      aria-hidden
      className="animate-float absolute -top-4 right-3 z-20 inline-flex max-w-[85%] items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold shadow-xl shadow-black/10"
      style={{ animationDelay: `${-delay}s` }}
    >
      <Icon className={`size-3.5 shrink-0 ${chipTones[tone]}`} />
      <span className="truncate">{text}</span>
    </div>
  );
}

// A rounded panel the sketches sit in.
function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div aria-hidden className={`rounded-xl border border-border bg-background p-3 text-xs ${className}`}>
      {children}
    </div>
  );
}

const Bar = ({ percent, tone = "bg-primary" }: { percent: number; tone?: string }) => (
  <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
    <div data-grow className={`h-full rounded-full ${tone}`} style={{ width: `${percent}%` }} />
  </div>
);

const questionTypes = ["Multiple choice", "Matching", "Identification", "Hotspot", "Drawing", "Essay", "Code", "SQL"];

const EditorVisual = (
  <Panel>
    <div className="flex flex-wrap gap-1.5">
      {questionTypes.map((type, i) => (
        <span
          key={type}
          className={`rounded-full px-2 py-1 font-medium ${i === 0 ? "bg-primary text-primary-foreground" : "bg-surface-muted text-muted"}`}
        >
          {type}
        </span>
      ))}
    </div>
    <div className="mt-3 rounded-lg border border-border bg-surface p-2.5">
      <p className="font-medium">Which JOIN keeps every row of the left table?</p>
      {["INNER JOIN", "LEFT JOIN", "CROSS JOIN"].map((choice, i) => (
        <p key={choice} className="mt-1.5 flex items-center gap-2 text-muted">
          <span className={`grid size-3.5 place-items-center rounded-full border ${i === 1 ? "border-success bg-success" : "border-border"}`}>
            {i === 1 && <Check className="size-2.5 text-surface" />}
          </span>
          {choice}
        </p>
      ))}
    </div>
    <p className="mt-2.5 inline-flex items-center gap-1.5 rounded-md bg-primary-soft px-2 py-1 font-medium text-primary">
      <Sparkles className="size-3.5" /> Draft 10 questions from my notes
    </p>
  </Panel>
);

const modes: { icon: LucideIcon; name: string; note: string }[] = [
  { icon: FileText, name: "Quiz", note: "On their own time" },
  { icon: ShieldCheck, name: "Exam", note: "Pledge and rules" },
  { icon: RefreshCw, name: "Mastery", note: "Until it's right" },
  { icon: Gamepad2, name: "Game", note: "Live leaderboard" },
];

const ModesVisual = (
  <Panel>
    <div className="grid grid-cols-2 gap-2">
      {modes.map(({ icon: Icon, name, note }, i) => (
        <div key={name} className={`rounded-lg border p-2 ${i === 1 ? "border-primary bg-primary-soft" : "border-border bg-surface"}`}>
          <Icon className={`size-4 ${i === 1 ? "text-primary" : "text-muted"}`} />
          <p className="mt-1 font-semibold">{name}</p>
          <p className="text-muted">{note}</p>
        </div>
      ))}
    </div>
    <p className="mt-2.5 flex items-center justify-between rounded-lg bg-surface-muted px-2.5 py-1.5">
      <span className="flex items-center gap-1.5 text-muted">
        <KeyRound className="size-3.5" /> Join key
      </span>
      <span className="font-mono font-bold tracking-widest">MNK-3RZZ</span>
    </p>
  </Panel>
);

const ExamVisual = (
  <Panel>
    <div className="flex items-center justify-between">
      <span className="font-semibold">IT302 Midterm</span>
      <span className="inline-flex items-center gap-1 rounded-md bg-surface-muted px-1.5 py-0.5 font-semibold tabular-nums">
        <Clock className="size-3" /> 24:13
      </span>
    </div>
    <div className="mt-2">
      <Bar percent={62} />
      <p className="mt-1 text-muted">8 of 13 answered · 1 marked</p>
    </div>
    <div className="mt-2.5 grid grid-cols-7 gap-1">
      {Array.from({ length: 14 }, (_, i) => (
        <span
          key={i}
          className={`grid aspect-square place-items-center rounded font-semibold ${
            i === 4 ? "bg-warning-soft text-warning" : i < 8 ? "bg-primary-soft text-primary" : "border border-dashed border-border text-muted"
          }`}
        >
          {i + 1}
        </span>
      ))}
    </div>
    <p className="mt-2.5 flex items-center gap-1.5 text-success">
      <Check className="size-3.5" /> Saved
    </p>
  </Panel>
);

const rules = ["Full screen", "Log tab and app switches", "Block copy and paste", "Watermark"];
const events: [string, string][] = [
  ["10:14", "Left full screen · 6 s"],
  ["10:21", "Switched to another app"],
  ["10:32", "Tried to paste"],
];

const AntiCheatVisual = (
  <Panel className="grid gap-3 sm:grid-cols-2">
    <ul className="space-y-1.5">
      {rules.map((rule) => (
        <li key={rule} className="flex items-center justify-between gap-2">
          {rule}
          <span className="flex h-4 w-7 items-center justify-end rounded-full bg-primary p-0.5">
            <span className="size-3 rounded-full bg-primary-foreground" />
          </span>
        </li>
      ))}
    </ul>
    <ul className="space-y-1.5 rounded-lg bg-surface p-2">
      {events.map(([at, what]) => (
        <li key={at} className="flex gap-2">
          <span className="font-mono text-muted tabular-nums">{at}</span>
          <span className="text-warning">{what}</span>
        </li>
      ))}
    </ul>
  </Panel>
);

const liveStudents: { name: string; progress: number; status: "ok" | "alert" | "done" }[] = [
  { name: "Aquino, J.", progress: 100, status: "done" },
  { name: "Bautista, C.", progress: 72, status: "ok" },
  { name: "Castillo, K.", progress: 55, status: "alert" },
  { name: "Cruz, B.", progress: 38, status: "ok" },
];
const liveDot = { ok: "bg-success", alert: "bg-danger animate-pulse", done: "bg-primary" } as const;

const LiveVisual = (
  <Panel>
    <p className="mb-2 flex items-center gap-1.5 font-semibold">
      <Radio className="size-3.5 text-success" /> Live · 28 taking it
    </p>
    <ul className="space-y-2">
      {liveStudents.map(({ name, progress, status }) => (
        <li key={name} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-2">
          <span className="truncate">{name}</span>
          <Bar percent={progress} tone={status === "alert" ? "bg-danger" : status === "done" ? "bg-primary" : "bg-success"} />
          <span className={`size-2 rounded-full ${liveDot[status]}`} />
        </li>
      ))}
    </ul>
    <div className="mt-2.5 flex gap-1.5">
      {["Pause", "Add time", "Warn"].map((action) => (
        <span key={action} className="rounded-md border border-border bg-surface px-2 py-1 font-medium">
          {action}
        </span>
      ))}
    </div>
  </Panel>
);

// A ring showing how much of the paper scores itself.
const GradingVisual = (
  <Panel className="flex items-center gap-4">
    <svg viewBox="0 0 36 36" className="size-20 shrink-0 -rotate-90">
      <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--surface-muted)" strokeWidth="4" />
      <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--success)" strokeWidth="4" strokeDasharray="90 97.4" strokeLinecap="round" />
    </svg>
    <div className="min-w-0 flex-1">
      <p className="font-display text-xl font-bold">92%</p>
      <p className="text-muted">scored automatically</p>
      <div className="mt-2 space-y-1">
        {[
          ["Thesis", "4 / 4"],
          ["Evidence", "3 / 4"],
          ["Clarity", "2 / 2"],
        ].map(([row, score]) => (
          <p key={row} className="flex justify-between rounded bg-surface px-2 py-0.5">
            {row} <span className="font-semibold tabular-nums">{score}</span>
          </p>
        ))}
      </div>
    </div>
  </Panel>
);

const recordRows: [string, number, number, string, string][] = [
  ["Aquino", 88, 91, "1.50", "P"],
  ["Bautista", 79, 74, "2.25", "P"],
  ["Castillo", 61, 52, "5.00", "F"],
];

const RecordVisual = (
  <Panel className="overflow-hidden p-0">
    <table className="w-full">
      <thead className="bg-surface-muted text-muted">
        <tr>
          {["Student", "Quizzes", "Exams", "Grade", ""].map((h) => (
            <th key={h} className="px-2.5 py-1.5 text-left font-medium">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {recordRows.map(([name, quiz, exam, grade, remark]) => (
          <tr key={name} className="border-t border-border">
            <td className="px-2.5 py-1.5">{name}</td>
            <td className="px-2.5 py-1.5 tabular-nums">{quiz}</td>
            <td className="px-2.5 py-1.5 tabular-nums">{exam}</td>
            <td className="px-2.5 py-1.5 font-semibold tabular-nums">{grade}</td>
            <td className="px-2.5 py-1.5">
              <span className={`rounded px-1.5 py-0.5 font-bold ${remark === "P" ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>
                {remark}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </Panel>
);

// Two weeks of meetings: present, late or absent.
const attendance = "PPLPPAPPPLPPPP";
const attendanceTone = { P: "bg-success-soft text-success", L: "bg-warning-soft text-warning", A: "bg-danger-soft text-danger" } as const;

const AttendanceVisual = (
  <Panel>
    <div className="grid grid-cols-7 gap-1">
      {[...attendance].map((mark, i) => (
        <span key={i} className={`grid aspect-square place-items-center rounded font-bold ${attendanceTone[mark as keyof typeof attendanceTone]}`}>
          {mark}
        </span>
      ))}
    </div>
    <p className="mt-2.5 flex justify-between text-muted">
      <span>2 late · 1 absent</span>
      <span className="font-semibold text-foreground">1 of 4 absences used</span>
    </p>
  </Panel>
);

const PaperVisual = (
  <Panel className="bg-surface">
    <div className="flex items-center gap-2 border-b border-border pb-2">
      <span className="grid size-7 place-items-center rounded-full bg-primary-soft text-primary">
        <GraduationCap className="size-4" />
      </span>
      <div className="min-w-0 flex-1 text-center">
        <p className="font-bold tracking-wide uppercase">San Isidro College</p>
        <p className="text-muted">College of Computing · Midterm Examination</p>
      </div>
    </div>
    <p className="mt-2 flex justify-between text-muted">
      <span>Name: ____________</span>
      <span>Score: ___ / 65</span>
    </p>
    <p className="mt-2 font-semibold">Part I. Multiple choice (20 pts)</p>
    <div className="mt-1.5 space-y-1">
      {[90, 75, 82].map((w) => (
        <div key={w} className="h-1.5 rounded bg-surface-muted" style={{ width: `${w}%` }} />
      ))}
    </div>
  </Panel>
);

const standingRows: [string, number, string][] = [
  ["Quizzes", 86, "bg-success"],
  ["Exams", 78, "bg-primary"],
  ["Projects", 64, "bg-warning"],
];

const StandingVisual = (
  <Panel>
    <div className="flex items-baseline justify-between">
      <span className="font-semibold">IT302 · grade so far</span>
      <span className="font-display text-2xl font-extrabold text-primary">1.75</span>
    </div>
    <div className="mt-2 space-y-2">
      {standingRows.map(([name, percent, tone]) => (
        <div key={name}>
          <p className="mb-0.5 flex justify-between">
            {name} <span className="tabular-nums text-muted">{percent}%</span>
          </p>
          <Bar percent={percent} tone={tone} />
        </div>
      ))}
    </div>
  </Panel>
);

const features: Feature[] = [
  {
    icon: PenLine,
    eyebrow: "Quiz editor",
    title: "Write any kind of question",
    text: "The subject decides which question types you get, from multiple choice to code and SQL.",
    points: ["Question bank and Excel import", "AI drafts questions from a topic or your notes"],
    span: "lg:col-span-4",
    visual: EditorVisual,
    chip: { icon: Sparkles, text: "10 questions drafted", tone: "primary" },
  },
  {
    icon: LayoutGrid,
    eyebrow: "Sessions",
    title: "Quiz, exam, practice or game",
    text: "Each run gets its own join key, schedule and rules.",
    points: ["Exam mode with an honor pledge", "Live games with a leaderboard"],
    span: "lg:col-span-2",
    visual: ModesVisual,
    floating: true,
  },
  {
    icon: MonitorSmartphone,
    eyebrow: "For students",
    title: "A clear screen to answer on",
    text: "Full screen with a timer; every answer saves as they type.",
    points: ["Picks up where they left off", "Mark questions for review"],
    span: "lg:col-span-2",
    visual: ExamVisual,
  },
  {
    icon: ShieldCheck,
    eyebrow: "Anti-cheating",
    title: "Keeps exams honest, no webcam needed",
    text: "Turn on the rules you want; Examinus logs what happens and you decide.",
    points: ["A log of tab and app switches", "Block right-click, copy, paste and printing", "A watermark with the student's name"],
    span: "lg:col-span-4",
    visual: AntiCheatVisual,
    chip: { icon: AlertTriangle, text: "Castillo left full screen · 6 s", tone: "warning" },
  },
  {
    icon: Eye,
    eyebrow: "Live view",
    title: "Watch the room while they answer",
    text: "Progress, scores and alerts for every student, as they work.",
    points: ["Pause, add time or end the session", "Warn, lock or force-submit one student"],
    span: "lg:col-span-3",
    visual: LiveVisual,
    chip: { icon: CheckCircle2, text: "Bautista submitted", tone: "success" },
  },
  {
    icon: ListChecks,
    eyebrow: "Grading",
    title: "Only the essays are left for you",
    text: "Everything else is scored automatically. Accept a near-miss in one click.",
    points: ["Rubrics and feedback for essays", "Typing replay of code answers"],
    span: "lg:col-span-3",
    visual: GradingVisual,
    floating: true,
  },
  {
    icon: Table2,
    eyebrow: "Class record",
    title: "Your school's class record, filled in",
    text: "Same columns, weights and transmutation table. Scores land as students submit.",
    points: ["P, F, FA and DR remarks", "Printable grade sheet and Excel"],
    span: "lg:col-span-4",
    visual: RecordVisual,
    chip: { icon: CheckCircle2, text: "Quiz 3 scores added", tone: "success" },
  },
  {
    icon: CalendarCheck,
    eyebrow: "Attendance",
    title: "Roll call that counts itself",
    text: "Meetings come from the schedule; absences feed the class record.",
    points: ["7 lates count as 1 absence", "4 absences flag a drop"],
    span: "lg:col-span-2",
    visual: AttendanceVisual,
    floating: true,
  },
  {
    icon: Printer,
    eyebrow: "Test papers",
    title: "Print it with your school's header",
    text: "The same quiz prints as a test paper, with a live preview.",
    points: ["School and department logos", "Optional separate answer sheet"],
    span: "lg:col-span-3",
    visual: PaperVisual,
  },
  {
    icon: Gauge,
    eyebrow: "Student standing",
    title: "Students always know where they stand",
    text: "Their grade so far in each subject, computed like your class record.",
    points: ["Scores per category and term", "Absences used out of the limit"],
    span: "lg:col-span-3",
    visual: StandingVisual,
  },
];

export function FeatureCards() {
  return (
    <div className="mx-auto mt-14 grid max-w-6xl gap-5 md:grid-cols-2 lg:grid-cols-6">
      {features.map(({ icon: Icon, eyebrow, title, text, points, span, visual, floating, chip }, i) => (
        <article
          key={eyebrow}
          data-reveal
          // Cards on one row arrive one after another.
          style={revealDelay((i % 2) * 120)}
          className={`flex min-w-0 flex-col rounded-2xl border p-6 hover:shadow-xl hover:shadow-black/5 ${floating ? "border-primary/30 bg-[color-mix(in_oklab,var(--primary)_5%,var(--surface))]" : "border-border bg-surface"} ${span}`}
        >
          <p className="flex items-center gap-2 text-xs font-bold tracking-[0.18em] text-primary uppercase">
            <span className="grid size-7 place-items-center rounded-lg bg-primary-soft">
              <Icon className="size-4" aria-hidden />
            </span>
            {eyebrow}
          </p>
          <h3 className="mt-3 font-display text-xl font-bold tracking-tight">{title}</h3>
          <p className="mt-1.5 text-sm text-muted">{text}</p>
          <ul className="mt-3 space-y-1 text-sm">
            {points.map((point) => (
              <li key={point} className="flex gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                {point}
              </li>
            ))}
          </ul>
          <div className="mt-6 flex-1 content-end">
            <div className="relative">
              {chip && <FloatingChip {...chip} delay={i * 1.1} />}
              {floating ? (
                <div
                  className="animate-float relative z-10 -rotate-1 lg:-mr-10 [&>div]:bg-surface [&>div]:shadow-2xl [&>div]:shadow-black/15"
                  style={{ animationDelay: `${-i * 0.7}s` }}
                >
                  {visual}
                </div>
              ) : (
                visual
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

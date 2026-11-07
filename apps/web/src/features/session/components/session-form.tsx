"use client";

import { shiftLocal } from "@examinus/copy/time";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import {
  AppWindow,
  ArrowLeftRight,
  ArrowRight,
  BookOpenCheck,
  CalendarClock,
  Check,
  ChevronDown,
  ClipboardList,
  ClipboardPaste,
  ClipboardX,
  Clock,
  Copy,
  Droplets,
  Flag,
  Gamepad2,
  Globe,
  Hand,
  KeyRound,
  Laptop,
  ListChecks,
  ListOrdered,
  LogOut,
  Maximize,
  MonitorOff,
  MousePointerClick,
  Play,
  Printer,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  SquareCode,
  Target,
  Timer,
  Trophy,
  Users,
  CalendarCheck,
  CalendarX,
  RotateCcw,
  UserRoundPlus,
  Info,
  TriangleAlert,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Button, Field, Switch, inputClass } from "@/components/ui";
import { Select } from "@/components/select";
import { GameFields } from "@/features/game/components/game-fields";
import { MasteryFields } from "@/features/mastery/components/mastery-fields";
import { clientKindLabel, clientKinds, type ClientKind } from "@examinus/domain/client";
import { examDefaults, examLockedSettings } from "@examinus/domain/exam";
import { formatJoinKey } from "@examinus/domain/join-key";
import {
  guestModes,
  type IntegritySettings,
  type ResultsRelease,
  type Session,
  type SessionMode,
  type SessionNavigation,
} from "@examinus/domain/quiz";
import type { Class } from "@/features/classes/types";
import { createSessionAction, updateSessionAction } from "../actions";
import {
  applyStarter,
  changeAllowedClients,
  changeLockExit,
  changeMode,
  changeOneAtATime,
  changeStartWhen,
  attemptsAllowedOf,
  firstProblemArea,
  generatePassword,
  hasNavigation,
  locksOf,
  manilaAt,
  newDraft,
  originOf,
  starterMode,
  toInput,
  validate,
  type Area,
  type Problem,
  type SessionDraft,
  type StarterId,
  type StartWhen,
} from "../session-draft";
import { RuleCard, type Art } from "./anti-cheat";
import { ModeTile } from "./assessment-bits";
import { ChipGroup, RadioCards, Section, type CardOption } from "./session-form-parts";


const modes: readonly CardOption<SessionMode>[] = [
  {
    value: "quiz",
    label: "Quiz",
    description: "Students answer on their own time. You decide when they see the results.",
    icon: <ClipboardList className="size-5" />,
  },
  {
    value: "exam",
    label: "Exam",
    description: "Serious mode: honor pledge, locked anti-cheating rules and a scheduled window.",
    icon: <ShieldCheck className="size-5" />,
  },
  {
    value: "mastery",
    label: "Mastery",
    description: "Practice until correct: wrong answers come back until they are right.",
    icon: <Target className="size-5" />,
  },
  {
    value: "game",
    label: "Game",
    description: "Live and competitive, with points, streaks and a leaderboard.",
    icon: <Gamepad2 className="size-5" />,
  },
];

const modeRulesDescription: Record<SessionMode, string> = {
  quiz: "How students move through the questions and mark them for review.",
  exam: "How students move through the questions, and the conditions only exams have.",
  mastery: "How practice repeats until students get it right.",
  game: "How the game is played: pacing, points and teams.",
};

// The form is one page in three numbered sections: the type, who and when (everything most sessions need), and the
// rules, which start folded with sensible defaults. Each problem belongs to the area that fixes it.
type Panel = Exclude<Area, "basics">;
// The form's three tabs, and the tab each area of fields is on.
type Tab = "basics" | "rules" | "security";
const tabOf: Record<Area, Tab> = { basics: "basics", rules: "rules", access: "rules", results: "rules", security: "security" };
const areaAnchor = (area: Area | "type") => `session-area-${area}`;

// The cards of the one-click starting points for a new session; what each sets is in the draft module.
const starters: readonly { id: StarterId; label: string; description: string; icon: LucideIcon }[] = [
  { id: "pop", label: "Pop quiz now", description: "Opens now, one try, scores right after.", icon: Zap },
  { id: "homework", label: "Homework", description: "Open for a week, two tries, scores when it closes.", icon: BookOpenCheck },
  { id: "exam", label: "Scheduled exam", description: "Tomorrow 9:00–11:00, locked anti-cheating rules.", icon: ShieldCheck },
  { id: "practice", label: "Practice", description: "Wrong answers come back until they're right.", icon: Target },
  { id: "game", label: "Live game", description: "Points, streaks and a leaderboard on the big screen.", icon: Trophy },
];

const releases: readonly { value: ResultsRelease; label: string; icon: ReactNode }[] = [
  { value: "immediately", label: "Immediately", icon: <Zap className="size-3.5" aria-hidden /> },
  { value: "after_close", label: "After it closes", icon: <Clock className="size-3.5" aria-hidden /> },
  { value: "manual", label: "When I release them", icon: <Hand className="size-3.5" aria-hidden /> },
];

const navigations: readonly CardOption<SessionNavigation>[] = [
  {
    value: "free",
    label: "Free",
    description: "Students go to any question, in any order.",
    icon: <ArrowLeftRight className="size-5" />,
  },
  {
    value: "marked_only",
    label: "Back to marked only",
    description: "Forward only, but students may return to questions they marked for review.",
    icon: <Flag className="size-5" />,
  },
  {
    value: "forward_only",
    label: "Forward only",
    description: "No going back once a question is left.",
    icon: <ArrowRight className="size-5" />,
  },
];

// The cards for the settings every session has, with the drawing and icon of each.
const lockedCards: Record<(typeof examLockedSettings)[number][0], { art: Art; icon: ReactNode; description: string }> = {
  requireFullscreen: {
    art: "fullscreen",
    icon: <Maximize className="size-4" />,
    description: "The quiz opens in full screen and students must stay there until they submit.",
  },
  trackFocus: {
    art: "focus",
    icon: <AppWindow className="size-4" />,
    description: "Every switch to another tab or app (Alt+Tab included) is logged with how long it lasted.",
  },
  blockSecondScreen: {
    art: "screens",
    icon: <MonitorOff className="size-4" />,
    description: "A second monitor must be disconnected to start (Chrome and Edge).",
  },
  blockRightClick: {
    art: "rightClick",
    icon: <MousePointerClick className="size-4" />,
    description: "The right-click and long-press menus are turned off.",
  },
  blockCopy: {
    art: "copy",
    icon: <Copy className="size-4" />,
    description: "Copy and cut are turned off, and the question text can't be selected.",
  },
  blockPaste: {
    art: "paste",
    icon: <ClipboardPaste className="size-4" />,
    description: "Pasting and dragging text in are turned off.",
  },
  blockPrint: {
    art: "print",
    icon: <Printer className="size-4" />,
    description: "Printing and saving the page are turned off.",
  },
  clearClipboardOnStart: {
    art: "clipboard",
    icon: <ClipboardX className="size-4" />,
    description: "The clipboard is emptied when the student starts, so earlier notes can't be pasted.",
  },
  watermark: {
    art: "watermark",
    icon: <Droplets className="size-4" />,
    description: "The student's name is shown faintly across the page, so photos can be traced.",
  },
};
const lockedLabel = Object.fromEntries(examLockedSettings) as Record<keyof typeof lockedCards, string>;

export function SessionForm({
  quizId,
  classes,
  session,
  roomPassword: savedPassword,
  exitPassword: savedExitPassword,
  ipAllowlist: savedAllowlist,
  relayPassword: savedRelayPassword,
  relayClues: savedRelayClues,
  defaultClassId,
  onDone,
}: {
  quizId: string;
  classes: Class[];
  // Set when editing a session.
  session?: Session;
  roomPassword?: string | null;
  exitPassword?: string | null;
  ipAllowlist?: readonly string[];
  relayPassword?: string | null;
  relayClues?: readonly string[];
  defaultClassId?: string;
  onDone: () => void;
}) {
  const router = useRouter();
  // What a locked field goes back to when editing: the session as it was when the form opened.
  const [origin] = useState(() =>
    session
      ? originOf(session, {
          roomPassword: savedPassword,
          exitPassword: savedExitPassword,
          ipAllowlist: savedAllowlist,
          relayPassword: savedRelayPassword,
          relayClues: savedRelayClues,
        })
      : undefined,
  );
  const [draft, setDraft] = useState<SessionDraft>(() => origin?.seed ?? newDraft({ defaultClassId }));
  const set = (patch: Partial<SessionDraft>) => setDraft((prev) => ({ ...prev, ...patch }));
  const {
    classId,
    mode,
    startWhen,
    opens,
    closes,
    timeLimit,
    attempts,
    customAttempts,
    release,
    integrity,
    oneAtATime,
    navigation,
    marked,
    customMarked,
    questionSeconds,
    lateJoin,
    password,
    exitPassword,
    lockExit,
    computersOnly,
    allowMobile,
    pledge,
    graceMinutes,
    allowlist,
    limitNetworks,
    countInRecord,
    allowGuests,
  } = draft;
  const { opened, started } = locksOf(session);
  const [copied, setCopied] = useState(false);

  const [problems, setProblems] = useState<Problem[]>([]);
  const [openPanels, setOpenPanels] = useState<ReadonlySet<Panel>>(new Set());
  const [starter, setStarter] = useState<StarterId | null>(null);
  const [tab, setTab] = useState<Tab>("basics");
  const [saving, setSaving] = useState(false);

  const exam = mode === "exam";
  const klass = classes.find((c) => c.id === classId);
  const setIntegrityField = (patch: Partial<IntegritySettings>) =>
    setDraft((prev) => ({ ...prev, integrity: { ...prev.integrity, ...patch } }));
  const toggleOneAtATime = (on: boolean) => setDraft((prev) => changeOneAtATime(prev, on));
  const setQuestionSeconds = (value: string) => set({ questionSeconds: value });

  async function copyJoinKey() {
    if (!session?.joinCode) return;
    await navigator.clipboard.writeText(session.joinCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const attemptsAllowed = attemptsAllowedOf(draft);
  // Only papers with questions to go between have navigation and marks: not games, not mastery's retry queue.
  const navigates = hasNavigation(mode);

  function togglePanel(panel: Panel) {
    setOpenPanels((prev) => {
      const next = new Set(prev);
      if (!next.delete(panel)) next.add(panel);
      return next;
    });
  }

  function chooseStarter(id: StarterId) {
    setDraft((prev) => applyStarter(prev, id));
    setStarter(id);
    setProblems([]);
  }

  // Scrolls the form's own scroller, not the dialog (scrollIntoView would also shift the dialog's hidden overflow).
  function jumpTo(area: Area | "type") {
    const target = document.getElementById(areaAnchor(area));
    const scroller = target?.closest<HTMLElement>(".overflow-y-auto");
    if (!target || !scroller) return;
    const smooth = !matchMedia("(prefers-reduced-motion: reduce)").matches;
    const top = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 16;
    scroller.scrollTo({ top, behavior: smooth ? "smooth" : "auto" });
  }

  async function save() {
    const found = validate(draft, origin);
    if (found.length > 0) {
      // Every problem shows beside its fields: open the panels that have one and bring the first into view.
      setProblems(found);
      setOpenPanels((prev) => new Set([...prev, ...found.flatMap((p) => (p.area === "basics" ? [] : [p.area]))]));
      const first = firstProblemArea(found)!;
      setTab(tabOf[first]);
      requestAnimationFrame(() => jumpTo(first));
      return;
    }

    const input = toInput(draft, origin);
    setSaving(true);
    if (session) {
      const result = await updateSessionAction(session.id, input);
      setSaving(false);
      if ("error" in result) return setProblems([{ area: "basics", text: result.error }]);
      router.refresh();
      return onDone();
    }
    const startNow = startWhen === "now";
    const result = await createSessionAction(quizId, { ...input, startNow });
    if ("error" in result) {
      setSaving(false);
      return setProblems([{ area: "basics", text: result.error }]);
    }
    // Started now: go where the teacher runs it. A game opens its lobby on the presenter screen; the other modes
    // open the live view. The button stays busy while the page changes.
    if (startNow) {
      const base = `/teacher/assessments/${quizId}/sessions/${result.ok.id}`;
      return router.push(mode === "game" ? `${base}/present` : `${base}/live`);
    }
    setSaving(false);
    router.refresh();
    onDone();
  }

  const modeLabel = modes.find((m) => m.value === mode)!.label;
  const attemptsLabel =
    attempts === "unlimited" ? "Unlimited attempts" : `${attemptsAllowed || "?"} ${attemptsAllowed === 1 ? "attempt" : "attempts"}`;
  const whoLabel = klass ? `${klass.courseCode} · ${klass.section}` : "Anyone with the key";
  const opensLabel = opened
    ? "Already open"
    : startWhen === "now"
      ? "Opens the lobby now"
      : startWhen === "schedule"
        ? opens
          ? `Opens ${opens.replace("T", " ")}`
          : "Pick an open time"
        : "You press Start";
  const releaseLabel = releases.find((r) => r.value === release)!.label;
  const rulesOn = examLockedSettings.filter(([key]) => exam || integrity[key]).length;
  const rulesSummary =
    navigates
      ? [
          oneAtATime ? "One question at a time" : "All questions on one page",
          oneAtATime ? navigations.find((n) => n.value === navigation)!.label.toLowerCase() : null,
          exam && computersOnly ? "computers only" : null,
          exam && allowMobile ? "mobile app allowed" : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : mode === "game"
        ? draft.game.pacing === "teacher"
          ? "Teacher-paced"
          : "Student-paced"
        : "Practice until correct";
  const accessSummary = [
    password.trim() ? "Room password" : "No password",
    lateJoin ? `late join up to ${lateJoin} min` : "no late-join cutoff",
    !klass && guestModes.includes(mode) && allowGuests ? "guests allowed" : null,
    klass && countInRecord ? "counts in the class record" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const securitySummary = `${rulesOn} of ${examLockedSettings.length} rules on${limitNetworks ? " · allowed networks" : ""}${lockExit ? " · exit password" : ""}`;
  const problemsIn = (areasOf: readonly Area[]) => problems.filter((p) => areasOf.includes(p.area));
  const primaryLabel = session ? "Save changes" : startWhen === "now" ? (mode === "game" ? "Open the lobby" : "Start now") : "Schedule session";

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div role="tablist" aria-label="Session settings" className="flex shrink-0 gap-1 overflow-x-auto overflow-y-hidden border-b border-border px-3 pt-2 [scrollbar-width:none] sm:px-5">
            {(
              [
                { key: "basics", title: "Basics", icon: <ListChecks className="size-4" aria-hidden />, summary: `${modeLabel} · ${whoLabel}` },
                { key: "rules", title: "Rules", icon: <SlidersHorizontal className="size-4" aria-hidden />, summary: `${rulesSummary} · scores ${releaseLabel.toLowerCase()}` },
                { key: "security", title: "Anti-cheating", icon: <ShieldCheck className="size-4" aria-hidden />, summary: securitySummary },
              ] as const
            ).map((t) => {
              const count = problems.filter((pr) => tabOf[pr.area] === t.key).length;
              const on = tab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  id={`session-tab-${t.key}`}
                  aria-selected={on}
                  aria-controls={`session-panel-${t.key}`}
                  tabIndex={on ? 0 : -1}
                  onClick={() => setTab(t.key)}
                  onKeyDown={(e) => {
                    const order = ["basics", "rules", "security"] as const;
                    const at = order.indexOf(t.key);
                    const next = e.key === "ArrowRight" ? order[(at + 1) % 3] : e.key === "ArrowLeft" ? order[(at + 2) % 3] : null;
                    if (!next) return;
                    e.preventDefault();
                    setTab(next);
                    document.getElementById(`session-tab-${next}`)?.focus();
                  }}
                  className={clsx(
                    "-mb-px flex min-h-12 shrink-0 items-center gap-2 rounded-t-lg border-b-2 px-3 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary",
                    on ? "border-primary bg-primary-soft/50 text-foreground" : "border-transparent text-muted hover:bg-surface-muted hover:text-foreground",
                  )}
                >
                  <span className={on ? "text-primary" : undefined}>{t.icon}</span>
                  <span>
                    <span className="block font-bold">{t.title}</span>
                    <span className="hidden max-w-56 truncate text-xs text-muted sm:block">{t.summary}</span>
                  </span>
                  {count > 0 && (
                    <span className="rounded-full bg-danger-soft px-2 py-0.5 text-xs font-bold text-danger tabular-nums">
                      {count}
                      <span className="sr-only"> to fix</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          <div role="tabpanel" id="session-panel-basics" aria-labelledby="session-tab-basics" hidden={tab !== "basics"} className="space-y-5">
          {!session && (
            <section aria-labelledby="session-starters" className="space-y-2">
              <div>
                <h3 id="session-starters" className="text-sm font-bold">
                  Start from
                </h3>
                <p className="text-xs text-muted">Pick one to fill in the usual settings, then change anything below.</p>
              </div>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
                {starters.map((s) => {
                  const Icon = s.icon;
                  const on = starter === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => chooseStarter(s.id)}
                      className={clsx(
                        "flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-[background-color,border-color,box-shadow,transform] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-safe:hover:-translate-y-px sm:flex-row sm:gap-3 lg:flex-col",
                        on ? "border-primary bg-primary-soft shadow-sm ring-1 ring-primary" : "border-border bg-surface shadow-sm hover:border-primary",
                      )}
                    >
                      <ModeTile mode={starterMode(s.id)} />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 text-sm font-bold">
                          <Icon className="size-3.5 text-muted" aria-hidden />
                          {s.label}
                          {on && <Check className="size-3.5 text-primary" aria-label="Chosen" />}
                        </span>
                        {/* Phones show the names only; the type tile and the settings below say the rest. */}
                        <span className="mt-0.5 hidden text-xs text-muted sm:block">{s.description}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          <div id={areaAnchor("type")} className="scroll-mt-4">
            <Section
              number={1}
              icon={<ListChecks className="size-5" />}
              title="Type"
              description="Picking a type applies its usual settings."
              locked={opened ? "The type can't change once the session is open." : undefined}
            >
              <RadioCards
                label="Type"
                value={mode}
                options={modes}
                onChange={(next) => {
                  setStarter(null);
                  setDraft((prev) => changeMode(prev, next, origin));
                }}
              />
            </Section>
          </div>

          <div id={areaAnchor("basics")} className="scroll-mt-4">
            <Section number={2} icon={<Users className="size-5" />} title="Who & when" description="Who can join, when it opens, and how long they get.">
              <WhenBlock icon={<Users className="size-5" />} title="Who can take it">
                <Field
                  label="Class"
                  hint={
                    opened
                      ? "The class was set when the session opened."
                      : klass
                        ? `Only its ${klass.studentIds.length} students (and later joiners) can take it.`
                        : "No class: anyone who enters the join key can take it."
                  }
                >
                  <Select
                    value={classId}
                    disabled={opened}
                    onChange={(value) => set({ classId: value })}
                    className="w-full"
                    options={[
                      { value: "", label: "No class: anyone with the key" },
                      ...classes.map((c) => ({ value: c.id, label: `${c.courseCode} · ${c.section}`, description: c.title })),
                    ]}
                  />
                </Field>
                <GuestCard
                  mode={mode}
                  modeLabel={modeLabel}
                  hasClass={Boolean(klass)}
                  on={allowGuests}
                  onChange={(on) => set({ allowGuests: on })}
                  hasPassword={password.trim() !== ""}
                />
              </WhenBlock>

              <WhenBlock icon={<CalendarClock className="size-5" />} title="When it opens and closes">
                {opened ? (
                  <p className="text-sm text-muted">Already open: its opening time can no longer change.</p>
                ) : (
                  <div role="radiogroup" aria-label="When it opens" className="grid gap-2 sm:grid-cols-2">
                    {(
                      [
                        { value: "now", label: "Now", hint: "Students can start right away.", icon: Play },
                        { value: "schedule", label: "Later", hint: "Pick the day and time it opens.", icon: CalendarClock },
                        ...(session && !session.opensAt ? [{ value: "manual" as const, label: "When I press Start", hint: "It waits for you.", icon: Hand }] : []),
                      ] satisfies { value: StartWhen; label: string; hint: string; icon: LucideIcon }[]
                    ).map((o) => {
                      const on = startWhen === o.value;
                      return (
                        // Real radio inputs, so the arrow keys move between them as in any radio group.
                        <label
                          key={o.value}
                          className={clsx(
                            "flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border p-3 text-left transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary",
                            on ? "border-primary bg-primary-soft ring-1 ring-primary" : "border-border bg-surface hover:bg-surface-muted",
                          )}
                        >
                          <input
                            type="radio"
                            name="session-opens"
                            value={o.value}
                            checked={on}
                            onChange={() => setDraft((prev) => changeStartWhen(prev, o.value))}
                            className="sr-only"
                          />
                          <span
                            className={clsx("grid size-9 shrink-0 place-items-center rounded-lg", on ? "bg-primary text-primary-foreground shadow-depth" : "bg-surface-muted text-muted")}
                            aria-hidden
                          >
                            <o.icon className="size-4" />
                          </span>
                          <span>
                            <span className="block text-sm font-bold">{o.label}</span>
                            <span className="block text-xs text-muted">{o.hint}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                  {!opened && startWhen === "schedule" && (
                    <Field label="Opens at">
                      <IconInput icon={<CalendarCheck className="size-4" />}>
                        <input type="datetime-local" value={opens} onChange={(e) => set({ opens: e.target.value })} className={clsx(inputClass, "w-full pl-10")} />
                      </IconInput>
                    </Field>
                  )}
                  <div className="space-y-2">
                    <Field label={exam ? "Closes at" : "Closes at (optional)"} hint={exam ? "Exams need a close time." : "Empty: you close it yourself."}>
                      <IconInput icon={<CalendarX className="size-4" />}>
                        <input type="datetime-local" value={closes} onChange={(e) => set({ closes: e.target.value })} className={clsx(inputClass, "w-full pl-10")} />
                      </IconInput>
                    </Field>
                    {(() => {
                      // Quick close times count from when it opens (now, or the open time picked).
                      const from = startWhen === "schedule" && opens ? opens : manilaAt(0);
                      return (
                        <div className="flex flex-wrap gap-1.5" aria-label="Quick close times">
                          {[
                            { label: "1 hour after", value: shiftLocal(from, 60) },
                            { label: "End of that day", value: `${from.slice(0, 10)}T23:59` },
                            { label: "A week after", value: shiftLocal(from, 7 * 24 * 60) },
                            ...(exam ? [] : [{ label: "No close time", value: "" }]),
                          ].map((c) => (
                            <QuickChip key={c.label} on={closes === c.value} onClick={() => set({ closes: c.value })}>
                              {c.label}
                            </QuickChip>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </WhenBlock>

              <WhenBlock icon={<Timer className="size-5" />} title="How long and how often">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Field label="Time limit (minutes)" hint="Empty: no limit.">
                      <IconInput icon={<Timer className="size-4" />}>
                        <input type="number" min={1} value={timeLimit} onChange={(e) => set({ timeLimit: e.target.value })} className={clsx(inputClass, "w-full pl-10")} />
                      </IconInput>
                    </Field>
                    <div className="flex flex-wrap gap-1.5" aria-label="Quick time limits">
                      {["15", "30", "60", "90", ""].map((m) => (
                        <QuickChip key={m || "none"} on={timeLimit === m} onClick={() => set({ timeLimit: m })}>
                          {m ? `${m} min` : "No limit"}
                        </QuickChip>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      <RotateCcw className="size-4 text-muted" aria-hidden /> Attempts
                    </span>
                    <div className="flex flex-wrap items-center gap-3">
                      <ChipGroup
                        label="Attempts allowed"
                        value={attempts}
                        onChange={(value) => set({ attempts: value })}
                        options={[
                          { value: "1", label: "1" },
                          { value: "2", label: "2" },
                          { value: "3", label: "3" },
                          { value: "unlimited", label: "Unlimited" },
                          { value: "custom", label: "Custom" },
                        ]}
                      />
                      {attempts === "custom" && (
                        <input
                          type="number"
                          min={1}
                          value={customAttempts}
                          onChange={(e) => set({ customAttempts: e.target.value })}
                          aria-label="Number of attempts"
                          className={`${inputClass} w-24`}
                        />
                      )}
                    </div>
                    <p className="text-xs text-muted">How many times a student may take it. 1 means no retakes.</p>
                  </div>
                </div>
              </WhenBlock>
              <ProblemList problems={problemsIn(["basics"])} />
            </Section>
          </div>

          </div>

          <div role="tabpanel" id="session-panel-rules" aria-labelledby="session-tab-rules" hidden={tab !== "rules"} className="space-y-3">
            <p className="text-sm text-muted">Everything here already has a sensible default. Open a part only to change it.</p>
            <div id={areaAnchor("rules")} className="scroll-mt-4 space-y-3">
                <RulePanel
                  panel="rules"
                  icon={<ShieldAlert className="size-4" />}
                  title={`${modeLabel} settings`}
                  summary={rulesSummary}
                  description={modeRulesDescription[mode]}
                  open={openPanels.has("rules")}
                  onToggle={togglePanel}
                  problems={problemsIn(["rules"])}
                  locked={started && mode !== "game" ? "Students are already taking it, so these rules stay as they are." : undefined}
                >
                  {navigates && (
                    <>
                      <Part title="Questions">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <PacingCards
                            oneAtATime={oneAtATime}
                            questionSeconds={questionSeconds}
                            onOneAtATime={toggleOneAtATime}
                            onQuestionSeconds={setQuestionSeconds}
                          />
                        </div>
                      </Part>
                      <Part title="Going back">
                        {oneAtATime ? (
                          <RadioCards label="Going back" value={navigation} options={navigations} onChange={(value) => set({ navigation: value })} />
                        ) : (
                          <p className="rounded-lg bg-surface-muted px-3 py-2 text-xs text-muted">
                            Every question is on one page, so students move freely. Turn on “One question at a time” above to send
                            them forward only or back to marked questions only.
                          </p>
                        )}
                      </Part>
                      <Part
                        title="Questions a student may mark for review"
                        hint={
                          marked === "0"
                            ? "Marking for review is off: students don't see the button."
                            : "At most this many at once. Marked questions are listed first on the review screen before submitting."
                        }
                      >
                        <div className="flex flex-wrap items-center gap-3">
                          <ChipGroup
                            label="Questions a student may mark for review"
                            value={marked}
                            onChange={(value) => set({ marked: value })}
                            options={[
                              { value: "0", label: "None allowed" },
                              { value: "1", label: "1" },
                              { value: "3", label: "3" },
                              { value: "5", label: "5" },
                              { value: "unlimited", label: "Unlimited" },
                              { value: "custom", label: "Custom" },
                            ]}
                          />
                          {marked === "custom" && (
                            <input
                              type="number"
                              min={1}
                              max={500}
                              value={customMarked}
                              onChange={(e) => set({ customMarked: e.target.value })}
                              aria-label="Questions a student may mark for review"
                              className={`${inputClass} w-24`}
                            />
                          )}
                        </div>
                      </Part>
                    </>
                  )}
                  {exam && (
                    <Part title="Exam conditions">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <RuleCard
                          art="computers"
                          icon={<Laptop className="size-4" />}
                          title="Computers only"
                          description="Phones and tablets are refused."
                          checked={computersOnly}
                          onChange={(on) => set({ computersOnly: on })}
                        />
                        <RuleCard
                          art="mobile"
                          icon={<Smartphone className="size-4" />}
                          title="Allow the mobile app"
                          description="Students may take this exam in the Examinus app on a verified phone; computers-only still applies to browsers."
                          checked={allowMobile}
                          onChange={(on) => set({ allowMobile: on })}
                        />
                      </div>
                      <Field
                        label="Device grace period (minutes)"
                        hint="A student who reloads on the same computer within this time after their last check-in continues. Anything else needs your approval in the live view."
                      >
                        <input
                          type="number"
                          min={1}
                          max={60}
                          value={graceMinutes}
                          onChange={(e) => set({ graceMinutes: e.target.value })}
                          className={`${inputClass} w-32`}
                        />
                      </Field>
                      <Field label="Honor pledge" hint="Students must accept this before they can start.">
                        <textarea rows={4} value={pledge} onChange={(e) => set({ pledge: e.target.value })} className={inputClass} />
                      </Field>
                    </Part>
                  )}
                  {mode === "mastery" && <MasteryFields value={draft.mastery} onChange={(value) => set({ mastery: value })} />}
                  {mode === "game" && <GameFields value={draft.game} onChange={(value) => set({ game: value })} pacingLocked={opened} />}
                </RulePanel>

                <RulePanel
                  panel="access"
                  icon={<KeyRound className="size-4" />}
                  title="Joining"
                  summary={accessSummary}
                  description="The join key, a room password, late joiners and guests."
                  open={openPanels.has("access")}
                  onToggle={togglePanel}
                  problems={problemsIn(["access"])}
                >
                  <div className="flex flex-wrap items-center gap-3 rounded-lg bg-surface-muted px-4 py-3 text-sm">
                    <KeyRound className="size-5 shrink-0 text-primary" aria-hidden />
                    <div className="min-w-0 flex-1">
                      {session?.joinCode ? (
                        <p>
                          Join key{" "}
                          <span className="ml-1 font-mono text-base font-semibold tracking-widest" data-testid="session-join-key">
                            {formatJoinKey(session.joinCode)}
                          </span>
                        </p>
                      ) : (
                        <p className="font-medium">A 7-character join key is created when you save.</p>
                      )}
                      <p className="text-xs text-muted">
                        {klass
                          ? "Students of the class enter it at Join with a key. Anyone else is turned away."
                          : allowGuests && guestModes.includes(mode)
                            ? "Anyone with the key can join from the join page, giving only a name; students join as themselves."
                            : "Any student who has joined a class and enters it at Join with a key is added to the session."}
                      </p>
                    </div>
                    {session?.joinCode && (
                      <Button variant="secondary" onClick={copyJoinKey}>
                        {copied ? "Copied" : "Copy"}
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Room password (optional)" hint="Students type it to start. Read it out in class. Empty: no password.">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={password}
                          onChange={(e) => set({ password: e.target.value })}
                          autoComplete="off"
                          aria-label="Room password"
                          className={`${inputClass} font-mono`}
                        />
                        <Button variant="secondary" onClick={() => set({ password: generatePassword() })}>
                          Generate
                        </Button>
                      </div>
                    </Field>
                    <Field label="Late-join cutoff (minutes)" hint="How long after it opens students may still start. Empty: no cutoff.">
                      <input type="number" min={1} value={lateJoin} onChange={(e) => set({ lateJoin: e.target.value })} className={inputClass} />
                    </Field>
                  </div>
                  {klass && (
                    <Switch
                      checked={countInRecord}
                      onChange={(on) => set({ countInRecord: on })}
                      label="Count in the class record"
                      description="The scores are linked to the class record and grade sheet."
                    />
                  )}
                </RulePanel>

                <RulePanel
                  panel="results"
                  icon={<Clock className="size-4" />}
                  title="Showing results"
                  summary={`Scores shown: ${releaseLabel}`}
                  description="When students see their score and the answer key."
                  open={openPanels.has("results")}
                  onToggle={togglePanel}
                  problems={problemsIn(["results"])}
                >
                  <ChipGroup label="Show results to students" value={release} onChange={(value) => set({ release: value })} options={releases} />
                </RulePanel>

            </div>
          </div>

          <div
            role="tabpanel"
            id="session-panel-security"
            aria-labelledby="session-tab-security"
            hidden={tab !== "security"}
            className="space-y-5"
          >
            <div id={areaAnchor("security")} className="scroll-mt-4">
              <p className="text-sm text-muted">
                {started ? "Students are already taking it with these rules, so they stay as they are." : "Turn on the rules you want. Click a card to switch it on or off."}
              </p>
            </div>
            <ProblemList problems={problemsIn(["security"])} />
            <fieldset disabled={started} className={clsx("space-y-5", started && "opacity-60")}>
                  {exam && (
                    <p className="rounded-lg bg-surface-muted px-3 py-2 text-xs text-muted">
                      Cards with a lock are required for exams. You can only add stricter rules.
                    </p>
                  )}
                  <Group title="Focus and screen">
                    {(["requireFullscreen", "trackFocus", "blockSecondScreen"] as const).map((key) => (
                      <LockedRule key={key} id={key} exam={exam} integrity={integrity} onChange={setIntegrityField} />
                    ))}
                    <RuleCard
                      art="autoSubmit"
                      icon={<LogOut className="size-4" />}
                      title="Submit after leaving"
                      description="Students may leave (switch away or exit full screen) and come back a few times. One more and it submits itself."
                      checked={integrity.autoSubmitAfter !== null}
                      onChange={(on) => setIntegrityField({ autoSubmitAfter: on ? examDefaults.autoSubmitAfter : null })}
                    >
                      <Field label="Chances to come back" hint="Leaving once more submits it.">
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={integrity.autoSubmitAfter ?? ""}
                          onChange={(e) =>
                            setIntegrityField({ autoSubmitAfter: e.target.value ? Math.max(1, Math.floor(Number(e.target.value))) : null })
                          }
                          className={`${inputClass} w-24`}
                        />
                      </Field>
                    </RuleCard>
                  </Group>

                  <Group title="Copying and printing">
                    {(["blockRightClick", "blockCopy"] as const).map((key) => (
                      <LockedRule key={key} id={key} exam={exam} integrity={integrity} onChange={setIntegrityField} />
                    ))}
                    <LockedRule id="blockPaste" exam={exam} integrity={integrity} onChange={setIntegrityField} />
                    <RuleCard
                      art="pasteCode"
                      icon={<SquareCode className="size-4" />}
                      title="Allow paste in code answers"
                      description="Pasting stays blocked everywhere else. Every paste in the code editor is recorded."
                      checked={integrity.blockPaste && integrity.allowPasteInCode}
                      disabled={!integrity.blockPaste && !exam}
                      disabledHint="Needs “Block paste” on."
                      onChange={(on) => setIntegrityField({ allowPasteInCode: on })}
                    />
                    {(["blockPrint", "clearClipboardOnStart", "watermark"] as const).map((key) => (
                      <LockedRule key={key} id={key} exam={exam} integrity={integrity} onChange={setIntegrityField} />
                    ))}
                  </Group>

                  <Group title="Test conditions">
                    <AllowedApps
                      value={integrity.allowedClients}
                      onChange={(kinds) => setDraft((prev) => changeAllowedClients(prev, kinds))}
                    />
                    {/* Quizzes and exams set the question pacing with their navigation, in their own settings. */}
                    {!navigates && (
                      <PacingCards
                        oneAtATime={oneAtATime}
                        questionSeconds={questionSeconds}
                        onOneAtATime={toggleOneAtATime}
                        onQuestionSeconds={setQuestionSeconds}
                      />
                    )}
                    <RuleCard
                      art="network"
                      icon={<Globe className="size-4" />}
                      title="Allowed networks"
                      description="Students can only start from the school's network addresses you list."
                      checked={limitNetworks}
                      onChange={(on) => set({ limitNetworks: on })}
                    >
                      <Field label="Addresses" hint="One address or range per line, e.g. 10.0.4.0/24.">
                        <textarea
                          rows={3}
                          value={allowlist}
                          onChange={(e) => set({ allowlist: e.target.value })}
                          className={`${inputClass} font-mono`}
                        />
                      </Field>
                    </RuleCard>
                    <RuleCard
                      art="computers"
                      icon={<Laptop className="size-4" />}
                      title="Password to exit the desktop app"
                      description="In Examinus Desktop the app won't close during an attempt until this password is typed. Browsers aren't affected."
                      checked={lockExit}
                      onChange={(on) => setDraft((prev) => changeLockExit(prev, on))}
                    >
                      <Field label="Exit password" hint="Keep it to yourself; type it on the student's computer when they may leave.">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={exitPassword}
                            onChange={(e) => set({ exitPassword: e.target.value })}
                            autoComplete="off"
                            aria-label="Exit password"
                            className={`${inputClass} font-mono`}
                          />
                          <Button variant="secondary" onClick={() => set({ exitPassword: generatePassword() })}>
                            Generate
                          </Button>
                        </div>
                      </Field>
                    </RuleCard>
                  </Group>
            </fieldset>
          </div>
          </div>
        </div>

        <aside aria-label="What students will see" className="hidden w-80 shrink-0 overflow-y-auto border-l border-border bg-surface-muted/40 p-5 lg:block xl:w-96">
          <SessionPreview
            mode={mode}
            modeLabel={modeLabel}
            who={whoLabel}
            opens={opened ? "Already open" : startWhen === "now" ? "Right away" : startWhen === "schedule" ? opens.replace("T", " ") || "Pick a time" : "When you press Start"}
            closes={closes ? closes.replace("T", " ") : "When you close it"}
            timeLimit={timeLimit ? `${timeLimit} min` : "No time limit"}
            attempts={attemptsLabel}
            scores={releaseLabel}
            password={password.trim() !== ""}
            joinKey={session?.joinCode ? formatJoinKey(session.joinCode) : null}
            rules={examLockedSettings.filter(([key]) => exam || integrity[key]).map(([, label]) => label)}
            guests={!klass && guestModes.includes(mode) && allowGuests}
          />
        </aside>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border bg-surface px-5 py-3 sm:justify-between">
        {problems.length > 0 ? (
          <p role="alert" className="min-w-0 flex-1 text-sm font-semibold text-danger">
            {problems.length === 1 ? "1 thing to fix" : `${problems.length} things to fix`}, marked in red on the tabs.
          </p>
        ) : (
          <p className="hidden min-w-0 flex-1 text-sm text-muted sm:block lg:invisible" aria-live="polite">
            {[modeLabel, whoLabel, opensLabel, attemptsLabel].join(" · ")}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={onDone} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {session ? (
              <Check className="size-4" aria-hidden />
            ) : startWhen === "schedule" ? (
              <CalendarClock className="size-4" aria-hidden />
            ) : (
              <Play className="size-4" aria-hidden />
            )}
            {saving ? "Saving…" : primaryLabel}
            {!saving && !session && <ArrowRight className="size-4" aria-hidden />}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ProblemList({ problems }: { problems: readonly Problem[] }) {
  if (problems.length === 0) return null;
  return (
    <ul role="alert" className="animate-shake space-y-1 rounded-lg bg-danger-soft p-3 text-sm font-semibold text-danger">
      {problems.map((p) => (
        <li key={p.text}>{p.text}</li>
      ))}
    </ul>
  );
}

// One folded part of the Rules section: a one-line summary of what is set, opened only to change it.
function RulePanel({
  panel,
  icon,
  title,
  summary,
  description,
  open,
  onToggle,
  problems,
  locked,
  children,
}: {
  panel: Panel;
  icon: ReactNode;
  title: string;
  summary: string;
  description: string;
  open: boolean;
  onToggle: (panel: Panel) => void;
  problems: readonly Problem[];
  locked?: string;
  children: ReactNode;
}) {
  const bodyId = `${areaAnchor(panel)}-body`;
  return (
    <div
      id={areaAnchor(panel)}
      className={clsx(
        "scroll-mt-4 rounded-xl border bg-surface transition-shadow",
        problems.length > 0 ? "border-danger" : "border-border",
        open && "shadow-sm",
      )}
    >
      <h4>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => onToggle(panel)}
          className="flex min-h-14 w-full items-center gap-3 rounded-xl px-4 py-3 text-left hover:bg-surface-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary" aria-hidden>
            {icon}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold">{title}</span>
            <span className="block truncate text-xs text-muted">{summary}</span>
          </span>
          {problems.length > 0 && (
            <span className="rounded-full bg-danger-soft px-2 py-0.5 text-xs font-bold text-danger tabular-nums">
              {problems.length}
              <span className="sr-only"> to fix</span>
            </span>
          )}
          <span className="hidden text-xs font-semibold text-primary sm:inline">{open ? "Done" : "Change"}</span>
          <ChevronDown className={clsx("size-4 shrink-0 text-muted transition-transform duration-200", open && "rotate-180")} aria-hidden />
        </button>
      </h4>
      {open && (
        <div id={bodyId} className="space-y-5 border-t border-border px-4 py-4">
          <p className="text-xs text-muted">{locked ?? description}</p>
          <ProblemList problems={problems} />
          {locked ? (
            <fieldset disabled className="space-y-5 opacity-60">
              {children}
            </fieldset>
          ) : (
            children
          )}
        </div>
      )}
    </div>
  );
}

// A labelled part of a step.
function Part({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">{title}</h4>
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

// One question at a time, and a clock per question on top of it.
function PacingCards({
  oneAtATime,
  questionSeconds,
  onOneAtATime,
  onQuestionSeconds,
}: {
  oneAtATime: boolean;
  questionSeconds: string;
  onOneAtATime: (on: boolean) => void;
  onQuestionSeconds: (value: string) => void;
}) {
  return (
    <>
      <RuleCard
        art="oneAtATime"
        icon={<ListOrdered className="size-4" />}
        title="One question at a time"
        description="Students see one question at a time."
        checked={oneAtATime}
        onChange={onOneAtATime}
      />
      <RuleCard
        art="questionTime"
        icon={<Timer className="size-4" />}
        title="Time per question"
        description="Each question closes after a set time, then the next one opens."
        checked={oneAtATime && questionSeconds !== ""}
        disabled={!oneAtATime}
        disabledHint="Needs “One question at a time” on."
        onChange={(on) => onQuestionSeconds(on ? "30" : "")}
      >
        <Field label="Seconds per question" hint="At least 5.">
          <input
            type="number"
            min={5}
            value={questionSeconds}
            onChange={(e) => onQuestionSeconds(e.target.value)}
            className={`${inputClass} w-24`}
          />
        </Field>
      </RuleCard>
    </>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h4>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}

// Where students may take it: one checkbox per client. All on (the default) is stored as no list at all.
function AllowedApps({ value, onChange }: { value: readonly ClientKind[] | undefined; onChange: (kinds: ClientKind[]) => void }) {
  const allowed = value ?? [...clientKinds];
  return (
    <fieldset className="rounded-xl border border-border bg-surface p-4">
      <legend className="flex items-center gap-2 px-1 text-sm font-medium">
        <AppWindow className="size-4 text-muted" aria-hidden /> Where it can be taken
      </legend>
      <p className="mb-2 text-xs text-muted">Untick one to keep students out of it: a desktop-only exam can&apos;t be opened in a browser.</p>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {clientKinds.map((kind) => (
          <label key={kind} className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={allowed.includes(kind)}
              onChange={(e) => onChange(clientKinds.filter((k) => (k === kind ? e.target.checked : allowed.includes(k))))}
              className="size-4 rounded border-border accent-primary"
            />
            {clientKindLabel[kind]}
          </label>
        ))}
      </div>
      {allowed.length === 0 && (
        <p role="alert" className="mt-2 text-xs text-danger">
          Allow at least one.
        </p>
      )}
    </fieldset>
  );
}

// A card for one of the rules an exam requires.
function LockedRule({
  id,
  exam,
  integrity,
  onChange,
}: {
  id: keyof typeof lockedCards;
  exam: boolean;
  integrity: IntegritySettings;
  onChange: (patch: Partial<IntegritySettings>) => void;
}) {
  const card = lockedCards[id];
  return (
    <RuleCard
      art={card.art}
      icon={card.icon}
      title={lockedLabel[id]}
      description={card.description}
      locked={exam}
      checked={exam || integrity[id]}
      onChange={(on) => onChange(id === "blockPaste" ? { blockPaste: on, ...(on ? {} : { allowPasteInCode: false }) } : { [id]: on })}
    />
  );
}

// The side panel: the session as a student will meet it, updated as the form changes.
function SessionPreview({
  mode,
  modeLabel,
  who,
  opens,
  closes,
  timeLimit,
  attempts,
  scores,
  password,
  joinKey,
  rules,
  guests,
}: {
  mode: SessionMode;
  modeLabel: string;
  who: string;
  opens: string;
  closes: string;
  timeLimit: string;
  attempts: string;
  scores: string;
  password: boolean;
  joinKey: string | null;
  rules: readonly string[];
  guests: boolean;
}) {
  return (
    <div className="space-y-3" aria-live="polite">
      <p className="text-xs font-semibold tracking-wide text-muted uppercase">What students will see</p>
      <div className="space-y-4 rounded-xl border border-border bg-surface p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <ModeTile mode={mode} />
          <div className="min-w-0">
            <p className="font-bold">{modeLabel}</p>
            <p className="truncate text-xs text-muted">{who}</p>
          </div>
        </div>
        <div className="rounded-lg bg-surface-muted/70 px-3 py-2 text-center shadow-well">
          <p className="text-xs text-muted">Join key</p>
          {joinKey ? (
            <p className="font-mono text-lg font-bold tracking-widest">{joinKey}</p>
          ) : (
            <p className="text-sm font-semibold">Made when you save</p>
          )}
          {password && <p className="mt-1 text-xs font-semibold text-warning">They also need the room password</p>}
          {guests && <p className="mt-1 text-xs text-muted">Guests can join with just a name</p>}
        </div>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          {[
            ["Opens", opens],
            ["Closes", closes],
            ["Time limit", timeLimit],
            ["Attempts", attempts],
            ["Scores shown", scores],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="font-semibold break-words">{value}</dd>
            </div>
          ))}
        </dl>
        <div>
          <p className="text-xs font-semibold text-muted">While they take it</p>
          {rules.length === 0 ? (
            <p className="mt-1 text-sm text-muted">No anti-cheating rules.</p>
          ) : (
            <ul className="mt-1.5 space-y-1 text-sm">
              {rules.map((rule) => (
                <li key={rule} className="flex items-start gap-1.5">
                  <Check className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />
                  {rule}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// One group of the "Who & when" section: an icon tile, a heading and its fields.
function WhenBlock({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 border-t border-border pt-5 first:border-t-0 first:pt-0">
      <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0 flex-1 space-y-3">
        <h4 className="text-sm font-bold">{title}</h4>
        {children}
      </div>
    </div>
  );
}

// An input with a small icon inside its left edge (give the input `pl-10`).
function IconInput({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" aria-hidden>
        {icon}
      </span>
      {children}
    </div>
  );
}

// A one-click value for the field above it.
function QuickChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={clsx(
        "min-h-8 rounded-full border px-3 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        on ? "border-primary bg-primary text-primary-foreground shadow-depth" : "border-border bg-surface text-muted hover:bg-surface-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

// Whether people without an account may join: its own card under the class, so it isn't mistaken for a detail of
// joining. Only sessions without a class can let guests in, and only the types guests may take (not mastery, which
// tracks each student's progress).
function GuestCard({
  mode,
  modeLabel,
  hasClass,
  on,
  onChange,
  hasPassword,
}: {
  mode: SessionMode;
  modeLabel: string;
  hasClass: boolean;
  on: boolean;
  onChange: (on: boolean) => void;
  hasPassword: boolean;
}) {
  const allowed = !hasClass && guestModes.includes(mode);
  const active = allowed && on;
  return (
    <div
      className={clsx(
        "rounded-xl border-2 p-4 transition-colors",
        active ? "border-info bg-info-soft/60" : allowed ? "border-dashed border-border bg-surface" : "border-dashed border-border bg-surface-muted/40",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={clsx("grid size-10 shrink-0 place-items-center rounded-xl", active ? "bg-info text-white shadow-depth dark:text-background" : "bg-info-soft text-info")}
          aria-hidden
        >
          <UserRoundPlus className="size-5" />
        </span>
        <Switch
          className="min-w-0 flex-1"
          checked={active}
          disabled={!allowed}
          onChange={onChange}
          label={
            <span className="flex flex-wrap items-center gap-2 font-bold">
              Let guests join
              {active && <span className="rounded-full bg-info px-2 py-0.5 text-xs font-bold text-white dark:text-background">On</span>}
            </span>
          }
          description={
            hasClass
              ? "Class sessions are only for the class's students. Choose “No class” to let guests in."
              : !allowed
                ? `${modeLabel} sessions need an account, to keep each student's progress.`
                : "People without an Examinus account, like visitors or another school's students."
          }
        />
      </div>
      {active && (
        <ul className="mt-3 space-y-1.5 border-t border-info/20 pt-3 text-sm">
          <li className="flex items-start gap-2">
            <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
            {mode === "game"
              ? "They join with just a name, from the join page with the key or the invite link shown in the lobby."
              : "They join with just a name, from the join page with the key."}
          </li>
          <li className="flex items-start gap-2">
            <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
            Students with an account still join as themselves. Guests&apos; scores stay in this session only.
          </li>
          {mode === "exam" && !hasPassword && (
            <li className="flex items-start gap-2 font-semibold text-warning">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              Anyone with the key can sit this exam under any name. Consider a room password (Rules → Joining).
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

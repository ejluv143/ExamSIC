"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import {
  AppWindow,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  CalendarClock,
  Check,
  ClipboardCheck,
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
  SquareCode,
  Target,
  Timer,
  Users,
  Zap,
} from "lucide-react";
import { Button, Field, Switch, inputClass } from "@/components/ui";
import { Select } from "@/components/select";
import { GameFields, gameDraft, gameFromDraft } from "@/features/game/components/game-fields";
import { MasteryFields, masteryDraft, masteryFromDraft } from "@/features/mastery/components/mastery-fields";
import { defaultHonorPledge, examDefaults, examLockedSettings } from "@examinus/domain/exam";
import { defaultIntegrity } from "@examinus/domain/integrity";
import { formatJoinKey } from "@examinus/domain/join-key";
import {
  type IntegritySettings,
  type ResultsRelease,
  type Session,
  type SessionMode,
  type SessionNavigation,
} from "@examinus/domain/quiz";
import { defaultMaxMarked, defaultNavigation } from "@examinus/domain/review";
import type { Class } from "@/features/classes/types";
import { createSessionAction, updateSessionAction } from "../actions";
import { RuleCard, type Art } from "./anti-cheat";
import { ChipGroup, RadioCards, Section, type CardOption } from "./session-form-parts";

// <input type="datetime-local"> works in local wall time; all schedules are Manila time (UTC+8, no DST).
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const manila = new Date(new Date(iso).getTime() + 8 * 3600_000);
  return manila.toISOString().slice(0, 16);
}
function fromLocalInput(value: string): string | null {
  return value ? `${value}:00+08:00` : null;
}

type AttemptsChip = "1" | "2" | "3" | "unlimited" | "custom";
type MarkedChip = "0" | "1" | "3" | "5" | "unlimited" | "custom";
type StartWhen = "now" | "schedule" | "manual";

function chipOfAttempts(n: number | null): AttemptsChip {
  return n === null ? "unlimited" : n === 1 || n === 2 || n === 3 ? (String(n) as AttemptsChip) : "custom";
}

function chipOfMarked(n: number | null): MarkedChip {
  return n === null ? "unlimited" : n === 0 || n === 1 || n === 3 || n === 5 ? (String(n) as MarkedChip) : "custom";
}

// What a new session starts with for each mode; the teacher can change everything except an exam's locked settings.
function presets(mode: SessionMode) {
  const exam = mode === "exam";
  return {
    timeLimit: exam ? "60" : "",
    attempts: chipOfAttempts(1),
    resultsRelease: (exam ? examDefaults.resultsRelease : "immediately") as ResultsRelease,
    integrity: defaultIntegrity(mode),
    lateJoin: exam ? String(examDefaults.lateJoinMinutes) : "",
    password: exam ? generatePassword() : "",
  };
}

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

// The types side by side by what they are for: graded papers, or practice and play.
const modeGroups: readonly { title: string; description: string; modes: readonly SessionMode[] }[] = [
  { title: "Graded", description: "Students take it once (or a few times) for a score.", modes: ["quiz", "exam"] },
  { title: "Practice and play", description: "Learning by repetition, or a live game for the class.", modes: ["mastery", "game"] },
];

const modeRulesDescription: Record<SessionMode, string> = {
  quiz: "How students move through the questions and mark them for review.",
  exam: "How students move through the questions, and the conditions only exams have.",
  mastery: "How practice repeats until students get it right.",
  game: "How the game is played: pacing, points and teams.",
};

type StepId = "type" | "who" | "when" | "rules" | "security" | "review";
type Step = { id: StepId; title: string; icon: ReactNode };
type Problem = { step: StepId; text: string };

// The form's steps. The type's own settings are grouped into one step named after it.
function stepsFor(mode: SessionMode): Step[] {
  const label = { quiz: "Quiz", exam: "Exam", mastery: "Mastery", game: "Game" }[mode];
  return [
    { id: "type", title: "Type", icon: <ListChecks className="size-5" /> },
    { id: "who", title: "Who", icon: <Users className="size-5" /> },
    { id: "when", title: "When & attempts", icon: <CalendarClock className="size-5" /> },
    { id: "rules", title: `${label} settings`, icon: <ShieldAlert className="size-5" /> },
    { id: "security", title: "Anti-cheating", icon: <ShieldCheck className="size-5" /> },
    { id: "review", title: "Review", icon: <ClipboardCheck className="size-5" /> },
  ];
}

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
  ipAllowlist?: readonly string[];
  relayPassword?: string | null;
  relayClues?: readonly string[];
  defaultClassId?: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const initialMode: SessionMode = session?.mode ?? "quiz";
  // No class unless one was asked for: anyone with the key may join.
  const initialClass = session ? (session.classId ?? "") : (defaultClassId ?? "");
  const [classId, setClassId] = useState(initialClass);
  const [mode, setMode] = useState<SessionMode>(initialMode);
  const preset = presets(initialMode);
  // An opened session keeps the time it opened; a scheduled one can still change it.
  const opened = session !== undefined && session.status !== "scheduled";
  const [startWhen, setStartWhen] = useState<StartWhen>(session ? (session.opensAt ? "schedule" : "manual") : "now");
  const [opens, setOpens] = useState(toLocalInput(session?.opensAt ?? null));
  const [closes, setCloses] = useState(toLocalInput(session?.closesAt ?? null));
  const [timeLimit, setTimeLimit] = useState(
    session ? (session.timeLimitMinutes === null ? "" : String(session.timeLimitMinutes)) : preset.timeLimit,
  );
  const [attempts, setAttempts] = useState<AttemptsChip>(session ? chipOfAttempts(session.attemptsAllowed) : preset.attempts);
  const [customAttempts, setCustomAttempts] = useState(
    session && chipOfAttempts(session.attemptsAllowed) === "custom" ? String(session.attemptsAllowed) : "4",
  );
  const [release, setRelease] = useState<ResultsRelease>(session?.resultsRelease ?? preset.resultsRelease);
  const [integrity, setIntegrity] = useState<IntegritySettings>(session?.integrity ?? preset.integrity);
  const [oneAtATime, setOneAtATime] = useState(session?.oneQuestionAtATime ?? false);
  // Kept while one question at a time is off (a paper on one page is always free), so turning it on restores it.
  const [navigation, setNavigation] = useState<SessionNavigation>(
    session ? (session.oneQuestionAtATime ? session.navigation : defaultNavigation(session.mode)) : defaultNavigation(initialMode),
  );
  const [marked, setMarked] = useState<MarkedChip>(chipOfMarked(session ? session.maxMarked : defaultMaxMarked(initialMode)));
  const [customMarked, setCustomMarked] = useState(
    session && chipOfMarked(session.maxMarked) === "custom" ? String(session.maxMarked) : "10",
  );
  const [questionSeconds, setQuestionSeconds] = useState(
    session?.questionTimeLimitSeconds ? String(session.questionTimeLimitSeconds) : "",
  );
  const [lateJoin, setLateJoin] = useState(session ? (session.lateJoinMinutes === null ? "" : String(session.lateJoinMinutes)) : preset.lateJoin);
  const [password, setPassword] = useState(session ? (savedPassword ?? "") : preset.password);
  const [computersOnly, setComputersOnly] = useState(session?.exam?.computersOnly ?? examDefaults.computersOnly);
  const [pledge, setPledge] = useState(session?.exam?.honorPledge ?? defaultHonorPledge);
  const [graceMinutes, setGraceMinutes] = useState(String(session?.exam?.deviceGraceMinutes ?? examDefaults.deviceGraceMinutes));
  const [allowlist, setAllowlist] = useState((savedAllowlist ?? []).join("\n"));
  const [limitNetworks, setLimitNetworks] = useState((savedAllowlist ?? []).length > 0);
  const [copied, setCopied] = useState(false);
  const [masteryRules, setMasteryRules] = useState(masteryDraft(session?.mastery));
  const [gameRules, setGameRules] = useState(
    gameDraft(session?.game, session?.pacing, { relayPassword: savedRelayPassword ?? null, relayClues: savedRelayClues ?? [] }),
  );
  const [countInRecord, setCountInRecord] = useState(session?.countInRecord ?? true);
  const [allowGuests, setAllowGuests] = useState(session?.allowGuests ?? false);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [step, setStep] = useState<StepId>("type");
  const [saving, setSaving] = useState(false);

  const exam = mode === "exam";
  const klass = classes.find((c) => c.id === classId);
  const setIntegrityField = (patch: Partial<IntegritySettings>) => setIntegrity((prev) => ({ ...prev, ...patch }));

  // Picking a mode on a new session also applies that mode's usual settings.
  function changeMode(next: SessionMode) {
    setMode(next);
    if (session) return;
    const p = presets(next);
    setTimeLimit(p.timeLimit);
    setAttempts(p.attempts);
    setRelease(p.resultsRelease);
    setIntegrity(p.integrity);
    setLateJoin(p.lateJoin);
    setPassword(p.password);
    setNavigation(defaultNavigation(next));
    setMarked(chipOfMarked(defaultMaxMarked(next)));
  }

  function changeOneAtATime(on: boolean) {
    setOneAtATime(on);
    if (!on) setQuestionSeconds("");
  }

  async function copyJoinKey() {
    if (!session?.joinCode) return;
    await navigator.clipboard.writeText(session.joinCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const attemptsAllowed = attempts === "unlimited" ? null : attempts === "custom" ? Number(customAttempts) : Number(attempts);
  const maxMarked = marked === "unlimited" ? null : marked === "custom" ? Number(customMarked) : Number(marked);
  // Only papers with questions to go between have navigation and marks: not games, not mastery's retry queue.
  const hasNavigation = mode === "quiz" || mode === "exam";
  const steps = stepsFor(mode);
  const stepIndex = steps.findIndex((s) => s.id === step);
  // Quizzes and exams set one question at a time with their navigation; the other types keep it with anti-cheating.
  const pacingStep: StepId = hasNavigation ? "rules" : "security";

  // Everything wrong with the form, each with the step that fixes it, and the values the checks worked out.
  function check() {
    const found: Problem[] = [];
    const add = (step: StepId, text: string) => found.push({ step, text });
    const opensAt = opened ? session.opensAt : startWhen === "schedule" ? fromLocalInput(opens) : null;
    const closesAt = fromLocalInput(closes);
    if (!opened && startWhen === "schedule" && !opensAt) add("when", "Set an open time, or choose to start now.");
    if (exam && !closesAt) add("when", "Exams need a close time.");
    if (opensAt && closesAt && closesAt <= opensAt) add("when", "Close time must be after open time.");
    if (attempts === "custom" && (!Number.isInteger(attemptsAllowed) || (attemptsAllowed ?? 0) < 1))
      add("when", "Attempts must be a whole number, 1 or more.");
    const late = lateJoin ? Number(lateJoin) : null;
    if (late !== null && (!Number.isInteger(late) || late < 0)) add("when", "Late-join cutoff must be a number of minutes, 0 or more.");
    if (hasNavigation && marked === "custom" && (!Number.isInteger(maxMarked) || (maxMarked ?? 0) < 1 || (maxMarked ?? 0) > 500))
      add("rules", "The number of questions students may mark for review must be a whole number from 1 to 500.");
    const seconds = questionSeconds ? Number(questionSeconds) : null;
    if (oneAtATime && seconds !== null && (!Number.isInteger(seconds) || seconds < 5))
      add(pacingStep, "Time per question must be a whole number of at least 5 seconds.");
    const grace = Number(graceMinutes);
    if (exam && (!Number.isInteger(grace) || grace < 1 || grace > 60)) add("rules", "The device grace period must be 1 to 60 minutes.");
    if (exam && pledge.trim() === "") add("rules", "Write the honor pledge students accept.");
    const masteryResult = mode === "mastery" ? masteryFromDraft(masteryRules) : null;
    if (masteryResult && "problems" in masteryResult) masteryResult.problems.forEach((text) => add("rules", text));
    const gameResult = mode === "game" ? gameFromDraft(gameRules) : null;
    if (gameResult && "problems" in gameResult) gameResult.problems.forEach((text) => add("rules", text));
    const addresses = limitNetworks
      ? allowlist
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
      : [];
    const badAddress = addresses.find((a) => !/^[0-9a-fA-F.:]+(\/\d{1,3})?$/.test(a));
    if (badAddress) add("security", `"${badAddress}" is not an IP address or range such as 10.0.4.0/24.`);
    return { found, opensAt, closesAt, late, seconds, grace, masteryResult, gameResult, addresses };
  }

  function goTo(next: StepId) {
    setProblems([]);
    setStep(next);
  }

  // Next checks only the step on screen; the rest is checked when saving.
  function next() {
    const here = check().found.filter((p) => p.step === step);
    if (here.length > 0) return setProblems(here);
    goTo(steps[stepIndex + 1]!.id);
  }

  async function save() {
    const { found, opensAt, closesAt, late, seconds, grace, masteryResult, gameResult, addresses } = check();
    if (found.length > 0) {
      // Back to the first step with a problem, showing what is wrong there.
      const first = steps.find((s) => found.some((p) => p.step === s.id))!.id;
      setStep(first);
      return setProblems(found.filter((p) => p.step === first));
    }
    setProblems([]);

    const sessionMode: SessionMode = mode;
    const input = {
      classId: classId || null,
      mode: sessionMode,
      exam: exam ? { computersOnly, honorPledge: pledge.trim(), deviceGraceMinutes: grace } : null,
      opensAt,
      closesAt,
      timeLimitMinutes: timeLimit ? Math.max(1, Math.floor(Number(timeLimit))) : null,
      attemptsAllowed,
      resultsRelease: release,
      mastery: masteryResult && "settings" in masteryResult ? masteryResult.settings : null,
      game: gameResult && "settings" in gameResult ? gameResult.settings : null,
      pacing: mode === "game" ? gameRules.pacing : ("student" as const),
      relayPassword: gameResult && "settings" in gameResult ? gameResult.relayPassword : null,
      relayClues: gameResult && "settings" in gameResult ? gameResult.relayClues : [],
      integrity: exam
        ? { ...integrity, ...Object.fromEntries(examLockedSettings.map(([key]) => [key, true])) }
        : integrity.blockPaste
          ? integrity
          : { ...integrity, allowPasteInCode: false },
      oneQuestionAtATime: oneAtATime,
      questionTimeLimitSeconds: oneAtATime ? seconds : null,
      navigation: hasNavigation && oneAtATime ? navigation : ("free" as const),
      maxMarked: hasNavigation ? maxMarked : 0,
      lateJoinMinutes: late,
      roomPassword: password.trim() || null,
      ipAllowlist: addresses,
      // Guests only make sense for a game anyone with the key may join.
      allowGuests: sessionMode === "game" && !classId ? allowGuests : false,
      // The class record only links sessions of a class.
      countInRecord: classId ? countInRecord : false,
    };
    setSaving(true);
    if (session) {
      const result = await updateSessionAction(session.id, input);
      setSaving(false);
      if ("error" in result) return setProblems([{ step, text: result.error }]);
      router.refresh();
      return onDone();
    }
    const startNow = startWhen === "now";
    const result = await createSessionAction(quizId, { ...input, startNow });
    if ("error" in result) {
      setSaving(false);
      return setProblems([{ step, text: result.error }]);
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
      ? mode === "game"
        ? "Opens the lobby now"
        : "Starts now"
      : startWhen === "schedule"
        ? opens
          ? `Opens ${opens.replace("T", " ")}`
          : "Pick an open time"
        : "You press Start";
  const summary = [modeLabel, whoLabel, opensLabel, attemptsLabel].join(" · ");
  const last = stepIndex === steps.length - 1;
  const current = steps[stepIndex]!;
  const rulesOn = examLockedSettings.filter(([key]) => exam || integrity[key]).length;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">A session is one run of this quiz, with its own key, schedule and rules.</p>

      <Stepper steps={steps} current={step} onPick={goTo} />

      {step === "type" && (
        <Section
          number={stepIndex + 1}
          icon={current.icon}
          title="Type"
          description="What kind of session this is. It decides the settings in the next steps."
          locked={opened ? "The type can't change once the session is open." : undefined}
        >
          {modeGroups.map((group) => (
            <div key={group.title} className="space-y-2">
              <div>
                <h4 className="text-sm font-semibold">{group.title}</h4>
                <p className="text-xs text-muted">{group.description}</p>
              </div>
              <RadioCards
                label={group.title}
                value={mode}
                options={modes.filter((m) => group.modes.includes(m.value))}
                onChange={changeMode}
              />
            </div>
          ))}
        </Section>
      )}

      {step === "who" && (
        <Section
          number={stepIndex + 1}
          icon={current.icon}
          title="Who"
          description="A class limits the session to its students. Without one, any student who has joined a class can join with the key."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Class (optional)" hint={opened ? "The class was set when the session opened." : undefined}>
              <Select
                value={classId}
                disabled={opened}
                onChange={setClassId}
                className="w-full"
                options={[
                  { value: "", label: "No class: anyone with the key" },
                  ...classes.map((c) => ({ value: c.id, label: `${c.courseCode} · ${c.section}`, description: c.title })),
                ]}
              />
            </Field>
            <Field label="Room password (optional)" hint="Students type it to start. Read it out in class. Empty: no password.">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="off"
                  aria-label="Room password"
                  className={`${inputClass} font-mono`}
                />
                <Button variant="secondary" onClick={() => setPassword(generatePassword())}>
                  Generate
                </Button>
              </div>
            </Field>
          </div>

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
                  : allowGuests && mode === "game"
                    ? "Anyone with the key can play from the join page, giving only a name; students join as themselves."
                    : "Any student who has joined a class and enters it at Join with a key is added to the session."}
              </p>
            </div>
            {session?.joinCode && (
              <Button variant="secondary" onClick={copyJoinKey}>
                {copied ? "Copied" : "Copy"}
              </Button>
            )}
          </div>

          {klass && (
            <p className="text-sm">
              <span className="font-medium">Students:</span> everyone in the class ({klass.studentIds.length} now; students who
              join the class later are added).
            </p>
          )}

          {klass && (
            <Switch
              checked={countInRecord}
              onChange={setCountInRecord}
              label="Count in the class record"
              description="The scores are linked to the class record and grade sheet."
            />
          )}

          {!klass && mode === "game" && (
            <Switch
              checked={allowGuests}
              onChange={setAllowGuests}
              label="Allow guests"
              description="People without an account play with just a name, from the join page or the invite link shown in the lobby."
            />
          )}
        </Section>
      )}

      {step === "when" && (
        <Section
          number={stepIndex + 1}
          icon={current.icon}
          title="When & attempts"
          description="When students can start, the limits on time, how many tries they get, and when they see their score."
        >
          <Part title="Opening">
            {opened ? (
              <p className="text-sm text-muted">This session is already open, so its opening time can no longer change.</p>
            ) : (
              <ChipGroup
                label="When it opens"
                value={startWhen}
                onChange={setStartWhen}
                options={[
                  { value: "now", label: "Start now", icon: <Play className="size-3.5" aria-hidden /> },
                  { value: "schedule", label: "Schedule for later", icon: <CalendarClock className="size-3.5" aria-hidden /> },
                  ...(session && !session.opensAt
                    ? [{ value: "manual" as const, label: "I'll press Start", icon: <Hand className="size-3.5" aria-hidden /> }]
                    : []),
                ]}
              />
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              {!opened && startWhen === "schedule" && (
                <Field label="Opens at">
                  <input type="datetime-local" value={opens} onChange={(e) => setOpens(e.target.value)} className={inputClass} />
                </Field>
              )}
              <Field label={exam ? "Closes at" : "Closes at (optional)"} hint={exam ? "Exams need a close time." : "Empty: you close it yourself."}>
                <input type="datetime-local" value={closes} onChange={(e) => setCloses(e.target.value)} className={inputClass} />
              </Field>
            </div>
          </Part>

          <Part title="Time">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Time limit (minutes)" hint="Empty: no limit.">
                <input type="number" min={1} value={timeLimit} onChange={(e) => setTimeLimit(e.target.value)} className={inputClass} />
              </Field>
              <Field label="Late-join cutoff (minutes)" hint="How long after it opens students may still start. Empty: no cutoff.">
                <input type="number" min={0} value={lateJoin} onChange={(e) => setLateJoin(e.target.value)} className={inputClass} />
              </Field>
            </div>
          </Part>

          <Part title="Attempts allowed" hint="How many times a student may take it. 1 means no retakes.">
            <div className="flex flex-wrap items-center gap-3">
              <ChipGroup
                label="Attempts allowed"
                value={attempts}
                onChange={setAttempts}
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
                  onChange={(e) => setCustomAttempts(e.target.value)}
                  aria-label="Number of attempts"
                  className={`${inputClass} w-24`}
                />
              )}
            </div>
          </Part>

          <Part title="Show results to students">
            <ChipGroup label="Show results to students" value={release} onChange={setRelease} options={releases} />
          </Part>
        </Section>
      )}

      {step === "rules" && (
        <Section
          number={stepIndex + 1}
          icon={current.icon}
          title={current.title}
          description={modeRulesDescription[mode]}
          locked={opened && mode !== "game" ? "Students are already taking it, so these rules stay as they are." : undefined}
        >
          {hasNavigation && (
            <>
              <Part title="Questions">
                <div className="grid gap-3 sm:grid-cols-2">
                  <PacingCards
                    oneAtATime={oneAtATime}
                    questionSeconds={questionSeconds}
                    onOneAtATime={changeOneAtATime}
                    onQuestionSeconds={setQuestionSeconds}
                  />
                </div>
              </Part>
              <Part title="Going back">
                {oneAtATime ? (
                  <RadioCards label="Going back" value={navigation} options={navigations} onChange={setNavigation} />
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
                    onChange={setMarked}
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
                      onChange={(e) => setCustomMarked(e.target.value)}
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
                  onChange={setComputersOnly}
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
                  onChange={(e) => setGraceMinutes(e.target.value)}
                  className={`${inputClass} w-32`}
                />
              </Field>
              <Field label="Honor pledge" hint="Students must accept this before they can start.">
                <textarea rows={4} value={pledge} onChange={(e) => setPledge(e.target.value)} className={inputClass} />
              </Field>
            </Part>
          )}
          {mode === "mastery" && <MasteryFields value={masteryRules} onChange={setMasteryRules} />}
          {mode === "game" && <GameFields value={gameRules} onChange={setGameRules} pacingLocked={opened} />}
        </Section>
      )}

      {step === "security" && (
        <Section
          number={stepIndex + 1}
          icon={current.icon}
          title="Anti-cheating"
          description="Turn on the rules you want. Click a card to switch it on or off."
          locked={opened ? "Students are already taking it with these rules, so they stay as they are." : undefined}
        >
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
            {/* Quizzes and exams set the question pacing with their navigation, in the previous step. */}
            {!hasNavigation && (
              <PacingCards
                oneAtATime={oneAtATime}
                questionSeconds={questionSeconds}
                onOneAtATime={changeOneAtATime}
                onQuestionSeconds={setQuestionSeconds}
              />
            )}
            <RuleCard
              art="network"
              icon={<Globe className="size-4" />}
              title="Allowed networks"
              description="Students can only start from the school's network addresses you list."
              checked={limitNetworks}
              onChange={setLimitNetworks}
            >
              <Field label="Addresses" hint="One address or range per line, e.g. 10.0.4.0/24.">
                <textarea
                  rows={3}
                  value={allowlist}
                  onChange={(e) => setAllowlist(e.target.value)}
                  className={`${inputClass} font-mono`}
                />
              </Field>
            </RuleCard>
          </Group>
        </Section>
      )}

      {step === "review" && (
        <Section number={stepIndex + 1} icon={current.icon} title="Review" description="Check the settings, then save. Pick a step above to change it.">
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <ReviewRow label="Type" value={modeLabel} onEdit={() => goTo("type")} />
            <ReviewRow
              label="Who"
              value={[whoLabel, password.trim() ? "room password" : "no password", !klass && mode === "game" && allowGuests ? "guests allowed" : null]
                .filter(Boolean)
                .join(" · ")}
              onEdit={() => goTo("who")}
            />
            <ReviewRow
              label="When"
              value={[opensLabel, closes ? `closes ${closes.replace("T", " ")}` : "you close it", timeLimit ? `${timeLimit} min limit` : "no time limit"].join(
                " · ",
              )}
              onEdit={() => goTo("when")}
            />
            <ReviewRow
              label="Attempts & results"
              value={`${attemptsLabel} · results ${releases.find((r) => r.value === release)!.label.toLowerCase()}`}
              onEdit={() => goTo("when")}
            />
            <ReviewRow
              label={`${modeLabel} settings`}
              value={
                hasNavigation
                  ? [
                      oneAtATime ? "One question at a time" : "All questions on one page",
                      oneAtATime ? navigations.find((n) => n.value === navigation)!.label.toLowerCase() : null,
                      exam && computersOnly ? "computers only" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : mode === "game"
                    ? gameRules.pacing === "teacher"
                      ? "Teacher-paced"
                      : "Student-paced"
                    : "Practice until correct"
              }
              onEdit={() => goTo("rules")}
            />
            <ReviewRow
              label="Anti-cheating"
              value={`${rulesOn} of ${examLockedSettings.length} rules on${limitNetworks ? " · allowed networks" : ""}`}
              onEdit={() => goTo("security")}
            />
          </dl>
        </Section>
      )}

      {problems.length > 0 && (
        <ul role="alert" className="space-y-1 rounded-lg bg-danger-soft p-3 text-sm text-danger">
          {problems.map((p) => (
            <li key={p.text}>{p.text}</li>
          ))}
        </ul>
      )}

      <div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface/95 px-5 py-3 shadow-lg backdrop-blur">
        <p className="min-w-0 flex-1 text-sm text-muted" aria-live="polite">
          {summary}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={onDone} disabled={saving}>
            Cancel
          </Button>
          {stepIndex > 0 && (
            <Button variant="secondary" onClick={() => goTo(steps[stepIndex - 1]!.id)} disabled={saving}>
              <ArrowLeft className="size-4" aria-hidden /> Back
            </Button>
          )}
          {/* Editing saves from any step; a new session is created from the review. */}
          {session && !last && (
            <Button variant="secondary" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          )}
          {last ? (
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : session ? "Save changes" : "Create session"}
            </Button>
          ) : (
            <Button onClick={next} disabled={saving}>
              Next <ArrowRight className="size-4" aria-hidden />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// The steps across the top: where the teacher is, and a way to jump to any step.
function Stepper({ steps, current, onPick }: { steps: readonly Step[]; current: StepId; onPick: (id: StepId) => void }) {
  const at = steps.findIndex((s) => s.id === current);
  return (
    <nav aria-label="Steps">
      <ol className="flex flex-wrap gap-2">
        {steps.map((s, i) => (
          <li key={s.id}>
            <button
              type="button"
              aria-current={s.id === current ? "step" : undefined}
              onClick={() => onPick(s.id)}
              className={clsx(
                "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                s.id === current
                  ? "border-primary bg-primary-soft font-medium text-primary"
                  : "border-border bg-surface text-muted hover:bg-surface-muted hover:text-foreground",
              )}
            >
              <span
                className={clsx(
                  "grid size-5 place-items-center rounded-full text-xs font-semibold",
                  s.id === current ? "bg-primary text-primary-foreground" : i < at ? "bg-success-soft text-success" : "bg-surface-muted",
                )}
                aria-hidden
              >
                {i < at ? <Check className="size-3" /> : i + 1}
              </span>
              {s.title}
            </button>
          </li>
        ))}
      </ol>
    </nav>
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

function ReviewRow({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-surface-muted px-3 py-2">
      <div className="min-w-0 flex-1">
        <dt className="text-xs font-semibold text-muted uppercase">{label}</dt>
        <dd className="mt-0.5">{value}</dd>
      </div>
      <Button variant="text" onClick={onEdit} aria-label={`Change ${label.toLowerCase()}`}>
        Change
      </Button>
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

// Six readable characters: no 0/O or 1/I/L.
function generatePassword(): string {
  const letters = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => letters[b % letters.length]).join("");
}

"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  AppWindow,
  ArrowLeftRight,
  ArrowRight,
  CalendarClock,
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
import { GameFields, gameDraft, gameFromDraft } from "@/components/game-fields";
import { MasteryFields, masteryDraft, masteryFromDraft } from "@/components/mastery-fields";
import {
  defaultHonorPledge,
  defaultIntegrity,
  defaultMaxMarked,
  defaultNavigation,
  examDefaults,
  examLockedSettings,
  formatJoinKey,
  type IntegritySettings,
  type ResultsRelease,
  type Session,
  type SessionMode,
  type SessionNavigation,
} from "@examora/contract";
import type { Class } from "@/lib/types";
import { createSessionAction, updateSessionAction } from "../actions";
import { RuleCard, type Art } from "./anti-cheat";
import { ChipGroup, RadioCards, Section, type CardOption } from "./session-form-parts";

export type RosterStudent = { id: string; name: string; number: string };

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
  students,
  session,
  studentIds: savedStudentIds,
  roomPassword: savedPassword,
  ipAllowlist: savedAllowlist,
  defaultClassId,
  onDone,
}: {
  quizId: string;
  classes: Class[];
  students: RosterStudent[];
  // Set when editing a session.
  session?: Session;
  studentIds?: readonly string[];
  roomPassword?: string | null;
  ipAllowlist?: readonly string[];
  defaultClassId?: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const initialMode: SessionMode = session?.mode ?? "quiz";
  // No class unless one was asked for: anyone with the key may join.
  const initialClass = session ? (session.classId ?? "") : (defaultClassId ?? "");
  const [classId, setClassId] = useState(initialClass);
  const [studentIds, setStudentIds] = useState<string[]>(
    savedStudentIds ? [...savedStudentIds] : [...(classes.find((c) => c.id === initialClass)?.studentIds ?? [])],
  );
  const [pickStudents, setPickStudents] = useState(false);
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
  const [gameRules, setGameRules] = useState(gameDraft(session?.game, session?.pacing));
  const [countInRecord, setCountInRecord] = useState(session?.countInRecord ?? true);
  const [problems, setProblems] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const exam = mode === "exam";
  const klass = classes.find((c) => c.id === classId);
  const classStudents = students.filter((s) => klass?.studentIds.includes(s.id));
  const setIntegrityField = (patch: Partial<IntegritySettings>) => setIntegrity((prev) => ({ ...prev, ...patch }));

  function changeClass(id: string) {
    setClassId(id);
    setStudentIds([...(classes.find((c) => c.id === id)?.studentIds ?? [])]);
  }

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

  async function save() {
    const opensAt = opened ? session.opensAt : startWhen === "schedule" ? fromLocalInput(opens) : null;
    const closesAt = fromLocalInput(closes);
    const found: string[] = [];
    if (classId && studentIds.length === 0) found.push("Choose at least one student, or remove the class so anyone with the key can join.");
    if (!opened && startWhen === "schedule" && !opensAt) found.push("Set an open time, or choose to start now.");
    if (exam && !closesAt) found.push("Exams need a close time.");
    if (opensAt && closesAt && closesAt <= opensAt) found.push("Close time must be after open time.");
    if (attempts === "custom" && (!Number.isInteger(attemptsAllowed) || (attemptsAllowed ?? 0) < 1))
      found.push("Attempts must be a whole number, 1 or more.");
    if (hasNavigation && marked === "custom" && (!Number.isInteger(maxMarked) || (maxMarked ?? 0) < 1 || (maxMarked ?? 0) > 500))
      found.push("The number of questions students may mark for review must be a whole number from 1 to 500.");
    const seconds = questionSeconds ? Number(questionSeconds) : null;
    if (oneAtATime && seconds !== null && (!Number.isInteger(seconds) || seconds < 5))
      found.push("Time per question must be a whole number of at least 5 seconds.");
    const late = lateJoin ? Number(lateJoin) : null;
    if (late !== null && (!Number.isInteger(late) || late < 0)) found.push("Late-join cutoff must be a number of minutes, 0 or more.");
    const addresses = limitNetworks
      ? allowlist
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
      : [];
    const badAddress = addresses.find((a) => !/^[0-9a-fA-F.:]+(\/\d{1,3})?$/.test(a));
    if (badAddress) found.push(`"${badAddress}" is not an IP address or range such as 10.0.4.0/24.`);
    const grace = Number(graceMinutes);
    if (exam && (!Number.isInteger(grace) || grace < 1 || grace > 60)) found.push("The device grace period must be 1 to 60 minutes.");
    if (exam && pledge.trim() === "") found.push("Write the honor pledge students accept.");
    const masteryResult = mode === "mastery" ? masteryFromDraft(masteryRules) : null;
    if (masteryResult && "problems" in masteryResult) found.push(...masteryResult.problems);
    const gameResult = mode === "game" ? gameFromDraft(gameRules) : null;
    if (gameResult && "problems" in gameResult) found.push(...gameResult.problems);
    setProblems(found);
    if (found.length) return;

    const sessionMode: SessionMode = mode;
    const input = {
      classId: classId || null,
      studentIds: classId ? studentIds : [],
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
      // The class record only links sessions of a class.
      countInRecord: classId ? countInRecord : false,
    };
    setSaving(true);
    if (session) {
      const result = await updateSessionAction(session.id, input);
      setSaving(false);
      if ("error" in result) return setProblems([result.error]);
      router.refresh();
      return onDone();
    }
    const startNow = startWhen === "now";
    const result = await createSessionAction(quizId, { ...input, startNow });
    if ("error" in result) {
      setSaving(false);
      return setProblems([result.error]);
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

  const hasModeSettings = mode !== "quiz";
  const navigationNumber = hasNavigation ? 5 : null;
  const modeNumber = hasNavigation ? 6 : 5;
  const antiNumber = hasModeSettings ? modeNumber + 1 : modeNumber;
  const attemptsLabel =
    attempts === "unlimited" ? "Unlimited attempts" : `${attemptsAllowed || "?"} ${attemptsAllowed === 1 ? "attempt" : "attempts"}`;
  const summary = [
    modes.find((m) => m.value === mode)!.label,
    klass ? `${klass.courseCode} · ${klass.section}` : "Anyone with the key",
    opened
      ? "Already open"
      : startWhen === "now"
        ? mode === "game"
          ? "Opens the lobby now"
          : "Starts now"
        : startWhen === "schedule"
          ? opens
            ? `Opens ${opens.replace("T", " ")}`
            : "Pick an open time"
          : "You press Start",
    attemptsLabel,
  ].join(" · ");

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">A session is one run of this quiz, with its own key, schedule and rules.</p>

      <Section
        number={1}
        icon={<ListChecks className="size-5" />}
        title="Type"
        description="What kind of session this is. It sets the starting rules for everything below."
      >
        <RadioCards label="Session type" value={mode} options={modes} onChange={changeMode} />
      </Section>

      <Section
        number={2}
        icon={<Users className="size-5" />}
        title="Who"
        description="A class limits the session to its students. Without one, anyone with the key can join."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Class (optional)">
            <select value={classId} onChange={(e) => changeClass(e.target.value)} className={inputClass}>
              <option value="">No class: anyone with the key</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.courseCode} · {c.section} · {c.title}
                </option>
              ))}
            </select>
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
                : "Any signed-in student who enters it at Join with a key is added to the session."}
            </p>
          </div>
          {session?.joinCode && (
            <Button variant="secondary" onClick={copyJoinKey}>
              {copied ? "Copied" : "Copy"}
            </Button>
          )}
        </div>

        {klass && (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm">
                <span className="font-medium">Students:</span>{" "}
                {studentIds.length === classStudents.length && studentIds.length > 0
                  ? `All ${studentIds.length} in the class`
                  : `${studentIds.length} of ${classStudents.length} in the class`}
              </p>
              <Button variant="secondary" onClick={() => setPickStudents((p) => !p)} aria-expanded={pickStudents}>
                {pickStudents ? "Done" : "Choose students"}
              </Button>
            </div>
            {pickStudents && (
              <div className="mt-2 rounded-lg border border-border">
                <div className="flex gap-3 border-b border-border bg-surface-muted px-3 py-2 text-xs">
                  <button type="button" className="underline" onClick={() => setStudentIds(classStudents.map((s) => s.id))}>
                    Select all
                  </button>
                  <button type="button" className="underline" onClick={() => setStudentIds([])}>
                    Select none
                  </button>
                </div>
                <ul className="max-h-56 divide-y divide-border overflow-y-auto">
                  {classStudents.map((s) => (
                    <li key={s.id}>
                      <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          checked={studentIds.includes(s.id)}
                          onChange={(e) =>
                            setStudentIds((ids) => (e.target.checked ? [...ids, s.id] : ids.filter((id) => id !== s.id)))
                          }
                          className="size-4 accent-primary"
                        />
                        <span className="flex-1">{s.name}</span>
                        <span className="font-mono text-xs text-muted">{s.number}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {klass && (
          <Switch
            checked={countInRecord}
            onChange={setCountInRecord}
            label="Count in the class record"
            description="The scores are linked to the class record and grade sheet."
          />
        )}
      </Section>

      <Section
        number={3}
        icon={<CalendarClock className="size-5" />}
        title="When"
        description="When students can start, and the limits on time."
      >
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {!opened && startWhen === "schedule" && (
            <Field label="Opens at">
              <input type="datetime-local" value={opens} onChange={(e) => setOpens(e.target.value)} className={inputClass} />
            </Field>
          )}
          <Field label="Closes at (optional)" hint={exam ? "Exams need a close time." : "Empty: you close it yourself."}>
            <input type="datetime-local" value={closes} onChange={(e) => setCloses(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Time limit (minutes)" hint="Empty: no limit.">
            <input type="number" min={1} value={timeLimit} onChange={(e) => setTimeLimit(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Late-join cutoff (minutes)" hint="How long after it opens students may still start. Empty: no cutoff.">
            <input type="number" min={0} value={lateJoin} onChange={(e) => setLateJoin(e.target.value)} className={inputClass} />
          </Field>
        </div>
      </Section>

      <Section
        number={4}
        icon={<ListChecks className="size-5" />}
        title="Attempts & results"
        description="How many tries each student gets, and when they see their score."
      >
        <div className="space-y-2">
          <p className="text-sm font-medium" id="attempts-label">
            Attempts allowed
          </p>
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
          <p className="text-xs text-muted">How many times a student may take it. 1 means no retakes.</p>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Show results to students</p>
          <ChipGroup label="Show results to students" value={release} onChange={setRelease} options={releases} />
        </div>
      </Section>

      {navigationNumber !== null && (
        <Section
          number={navigationNumber}
          icon={<Flag className="size-5" />}
          title="Navigation & review"
          description="Whether students may go back to earlier questions, and how many they may mark to check before submitting."
        >
          <div className="space-y-2">
            <p className="text-sm font-medium">Going back</p>
            {oneAtATime ? (
              <RadioCards label="Going back" value={navigation} options={navigations} onChange={setNavigation} />
            ) : (
              <p className="rounded-lg bg-surface-muted px-3 py-2 text-xs text-muted">
                Every question is on one page, so students move freely. Turn on “One question at a time” under
                Anti-cheating to send them forward only or back to marked questions only.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Questions a student may mark for review</p>
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
            <p className="text-xs text-muted">
              {marked === "0"
                ? "Marking for review is off: students don't see the button."
                : "At most this many at once. Marked questions are listed first on the review screen before submitting."}
            </p>
          </div>
        </Section>
      )}

      {hasModeSettings && (
        <Section
          number={modeNumber}
          icon={<ShieldAlert className="size-5" />}
          title={exam ? "Exam rules" : mode === "mastery" ? "Mastery rules" : "Game rules"}
          description={`Settings that only ${exam ? "exams" : mode === "mastery" ? "mastery sessions" : "games"} have.`}
        >
          {mode === "mastery" && <MasteryFields value={masteryRules} onChange={setMasteryRules} />}
          {mode === "game" && <GameFields value={gameRules} onChange={setGameRules} />}
          {exam && (
            <div className="space-y-4">
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
            </div>
          )}
        </Section>
      )}

      <Section
        number={antiNumber}
        icon={<ShieldCheck className="size-5" />}
        title="Anti-cheating"
        description="Turn on the rules you want. Click a card to switch it on or off."
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
          <RuleCard
            art="oneAtATime"
            icon={<ListOrdered className="size-4" />}
            title="One question at a time"
            description="Students see one question at a time. Navigation & review decides whether they can go back."
            checked={oneAtATime}
            onChange={changeOneAtATime}
          />
          <RuleCard
            art="questionTime"
            icon={<Timer className="size-4" />}
            title="Time per question"
            description="Each question closes after a set time, then the next one opens."
            checked={oneAtATime && questionSeconds !== ""}
            disabled={!oneAtATime}
            disabledHint="Needs “One question at a time” on."
            onChange={(on) => setQuestionSeconds(on ? "30" : "")}
          >
            <Field label="Seconds per question" hint="At least 5.">
              <input
                type="number"
                min={5}
                value={questionSeconds}
                onChange={(e) => setQuestionSeconds(e.target.value)}
                className={`${inputClass} w-24`}
              />
            </Field>
          </RuleCard>
          {exam && (
            <RuleCard
              art="computers"
              icon={<Laptop className="size-4" />}
              title="Computers only"
              description="Phones and tablets are refused."
              checked={computersOnly}
              onChange={setComputersOnly}
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

      {problems.length > 0 && (
        <ul role="alert" className="space-y-1 rounded-lg bg-danger-soft p-3 text-sm text-danger">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      <div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface/95 px-5 py-3 shadow-lg backdrop-blur">
        <p className="min-w-0 flex-1 text-sm text-muted" aria-live="polite">
          {summary}
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onDone} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : session ? "Save changes" : "Create session"}
          </Button>
        </div>
      </div>
    </div>
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

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { Button, Card, CardHeader, Field, inputClass } from "@/components/ui";
import { GameFields, gameDraft, gameFromDraft } from "@/components/game-fields";
import { MasteryFields, masteryDraft, masteryFromDraft } from "@/components/mastery-fields";
import {
  defaultHonorPledge,
  defaultIntegrity,
  examDefaults,
  examLockedSettings,
  type IntegritySettings,
  type ResultsRelease,
  type Session,
  type SessionMode,
} from "@examora/contract";
import type { Class } from "@/lib/types";
import { createSessionAction, updateSessionAction } from "../actions";

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

// What a new session starts with for each mode; the teacher can change everything except an exam's locked settings.
function presets(mode: SessionMode) {
  const exam = mode === "exam";
  return {
    timeLimit: exam ? "60" : "",
    attempts: 1,
    resultsRelease: (exam ? examDefaults.resultsRelease : "immediately") as ResultsRelease,
    integrity: defaultIntegrity(mode),
    lateJoin: exam ? String(examDefaults.lateJoinMinutes) : "",
    password: exam ? generatePassword() : "",
  };
}

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
  const initialClass = session?.classId ?? defaultClassId ?? classes[0]?.id ?? "";
  const [classId, setClassId] = useState(initialClass);
  const [studentIds, setStudentIds] = useState<string[]>(
    savedStudentIds ? [...savedStudentIds] : [...(classes.find((c) => c.id === initialClass)?.studentIds ?? [])],
  );
  const [pickStudents, setPickStudents] = useState(false);
  const [mode, setMode] = useState<SessionMode>(initialMode);
  const preset = presets(initialMode);
  const [startWhen, setStartWhen] = useState<"manual" | "schedule">(session && !session.opensAt ? "manual" : "schedule");
  const [opens, setOpens] = useState(toLocalInput(session?.opensAt ?? null));
  const [closes, setCloses] = useState(toLocalInput(session?.closesAt ?? null));
  const [timeLimit, setTimeLimit] = useState(
    session ? (session.timeLimitMinutes === null ? "" : String(session.timeLimitMinutes)) : preset.timeLimit,
  );
  const [attempts, setAttempts] = useState<number | null>(session ? session.attemptsAllowed : preset.attempts);
  const [release, setRelease] = useState<ResultsRelease>(session?.resultsRelease ?? preset.resultsRelease);
  const [integrity, setIntegrity] = useState<IntegritySettings>(session?.integrity ?? preset.integrity);
  const [oneAtATime, setOneAtATime] = useState(session?.oneQuestionAtATime ?? false);
  const [questionSeconds, setQuestionSeconds] = useState(
    session?.questionTimeLimitSeconds ? String(session.questionTimeLimitSeconds) : "",
  );
  const [lateJoin, setLateJoin] = useState(session ? (session.lateJoinMinutes === null ? "" : String(session.lateJoinMinutes)) : preset.lateJoin);
  const [password, setPassword] = useState(session ? (savedPassword ?? "") : preset.password);
  const [computersOnly, setComputersOnly] = useState(session?.exam?.computersOnly ?? examDefaults.computersOnly);
  const [pledge, setPledge] = useState(session?.exam?.honorPledge ?? defaultHonorPledge);
  const [graceMinutes, setGraceMinutes] = useState(String(session?.exam?.deviceGraceMinutes ?? examDefaults.deviceGraceMinutes));
  const [allowlist, setAllowlist] = useState((savedAllowlist ?? []).join("\n"));
  const [copied, setCopied] = useState(false);
  const [masteryRules, setMasteryRules] = useState(masteryDraft(session?.mastery));
  const [gameRules, setGameRules] = useState(gameDraft(session?.game, session?.pacing));
  const [countInRecord, setCountInRecord] = useState(session?.countInRecord ?? true);
  const [problems, setProblems] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

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
  }

  async function copyJoinCode() {
    if (!session?.joinCode) return;
    await navigator.clipboard.writeText(session.joinCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function save() {
    const opensAt = startWhen === "schedule" ? fromLocalInput(opens) : null;
    const closesAt = fromLocalInput(closes);
    const found: string[] = [];
    if (!classId) found.push("Choose a class.");
    if (studentIds.length === 0) found.push("Choose at least one student.");
    if (startWhen === "schedule" && !opensAt) found.push("Set an open time, or choose to start it yourself.");
    if (mode === "exam" && (!opensAt || !closesAt)) found.push("Exams need an open and close time.");
    if (opensAt && closesAt && closesAt <= opensAt) found.push("Close time must be after open time.");
    const seconds = questionSeconds ? Number(questionSeconds) : null;
    if (oneAtATime && seconds !== null && (!Number.isInteger(seconds) || seconds < 5))
      found.push("Time per question must be a whole number of at least 5 seconds.");
    const late = lateJoin ? Number(lateJoin) : null;
    if (late !== null && (!Number.isInteger(late) || late < 0)) found.push("Late-join cutoff must be a number of minutes, 0 or more.");
    const addresses = allowlist
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const badAddress = addresses.find((a) => !/^[0-9a-fA-F.:]+(\/\d{1,3})?$/.test(a));
    if (badAddress) found.push(`"${badAddress}" is not an IP address or range such as 10.0.4.0/24.`);
    const exam = mode === "exam";
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
      classId,
      studentIds,
      mode: sessionMode,
      exam: exam ? { computersOnly, honorPledge: pledge.trim(), deviceGraceMinutes: grace } : null,
      opensAt,
      closesAt,
      timeLimitMinutes: timeLimit ? Math.max(1, Math.floor(Number(timeLimit))) : null,
      attemptsAllowed: attempts,
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
      lateJoinMinutes: late,
      roomPassword: password.trim() || null,
      ipAllowlist: addresses,
      countInRecord,
    };
    setSaving(true);
    const result = session ? await updateSessionAction(session.id, input) : await createSessionAction(quizId, input);
    setSaving(false);
    if ("error" in result) {
      setProblems([result.error]);
      return;
    }
    router.refresh();
    onDone();
  }

  return (
    <Card>
      <CardHeader
        title={session ? "Edit session" : "Start a session"}
        description="A session is one run of this quiz for a class, with its own schedule and rules."
      />
      <div className="space-y-5 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Class">
            <select value={classId} onChange={(e) => changeClass(e.target.value)} className={inputClass}>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.courseCode} · {c.section} · {c.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Type">
            <select value={mode} onChange={(e) => changeMode(e.target.value as SessionMode)} className={inputClass}>
              <option value="quiz">Quiz</option>
              <option value="exam">Exam (serious mode)</option>
              <option value="mastery">Mastery (practice until correct)</option>
              <option value="game">Game (live, with points)</option>
            </select>
          </Field>
        </div>

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

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Opens">
            <select
              value={startWhen}
              onChange={(e) => setStartWhen(e.target.value as "manual" | "schedule")}
              className={inputClass}
            >
              <option value="schedule">At a set time</option>
              <option value="manual">When I press Start</option>
            </select>
          </Field>
          {startWhen === "schedule" && (
            <Field label="Opens at">
              <input type="datetime-local" value={opens} onChange={(e) => setOpens(e.target.value)} className={inputClass} />
            </Field>
          )}
          <Field label="Closes at" hint="Leave empty to close it yourself.">
            <input type="datetime-local" value={closes} onChange={(e) => setCloses(e.target.value)} className={inputClass} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Time limit (minutes)" hint="Leave empty for no limit.">
            <input
              type="number"
              min={1}
              value={timeLimit}
              onChange={(e) => setTimeLimit(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Attempts" hint="How many times a student may take it.">
            <select
              value={attempts === null ? "unlimited" : String(attempts)}
              onChange={(e) => setAttempts(e.target.value === "unlimited" ? null : Number(e.target.value))}
              className={inputClass}
            >
              <option value="1">1 (no retakes)</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="unlimited">Unlimited</option>
              {/* Keep an older setting that isn't in the list visible. */}
              {attempts !== null && attempts > 3 && <option value={String(attempts)}>{attempts}</option>}
            </select>
          </Field>
          <Field label="Show results to students">
            <select
              value={release}
              onChange={(e) => setRelease(e.target.value as ResultsRelease)}
              className={inputClass}
            >
              <option value="immediately">Right after they submit</option>
              <option value="after_close">After it closes</option>
              <option value="manual">When I release them</option>
            </select>
          </Field>
        </div>

        <fieldset className="space-y-2.5">
          <legend className="mb-1 text-sm font-medium">Anti-cheating</legend>
          {mode === "exam" && (
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <Lock className="size-3.5" aria-hidden /> Switches with a lock are required for exams. You can only add stricter rules.
            </p>
          )}
          {examLockedSettings.map(([key, label]) => (
            <Toggle
              key={key}
              label={label}
              locked={mode === "exam"}
              checked={mode === "exam" || integrity[key]}
              onChange={(v) =>
                setIntegrityField(key === "blockPaste" ? { blockPaste: v, ...(v ? {} : { allowPasteInCode: false }) } : { [key]: v })
              }
            />
          ))}
          <Toggle
            label="Allow paste in code answers (every paste is recorded)"
            checked={integrity.blockPaste && integrity.allowPasteInCode}
            disabled={!integrity.blockPaste && mode !== "exam"}
            onChange={(v) => setIntegrityField({ allowPasteInCode: v })}
          />
          <Field
            label="Chances to come back"
            hint="How many times a student may leave (switch tab or app, exit full screen) and return. Leaving once more submits it. Empty: never auto-submit."
          >
            <input
              type="number"
              min={1}
              max={20}
              value={integrity.autoSubmitAfter ?? ""}
              onChange={(e) =>
                setIntegrityField({
                  autoSubmitAfter: e.target.value ? Math.max(1, Math.floor(Number(e.target.value))) : null,
                })
              }
              className={inputClass}
            />
          </Field>
        </fieldset>

        {mode === "mastery" && <MasteryFields value={masteryRules} onChange={setMasteryRules} />}
        {mode === "game" && <GameFields value={gameRules} onChange={setGameRules} />}

        {mode === "exam" && (
          <fieldset className="space-y-3">
            <legend className="mb-1 text-sm font-medium">Exam rules</legend>
            <Toggle label="Computers only (refuse phones and tablets)" checked={computersOnly} onChange={setComputersOnly} />
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
          </fieldset>
        )}

        <fieldset className="space-y-3">
          <legend className="mb-1 text-sm font-medium">Prevention</legend>
          {session?.joinCode && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>Join code:</span>
              <input readOnly value={session.joinCode} aria-label="Join code" className={`${inputClass} w-32 font-mono`} />
              <Button variant="secondary" onClick={copyJoinCode}>
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          )}
          <Toggle label="Show one question at a time (no going back)" checked={oneAtATime} onChange={setOneAtATime} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Time per question (seconds)" hint="At least 5. Empty: no limit per question.">
              <input
                type="number"
                min={5}
                value={questionSeconds}
                disabled={!oneAtATime}
                onChange={(e) => setQuestionSeconds(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Late-join cutoff (minutes)" hint="How long after it opens students may still start. Empty: no cutoff.">
              <input
                type="number"
                min={0}
                value={lateJoin}
                onChange={(e) => setLateJoin(e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
          <Field label="Room password" hint="Students type it to start. Read it out in class. Empty: no password.">
            <div className="flex gap-2">
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="off"
                className={`${inputClass} font-mono`}
              />
              <Button variant="secondary" onClick={() => setPassword(generatePassword())}>
                Generate
              </Button>
            </div>
          </Field>
          <Field label="Allowed networks" hint="One address or range per line, e.g. 10.0.4.0/24. Empty: anywhere.">
            <textarea
              rows={3}
              value={allowlist}
              onChange={(e) => setAllowlist(e.target.value)}
              className={`${inputClass} font-mono`}
            />
          </Field>
        </fieldset>

        <Toggle label="Count in the class record" checked={countInRecord} onChange={setCountInRecord} />

        {problems.length > 0 && (
          <ul role="alert" className="space-y-1 rounded-lg bg-danger-soft p-3 text-sm text-danger">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onDone} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : session ? "Save session" : "Create session"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

// Six readable characters: no 0/O or 1/I/L.
function generatePassword(): string {
  const letters = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => letters[b % letters.length]).join("");
}

function Toggle({
  label,
  checked,
  onChange,
  disabled,
  locked,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  // Required by the session's mode: shown on, can't be changed.
  locked?: boolean;
}) {
  const off = disabled || locked;
  return (
    <label className={`flex items-center justify-between gap-3 text-sm ${off ? "opacity-60" : "cursor-pointer"}`}>
      <span className="flex items-center gap-1.5">
        {locked && <Lock className="size-3.5 text-muted" aria-label="Locked for exams" />}
        {label}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={off}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-primary"
      />
    </label>
  );
}

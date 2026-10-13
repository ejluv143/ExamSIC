"use client";

import {
  defaultGame,
  defaultRelay,
  gameMaxSeconds,
  gameMinSeconds,
  relayLimits,
  type GameSettings,
  type RelayPieceKind,
} from "@examinus/domain/quiz";
import { relayPasswordProblem, relaySettingsProblem } from "@examinus/domain/relay";
import { Field, Switch, inputClass } from "@/components/ui";
import { Select } from "@/components/select";

export type GamePacing = "teacher" | "student";

// The game settings as the form holds them while the teacher types.
export type GameDraft = {
  pacing: GamePacing;
  questionSeconds: string;
  showLeaderboard: boolean;
  streakBonus: boolean;
  // Team Relay: `relay` is the format toggle; the rest are the relay fields.
  relay: boolean;
  teamSize: string;
  teamCount: string;
  studentPick: boolean;
  pieceKind: RelayPieceKind;
  // Blank: each team gets a generated word.
  relayPassword: string;
  // One clue per line.
  relayClues: string;
  passwordAttempts: string;
  solveBonus: string;
  roundMinutes: string;
  requireConsensus: boolean;
  retry: boolean;
  retryLimit: string;
  retryPenalty: string;
  rescue: boolean;
  rescuePoints: string;
};

export const gameDraft = (
  saved: GameSettings | null | undefined,
  pacing: GamePacing | undefined,
  secrets?: { relayPassword: string | null; relayClues: readonly string[] },
): GameDraft => {
  const s = saved ?? defaultGame;
  const r = s.relay ?? defaultRelay;
  return {
    pacing: pacing ?? "teacher",
    questionSeconds: String(s.questionSeconds),
    showLeaderboard: s.showLeaderboard,
    streakBonus: s.streakBonus,
    relay: s.relay !== null,
    teamSize: String(r.teamSize),
    teamCount: String(r.teamCount),
    studentPick: r.studentPick,
    pieceKind: r.pieceKind,
    relayPassword: secrets?.relayPassword ?? "",
    relayClues: (secrets?.relayClues ?? []).join("\n"),
    passwordAttempts: String(r.passwordAttempts),
    solveBonus: String(r.solveBonus),
    roundMinutes: String(r.roundMinutes),
    requireConsensus: r.requireConsensus,
    retry: r.retry,
    retryLimit: String(r.retryLimit),
    retryPenalty: String(r.retryPenalty),
    rescue: r.rescue,
    rescuePoints: String(r.rescuePoints),
  };
};

// The settings to save (with the relay password and clues, which are stored apart), or the problems to show the teacher.
export function gameFromDraft(
  d: GameDraft,
): { settings: GameSettings; relayPassword: string | null; relayClues: string[] } | { problems: string[] } {
  const questionSeconds = Number(d.questionSeconds);
  if (!Number.isInteger(questionSeconds) || questionSeconds < gameMinSeconds || questionSeconds > gameMaxSeconds)
    return { problems: [`Time per question must be a whole number from ${gameMinSeconds} to ${gameMaxSeconds} seconds.`] };
  const base = { questionSeconds, showLeaderboard: d.showLeaderboard, streakBonus: d.streakBonus };
  if (!d.relay) return { settings: { ...base, relay: null }, relayPassword: null, relayClues: [] };
  const relay = {
    teamSize: Number(d.teamSize),
    teamCount: Number(d.teamCount),
    studentPick: d.studentPick,
    pieceKind: d.pieceKind,
    passwordAttempts: Number(d.passwordAttempts),
    solveBonus: Number(d.solveBonus),
    roundMinutes: Number(d.roundMinutes),
    requireConsensus: d.requireConsensus,
    retry: d.retry,
    retryLimit: Number(d.retryLimit),
    retryPenalty: Number(d.retryPenalty),
    rescue: d.rescue,
    rescuePoints: Number(d.rescuePoints),
  };
  const password = d.relayPassword.trim() === "" ? null : d.relayPassword.trim();
  const clues = d.pieceKind === "clue" ? d.relayClues.split("\n").map((c) => c.trim()).filter(Boolean) : [];
  const problem = relaySettingsProblem(d.pacing, relay) ?? relayPasswordProblem(password, clues, d.pieceKind);
  if (problem) return { problems: [problem] };
  return { settings: { ...base, relay }, relayPassword: password, relayClues: clues };
}

const pieceKinds: { value: RelayPieceKind; label: string; help: string }[] = [
  { value: "letter", label: "Letter", help: "Each correct answer reveals one letter of the password, in place." },
  { value: "word", label: "Word", help: "Each correct answer reveals one word of the password." },
  { value: "coordinate", label: "Coordinate", help: "Each correct answer reveals a numbered letter; the team puts the scrambled list in order." },
  { value: "clue", label: "Clue", help: "Each correct answer reveals one of your clues; the team works out the password you set." },
];

export function GameFields({
  value,
  onChange,
  pacingLocked = false,
}: {
  value: GameDraft;
  onChange: (next: GameDraft) => void;
  // The game already opened: the pace stays; the clock and leaderboard can still change.
  pacingLocked?: boolean;
}) {
  const set = (patch: Partial<GameDraft>) => onChange({ ...value, ...patch });
  const number = (key: keyof GameDraft, label: string, hint: string, min: number, max: number) => (
    <Field label={label} hint={hint}>
      <input
        type="number"
        min={min}
        max={max}
        value={String(value[key])}
        onChange={(e) => set({ [key]: e.target.value } as Partial<GameDraft>)}
        className={inputClass}
      />
    </Field>
  );
  const kind = pieceKinds.find((k) => k.value === value.pieceKind) ?? pieceKinds[0];
  return (
    <fieldset className="space-y-3">
      <legend className="mb-1 text-sm font-medium">Game rules</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Who sets the pace"
          hint={
            pacingLocked
              ? "Set when the game opened."
              : value.relay
                ? "Team Relay is always student-paced: each member answers their own questions."
                : "Teacher-paced: you move the whole room from question to question. Student-paced: everyone plays alone."
          }
        >
          <Select
            value={value.pacing}
            disabled={pacingLocked || value.relay}
            onChange={(pacing) => set({ pacing })}
            className="w-full"
            options={[
              { value: "teacher", label: "Teacher-paced (live, on the projector)" },
              { value: "student", label: "Student-paced (each student on their own)" },
            ]}
          />
        </Field>
        <Field label="Seconds per question" hint="Faster correct answers earn more points.">
          <input
            type="number"
            min={gameMinSeconds}
            max={gameMaxSeconds}
            value={value.questionSeconds}
            onChange={(e) => set({ questionSeconds: e.target.value })}
            className={inputClass}
          />
        </Field>
      </div>
      {value.pacing === "student" && (
        <Switch
          checked={value.relay}
          disabled={pacingLocked}
          onChange={(relay) => set(relay ? { relay, pacing: "student" } : { relay })}
          label="Team Relay"
          description="Teams answer their own share of the questions; every correct answer unlocks a piece of a secret password the team then solves together."
        />
      )}
      {value.pacing === "teacher" && !value.relay && (
        <p className="text-xs text-slate-500">Team Relay needs a student-paced game: each member gets different questions.</p>
      )}
      {value.pacing === "teacher" && (
        <Switch
          checked={value.showLeaderboard}
          onChange={(v) => set({ showLeaderboard: v })}
          label="Show the leaderboard after each question"
        />
      )}
      {value.relay && (
        <div className="space-y-4 rounded-lg border border-border p-4">
          <p className="text-sm font-medium">Team Relay</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {number("teamSize", "Team size", "Most members a team may have.", relayLimits.teamSize.minimum, relayLimits.teamSize.maximum)}
            {number("teamCount", "Number of teams", "Made when the lobby opens; you can add or remove teams there.", relayLimits.teamCount.minimum, relayLimits.teamCount.maximum)}
          </div>
          <Switch
            checked={value.studentPick}
            onChange={(v) => set({ studentPick: v })}
            label="Let students pick their team"
            description="Otherwise you place them in the lobby, or they are balanced across the teams at the start."
          />
          <Field label="Piece kind" hint={kind.help}>
            <Select
              value={value.pieceKind}
              onChange={(pieceKind) => set({ pieceKind })}
              className="w-full"
              options={pieceKinds.map((k) => ({ value: k.value, label: k.label }))}
            />
          </Field>
          <Field
            label="Password"
            hint={
              value.pieceKind === "clue"
                ? "Required: the answer your clues lead to."
                : "Leave blank and each team gets its own generated word."
            }
          >
            <input
              type="text"
              value={value.relayPassword}
              onChange={(e) => set({ relayPassword: e.target.value })}
              autoComplete="off"
              className={inputClass}
            />
          </Field>
          {value.pieceKind === "clue" && (
            <Field label="Clues" hint="One per line. Each correct answer reveals the next clue.">
              <textarea
                rows={4}
                value={value.relayClues}
                onChange={(e) => set({ relayClues: e.target.value })}
                className={inputClass}
              />
            </Field>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            {number("passwordAttempts", "Password guesses", "Wrong guesses a team may make.", relayLimits.passwordAttempts.minimum, relayLimits.passwordAttempts.maximum)}
            {number("solveBonus", "Solve bonus", "Points for solving; less the later it is.", relayLimits.solveBonus.minimum, relayLimits.solveBonus.maximum)}
            {number("roundMinutes", "Round minutes", "How long the round lasts.", relayLimits.roundMinutes.minimum, relayLimits.roundMinutes.maximum)}
          </div>
          <Switch
            checked={value.requireConsensus}
            onChange={(v) => set({ requireConsensus: v })}
            label="Require consensus"
            description="Every member must confirm a proposed password before it is checked."
          />
          <fieldset className="space-y-3">
            <legend className="mb-1 text-sm font-medium">Wrong answers</legend>
            <Switch
              checked={value.retry}
              onChange={(v) => set({ retry: v })}
              label="Allow retry"
              description="After a wrong answer the student may try the question again, for fewer points."
            />
            {value.retry && (
              <div className="grid gap-4 sm:grid-cols-2">
                {number("retryLimit", "Retries", "1 to 3 tries after the first.", relayLimits.retryLimit.minimum, relayLimits.retryLimit.maximum)}
                {number("retryPenalty", "Point penalty (%)", "Lost for each retry.", relayLimits.percent.minimum, relayLimits.percent.maximum)}
              </div>
            )}
            <Switch
              checked={value.rescue}
              onChange={(v) => set({ rescue: v })}
              label="Allow teammates to rescue questions"
              description="A member who finished their own questions may answer a teammate's locked question once."
            />
            {value.rescue && number("rescuePoints", "Rescue points (%)", "Share of the question's points the rescuer earns.", relayLimits.percent.minimum, relayLimits.percent.maximum)}
          </fieldset>
        </div>
      )}
      <Switch
        checked={value.streakBonus}
        onChange={(v) => onChange({ ...value, streakBonus: v })}
        label="Streak bonus"
        description="+100 points for each correct answer in a row, up to +500."
      />
      <p className="text-xs text-slate-500">
        A game can&apos;t have essay questions. Code questions need a student-paced game. Drawing questions must be set to
        &quot;No points&quot; and show as a class gallery.
      </p>
    </fieldset>
  );
}

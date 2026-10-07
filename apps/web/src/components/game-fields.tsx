"use client";

import { defaultGame, gameMaxSeconds, gameMinSeconds, type GameSettings } from "@examora/contract";
import { Field, Switch, inputClass } from "@/components/ui";

export type GamePacing = "teacher" | "student";

// The game settings as the form holds them while the teacher types.
export type GameDraft = { pacing: GamePacing; questionSeconds: string; showLeaderboard: boolean; streakBonus: boolean };

export const gameDraft = (saved: GameSettings | null | undefined, pacing: GamePacing | undefined): GameDraft => {
  const s = saved ?? defaultGame;
  return {
    pacing: pacing ?? "teacher",
    questionSeconds: String(s.questionSeconds),
    showLeaderboard: s.showLeaderboard,
    streakBonus: s.streakBonus,
  };
};

// The settings to save, or the problems to show the teacher.
export function gameFromDraft(d: GameDraft): { settings: GameSettings } | { problems: string[] } {
  const questionSeconds = Number(d.questionSeconds);
  if (!Number.isInteger(questionSeconds) || questionSeconds < gameMinSeconds || questionSeconds > gameMaxSeconds)
    return { problems: [`Time per question must be a whole number from ${gameMinSeconds} to ${gameMaxSeconds} seconds.`] };
  return { settings: { questionSeconds, showLeaderboard: d.showLeaderboard, streakBonus: d.streakBonus } };
}

export function GameFields({ value, onChange }: { value: GameDraft; onChange: (next: GameDraft) => void }) {
  return (
    <fieldset className="space-y-3">
      <legend className="mb-1 text-sm font-medium">Game rules</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Who sets the pace" hint="Teacher-paced: you move the whole room from question to question. Student-paced: everyone plays alone.">
          <select
            value={value.pacing}
            onChange={(e) => onChange({ ...value, pacing: e.target.value as GamePacing })}
            className={inputClass}
          >
            <option value="teacher">Teacher-paced (live, on the projector)</option>
            <option value="student">Student-paced (each student on their own)</option>
          </select>
        </Field>
        <Field label="Seconds per question" hint="Faster correct answers earn more points.">
          <input
            type="number"
            min={gameMinSeconds}
            max={gameMaxSeconds}
            value={value.questionSeconds}
            onChange={(e) => onChange({ ...value, questionSeconds: e.target.value })}
            className={inputClass}
          />
        </Field>
      </div>
      {value.pacing === "teacher" && (
        <Switch
          checked={value.showLeaderboard}
          onChange={(v) => onChange({ ...value, showLeaderboard: v })}
          label="Show the leaderboard after each question"
        />
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

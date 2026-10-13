// Game mode scoring and rules (Kahoot- and Wayground-style): the server owns the clock and the points.
import type { GamePoints, QuestionType } from "./question.ts";

// What the attempt RPCs say for a game session: its questions and answers only go through `game.*`, so the
// teacher's pacing and the live scoring hold. The web app recognises it by this text and opens the game screen.
export const gameAttemptMessage = "This is a game. Play it from the game screen.";

// --- Points ---

export const gameBasePoints: Record<GamePoints, number> = { standard: 1000, double: 2000, none: 0 };
export const streakBonusStep = 100;
export const streakBonusMax = 500;
// Answers that arrive a moment after the timer still count, at the lowest speed score (slow connections).
export const gameGraceMs = 1500;

export type GameAnswerPoints = {
  // Speed points plus the streak bonus: what the player's total goes up by.
  earned: number;
  bonus: number;
  // The streak after this answer (a question worth no points leaves it alone).
  streak: number;
};

// A correct answer earns `base * (1 - elapsed / limit / 2)`: full points at once, half at the last moment. A
// partly correct answer earns that share of it and breaks the streak. Fully correct answers after the first in a
// row add +100 each, up to +500. A wrong answer earns 0 and breaks the streak. `none` questions earn nothing.
export function gameAnswerPoints(input: {
  gamePoints: GamePoints;
  // Fraction correct, 0 to 1 (null: couldn't be checked, counts as wrong).
  fraction: number | null;
  elapsedMs: number;
  limitMs: number;
  // The streak before this answer.
  streak: number;
  streakBonus: boolean;
}): GameAnswerPoints {
  const base = gameBasePoints[input.gamePoints];
  if (base === 0) return { earned: 0, bonus: 0, streak: input.streak };
  const fraction = Math.min(Math.max(input.fraction ?? 0, 0), 1);
  if (fraction === 0) return { earned: 0, bonus: 0, streak: 0 };
  const elapsed = Math.min(Math.max(input.elapsedMs, 0), input.limitMs);
  const speed = Math.round(base * (1 - elapsed / input.limitMs / 2) * fraction);
  if (fraction < 1) return { earned: speed, bonus: 0, streak: 0 };
  const bonus = input.streakBonus ? Math.min(input.streak * streakBonusStep, streakBonusMax) : 0;
  return { earned: speed + bonus, bonus, streak: input.streak + 1 };
}

// --- Which questions a game can run ---

// What stops a quiz from being played as a game: essays need a teacher to read them, code needs time to run so
// only a student-paced game takes it, and a drawing can't be scored for speed so it runs as "No points" (shown to
// the class as a gallery). A relay can't use drawings at all: a piece unlocks only on an answer that can be checked.
export function gameQuestionProblems(
  pacing: "teacher" | "student",
  questions: readonly { type: QuestionType; gamePoints: GamePoints }[],
  relay = false,
): string[] {
  const problems: string[] = [];
  if (questions.length === 0) problems.push("The quiz has no questions.");
  if (questions.some((q) => q.type === "essay")) problems.push("A game can't have essay questions: remove them or use another mode.");
  if (pacing === "teacher" && questions.some((q) => q.type === "code"))
    problems.push("Code questions only work in a student-paced game, because running code takes time.");
  if (relay && questions.some((q) => q.type === "drawing"))
    problems.push("A Team Relay can't have drawing questions: a piece only unlocks on an answer that can be checked.");
  else if (questions.some((q) => q.type === "drawing" && q.gamePoints !== "none"))
    problems.push('Drawing questions must be set to "No points" in a game; the class sees them as a gallery.');
  return problems;
}

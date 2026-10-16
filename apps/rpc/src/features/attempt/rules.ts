// What an attempt's paper, answers and clock mean. Pure: the row types are the only thing taken from the database layer.
import { PlayInGame } from "@examinus/contract/attempt";
import { type SessionUser } from "@examinus/domain/user";
import { type QuizDetail } from "@examinus/contract/quiz";
import { kindOf } from "@examinus/domain/kinds";
import { type Question } from "@examinus/domain/question";
import { type AnswerValue, type IntegrityEvent, type TypingEdits } from "@examinus/domain/quiz";
import { attemptScore, type AttemptScore, type ScoredAnswer } from "@examinus/domain/scoring";
import { orderForAttempt } from "@examinus/domain/shuffle";
import { Effect } from "effect";
import type { AnswerItem, AttemptItem, QuizSessionItem } from "../../database/schemas/index.ts";

// Who plays: a null organization (a guest) means any organization, by user id only.
export type Player = { readonly id: string; readonly organizationId: string | null };

export const playerOf = (user: SessionUser): Player => ({ id: user.id, organizationId: user.organization?.id ?? null });

// Sessions whose answers keep every saved version (answer_history): the exam report shows the changes, and the
// result page counts answer switches. Mastery keeps its own tries; games score the first answer only.
export const keepsHistory = (mode: QuizSessionItem["mode"]) => mode === "exam" || mode === "quiz";

// A game's questions and answers only go through `game.*` (issue #13): the attempt RPCs would show every question
// before the teacher opens it and store answers that outrank the live ones.
export const refuseGame = (session: Pick<QuizSessionItem, "mode">) =>
  session.mode === "game" ? Effect.fail(new PlayInGame({ message: "This is a game. Play it from the game screen." })) : Effect.void;

// What a student sees when an exam is for computers only and they came from a phone or tablet.
export const computersOnlyMessage = "This exam is for computers only. Phones and tablets can't take it.";

// What a student must wait for when their exam attempt is on another device, or they were away too long.
export const deviceApprovalMessage =
  "Your teacher must approve this device before you can continue the exam. Keep this page open; it continues when they allow it.";

// What a student sees when their attempt is open in another browser.
export const otherDeviceMessage = "This attempt is open in another browser or device. Go back to the one you started on.";

// Extra seconds an answer to a timed question is still taken after its deadline: slow connections.
export const questionGraceMs = 3000;

// Where a student is on a one-question-at-a-time paper, see `questionProgress`.
export type QuestionProgress = { index: number; furthest: number; startedAt: number; deadline: number | null; timedOut: number[] };

// One question at a time: where the student is now. With a limit per question, a question's time runs while it is
// open, on top of what earlier visits used (`shownMs`, by paper index). When it runs out the student moves on at
// that moment, even if they were away: back to the furthest question reached when they had gone back to an earlier
// one, else to the next. `timedOut` lists the questions whose time ran out on the way; `deadline` is when the time
// of the question they are on runs out (null without a limit).
export function questionProgress(
  session: Pick<QuizSessionItem, "questionTimeLimitSeconds">,
  attempt: Pick<AttemptItem, "questionIndex" | "furthestIndex" | "questionStartedAt" | "startedAt">,
  shownMs: readonly number[],
  now: number,
): QuestionProgress {
  const last = Math.max(0, shownMs.length - 1);
  let index = Math.min(attempt.questionIndex, last);
  let furthest = Math.max(index, Math.min(attempt.furthestIndex, last));
  let startedAt = (attempt.questionStartedAt ?? attempt.startedAt).getTime();
  const timedOut: number[] = [];
  const limit = session.questionTimeLimitSeconds === null ? null : session.questionTimeLimitSeconds * 1000;
  if (limit === null) return { index, furthest, startedAt, deadline: null, timedOut };
  for (;;) {
    const deadline = startedAt + Math.max(0, limit - (shownMs[index] ?? 0));
    if (now <= deadline || (index === furthest && index === last)) return { index, furthest, startedAt, deadline, timedOut };
    timedOut.push(index);
    index = index < furthest ? furthest : index + 1;
    furthest = Math.max(furthest, index);
    startedAt = deadline;
  }
}

// The time earlier visits used on each question of the paper, for `questionProgress`.
export const shownTimes = (paper: readonly Question[], rows: readonly Pick<AnswerItem, "questionId" | "shownMs">[]) => {
  const byQuestion = new Map(rows.map((r) => [r.questionId, r.shownMs]));
  return paper.map((q) => byQuestion.get(q.id) ?? 0);
};

// A check-in gap longer than this is a disconnection.
export const disconnectedAfterMs = 30_000;

// The `disconnected` event for the time since the last check-in, or null when it was recent.
export function disconnectGap(lastSeen: Date | null, now: Date): IntegrityEvent | null {
  if (!lastSeen) return null;
  const gap = now.getTime() - lastSeen.getTime();
  return gap > disconnectedAfterMs
    ? { type: "disconnected", at: lastSeen.toISOString(), durationMs: gap }
    : null;
}

// The questions an attempt's student got, in the order they saw them.
export const attemptPaper = (detail: QuizDetail, seed: number) => orderForAttempt(detail.quiz.settings, detail.parts, seed);
export const flatQuestions = (parts: readonly { questions: readonly Question[] }[]) => parts.flatMap((p) => p.questions);

export const scoreOf = (paper: readonly Question[], rows: readonly (ScoredAnswer & { questionId: string })[]): AttemptScore =>
  attemptScore(paper, new Map(rows.map((r) => [r.questionId, r])));

const maxEdits = 20000;

// Keeps an answer in the shape its question type expects, and a sane size.
export const cleanAnswer = (q: Question, v: AnswerValue): AnswerValue => kindOf(q).cleanAnswer(q, v);

export const cleanTyping = (edits: TypingEdits): TypingEdits => edits.slice(0, maxEdits);

const maxEvents = 500;

// A bounded list of events with valid times.
export function cleanEvents(events: readonly IntegrityEvent[], now: Date): IntegrityEvent[] {
  return events.slice(0, maxEvents).map((e) => ({
    ...e,
    at: Number.isNaN(Date.parse(e.at)) ? now.toISOString() : e.at,
    ...(e.durationMs === undefined ? {} : { durationMs: Math.max(0, e.durationMs) }),
  }));
}

export const toEventRow = (attemptId: string, e: IntegrityEvent) => ({
  attemptId,
  type: e.type,
  at: new Date(e.at),
  durationMs: e.durationMs ?? null,
});

export const isBlank = (value: AnswerValue) => typeof value !== "string" || value.trim() === "";


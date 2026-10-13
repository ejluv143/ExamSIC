// What an attempt's paper, answers and clock mean. Pure: the row types are the only thing taken from the database layer.
import {
  attemptScore,
  cleanCategorizationAnswer,
  cleanHotspotAnswer,
  maxPhotos,
  maxStrokePoints,
  maxStrokes,
  orderForAttempt,
  parseDrawingAnswer,
  parseOrderingAnswer,
  encodeDrawingAnswer,
  type AnswerValue,
  type AttemptScore,
  type IntegrityEvent,
  type Question,
  type QuizDetail,
  type ScoredAnswer,
  type TypingEdits,
} from "@examinus/contract";
import type { AnswerItem, AttemptItem, QuizSessionItem } from "../../database/schemas/index.ts";

// Sessions whose answers keep every saved version (answer_history): the exam report shows the changes, and the
// result page counts answer switches. Mastery keeps its own tries; games score the first answer only.
export const keepsHistory = (mode: QuizSessionItem["mode"]) => mode === "exam" || mode === "quiz";

// Extra seconds an answer to a timed question is still taken after its deadline: slow connections.
export const questionGraceMs = 3000;

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
): { index: number; furthest: number; startedAt: number; deadline: number | null; timedOut: number[] } {
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

// Question types whose typing is kept for the teacher's replay.
export const keepsTyping = (type: Question["type"]) =>
  type === "code" || type === "sql" || type === "essay" || type === "blank" || type === "enumeration";

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

const maxTextLength = 5000;
const maxCodeLength = 20000;
const maxEdits = 20000;

// Keeps an answer in the shape its question type expects, and a sane size.
export function cleanAnswer(q: Question, v: AnswerValue): AnswerValue {
  switch (q.type) {
    case "true_false":
      return typeof v === "boolean" ? v : null;
    case "multiple_choice":
      return q.multipleCorrect ? (Array.isArray(v) ? v.slice(0, 50).map(String) : null) : typeof v === "string" ? v : null;
    case "blank":
    case "matching":
    case "enumeration":
      return Array.isArray(v) ? v.slice(0, 50).map((x) => String(x ?? "").slice(0, maxTextLength)) : null;
    case "code":
    case "sql":
      return typeof v === "string" ? v.slice(0, maxCodeLength) : null;
    case "drawing": {
      // The strokes and picture ids of the drawing, kept to what the question allows and to a sane size.
      const given = parseDrawingAnswer(v);
      let points = 0;
      const strokes = q.allowDraw
        ? given.strokes
            .slice(0, maxStrokes)
            .filter((s) => (points += s.points.length) <= maxStrokePoints)
            .map((s) => (s.text === undefined ? s : { ...s, text: s.text.slice(0, 200) }))
        : [];
      const photos = q.allowUpload ? [...new Set(given.photos)].slice(0, maxPhotos) : [];
      const assetId = q.allowDraw ? given.assetId : null;
      return strokes.length === 0 && assetId === null && photos.length === 0
        ? null
        : encodeDrawingAnswer({ strokes, assetId, photos });
    }
    case "categorization":
      return cleanCategorizationAnswer(q, v);
    case "ordering":
      return parseOrderingAnswer(q, v);
    case "hotspot":
      return cleanHotspotAnswer(q, v);
    default:
      return typeof v === "string" ? v.slice(0, maxTextLength) : null;
  }
}

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


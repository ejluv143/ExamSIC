// What the quiz handlers and the background job share: rows as contract types, the session's derived
// status and time limits, and grading + submitting an attempt.
import {
  cleanCategorizationAnswer,
  cleanHotspotAnswer,
  parseOrderingAnswer,
  drawingAssetIds,
  encodeDrawingAnswer,
  maxPhotos,
  maxStrokePoints,
  maxStrokes,
  parseDrawingAnswer,
  attemptScore,
  autoScore,
  orderForAttempt,
  type AnswerValue,
  type AttemptScore,
  type AttemptStatus,
  type CodeTestResult,
  type IntegrityEvent,
  type Question,
  type Quiz,
  type QuizDetail,
  type QuizPart,
  type QuizPartWithQuestions,
  type ScoredAnswer,
  type Session,
  type StudentEndReason,
  type SessionStatus,
  type TypingEdits,
} from "@examora/contract";
import { and, asc, eq, inArray, isNotNull, isNull, lte, ne, sql } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";
import { Database, type Drizzle } from "./Database.ts";
import {
  assets,
  answers,
  answerHistory,
  attempts,
  classMembers,
  codeResults,
  integrityEvents,
  questions,
  quizParts,
  quizSessions,
  quizzes,
  students,
  typingEdits,
  type AnswerItem,
  type AttemptItem,
  type QuestionItem,
  type QuizItem,
  type QuizPartItem,
  type QuizSessionItem,
} from "./database/schemas/index.ts";
import { LiveHub } from "./Live.ts";
import { Runner } from "./Runner.ts";
import { runSqlChecks } from "./sql-grader.ts";

// Drizzle's database or a transaction of it.
export type Db = Pick<Drizzle, "select" | "insert" | "update" | "delete">;

// An answer sent a moment after the deadline still counts: slow connections, the browser's own timer.
export const graceMs = 60_000;

const iso = (date: Date) => date.toISOString();
const isoOrNull = (date: Date | null) => (date ? date.toISOString() : null);

// --- Rows as contract types ---

export const toQuiz = (r: QuizItem): Quiz => ({
  id: r.id,
  ownerId: r.ownerId,
  title: r.title,
  description: r.description,
  subject: r.subject,
  subjectArea: r.subjectArea,
  header: r.header,
  paper: r.paper,
  settings: r.settings,
  createdAt: iso(r.createdAt),
  updatedAt: iso(r.updatedAt),
});

export const toPart = (r: QuizPartItem): QuizPart => ({
  id: r.id,
  quizId: r.quizId,
  position: r.position,
  title: r.title,
  instructions: r.instructions,
  shuffleQuestions: r.shuffleQuestions,
  poolSize: r.poolSize,
});

// The body holds the type-specific fields (and `type`); the base fields have their own columns.
export const toQuestion = (r: QuestionItem): Question =>
  ({
    id: r.id,
    prompt: r.prompt,
    points: r.points,
    gamePoints: r.gamePoints,
    partialCredit: r.partialCredit,
    ...(r.topic === null ? {} : { topic: r.topic }),
    ...r.body,
  }) as Question;

// --- Sessions ---

// Stored status catches up with the clock only when the background job runs, so every read derives it:
// ended at closesAt, running from opensAt (or once the teacher started it).
export function sessionStatus(r: QuizSessionItem, now: number): SessionStatus {
  if (r.status === "ended") return "ended";
  // While paused the clock is stopped at the moment of the pause.
  const clock = r.pausedAt ? Math.min(now, r.pausedAt.getTime()) : now;
  if (r.closesAt && clock >= r.closesAt.getTime()) return "ended";
  if (r.status === "running") return "running";
  if (r.opensAt && now >= r.opensAt.getTime()) return "running";
  return r.status;
}

export function toSession(r: QuizSessionItem, now: number): Session {
  const status = sessionStatus(r, now);
  return {
    id: r.id,
    quizId: r.quizId,
    classId: r.classId,
    mode: r.mode,
    pacing: r.pacing,
    status,
    opensAt: isoOrNull(r.opensAt),
    closesAt: isoOrNull(r.closesAt),
    timeLimitMinutes: r.timeLimitMinutes,
    attemptsAllowed: r.attemptsAllowed,
    resultsRelease: r.resultsRelease,
    resultsReleased: r.resultsReleased,
    integrity: r.integrity,
    mastery: r.mastery,
    exam: r.exam,
    game: r.mode === "game" ? { questionSeconds: r.gameQuestionSeconds, showLeaderboard: r.gameLeaderboard, streakBonus: r.gameStreakBonus } : null,
    countInRecord: r.countInRecord,
    joinCode: r.joinCode,
    oneQuestionAtATime: r.oneQuestionAtATime,
    questionTimeLimitSeconds: r.questionTimeLimitSeconds,
    navigation: r.navigation,
    maxMarked: r.maxMarked,
    lateJoinMinutes: r.lateJoinMinutes,
    roomPasswordRequired: r.roomPassword !== null,
    ipRestricted: r.ipAllowlist.length > 0,
    allowGuests: r.allowGuests,
    startedAt: isoOrNull(r.startedAt ?? (status === "running" ? r.opensAt : null)),
    endedAt: isoOrNull(r.endedAt ?? (status === "ended" ? r.closesAt : null)),
    pausedAt: isoOrNull(r.pausedAt),
  };
}

// Whether students may see their score and the answer key yet.
export function resultsVisible(session: Session): boolean {
  switch (session.resultsRelease) {
    case "immediately":
      return true;
    case "after_close":
      return session.status === "ended";
    case "manual":
      return session.resultsReleased;
  }
}

// When an attempt stops taking answers (ms): its time limit or the session's close, whichever comes first.
export function attemptDeadline(
  session: Pick<QuizSessionItem, "closesAt" | "timeLimitMinutes">,
  attempt: Pick<AttemptItem, "startedAt" | "extraMs">,
): number | null {
  const limit = session.timeLimitMinutes === null ? null : attempt.startedAt.getTime() + session.timeLimitMinutes * 60_000;
  const close = session.closesAt?.getTime() ?? null;
  const base = limit === null ? close : close === null ? limit : Math.min(limit, close);
  return base === null ? null : base + attempt.extraMs;
}

// An answer that says something: not null, not empty text, not a list of empty boxes.
export const hasAnswer = (v: AnswerValue | null) =>
  v !== null && !(typeof v === "string" && v.trim() === "") && !(Array.isArray(v) && v.every((x) => x.trim() === ""));

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

// --- Quiz content ---

export async function loadParts(d: Db, quizIds: readonly string[]): Promise<Map<string, QuizPartWithQuestions[]>> {
  const byQuiz = new Map<string, QuizPartWithQuestions[]>();
  if (quizIds.length === 0) return byQuiz;
  const partRows = await d
    .select()
    .from(quizParts)
    .where(inArray(quizParts.quizId, [...quizIds]))
    .orderBy(asc(quizParts.position));
  const questionRows = partRows.length
    ? await d
        .select()
        .from(questions)
        .where(inArray(questions.partId, partRows.map((p) => p.id)))
        .orderBy(asc(questions.position))
    : [];
  const byPart = new Map<string, Question[]>();
  for (const q of questionRows) {
    const list = byPart.get(q.partId) ?? [];
    list.push(toQuestion(q));
    byPart.set(q.partId, list);
  }
  for (const p of partRows) {
    const list = byQuiz.get(p.quizId) ?? [];
    list.push({ ...toPart(p), questions: byPart.get(p.id) ?? [] });
    byQuiz.set(p.quizId, list);
  }
  return byQuiz;
}

export async function loadQuizDetail(d: Db, quiz: QuizItem): Promise<QuizDetail> {
  const parts = (await loadParts(d, [quiz.id])).get(quiz.id) ?? [];
  return { quiz: toQuiz(quiz), parts };
}

// The questions an attempt's student got, in the order they saw them.
export const attemptPaper = (detail: QuizDetail, seed: number) => orderForAttempt(detail.quiz.settings, detail.parts, seed);
export const flatQuestions = (parts: readonly { questions: readonly Question[] }[]) => parts.flatMap((p) => p.questions);

export const scoreOf = (paper: readonly Question[], rows: readonly (ScoredAnswer & { questionId: string })[]): AttemptScore =>
  attemptScore(paper, new Map(rows.map((r) => [r.questionId, r])));

// --- Roster ---

// The accounts of a class's current members, and the roster entries they are.
export const classAccounts = (d: Db, classId: string) =>
  d
    .select({ userId: students.userId, rosterId: students.id })
    .from(classMembers)
    .innerJoin(students, eq(classMembers.studentId, students.id))
    .where(and(eq(classMembers.classId, classId), isNotNull(students.userId)))
    .then((rows) => rows.map((r) => ({ userId: r.userId!, rosterId: r.rosterId })));

// --- Answers ---

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

// A drawing answer keeps only the pictures the student uploaded and confirmed themselves.
export async function keepOwnPictures(d: Db, studentId: string, value: AnswerValue): Promise<AnswerValue> {
  if (typeof value !== "string") return value;
  const drawing = parseDrawingAnswer(value);
  const ids = drawingAssetIds(drawing);
  if (ids.length === 0) return value;
  const rows = await d
    .select({ id: assets.id })
    .from(assets)
    .where(and(inArray(assets.id, ids), eq(assets.ownerId, studentId), eq(assets.purpose, "answer"), eq(assets.status, "ready")));
  const own = new Set(rows.map((r) => r.id));
  const kept = {
    strokes: drawing.strokes,
    assetId: drawing.assetId !== null && own.has(drawing.assetId) ? drawing.assetId : null,
    photos: drawing.photos.filter((id) => own.has(id)),
  };
  return kept.strokes.length === 0 && kept.assetId === null && kept.photos.length === 0 ? null : encodeDrawingAnswer(kept);
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

const isBlank = (value: AnswerValue) => typeof value !== "string" || value.trim() === "";

export type SubmitInput = {
  attemptId: string;
  // Answers by question id, replacing what was autosaved; absent: submit what was saved.
  answers?: Readonly<Record<string, AnswerValue>>;
  typing?: Readonly<Record<string, TypingEdits>>;
  events?: readonly IntegrityEvent[];
  // Submitted by the server (time ran out, or the teacher ended the session), not by the student.
  auto: boolean;
  // Why the server submitted it, shown to the student.
  reason?: StudentEndReason;
};

export type Submitted = { status: AttemptStatus; score: AttemptScore | null };

export class Quizzes extends Context.Service<
  Quizzes,
  {
    // Grades and submits an in-progress attempt. An attempt already submitted is returned as it is.
    readonly submit: (input: SubmitInput) => Effect.Effect<Submitted | null>;
    // Ends the session now and auto-submits every attempt still in progress.
    readonly endSession: (sessionId: string) => Effect.Effect<void>;
    // Background job: opens and ends sessions on schedule and submits attempts that ran out of time.
    readonly sweep: Effect.Effect<void>;
  }
>()("examora/api/Quizzes") {
  static readonly layer = Layer.effect(
    Quizzes,
    Effect.gen(function* () {
      const db = yield* Database;
      const runner = yield* Runner;
      const hub = yield* LiveHub;

      // Checks one code or SQL answer against the question's tests. null: nothing could check it.
      const check = (q: Question, value: AnswerValue): Effect.Effect<CodeTestResult[] | null> => {
        if (q.type !== "code" && q.type !== "sql") return Effect.succeed(null);
        if (isBlank(value)) return Effect.succeed([{ testId: "blank", passed: false, output: "", error: "No answer" }]);
        const code = value as string;
        return q.type === "code"
          ? runner.runTests(q, code)
          : Effect.promise(() => runSqlChecks(q, code)).pipe(
              Effect.catch(() => Effect.succeed(null)),
              Effect.catchDefect(() => Effect.succeed(null)),
            );
      };

      const submit = Effect.fn("Quizzes.submit")(function* (input: SubmitInput) {
        const now = new Date();
        const [attempt] = yield* db.query((d) => d.select().from(attempts).where(eq(attempts.id, input.attemptId)));
        if (!attempt) return null;
        const [session] = yield* db.query((d) => d.select().from(quizSessions).where(eq(quizSessions.id, attempt.sessionId)));
        const [quiz] = yield* db.query((d) => d.select().from(quizzes).where(eq(quizzes.id, session!.quizId)));
        if (attempt.status !== "in_progress") return yield* finished(attempt, quiz!.id);

        const detail = yield* db.query((d) => loadQuizDetail(d, quiz!));
        const paper = flatQuestions(attemptPaper(detail, attempt.seed));
        const saved = yield* db.query((d) => d.select().from(answers).where(eq(answers.attemptId, attempt.id)));
        const savedBy = new Map(saved.map((r) => [r.questionId, r]));
        // One question at a time: only the question the student is on may still change; the rest are locked.
        const progress = session!.oneQuestionAtATime
          ? questionProgress(session!, attempt, shownTimes(paper, saved), now.getTime())
          : null;
        const openQuestionId = progress ? paper[progress.index]?.id : undefined;
        const questionTimeUp =
          progress?.deadline != null && now.getTime() > progress.deadline + questionGraceMs;

        // Each question's final answer: the submitted one, else what was autosaved. Mastery answers were graded
        // when they were given, so they are kept as they are.
        const graded = yield* Effect.forEach(
          paper,
          (q) =>
            Effect.gen(function* () {
              if (session!.mode === "mastery") {
                const row = savedBy.get(q.id);
                return { q, value: row?.value ?? null, results: null, auto: row ? row.autoScore : autoScore(q, null, null) };
              }
              const mayChange = !progress || (q.id === openQuestionId && !questionTimeUp);
              const sent = mayChange && input.answers && Object.hasOwn(input.answers, q.id) ? input.answers[q.id] : undefined;
              const cleaned = cleanAnswer(q, sent === undefined ? (savedBy.get(q.id)?.value ?? null) : sent);
              const value =
                q.type === "drawing" ? yield* db.query((d) => keepOwnPictures(d, attempt.studentId, cleaned)) : cleaned;
              const results = yield* check(q, value);
              return { q, value, results, auto: autoScore(q, value, results) };
            }),
          { concurrency: 3 },
        );

        const events = cleanEvents(input.events ?? [], now);
        const limit = session!.timeLimitMinutes;
        if (input.auto) {
          events.push({ type: "auto_submitted", at: now.toISOString() });
          // Someone who left and never came back: the time since the last check-in.
          const gap = disconnectGap(attempt.lastSeenAt, now);
          if (gap) events.push(gap);
        } else if (limit !== null && now.getTime() - attempt.startedAt.getTime() > (limit + 1) * 60_000)
          events.push({ type: "late_submit", at: now.toISOString() });

        // Essays, and code nothing could check, wait for the teacher.
        const score = scoreOf(
          paper,
          graded.map((g) => ({ questionId: g.q.id, autoScore: g.auto, manualScore: savedBy.get(g.q.id)?.manualScore ?? null })),
        );
        const status: AttemptStatus = score.ungraded > 0 ? "needs_grading" : "graded";

        const won = yield* db.query((d) =>
          d.transaction(async (tx) => {
            // Whoever flips the status first submits; a second submit (or the job) changes nothing.
            const flipped = await tx
              .update(attempts)
              .set({ status, submittedAt: now })
              .where(and(eq(attempts.id, attempt.id), eq(attempts.status, "in_progress")))
              .returning({ id: attempts.id });
            if (flipped.length === 0) return false;
            for (const g of graded) {
              const [row] = await tx
                .insert(answers)
                .values({
                  attemptId: attempt.id,
                  questionId: g.q.id,
                  value: g.value,
                  correct: g.auto === null ? null : g.auto === 1,
                  autoScore: g.auto,
                  answeredAt: now,
                })
                .onConflictDoUpdate({
                  target: [answers.attemptId, answers.questionId],
                  set: { value: g.value, correct: g.auto === null ? null : g.auto === 1, autoScore: g.auto },
                })
                .returning({ id: answers.id });
              // Exam sessions keep every version of an answer; the final one may differ from the last autosave.
              if (session!.mode === "exam" && JSON.stringify(g.value) !== JSON.stringify(savedBy.get(g.q.id)?.value ?? null))
                await tx.insert(answerHistory).values({ attemptId: attempt.id, questionId: g.q.id, value: g.value, savedAt: now });
              if (g.results) {
                await tx
                  .insert(codeResults)
                  .values({ answerId: row!.id, results: g.results })
                  .onConflictDoUpdate({ target: codeResults.answerId, set: { results: g.results } });
              }
              const edits = input.typing?.[g.q.id];
              if (keepsTyping(g.q.type) && edits) {
                await tx
                  .insert(typingEdits)
                  .values({ answerId: row!.id, edits: cleanTyping(edits) })
                  .onConflictDoUpdate({ target: typingEdits.answerId, set: { edits: cleanTyping(edits) } });
              }
            }
            if (events.length) await tx.insert(integrityEvents).values(events.map((e) => toEventRow(attempt.id, e)));
            return true;
          }),
        );
        if (!won) {
          const [now2] = yield* db.query((d) => d.select().from(attempts).where(eq(attempts.id, attempt.id)));
          return yield* finished(now2!, quiz!.id);
        }
        yield* hub.attemptChanged(attempt.id, input.auto ? { events, ended: input.reason ?? "time_up" } : { events });
        return { status, score };
      });

      // The score of an attempt that was already submitted.
      const finished = Effect.fn("Quizzes.finished")(function* (attempt: AttemptItem, quizId: string) {
        const [quiz] = yield* db.query((d) => d.select().from(quizzes).where(eq(quizzes.id, quizId)));
        const detail = yield* db.query((d) => loadQuizDetail(d, quiz!));
        const rows = yield* db.query((d) => d.select().from(answers).where(eq(answers.attemptId, attempt.id)));
        const score = scoreOf(flatQuestions(attemptPaper(detail, attempt.seed)), rows);
        return { status: attempt.status, score } satisfies Submitted;
      });

      const submitInProgress = (rows: { id: string }[], reason: StudentEndReason) =>
        Effect.forEach(rows, (a) => submit({ attemptId: a.id, auto: true, reason }), { discard: true });

      const endSession = Effect.fn("Quizzes.endSession")(function* (sessionId: string) {
        const now = new Date();
        yield* db.query((d) =>
          d
            .update(quizSessions)
            .set({ status: "ended", pausedAt: null, endedAt: sql`least(coalesce(${quizSessions.closesAt}, ${now}), ${now})` })
            .where(and(eq(quizSessions.id, sessionId), ne(quizSessions.status, "ended"))),
        );
        const open = yield* db.query((d) =>
          d
            .select({ id: attempts.id })
            .from(attempts)
            .where(and(eq(attempts.sessionId, sessionId), eq(attempts.status, "in_progress"))),
        );
        yield* submitInProgress(open, "session_ended");
        yield* hub.sessionChanged(sessionId);
      });

      const sweep = Effect.gen(function* () {
        const now = new Date();
        const changed = yield* db.query(async (d) => {
          // Sessions whose opening time has come run; those past their closing time end (at that time).
          // A paused session's clock is stopped, so it neither ends nor expires anyone.
          const opened = await d
            .update(quizSessions)
            .set({ status: "running", startedAt: sql`${quizSessions.opensAt}` })
            .where(and(eq(quizSessions.status, "scheduled"), isNotNull(quizSessions.opensAt), lte(quizSessions.opensAt, now)))
            .returning({ id: quizSessions.id });
          const closed = await d
            .update(quizSessions)
            .set({ status: "ended", endedAt: sql`${quizSessions.closesAt}` })
            .where(
              and(
                ne(quizSessions.status, "ended"),
                isNull(quizSessions.pausedAt),
                isNotNull(quizSessions.closesAt),
                lte(quizSessions.closesAt, now),
              ),
            )
            .returning({ id: quizSessions.id });
          return [...opened, ...closed];
        });
        yield* Effect.forEach(changed, (s) => hub.sessionChanged(s.id), { discard: true });
        // Attempts still in progress after their deadline (and the grace for a late submit) are submitted as they are.
        const open = yield* db.query((d) =>
          d
            .select({ attempt: attempts, session: quizSessions })
            .from(attempts)
            .innerJoin(quizSessions, eq(attempts.sessionId, quizSessions.id))
            .where(and(eq(attempts.status, "in_progress"), isNull(quizSessions.pausedAt))),
        );
        const expired = open.filter(({ attempt, session }) => {
          const deadline = attemptDeadline(session, attempt);
          const ended = session.status === "ended" && session.endedAt ? session.endedAt.getTime() + attempt.extraMs : null;
          return (deadline !== null && now.getTime() > deadline + graceMs) || (ended !== null && now.getTime() > ended + graceMs);
        });
        yield* submitInProgress(expired.map((e) => e.attempt), "time_up");
        if (expired.length) yield* Effect.log(`Auto-submitted ${expired.length} expired attempt(s).`);
      }).pipe(
        Effect.catchCause((cause) => Effect.logError("Quiz sweep failed", cause)),
      );

      return Quizzes.of({ submit, endSession, sweep });
    }),
  );
}

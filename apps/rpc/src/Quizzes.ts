// What the quiz handlers and the background job share: rows as contract types, the session's derived
// status and time limits, and grading + submitting an attempt.
import {
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
  type SessionStatus,
  type TypingEdits,
} from "@examora/contract";
import { and, asc, eq, inArray, isNotNull, lte, ne, sql } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";
import { Database, type Drizzle } from "./Database.ts";
import {
  answers,
  attempts,
  codeResults,
  integrityEvents,
  questions,
  quizParts,
  quizSessions,
  quizzes,
  typingEdits,
  users,
  type AttemptItem,
  type QuestionItem,
  type QuizItem,
  type QuizPartItem,
  type QuizSessionItem,
} from "./database/schemas/index.ts";
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
  ({ id: r.id, prompt: r.prompt, points: r.points, ...(r.topic === null ? {} : { topic: r.topic }), ...r.body }) as Question;

// --- Sessions ---

// Stored status catches up with the clock only when the background job runs, so every read derives it:
// ended at closesAt, running from opensAt (or once the teacher started it).
export function sessionStatus(r: QuizSessionItem, now: number): SessionStatus {
  if (r.status === "ended") return "ended";
  if (r.closesAt && now >= r.closesAt.getTime()) return "ended";
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
    countInRecord: r.countInRecord,
    joinCode: r.joinCode,
    startedAt: isoOrNull(r.startedAt ?? (status === "running" ? r.opensAt : null)),
    endedAt: isoOrNull(r.endedAt ?? (status === "ended" ? r.closesAt : null)),
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
  startedAt: Date,
): number | null {
  const limit = session.timeLimitMinutes === null ? null : startedAt.getTime() + session.timeLimitMinutes * 60_000;
  const close = session.closesAt?.getTime() ?? null;
  return limit === null ? close : close === null ? limit : Math.min(limit, close);
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

// Roster ids ("s9") to the accounts that own them; roster entries without an account are skipped.
export async function accountsOfRoster(d: Db, rosterIds: readonly string[]) {
  if (rosterIds.length === 0) return [];
  return d
    .select({ userId: users.id, rosterId: users.studentId })
    .from(users)
    .where(and(eq(users.role, "student"), inArray(users.studentId, [...rosterIds])));
}

// --- Answers ---

const maxTextLength = 5000;
const maxCodeLength = 20000;
const maxEdits = 20000;

// Keeps an answer in the shape its question type expects, and a sane size.
export function cleanAnswer(q: Question, v: AnswerValue): AnswerValue {
  switch (q.type) {
    case "true_false":
      return typeof v === "boolean" ? v : null;
    case "fill_in_the_blank":
    case "enumeration":
      return Array.isArray(v) ? v.slice(0, 50).map((x) => String(x ?? "").slice(0, maxTextLength)) : null;
    case "code":
    case "sql":
      return typeof v === "string" ? v.slice(0, maxCodeLength) : null;
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

const isBlank = (value: AnswerValue) => typeof value !== "string" || value.trim() === "";

export type SubmitInput = {
  attemptId: string;
  // Answers by question id, replacing what was autosaved; absent: submit what was saved.
  answers?: Readonly<Record<string, AnswerValue>>;
  typing?: Readonly<Record<string, TypingEdits>>;
  events?: readonly IntegrityEvent[];
  // Submitted by the server (time ran out, or the teacher ended the session), not by the student.
  auto: boolean;
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

        // Each question's final answer: the submitted one, else what was autosaved.
        const graded = yield* Effect.forEach(
          paper,
          (q) =>
            Effect.gen(function* () {
              const sent = input.answers && Object.hasOwn(input.answers, q.id) ? input.answers[q.id] : undefined;
              const value = cleanAnswer(q, sent === undefined ? (savedBy.get(q.id)?.value ?? null) : sent);
              const results = yield* check(q, value);
              return { q, value, results, auto: autoScore(q, value, results) };
            }),
          { concurrency: 3 },
        );

        const events = cleanEvents(input.events ?? [], now);
        const limit = session!.timeLimitMinutes;
        if (input.auto) events.push({ type: "auto_submitted", at: now.toISOString() });
        else if (limit !== null && now.getTime() - attempt.startedAt.getTime() > (limit + 1) * 60_000)
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
              if (g.results) {
                await tx
                  .insert(codeResults)
                  .values({ answerId: row!.id, results: g.results })
                  .onConflictDoUpdate({ target: codeResults.answerId, set: { results: g.results } });
              }
              const edits = input.typing?.[g.q.id];
              if ((g.q.type === "code" || g.q.type === "sql") && edits) {
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

      const submitInProgress = (rows: { id: string }[]) =>
        Effect.forEach(rows, (a) => submit({ attemptId: a.id, auto: true }), { discard: true });

      const endSession = Effect.fn("Quizzes.endSession")(function* (sessionId: string) {
        const now = new Date();
        yield* db.query((d) =>
          d
            .update(quizSessions)
            .set({ status: "ended", endedAt: sql`least(coalesce(${quizSessions.closesAt}, ${now}), ${now})` })
            .where(and(eq(quizSessions.id, sessionId), ne(quizSessions.status, "ended"))),
        );
        const open = yield* db.query((d) =>
          d
            .select({ id: attempts.id })
            .from(attempts)
            .where(and(eq(attempts.sessionId, sessionId), eq(attempts.status, "in_progress"))),
        );
        yield* submitInProgress(open);
      });

      const sweep = Effect.gen(function* () {
        const now = new Date();
        yield* db.query(async (d) => {
          // Sessions whose opening time has come run; those past their closing time end (at that time).
          await d
            .update(quizSessions)
            .set({ status: "running", startedAt: sql`${quizSessions.opensAt}` })
            .where(and(eq(quizSessions.status, "scheduled"), isNotNull(quizSessions.opensAt), lte(quizSessions.opensAt, now)));
          await d
            .update(quizSessions)
            .set({ status: "ended", endedAt: sql`${quizSessions.closesAt}` })
            .where(and(ne(quizSessions.status, "ended"), isNotNull(quizSessions.closesAt), lte(quizSessions.closesAt, now)));
        });
        // Attempts still in progress after their deadline (and the grace for a late submit) are submitted as they are.
        const open = yield* db.query((d) =>
          d
            .select({ attempt: attempts, session: quizSessions })
            .from(attempts)
            .innerJoin(quizSessions, eq(attempts.sessionId, quizSessions.id))
            .where(eq(attempts.status, "in_progress")),
        );
        const expired = open.filter(({ attempt, session }) => {
          const deadline = attemptDeadline(session, attempt.startedAt);
          const ended = session.status === "ended" && session.endedAt ? session.endedAt.getTime() : null;
          return (deadline !== null && now.getTime() > deadline + graceMs) || (ended !== null && now.getTime() > ended + graceMs);
        });
        yield* submitInProgress(expired.map((e) => e.attempt));
        if (expired.length) yield* Effect.log(`Auto-submitted ${expired.length} expired attempt(s).`);
      }).pipe(
        Effect.catchCause((cause) => Effect.logError("Quiz sweep failed", cause)),
      );

      return Quizzes.of({ submit, endSession, sweep });
    }),
  );
}

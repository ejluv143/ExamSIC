// The game tables: the position of a game on `quiz_sessions`, the players' attempts and answers, the roster, and the
// teams of a Team Relay. Every query the game makes is here; the rules stay in Engine.ts and Service.ts.
import type { AnswerValue, GamePhase, RelaySettings, SessionMode, SessionStatus } from "@examinus/contract";
import { and, desc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";
import { Database } from "../../platform/Database.ts";
import {
  answers,
  attempts,
  classMembers,
  quizSessions,
  quizzes,
  sessionStudents,
  sessionTeamGuesses,
  sessionTeamMembers,
  sessionTeamQuestions,
  sessionTeams,
  students,
  users,
} from "../../database/schemas/index.ts";
import { keepOwnPictures } from "../attempt/Repo.ts";
import { loadQuizDetail } from "../quiz/Repo.ts";
import { toSession } from "../session/mappers.ts";

// A change to one row of `session_team_questions`.
export type SlotUpdate = { teamId: string; questionId: string; set: Partial<typeof sessionTeamQuestions.$inferInsert> };

// The open session a join key opens, as the join flow needs it.
export type OpenGame = {
  id: string;
  title: string;
  mode: SessionMode;
  pacing: "teacher" | "student";
  status: SessionStatus;
  classId: string | null;
  allowGuests: boolean;
  lateJoinMinutes: number | null;
  startedAt: number | null;
};

// What a relay start writes for one team that plays.
export type RelayStartPlan = {
  teamId: string;
  members: string[];
  password: string;
  slots: { questionId: string; owner: string | null; shareIndex: number; piece: number | null; boardIndex: number }[];
};

const make = Effect.gen(function* () {
  const db = yield* Database;

  const head = Effect.fn("GameRepo.head")(function* (sessionId: string) {
    const [row] = yield* db.query((d) =>
      d
        .select({ session: quizSessions, quiz: quizzes })
        .from(quizSessions)
        .innerJoin(quizzes, eq(quizSessions.quizId, quizzes.id))
        .where(eq(quizSessions.id, sessionId)),
    );
    return row;
  });

  return {
    // --- Loading a room ---

    head,
    // The game session with its quiz, or undefined when there is none (or it isn't a game).
    roomHead: Effect.fn("GameRepo.roomHead")(function* (sessionId: string) {
      const found = yield* head(sessionId);
      if (!found || found.session.mode !== "game") return undefined;
      const detail = yield* db.query((d) => loadQuizDetail(d, found.quiz));
      return { ...found, detail };
    }),
    players: Effect.fn("GameRepo.players")(function* (sessionId: string) {
      return yield* db.query((d) =>
        d
          .select({ attempt: attempts, name: users.name, avatar: users.avatar })
          .from(attempts)
          .innerJoin(users, eq(attempts.studentId, users.id))
          .where(eq(attempts.sessionId, sessionId)),
      );
    }),
    // Every answer that earned game points.
    scored: Effect.fn("GameRepo.scored")(function* (sessionId: string) {
      return yield* db.query((d) =>
        d
          .select({
            attemptId: answers.attemptId,
            questionId: answers.questionId,
            correct: answers.correct,
            earned: answers.gamePointsEarned,
            tries: answers.tries,
            answeredAt: answers.answeredAt,
          })
          .from(answers)
          .innerJoin(attempts, eq(answers.attemptId, attempts.id))
          .where(and(eq(attempts.sessionId, sessionId), sql`${answers.gamePointsEarned} is not null`)),
      );
    }),
    removedPlayers: Effect.fn("GameRepo.removedPlayers")(function* (sessionId: string) {
      return yield* db.query((d) =>
        d
          .select({ userId: sessionStudents.studentId, name: users.name, avatar: users.avatar })
          .from(sessionStudents)
          .innerJoin(users, eq(sessionStudents.studentId, users.id))
          .where(and(eq(sessionStudents.sessionId, sessionId), isNotNull(sessionStudents.removedAt))),
      );
    }),
    // The answers to one question that earned game points.
    questionAnswers: Effect.fn("GameRepo.questionAnswers")(function* (sessionId: string, questionId: string) {
      return yield* db.query((d) =>
        d
          .select({ attemptId: answers.attemptId, value: answers.value, autoScore: answers.autoScore, earned: answers.gamePointsEarned, correct: answers.correct })
          .from(answers)
          .innerJoin(attempts, eq(answers.attemptId, attempts.id))
          .where(and(eq(attempts.sessionId, sessionId), eq(answers.questionId, questionId), sql`${answers.gamePointsEarned} is not null`)),
      );
    }),
    // The teams of a relay with their members, questions and guesses; null when it has no teams yet.
    teams: Effect.fn("GameRepo.teams")(function* (sessionId: string) {
      const teamRows = yield* db.query((d) =>
        d.select().from(sessionTeams).where(eq(sessionTeams.sessionId, sessionId)).orderBy(sessionTeams.position),
      );
      if (teamRows.length === 0) return null;
      const ids = teamRows.map((t) => t.id);
      const memberRows = yield* db.query((d) =>
        d.select().from(sessionTeamMembers).where(inArray(sessionTeamMembers.teamId, ids)).orderBy(sessionTeamMembers.joinedAt),
      );
      const slotRows = yield* db.query((d) => d.select().from(sessionTeamQuestions).where(inArray(sessionTeamQuestions.teamId, ids)));
      const guessRows = yield* db.query((d) =>
        d.select().from(sessionTeamGuesses).where(inArray(sessionTeamGuesses.teamId, ids)).orderBy(sessionTeamGuesses.createdAt),
      );
      return { teamRows, memberRows, slotRows, guessRows };
    }),
    // Game sessions that were running when the API stopped.
    openGameIds: Effect.fn("GameRepo.openGameIds")(function* () {
      return yield* db.query((d) =>
        d
          .select({ id: quizSessions.id })
          .from(quizSessions)
          .where(and(eq(quizSessions.mode, "game"), inArray(quizSessions.status, ["lobby", "running"]))),
      );
    }),
    sessionStatus: Effect.fn("GameRepo.sessionStatus")(function* (sessionId: string) {
      const [row] = yield* db.query((d) => d.select({ status: quizSessions.status }).from(quizSessions).where(eq(quizSessions.id, sessionId)));
      return row?.status;
    }),

    // --- Joining ---

    // Whether the student is on the session's roster, was removed from it by the teacher, or isn't on it.
    rosterState: Effect.fn("GameRepo.rosterState")(function* (sessionId: string, userId: string) {
      const [row] = yield* db.query((d) =>
        d
          .select({ removedAt: sessionStudents.removedAt })
          .from(sessionStudents)
          .where(and(eq(sessionStudents.sessionId, sessionId), eq(sessionStudents.studentId, userId))),
      );
      return (row === undefined ? "none" : row.removedAt === null ? "on" : "removed") as "on" | "removed" | "none";
    }),
    // The open session a join key opens (the newest), or undefined.
    openByKey: Effect.fn("GameRepo.openByKey")(function* (key: string) {
      const rows = yield* db.query((d) =>
        d
          .select({ session: quizSessions, title: quizzes.title })
          .from(quizSessions)
          .innerJoin(quizzes, eq(quizSessions.quizId, quizzes.id))
          .where(and(eq(quizSessions.joinCode, key), ne(quizSessions.status, "ended")))
          .orderBy(desc(quizSessions.createdAt)),
      );
      const found = rows
        .map((r) => ({ ...r, status: toSession(r.session, Date.now()).status }))
        .find((r) => r.status !== "ended");
      if (!found) return undefined;
      const { session } = found;
      return {
        id: session.id,
        title: found.title,
        mode: session.mode,
        pacing: session.pacing,
        status: found.status,
        classId: session.classId,
        allowGuests: session.allowGuests,
        lateJoinMinutes: session.lateJoinMinutes,
        startedAt: session.startedAt?.getTime() ?? null,
      } satisfies OpenGame;
    }),
    // The student's roster entry (the account's `students` row), which a student gets when first joining a class.
    rosterEntry: Effect.fn("GameRepo.rosterEntry")(function* (userId: string) {
      const [row] = yield* db.query((d) => d.select({ id: students.id }).from(students).where(eq(students.userId, userId)));
      return row;
    }),
    isClassMember: Effect.fn("GameRepo.isClassMember")(function* (classId: string, rosterId: string) {
      const [row] = yield* db.query((d) =>
        d
          .select({ studentId: classMembers.studentId })
          .from(classMembers)
          .where(and(eq(classMembers.classId, classId), eq(classMembers.studentId, rosterId))),
      );
      return row !== undefined;
    }),
    addToRoster: Effect.fn("GameRepo.addToRoster")(function* (sessionId: string, userId: string) {
      yield* db.query((d) => d.insert(sessionStudents).values({ sessionId, studentId: userId }).onConflictDoNothing());
    }),
    profile: Effect.fn("GameRepo.profile")(function* (userId: string) {
      const [row] = yield* db.query((d) => d.select({ name: users.name, avatar: users.avatar }).from(users).where(eq(users.id, userId)));
      return row;
    }),
    // The player's attempt: `created` when this call made it (a second request for the same student gets the row).
    ensureAttempt: Effect.fn("GameRepo.ensureAttempt")(function* (sessionId: string, userId: string, seed: number | null) {
      const [created] = yield* db.query((d) =>
        d
          .insert(attempts)
          .values({ sessionId, studentId: userId, attemptNumber: 1, ...(seed !== null ? { seed } : {}) })
          .onConflictDoNothing()
          .returning(),
      );
      const attempt =
        created ??
        (yield* db.query((d) => d.select().from(attempts).where(and(eq(attempts.sessionId, sessionId), eq(attempts.studentId, userId)))))[0]!;
      return { attempt, created: created !== undefined };
    }),
    deleteAttempt: Effect.fn("GameRepo.deleteAttempt")(function* (attemptId: string) {
      yield* db.query((d) => d.delete(attempts).where(eq(attempts.id, attemptId)));
    }),
    // Out of the game: no seat, and no way to join again with the key until the teacher allows it (the roster row
    // stays, marked removed). A relay's question rows change in the same transaction.
    removePlayer: Effect.fn("GameRepo.removePlayer")(function* (sessionId: string, attemptId: string, userId: string, updates: SlotUpdate[]) {
      yield* db.query((d) =>
        d.transaction(async (tx) => {
          for (const u of updates)
            await tx
              .update(sessionTeamQuestions)
              .set(u.set)
              .where(and(eq(sessionTeamQuestions.teamId, u.teamId), eq(sessionTeamQuestions.questionId, u.questionId)));
          await tx.delete(attempts).where(eq(attempts.id, attemptId));
          await tx
            .update(sessionStudents)
            .set({ removedAt: new Date() })
            .where(and(eq(sessionStudents.sessionId, sessionId), eq(sessionStudents.studentId, userId)));
        }),
      );
    }),
    allowRejoin: Effect.fn("GameRepo.allowRejoin")(function* (sessionId: string, userId: string) {
      yield* db.query((d) =>
        d
          .update(sessionStudents)
          .set({ removedAt: null })
          .where(and(eq(sessionStudents.sessionId, sessionId), eq(sessionStudents.studentId, userId))),
      );
    }),

    // --- The game's flow ---

    // The quiz of a game, as a quiz detail; undefined when there is no such quiz.
    quizDetail: Effect.fn("GameRepo.quizDetail")(function* (quizId: string) {
      const [quiz] = yield* db.query((d) => d.select().from(quizzes).where(eq(quizzes.id, quizId)));
      if (!quiz) return undefined;
      return yield* db.query((d) => loadQuizDetail(d, quiz));
    }),
    setLobby: Effect.fn("GameRepo.setLobby")(function* (sessionId: string) {
      yield* db.query((d) => d.update(quizSessions).set({ status: "lobby" }).where(eq(quizSessions.id, sessionId)));
    }),
    setRunning: Effect.fn("GameRepo.setRunning")(function* (sessionId: string, now: Date) {
      yield* db.query((d) => d.update(quizSessions).set({ status: "running", startedAt: now, opensAt: now }).where(eq(quizSessions.id, sessionId)));
    }),
    persistPosition: Effect.fn("GameRepo.persistPosition")(function* (
      sessionId: string,
      position: { phase: GamePhase | null; index: number; questionStartedAt: number | null; pausedAt: number | null },
    ) {
      yield* db.query((d) =>
        d
          .update(quizSessions)
          .set({
            gamePhase: position.phase,
            currentQuestionIndex: position.index,
            questionStartedAt: position.questionStartedAt === null ? null : new Date(position.questionStartedAt),
            pausedAt: position.pausedAt === null ? null : new Date(position.pausedAt),
          })
          .where(eq(quizSessions.id, sessionId)),
      );
    }),
    resetStreaks: Effect.fn("GameRepo.resetStreaks")(function* (attemptIds: string[]) {
      yield* db.query((d) => d.update(attempts).set({ gameStreak: 0 }).where(inArray(attempts.id, attemptIds)));
    }),
    markEnded: Effect.fn("GameRepo.markEnded")(function* (sessionId: string, endedAt: number) {
      yield* db.query((d) =>
        d
          .update(quizSessions)
          .set({ status: "ended", endedAt: new Date(endedAt), gamePhase: "ended", pausedAt: null })
          .where(eq(quizSessions.id, sessionId)),
      );
    }),
    // The attempts of a game still open.
    openAttempts: Effect.fn("GameRepo.openAttempts")(function* (sessionId: string) {
      return yield* db.query((d) =>
        d
          .select({ id: attempts.id })
          .from(attempts)
          .where(and(eq(attempts.sessionId, sessionId), eq(attempts.status, "in_progress"))),
      );
    }),
    // A drawing answer keeps only the pictures the student uploaded and confirmed themselves.
    ownPictures: Effect.fn("GameRepo.ownPictures")(function* (userId: string, value: AnswerValue) {
      return yield* db.query((d) => keepOwnPictures(d, userId, value));
    }),
    // The live answer is the one scored: it replaces any row already there. The player's points and streak go
    // with it.
    storeAnswer: Effect.fn("GameRepo.storeAnswer")(function* (
      attemptId: string,
      questionId: string,
      row: { value: AnswerValue | null; correct: boolean | null; autoScore: number | null; timeMs: number | null; gamePointsEarned: number },
      points: number,
      streak: number,
    ) {
      yield* db.query(async (d) => {
        await d
          .insert(answers)
          .values({ attemptId, questionId, ...row })
          .onConflictDoUpdate({ target: [answers.attemptId, answers.questionId], set: { ...row, answeredAt: new Date() } });
        await d.update(attempts).set({ points, gameStreak: streak }).where(eq(attempts.id, attemptId));
      });
    }),
    // A student-paced player moved to a question.
    setQuestion: Effect.fn("GameRepo.setQuestion")(function* (attemptId: string, index: number, startedAt: number) {
      yield* db.query((d) =>
        d.update(attempts).set({ questionIndex: index, questionStartedAt: new Date(startedAt) }).where(eq(attempts.id, attemptId)),
      );
    }),
    setSeconds: Effect.fn("GameRepo.setSeconds")(function* (sessionId: string, seconds: number) {
      yield* db.query((d) => d.update(quizSessions).set({ gameQuestionSeconds: seconds }).where(eq(quizSessions.id, sessionId)));
    }),
    // The settings of a session a running game reads.
    settings: Effect.fn("GameRepo.settings")(function* (sessionId: string) {
      const [row] = yield* db.query((d) =>
        d
          .select({
            seconds: quizSessions.gameQuestionSeconds,
            leaderboard: quizSessions.gameLeaderboard,
            streakBonus: quizSessions.gameStreakBonus,
            lateJoinMinutes: quizSessions.lateJoinMinutes,
            relay: quizSessions.relay,
            relayPassword: quizSessions.relayPassword,
            relayClues: quizSessions.relayClues,
          })
          .from(quizSessions)
          .where(eq(quizSessions.id, sessionId)),
      );
      return row;
    }),

    // --- Team Relay ---

    insertTeams: Effect.fn("GameRepo.insertTeams")(function* (rows: { sessionId: string; name: string; position: number }[]) {
      return yield* db.query((d) => d.insert(sessionTeams).values(rows).returning());
    }),
    deleteTeams: Effect.fn("GameRepo.deleteTeams")(function* (sessionId: string) {
      yield* db.query((d) => d.delete(sessionTeams).where(eq(sessionTeams.sessionId, sessionId)));
    }),
    deleteTeam: Effect.fn("GameRepo.deleteTeam")(function* (teamId: string) {
      yield* db.query((d) => d.delete(sessionTeams).where(eq(sessionTeams.id, teamId)));
    }),
    // Writes the teams of the given players (`rows`: those of them that have one).
    saveMembers: Effect.fn("GameRepo.saveMembers")(function* (attemptIds: string[], rows: { attemptId: string; teamId: string }[]) {
      yield* db.query((d) =>
        d.transaction(async (tx) => {
          if (attemptIds.length === 0) return;
          await tx.delete(sessionTeamMembers).where(inArray(sessionTeamMembers.attemptId, attemptIds));
          if (rows.length > 0) await tx.insert(sessionTeamMembers).values(rows);
        }),
      );
    }),
    setRelay: Effect.fn("GameRepo.setRelay")(function* (sessionId: string, relay: RelaySettings) {
      yield* db.query((d) => d.update(quizSessions).set({ relay }).where(eq(quizSessions.id, sessionId)));
    }),
    // Starts a relay: teams without players go, the others get their members, passwords and questions.
    startRelay: Effect.fn("GameRepo.startRelay")(function* (sessionId: string, now: Date, empty: string[], plans: RelayStartPlan[]) {
      yield* db.query((d) =>
        d.transaction(async (tx) => {
          if (empty.length > 0) await tx.delete(sessionTeams).where(inArray(sessionTeams.id, empty));
          const everyone = plans.flatMap((plan) => plan.members);
          await tx.delete(sessionTeamMembers).where(inArray(sessionTeamMembers.attemptId, everyone));
          await tx
            .insert(sessionTeamMembers)
            .values(plans.flatMap((plan) => plan.members.map((attemptId) => ({ attemptId, teamId: plan.teamId }))));
          for (const plan of plans) {
            await tx.update(sessionTeams).set({ password: plan.password }).where(eq(sessionTeams.id, plan.teamId));
            await tx.insert(sessionTeamQuestions).values(
              plan.slots.map((s) => ({
                teamId: plan.teamId,
                questionId: s.questionId,
                ownerAttemptId: s.owner,
                shareIndex: s.shareIndex,
                piece: s.piece,
                boardIndex: s.boardIndex,
              })),
            );
          }
          await tx.update(quizSessions).set({ status: "running", startedAt: now, opensAt: now }).where(eq(quizSessions.id, sessionId));
        }),
      );
    }),
    // A late player takes a seat in a team, and the team's questions are dealt again.
    joinTeam: Effect.fn("GameRepo.joinTeam")(function* (attemptId: string, teamId: string, updates: SlotUpdate[]) {
      yield* db.query((d) =>
        d.transaction(async (tx) => {
          await tx.insert(sessionTeamMembers).values({ attemptId, teamId }).onConflictDoNothing();
          for (const u of updates)
            await tx
              .update(sessionTeamQuestions)
              .set(u.set)
              .where(and(eq(sessionTeamQuestions.teamId, u.teamId), eq(sessionTeamQuestions.questionId, u.questionId)));
        }),
      );
    }),
    // Another try: the answer's retry count and the player's points and clock.
    retry: Effect.fn("GameRepo.retry")(function* (attemptId: string, questionId: string, tries: number, points: number, startedAt: number) {
      yield* db.query(async (d) => {
        await d
          .update(answers)
          .set({ tries })
          .where(and(eq(answers.attemptId, attemptId), eq(answers.questionId, questionId)));
        await d.update(attempts).set({ points, questionStartedAt: new Date(startedAt) }).where(eq(attempts.id, attemptId));
      });
    }),
    claimRescue: Effect.fn("GameRepo.claimRescue")(function* (teamId: string, questionId: string, rescuer: string, claimedAt: number) {
      yield* db.query((d) =>
        d
          .update(sessionTeamQuestions)
          .set({ rescuerAttemptId: rescuer, rescueClaimedAt: new Date(claimedAt) })
          .where(and(eq(sessionTeamQuestions.teamId, teamId), eq(sessionTeamQuestions.questionId, questionId))),
      );
    }),
    // The rescue's answer, and the points it earned the rescuer.
    scoreRescue: Effect.fn("GameRepo.scoreRescue")(function* (
      teamId: string,
      questionId: string,
      attemptId: string,
      value: AnswerValue,
      correct: boolean,
      rescuePoints: number,
      playerPoints: number,
    ) {
      yield* db.query(async (d) => {
        await d
          .update(sessionTeamQuestions)
          .set({ rescueValue: value, rescueCorrect: correct, rescuePoints })
          .where(and(eq(sessionTeamQuestions.teamId, teamId), eq(sessionTeamQuestions.questionId, questionId)));
        await d.update(attempts).set({ points: playerPoints }).where(eq(attempts.id, attemptId));
      });
    }),
    rescueTimedOut: Effect.fn("GameRepo.rescueTimedOut")(function* (teamId: string, questionId: string) {
      yield* db.query((d) =>
        d
          .update(sessionTeamQuestions)
          .set({ rescueCorrect: false })
          .where(and(eq(sessionTeamQuestions.teamId, teamId), eq(sessionTeamQuestions.questionId, questionId))),
      );
    }),
    saveGuess: Effect.fn("GameRepo.saveGuess")(function* (
      teamId: string,
      attemptId: string,
      guess: string,
      correct: boolean,
      outcome: { solvedAt: number } | { wrongGuesses: number },
    ) {
      yield* db.query(async (d) => {
        await d.insert(sessionTeamGuesses).values({ teamId, attemptId, guess, correct });
        await d
          .update(sessionTeams)
          .set("solvedAt" in outcome ? { solvedAt: new Date(outcome.solvedAt) } : { wrongGuesses: outcome.wrongGuesses })
          .where(eq(sessionTeams.id, teamId));
      });
    }),
    // What a team's members answered, for the debrief.
    debriefRows: Effect.fn("GameRepo.debriefRows")(function* (attemptIds: string[]) {
      return yield* db.query((d) =>
        d
          .select({ attemptId: answers.attemptId, questionId: answers.questionId, value: answers.value, correct: answers.correct, tries: answers.tries })
          .from(answers)
          .where(and(inArray(answers.attemptId, attemptIds), sql`${answers.gamePointsEarned} is not null`)),
      );
    }),

    // --- Results ---

    standingRows: Effect.fn("GameRepo.standingRows")(function* (sessionId: string) {
      return yield* db.query((d) =>
        d
          .select({ attempt: attempts, name: users.name, avatar: users.avatar, studentId: students.id })
          .from(attempts)
          .innerJoin(users, eq(attempts.studentId, users.id))
          .leftJoin(students, eq(students.userId, attempts.studentId))
          .where(eq(attempts.sessionId, sessionId)),
      );
    }),
    answerStats: Effect.fn("GameRepo.answerStats")(function* (sessionId: string) {
      return yield* db.query((d) =>
        d
          .select({
            attemptId: answers.attemptId,
            correct: sql<number>`count(*) filter (where ${answers.correct} is true)::int`,
            answered: sql<number>`count(${answers.timeMs})::int`,
            averageMs: sql<number | null>`round(avg(${answers.timeMs}))::int`,
          })
          .from(answers)
          .innerJoin(attempts, eq(answers.attemptId, attempts.id))
          .where(eq(attempts.sessionId, sessionId))
          .groupBy(answers.attemptId),
      );
    }),
    // The questions most often answered wrong (a timeout counts as wrong).
    misses: Effect.fn("GameRepo.misses")(function* (sessionId: string) {
      return yield* db.query((d) =>
        d
          .select({
            questionId: answers.questionId,
            wrong: sql<number>`count(*) filter (where ${answers.correct} is not true)::int`,
            answered: sql<number>`count(*)::int`,
          })
          .from(answers)
          .innerJoin(attempts, eq(answers.attemptId, attempts.id))
          .where(and(eq(attempts.sessionId, sessionId), sql`${answers.gamePointsEarned} is not null`))
          .groupBy(answers.questionId),
      );
    }),
    // What the players answered to one question (the teacher's gallery of pictures and texts).
    gallery: Effect.fn("GameRepo.gallery")(function* (sessionId: string, questionId: string) {
      return yield* db.query((d) =>
        d
          .select({ attemptId: answers.attemptId, value: answers.value, name: users.name })
          .from(answers)
          .innerJoin(attempts, eq(answers.attemptId, attempts.id))
          .innerJoin(users, eq(attempts.studentId, users.id))
          .where(and(eq(attempts.sessionId, sessionId), eq(answers.questionId, questionId), sql`${answers.value} is not null`)),
      );
    }),
  };
});

// The rows of a relay's teams, as `GameRepo.teams` reads them.
export type TeamRows = NonNullable<Effect.Success<ReturnType<Effect.Success<typeof make>["teams"]>>>;

export class GameRepo extends Context.Service<GameRepo, Effect.Success<typeof make>>()("examinus/api/GameRepo") {
  static readonly layer = Layer.effect(GameRepo, make);
}

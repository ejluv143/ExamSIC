// Session rows as the contract's Session.
import type { Session } from "@examinus/domain/quiz";
import { quizTotals } from "@examinus/domain/shuffle";
import type { QuizItem, QuizSessionItem } from "../../database/schemas/index.ts";
import { sessionStatus } from "./rules.ts";

const isoOrNull = (date: Date | null) => (date ? date.toISOString() : null);

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
    game:
      r.mode === "game"
        ? { questionSeconds: r.gameQuestionSeconds, showLeaderboard: r.gameLeaderboard, streakBonus: r.gameStreakBonus, relay: r.relay }
        : null,
    countInRecord: r.countInRecord,
    joinCode: r.joinCode,
    oneQuestionAtATime: r.oneQuestionAtATime,
    questionTimeLimitSeconds: r.questionTimeLimitSeconds,
    navigation: r.navigation,
    maxMarked: r.maxMarked,
    lateJoinMinutes: r.lateJoinMinutes,
    roomPasswordRequired: r.roomPassword !== null,
    exitPasswordRequired: r.exitPassword !== null,
    ipRestricted: r.ipAllowlist.length > 0,
    allowGuests: r.allowGuests,
    startedAt: isoOrNull(r.startedAt ?? (status === "running" ? r.opensAt : null)),
    endedAt: isoOrNull(r.endedAt ?? (status === "ended" ? r.closesAt : null)),
    pausedAt: isoOrNull(r.pausedAt),
  };
}

// What a session looks like as a row of a class record, for the teacher's table of a class and a student's own list
// alike (they differ only in when a score is shown). `session` is the session as `toSession` reads it, for the
// fields only one of them needs.
export function toRecordSession(
  row: QuizSessionItem,
  quiz: Pick<QuizItem, "id" | "title" | "header">,
  parts: Parameters<typeof quizTotals>[0],
  now: number,
) {
  const session = toSession(row, now);
  return {
    session,
    record: {
      sessionId: row.id,
      quizId: quiz.id,
      title: quiz.title,
      mode: row.mode,
      period: quiz.header.period,
      maxScore: quizTotals(parts).totalPoints,
      opensAt: session.opensAt,
      closesAt: session.closesAt,
      countInRecord: row.countInRecord,
    },
  };
}

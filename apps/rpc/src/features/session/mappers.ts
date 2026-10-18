// Session rows as the contract's Session.
import type { Session } from "@examinus/domain/quiz";
import type { QuizSessionItem } from "../../database/schemas/index.ts";
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

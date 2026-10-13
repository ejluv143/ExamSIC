// Validating a session's schedule and settings, and turning them into column values.
import { Conflict } from "@examinus/contract/errors";
import { type SessionSettingsFields } from "@examinus/contract/session";
import { Effect } from "effect";
import { invalidAllowlistEntry } from "../../platform/network.ts";
import { examColumn, examSettingsProblem } from "../exam/rules.ts";
import { gameColumns, gameSettingsProblem } from "../game/rules.ts";

// Validates the schedule and limits and returns them as column values.
export const settingsColumns = Effect.fn("settingsColumns")(function* (s: SessionSettingsFields) {
  const opensAt = s.opensAt === null ? null : new Date(s.opensAt);
  const closesAt = s.closesAt === null ? null : new Date(s.closesAt);
  if ((opensAt && Number.isNaN(opensAt.getTime())) || (closesAt && Number.isNaN(closesAt.getTime())))
    return yield* new Conflict({ message: "The open and close times aren't valid dates." });
  if (opensAt && closesAt && closesAt <= opensAt) return yield* new Conflict({ message: "The session must close after it opens." });
  if (s.timeLimitMinutes !== null && s.timeLimitMinutes < 1) return yield* new Conflict({ message: "The time limit must be at least a minute." });
  if (s.attemptsAllowed !== null && s.attemptsAllowed < 1) return yield* new Conflict({ message: "Students need at least one attempt." });
  if (s.questionTimeLimitSeconds !== null && !s.oneQuestionAtATime)
    return yield* new Conflict({ message: "A time limit per question needs one question at a time." });
  if (s.questionTimeLimitSeconds !== null && s.questionTimeLimitSeconds < 5)
    return yield* new Conflict({ message: "Give each question at least 5 seconds." });
  if (s.navigation !== "free" && !s.oneQuestionAtATime)
    return yield* new Conflict({ message: "Limits on going back need one question at a time; a paper on one page is always free to move around." });
  if (s.maxMarked !== null && (!Number.isInteger(s.maxMarked) || s.maxMarked < 0 || s.maxMarked > 500))
    return yield* new Conflict({ message: "The number of questions a student may mark for review must be 0 to 500." });
  if (s.mode === "mastery" && s.mastery === null) return yield* new Conflict({ message: "Choose the mastery settings." });
  const gameProblem = gameSettingsProblem(s.mode, s.pacing, s.game, s.relayPassword, s.relayClues);
  if (gameProblem !== null) return yield* new Conflict({ message: gameProblem });
  const examProblem = examSettingsProblem(s.mode, s.integrity);
  if (examProblem !== null) return yield* new Conflict({ message: examProblem });
  if (s.lateJoinMinutes !== null && s.lateJoinMinutes < 1) return yield* new Conflict({ message: "The late-join cutoff must be at least a minute." });
  const password = (s.roomPassword ?? "").trim();
  if (password.length > 64) return yield* new Conflict({ message: "The room password is too long." });
  const badNetwork = invalidAllowlistEntry(s.ipAllowlist.filter((e) => e.trim() !== ""));
  if (badNetwork !== null) return yield* new Conflict({ message: `"${badNetwork}" isn't an IP address or range like 10.0.4.0/24.` });
  if (s.allowGuests && s.mode !== "game") return yield* new Conflict({ message: "Only games can let guests in." });
  return {
    mode: s.mode,
    opensAt,
    closesAt,
    timeLimitMinutes: s.timeLimitMinutes,
    attemptsAllowed: s.attemptsAllowed,
    resultsRelease: s.resultsRelease,
    integrity: s.integrity,
    mastery: s.mode === "mastery" ? s.mastery : null,
    exam: examColumn(s.mode, s.exam),
    countInRecord: s.countInRecord,
    oneQuestionAtATime: s.oneQuestionAtATime,
    questionTimeLimitSeconds: s.questionTimeLimitSeconds,
    navigation: s.navigation,
    maxMarked: s.maxMarked,
    lateJoinMinutes: s.lateJoinMinutes,
    roomPassword: password === "" ? null : password,
    ipAllowlist: s.ipAllowlist.map((e) => e.trim()).filter(Boolean),
    allowGuests: s.allowGuests,
    ...gameColumns(s.mode, s.pacing, s.game, s.relayPassword, s.relayClues),
  };
});

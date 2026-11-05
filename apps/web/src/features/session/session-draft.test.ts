import { fromLocalInput, shiftLocal, toLocalInput } from "@examinus/copy/time";
import { describe, expect, test } from "bun:test";
import { examLockedSettings } from "@examinus/domain/exam";
import { defaultIntegrity } from "@examinus/domain/integrity";
import type { Session } from "@examinus/domain/quiz";
import {
  applyStarter,
  changeAllowedClients,
  changeLockExit,
  changeMode,
  changeOneAtATime,
  changeStartWhen,
  firstProblemArea,
  manilaAt,
  newDraft,
  originOf,
  toInput,
  validate,
  type SessionDraft,
} from "./session-draft";

const password = () => "SECRET";
const now = Date.parse("2026-11-05T00:00:00Z");

// A draft that passes every check, to change one thing at a time.
const draftOf = (patch: Partial<SessionDraft> = {}): SessionDraft => ({ ...newDraft({}, password), ...patch });
const examDraft = (patch: Partial<SessionDraft> = {}): SessionDraft =>
  draftOf({ ...changeMode(newDraft({}, password), "exam", undefined, password), closes: "2026-11-06T11:00", ...patch });

function sessionOf(patch: Partial<Session> = {}): Session {
  return {
    id: "s1",
    quizId: "q1",
    classId: null,
    mode: "quiz",
    pacing: "student",
    status: "scheduled",
    opensAt: "2026-11-06T01:00:00.000Z",
    closesAt: "2026-11-06T03:00:00.000Z",
    timeLimitMinutes: 45,
    attemptsAllowed: 7,
    resultsRelease: "after_close",
    resultsReleased: false,
    oneQuestionAtATime: true,
    questionTimeLimitSeconds: 30,
    navigation: "forward_only",
    maxMarked: 9,
    lateJoinMinutes: 10,
    roomPasswordRequired: false,
    exitPasswordRequired: false,
    ipRestricted: false,
    allowGuests: false,
    integrity: defaultIntegrity("quiz"),
    mastery: null,
    exam: null,
    game: null,
    countInRecord: true,
    joinCode: "ABCDEF",
    startedAt: null,
    endedAt: null,
    pausedAt: null,
    ...patch,
  };
}

describe("Manila wall time", () => {
  test("a datetime-local value round-trips through the stored instant", () => {
    const iso = fromLocalInput("2026-11-06T09:30")!;
    expect(iso).toBe("2026-11-06T09:30:00+08:00");
    expect(toLocalInput(iso)).toBe("2026-11-06T09:30");
    expect(toLocalInput("2026-11-06T01:30:00.000Z")).toBe("2026-11-06T09:30");
  });

  test("empty means no time", () => {
    expect(fromLocalInput("")).toBeNull();
    expect(toLocalInput(null)).toBe("");
  });

  test("manilaAt counts days in Manila time, across the date line of UTC", () => {
    // 00:00 UTC is already 08:00 in Manila.
    expect(manilaAt(0, undefined, now)).toBe("2026-11-05T08:00");
    expect(manilaAt(1, "09:00", now)).toBe("2026-11-06T09:00");
    // 17:00 UTC is already the next day in Manila.
    expect(manilaAt(0, "23:59", Date.parse("2026-11-05T17:00:00Z"))).toBe("2026-11-06T23:59");
  });

  test("shiftLocal moves across midnight", () => {
    expect(shiftLocal("2026-11-05T23:30", 60)).toBe("2026-11-06T00:30");
    expect(shiftLocal("2026-11-05T10:00", 7 * 24 * 60)).toBe("2026-11-12T10:00");
  });
});

describe("presets", () => {
  test("a new session starts as a quiz that opens now with one try", () => {
    const d = newDraft({ defaultClassId: "c1" }, password);
    expect(d).toMatchObject({ classId: "c1", mode: "quiz", startWhen: "now", attempts: "1", release: "immediately", timeLimit: "", password: "" });
  });

  test("picking exam applies the exam's usual settings, and quiz takes them back", () => {
    const exam = changeMode(newDraft({}, password), "exam", undefined, password);
    expect(exam).toMatchObject({
      mode: "exam",
      timeLimit: "60",
      release: "manual",
      lateJoin: "15",
      password: "SECRET",
      navigation: "marked_only",
      marked: "5",
    });
    expect(exam.integrity).toEqual(defaultIntegrity("exam"));
    const quiz = changeMode(exam, "quiz", undefined, password);
    expect(quiz).toMatchObject({ mode: "quiz", timeLimit: "", release: "immediately", lateJoin: "", password: "", navigation: "free", marked: "unlimited" });
    expect(quiz.integrity).toEqual(defaultIntegrity("quiz"));
  });

  test("switching the mode keeps what is not part of a preset", () => {
    const typed = { ...draftOf(), closes: "2026-11-09T10:00", customAttempts: "6" };
    expect(changeMode(typed, "game", undefined, password)).toMatchObject({ closes: "2026-11-09T10:00", customAttempts: "6" });
  });

  test("an existing session only changes its mode", () => {
    const origin = originOf(sessionOf());
    const next = changeMode(origin.seed, "exam", origin, password);
    expect(next).toEqual({ ...origin.seed, mode: "exam" });
  });

  test("starters pick the type and the schedule", () => {
    const exam = applyStarter(newDraft({}, password), "exam", now, password);
    expect(exam).toMatchObject({ mode: "exam", startWhen: "schedule", opens: "2026-11-06T09:00", closes: "2026-11-06T11:00", password: "SECRET" });
    const homework = applyStarter(exam, "homework", now, password);
    expect(homework).toMatchObject({
      mode: "quiz",
      startWhen: "now",
      opens: "",
      closes: "2026-11-12T23:59",
      attempts: "2",
      release: "after_close",
      password: "",
    });
    expect(applyStarter(homework, "pop", now, password)).toMatchObject({ closes: "", attempts: "1", release: "immediately" });
  });

  test("choosing Later fills a time only when there is none", () => {
    expect(changeStartWhen(draftOf(), "schedule", now).opens).toBe("2026-11-06T09:00");
    expect(changeStartWhen(draftOf({ opens: "2026-12-01T08:00" }), "schedule", now).opens).toBe("2026-12-01T08:00");
    expect(changeStartWhen(draftOf(), "now", now).opens).toBe("");
  });

  test("turning one question at a time off drops the clock per question", () => {
    expect(changeOneAtATime(draftOf({ oneAtATime: true, questionSeconds: "30" }), false)).toMatchObject({ oneAtATime: false, questionSeconds: "" });
    expect(changeOneAtATime(draftOf({ questionSeconds: "30" }), true).questionSeconds).toBe("30");
  });

  test("the exit password is made when turned on without one, and kept otherwise", () => {
    expect(changeLockExit(draftOf(), true, password)).toMatchObject({ lockExit: true, exitPassword: "SECRET" });
    expect(changeLockExit(draftOf({ exitPassword: "mine" }), true, password).exitPassword).toBe("mine");
  });

  test("all clients allowed is stored as no list", () => {
    const some = changeAllowedClients(draftOf(), ["web"]);
    expect(some.integrity.allowedClients).toEqual(["web"]);
    expect("allowedClients" in changeAllowedClients(some, ["web", "desktop", "mobile"]).integrity).toBe(false);
  });
});

describe("seeding from a session", () => {
  test("every setting comes from the session, chips from their numbers", () => {
    const { seed } = originOf(sessionOf({ maxMarked: null }), { roomPassword: "pw", ipAllowlist: ["10.0.0.0/24"], exitPassword: "bye" });
    expect(seed).toMatchObject({
      mode: "quiz",
      startWhen: "schedule",
      opens: "2026-11-06T09:00",
      closes: "2026-11-06T11:00",
      timeLimit: "45",
      attempts: "custom",
      customAttempts: "7",
      marked: "unlimited",
      navigation: "forward_only",
      questionSeconds: "30",
      lateJoin: "10",
      password: "pw",
      allowlist: "10.0.0.0/24",
      limitNetworks: true,
      exitPassword: "bye",
      lockExit: true,
    });
  });

  test("a session with no open time waits for the teacher, and keeps no navigation while one page", () => {
    const { seed } = originOf(sessionOf({ opensAt: null, oneQuestionAtATime: false, navigation: "free", mode: "exam" }));
    expect(seed).toMatchObject({ startWhen: "manual", navigation: "marked_only" });
  });
});

describe("the payload", () => {
  test("a new quiz's settings", () => {
    expect(toInput(draftOf({ closes: "2026-11-06T11:00" }))).toMatchObject({
      classId: null,
      mode: "quiz",
      exam: null,
      opensAt: null,
      closesAt: "2026-11-06T11:00:00+08:00",
      timeLimitMinutes: null,
      attemptsAllowed: 1,
      pacing: "student",
      navigation: "free",
      maxMarked: null,
      roomPassword: null,
      exitPassword: null,
      ipAllowlist: [],
    });
  });

  test("a scheduled session sends the open time in Manila time", () => {
    const input = toInput(draftOf({ startWhen: "schedule", opens: "2026-11-06T09:00" }));
    expect(input.opensAt).toBe("2026-11-06T09:00:00+08:00");
  });

  test("an exam always has its locked rules on, and keeps the stricter ones it was given", () => {
    const loose = { ...defaultIntegrity("quiz"), autoSubmitAfter: 2 };
    const input = toInput(examDraft({ integrity: loose }));
    for (const [key] of examLockedSettings) expect(input.integrity[key]).toBe(true);
    expect(input.integrity.autoSubmitAfter).toBe(2);
    expect(input.exam).toEqual({ computersOnly: true, honorPledge: expect.any(String), deviceGraceMinutes: 5, allowMobile: false });
  });

  test("outside exams the integrity is kept, and paste in code needs paste blocked", () => {
    const integrity = { ...defaultIntegrity("quiz"), blockCopy: true, allowPasteInCode: true };
    expect(toInput(draftOf({ integrity })).integrity).toEqual({ ...integrity, allowPasteInCode: false });
    expect(toInput(draftOf({ integrity: { ...integrity, blockPaste: true } })).integrity.allowPasteInCode).toBe(true);
  });

  test("navigation and marks only apply to papers with one question at a time", () => {
    const paged = draftOf({ navigation: "forward_only", marked: "3", oneAtATime: false });
    expect(toInput(paged)).toMatchObject({ navigation: "free", maxMarked: 3 });
    expect(toInput({ ...paged, oneAtATime: true })).toMatchObject({ navigation: "forward_only", questionTimeLimitSeconds: null });
    expect(toInput(draftOf({ oneAtATime: true, questionSeconds: "20" })).questionTimeLimitSeconds).toBe(20);
    const game = changeMode(paged, "game", undefined, password);
    expect(toInput({ ...game, oneAtATime: true })).toMatchObject({ navigation: "free", maxMarked: 0 });
  });

  test("guests only for modes that allow them and without a class", () => {
    expect(toInput(draftOf({ allowGuests: true })).allowGuests).toBe(true);
    expect(toInput(draftOf({ allowGuests: true, classId: "c1" })).allowGuests).toBe(false);
    expect(toInput(draftOf({ allowGuests: true, mode: "mastery" })).allowGuests).toBe(false);
    expect(toInput(draftOf({ allowGuests: true, mode: "exam" })).allowGuests).toBe(true);
  });

  test("the class record only counts for a session of a class", () => {
    expect(toInput(draftOf({ countInRecord: true })).countInRecord).toBe(false);
    expect(toInput(draftOf({ countInRecord: true, classId: "c1" })).countInRecord).toBe(true);
    expect(toInput(draftOf({ countInRecord: false, classId: "c1" })).countInRecord).toBe(false);
  });

  test("passwords and addresses are trimmed, and the exit password needs its switch", () => {
    const input = toInput(
      draftOf({ password: "  pw ", exitPassword: " x ", lockExit: false, limitNetworks: true, allowlist: "10.0.0.1\n\n  192.168.0.0/16 " }),
    );
    expect(input).toMatchObject({ roomPassword: "pw", exitPassword: null, ipAllowlist: ["10.0.0.1", "192.168.0.0/16"] });
    expect(toInput(draftOf({ exitPassword: " x ", lockExit: true })).exitPassword).toBe("x");
    expect(toInput(draftOf({ limitNetworks: false, allowlist: "10.0.0.1" })).ipAllowlist).toEqual([]);
  });

  test("mastery and game settings go with their own mode only", () => {
    const mastery = toInput(changeMode(draftOf(), "mastery", undefined, password));
    expect(mastery.mastery).toEqual({ retryLimit: 3, targetPercent: null, showCorrectAnswer: true });
    expect(mastery.game).toBeNull();
    const game = toInput(changeMode(draftOf(), "game", undefined, password));
    expect(game).toMatchObject({ mastery: null, pacing: "teacher", relayPassword: null, relayClues: [] });
    expect(game.game).toMatchObject({ questionSeconds: 20, relay: null });
  });

  test("the time limit is a whole number of at least a minute", () => {
    expect(toInput(draftOf({ timeLimit: "0.4" })).timeLimitMinutes).toBe(1);
    expect(toInput(draftOf({ timeLimit: "45.9" })).timeLimitMinutes).toBe(45);
  });

  test("attempts: chips, unlimited and custom", () => {
    expect(toInput(draftOf({ attempts: "unlimited" })).attemptsAllowed).toBeNull();
    expect(toInput(draftOf({ attempts: "3" })).attemptsAllowed).toBe(3);
    expect(toInput(draftOf({ attempts: "custom", customAttempts: "12" })).attemptsAllowed).toBe(12);
  });
});

describe("checking", () => {
  test("a fresh draft has no problems", () => {
    expect(validate(draftOf())).toEqual([]);
    expect(validate(examDraft())).toEqual([]);
  });

  test("schedule problems are for the basics", () => {
    expect(validate(draftOf({ startWhen: "schedule" }))).toEqual([{ area: "basics", text: "Set an open time, or choose to start now." }]);
    expect(validate(examDraft({ closes: "" }))).toEqual([{ area: "basics", text: "Exams need a close time." }]);
    expect(validate(draftOf({ startWhen: "schedule", opens: "2026-11-06T09:00", closes: "2026-11-06T09:00" }))).toEqual([
      { area: "basics", text: "Close time must be after open time." },
    ]);
  });

  test("custom attempts must be a whole number from 1", () => {
    for (const bad of ["0", "1.5", "", "x"]) {
      expect(validate(draftOf({ attempts: "custom", customAttempts: bad })).map((p) => p.area)).toEqual(["basics"]);
    }
    expect(validate(draftOf({ attempts: "custom", customAttempts: "2" }))).toEqual([]);
  });

  test("late join is at least a minute, as the server requires", () => {
    expect(validate(draftOf({ lateJoin: "0" })).map((p) => p.area)).toEqual(["access"]);
    expect(validate(draftOf({ lateJoin: "2.5" })).map((p) => p.area)).toEqual(["access"]);
    expect(validate(draftOf({ lateJoin: "1" }))).toEqual([]);
  });

  test("custom marks run from 1 to 500, and only for papers", () => {
    expect(validate(draftOf({ marked: "custom", customMarked: "0" })).map((p) => p.area)).toEqual(["rules"]);
    expect(validate(draftOf({ marked: "custom", customMarked: "501" })).map((p) => p.area)).toEqual(["rules"]);
    expect(validate(draftOf({ marked: "custom", customMarked: "500" }))).toEqual([]);
    expect(validate(draftOf({ mode: "game", marked: "custom", customMarked: "0" }))).toEqual([]);
  });

  test("time per question is at least 5 seconds, shown where the pacing is set", () => {
    const quiz = validate(draftOf({ oneAtATime: true, questionSeconds: "4" }));
    expect(quiz.map((p) => p.area)).toEqual(["rules"]);
    const mastery = validate(draftOf({ mode: "mastery", oneAtATime: true, questionSeconds: "4" }));
    expect(mastery.map((p) => p.area)).toEqual(["security"]);
    expect(validate(draftOf({ oneAtATime: false, questionSeconds: "4" }))).toEqual([]);
  });

  test("an exam needs a grace period of 1 to 60 minutes and a pledge", () => {
    for (const bad of ["0", "61", "2.5", ""]) {
      expect(validate(examDraft({ graceMinutes: bad })).map((p) => p.area)).toEqual(["rules"]);
    }
    expect(validate(examDraft({ graceMinutes: "60" }))).toEqual([]);
    expect(validate(examDraft({ pledge: "   " }))).toEqual([{ area: "rules", text: "Write the honor pledge students accept." }]);
    expect(validate(examDraft({ pledge: "x".repeat(2001) })).map((p) => p.area)).toEqual(["rules"]);
    // Not an exam: the exam's fields are not read.
    expect(validate(draftOf({ graceMinutes: "0", pledge: "" }))).toEqual([]);
  });

  test("mastery and game problems come from their own settings", () => {
    const mastery = changeMode(draftOf(), "mastery", undefined, password);
    expect(validate({ ...mastery, mastery: { ...mastery.mastery, retryLimit: "0", targetPercent: "101" } })).toHaveLength(2);
    const game = changeMode(draftOf(), "game", undefined, password);
    expect(validate({ ...game, game: { ...game.game, questionSeconds: "2" } }).map((p) => p.area)).toEqual(["rules"]);
  });

  test("allowed networks are checked only while limiting, and clients need at least one", () => {
    expect(validate(draftOf({ limitNetworks: true, allowlist: "10.0.0.1\nnot-an-ip" }))).toEqual([
      { area: "security", text: '"not-an-ip" is not an IP address or range such as 10.0.4.0/24.' },
    ]);
    expect(validate(draftOf({ limitNetworks: false, allowlist: "not-an-ip" }))).toEqual([]);
    expect(validate(changeAllowedClients(draftOf(), [])).map((p) => p.area)).toEqual(["security"]);
  });

  test("the first area to fix follows the order of the form", () => {
    const problems = validate(examDraft({ closes: "", graceMinutes: "0", limitNetworks: true, allowlist: "x y", lateJoin: "0" }));
    expect(problems.map((p) => p.area).sort()).toEqual(["access", "basics", "rules", "security"]);
    expect(firstProblemArea(problems)).toBe("basics");
    expect(firstProblemArea([{ area: "security", text: "" }, { area: "access", text: "" }])).toBe("access");
    expect(firstProblemArea([])).toBeNull();
  });
});

describe("an opened or running session", () => {
  const scheduled = originOf(sessionOf());
  const lobby = originOf(sessionOf({ status: "lobby", classId: "c1" }), { roomPassword: "pw" });
  const running = originOf(
    sessionOf({
      status: "running",
      classId: "c1",
      mode: "exam",
      exam: { computersOnly: true, honorPledge: "I will not cheat.", deviceGraceMinutes: 9, allowMobile: false },
      integrity: defaultIntegrity("exam"),
    }),
    { exitPassword: "bye", ipAllowlist: ["10.0.0.0/24"] },
  );

  test("a scheduled session can change everything", () => {
    const input = toInput({ ...scheduled.seed, mode: "mastery", classId: "c2", startWhen: "manual" }, scheduled);
    expect(input).toMatchObject({ mode: "mastery", classId: "c2", opensAt: null });
  });

  test("an opened session keeps its type, class and open time", () => {
    const edited = { ...lobby.seed, mode: "exam" as const, classId: "c9", startWhen: "manual" as const, opens: "2030-01-01T00:00", timeLimit: "20" };
    const input = toInput(edited, lobby);
    expect(input).toMatchObject({ mode: "quiz", classId: "c1", opensAt: "2026-11-06T01:00:00.000Z", timeLimitMinutes: 20 });
    expect(validate({ ...edited, startWhen: "schedule", opens: "" }, lobby)).toEqual([]);
  });

  test("an opened game keeps its pace but can change its clock", () => {
    const game = originOf(sessionOf({ status: "lobby", mode: "game", pacing: "student", opensAt: null, game: { questionSeconds: 20, showLeaderboard: true, streakBonus: true, relay: null } }));
    const input = toInput({ ...game.seed, game: { ...game.seed.game, pacing: "teacher", questionSeconds: "40" } }, game);
    expect(input.pacing).toBe("student");
    expect(input.game).toMatchObject({ questionSeconds: 40 });
  });

  test("a running session keeps its rules", () => {
    const edited: SessionDraft = {
      ...running.seed,
      integrity: { ...running.seed.integrity, autoSubmitAfter: null },
      limitNetworks: false,
      lockExit: false,
      exitPassword: "",
      oneAtATime: false,
      questionSeconds: "10",
      navigation: "free",
      marked: "0",
      computersOnly: false,
      allowMobile: true,
      pledge: "Changed.",
      graceMinutes: "30",
      // Not locked: who may join, the room password, results.
      password: "new",
      release: "immediately",
      lateJoin: "20",
    };
    const input = toInput(edited, running);
    expect(input).toMatchObject({
      integrity: { ...defaultIntegrity("exam"), autoSubmitAfter: 3 },
      ipAllowlist: ["10.0.0.0/24"],
      exitPassword: "bye",
      oneQuestionAtATime: true,
      questionTimeLimitSeconds: 30,
      navigation: "forward_only",
      maxMarked: 9,
      exam: { computersOnly: true, honorPledge: "I will not cheat.", deviceGraceMinutes: 9, allowMobile: false },
      roomPassword: "new",
      resultsRelease: "immediately",
      lateJoinMinutes: 20,
    });
  });

  test("a running session's locked fields are not checked again", () => {
    expect(validate({ ...running.seed, graceMinutes: "0", pledge: "", allowlist: "bad address", limitNetworks: true }, running)).toEqual([]);
  });
});

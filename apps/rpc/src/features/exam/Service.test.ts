import { describe, expect, test } from "bun:test";
import { NotFound } from "@examinus/contract/errors";
import type { AttemptDetail } from "@examinus/contract/session";
import { Effect, Layer } from "effect";
import type { AttemptItem, QuizSessionItem } from "../../database/schemas/index.ts";
import { harness, stub } from "../../testing/config.ts";
import { attemptRow, quizRow, sessionRow } from "../../testing/rows.ts";
import { LiveHub } from "../live/Service.ts";
import { SessionRepo } from "../session/Repo.ts";
import { ExamRepo, type AnswerHistoryItem, type GradeChangeRow } from "./Repo.ts";
import { ExamService } from "./Service.ts";

type Recorded = Parameters<LiveHub["Service"]["record"]>[0];
type Session = QuizSessionItem;

// The teacher "teacher-1" owns attempt-1 of `session`. `statuses` are the attempts the student has in that session.
const setup = (options: { session?: Partial<Session>; attempt?: Partial<AttemptItem>; statuses?: AttemptItem["status"][] } = {}) => {
  const session = sessionRow({ mode: "exam", attemptsAllowed: 2, ...options.session });
  const attempt = attemptRow(options.attempt);
  const released: Array<[string, boolean]> = [];
  const recorded: Recorded[] = [];
  const changed: string[] = [];
  const sessions = Layer.succeed(
    SessionRepo,
    stub<SessionRepo["Service"]>("SessionRepo", {
      ownAttemptOf: (attemptId, userId) =>
        attemptId === attempt.id && userId === "teacher-1"
          ? Effect.succeed({ attempt, session, quiz: quizRow() })
          : Effect.fail(new NotFound({ message: "That attempt doesn't exist." })),
      attemptDetails: () => Effect.succeed([{ studentId: "roster-1" } as unknown as AttemptDetail]),
    }),
  );
  const history: AnswerHistoryItem[] = [
    { id: "h1", attemptId: attempt.id, questionId: "q-1", value: "first draft", savedAt: new Date("2026-10-13T08:01:00Z") },
    { id: "h2", attemptId: attempt.id, questionId: "q-1", value: null, savedAt: new Date("2026-10-13T08:02:00Z") },
  ];
  const changes: GradeChangeRow[] = [
    {
      change: { id: "c1", answerId: "a1", changedBy: "teacher-1", oldScore: 3, newScore: 5, reason: "Regraded", at: new Date("2026-10-13T09:00:00Z") },
      questionId: "q-1",
      by: "Ms. Cruz",
    },
  ];
  const exam = Layer.succeed(
    ExamRepo,
    stub<ExamRepo["Service"]>("ExamRepo", {
      statusesOf: () => Effect.succeed(options.statuses ?? ["graded"]),
      releaseDevice: (attemptId, touch) => Effect.sync(() => void released.push([attemptId, touch])),
      record: () => Effect.succeed({ incidents: [], history, changes }),
    }),
  );
  const hub = Layer.succeed(
    LiveHub,
    stub<LiveHub["Service"]>("LiveHub", {
      record: (input) => Effect.sync(() => void recorded.push(input)),
      attemptChanged: (attemptId) => Effect.sync(() => void changed.push(attemptId)),
    }),
  );
  return { ...harness(ExamService.layer.pipe(Layer.provide([sessions, exam, hub]))), released, recorded, changed };
};

const exam = Effect.service(ExamService);

describe("ExamService.allowBackIn", () => {
  test("a teacher who doesn't own the attempt gets NotFound and nothing is released", async () => {
    const { fail, released, recorded } = setup();
    const err = await fail(Effect.flatMap(exam, (s) => s.allowBackIn("attempt-1", "teacher-2")));
    expect(err._tag).toBe("NotFound");
    expect(released).toEqual([]);
    expect(recorded).toEqual([]);
  });

  test("a student who already submitted can't be let back in", async () => {
    const { fail, released } = setup({ attempt: { status: "graded" } });
    const err = await fail(Effect.flatMap(exam, (s) => s.allowBackIn("attempt-1", "teacher-1")));
    expect(err._tag).toBe("Conflict");
    expect(released).toEqual([]);
  });

  test("in an exam the device is released with the grace period restarted, and the switch is logged", async () => {
    const { run, released, recorded, changed } = setup({ session: { mode: "exam" } });
    await run(Effect.flatMap(exam, (s) => s.allowBackIn("attempt-1", "teacher-1")));
    expect(released).toEqual([["attempt-1", true]]);
    expect(recorded).toEqual([
      { sessionId: "session-1", attemptId: "attempt-1", actorId: "teacher-1", kind: "device_switch_allowed" },
    ]);
    expect(changed).toEqual(["attempt-1"]);
  });

  test("outside an exam the grace period is left alone and the entry is 'allow_back_in'", async () => {
    const { run, released, recorded } = setup({ session: { mode: "quiz" } });
    await run(Effect.flatMap(exam, (s) => s.allowBackIn("attempt-1", "teacher-1")));
    expect(released).toEqual([["attempt-1", false]]);
    expect(recorded.map((r) => r.kind)).toEqual(["allow_back_in"]);
  });
});

describe("ExamService.grantRetake", () => {
  const grant = (reason = "Power cut") => Effect.flatMap(exam, (s) => s.grantRetake("attempt-1", "teacher-1", reason));

  test("a retake is granted by recording the trimmed reason", async () => {
    const { run, recorded, changed } = setup();
    await run(grant("  Power cut  "));
    expect(recorded).toEqual([
      { sessionId: "session-1", attemptId: "attempt-1", actorId: "teacher-1", kind: "retake_granted", message: "Power cut" },
    ]);
    expect(changed).toEqual(["attempt-1"]);
  });

  test.each([
    ["the session isn't an exam", { session: { mode: "quiz" as const } }],
    ["the exam already allows unlimited attempts", { session: { attemptsAllowed: null } }],
    ["the session has ended", { session: { status: "ended" as const } }],
    ["the student is still taking the exam", { statuses: ["graded" as const, "in_progress" as const] }],
  ])("refused with Conflict, and nothing recorded, when %s", async (_why, options) => {
    const { fail, recorded } = setup(options);
    const err = await fail(grant());
    expect(err._tag).toBe("Conflict");
    expect(recorded).toEqual([]);
  });

  test("a blank reason is refused", async () => {
    const { fail, recorded } = setup();
    const err = await fail(grant("   "));
    expect(err._tag).toBe("Conflict");
    expect(recorded).toEqual([]);
  });

  test("a teacher who doesn't own the attempt gets NotFound", async () => {
    const { fail } = setup();
    const err = await fail(Effect.flatMap(exam, (s) => s.grantRetake("attempt-1", "teacher-2", "x")));
    expect(err._tag).toBe("NotFound");
  });
});

describe("ExamService.record", () => {
  test("the record carries the attempt's detail, answer history and score changes in the contract's shape", async () => {
    const { run } = setup();
    const record = await run(Effect.flatMap(exam, (s) => s.record("attempt-1", "teacher-1")));
    expect(record.detail).toEqual({ studentId: "roster-1" } as unknown as AttemptDetail);
    expect(record.history).toEqual([
      { questionId: "q-1", value: "first draft", savedAt: "2026-10-13T08:01:00.000Z" },
      { questionId: "q-1", value: null, savedAt: "2026-10-13T08:02:00.000Z" },
    ]);
    expect(record.gradeChanges).toEqual([
      { id: "c1", questionId: "q-1", changedBy: "Ms. Cruz", oldScore: 3, newScore: 5, reason: "Regraded", at: "2026-10-13T09:00:00.000Z" },
    ]);
  });

  test("another teacher can't read the record", async () => {
    const { fail } = setup();
    const err = await fail(Effect.flatMap(exam, (s) => s.record("attempt-1", "teacher-2")));
    expect(err._tag).toBe("NotFound");
  });
});

import { clientIpHeader } from "@examinus/contract/api";
import { describe, expect, test } from "bun:test";
import { noAccommodations, type Accommodations } from "@examinus/domain/accommodations";
import type { ClientInfo } from "@examinus/domain/client";
import { Effect } from "effect";
import { harness, testSecret } from "../../testing/config.ts";
import { signAttestation } from "../client/rules.ts";
import { attemptWorld, player, type WorldOptions } from "../../testing/attempt-world.ts";
import { answerItem, attemptItem, exam, integrity } from "../../testing/session-rows.ts";
import { Taking } from "./Taking.ts";

const setup = (options: WorldOptions = {}) => {
  const world = attemptWorld(options);
  return { ...world, ...harness(world.layer) };
};

const start = (
  input: {
    sessionId?: string;
    deviceId?: string;
    roomPassword?: string;
    pledgeAccepted?: boolean;
    client?: ClientInfo;
    attestation?: string;
  } = {},
  headers: Record<string, string> = {},
  userId = "student1",
) =>
  Effect.gen(function* () {
    const taking = yield* Taking;
    return yield* taking.start(player(userId), { sessionId: "sess1", deviceId: "dev1", ...input }, headers);
  });

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);

describe("Taking.start", () => {
  test("a student who isn't on the roster can't see the session", async () => {
    const { fail, state } = setup();
    expect((await fail(start({}, {}, "stranger")))._tag).toBe("NotFound");
    expect(state.created).toEqual([]);
  });

  test("a student working in another organization can't see the session", async () => {
    const { fail, state } = setup();
    expect((await fail(Effect.gen(function* () {
      return yield* (yield* Taking).start(player("student1", "org-elsewhere"), { sessionId: "sess1", deviceId: "dev1" }, {});
    })))._tag).toBe("NotFound");
    expect(state.created).toEqual([]);
  });

  test("a session that hasn't opened refuses to start and nothing is created", async () => {
    const { fail, state } = setup({ session: { status: "scheduled", startedAt: null } });
    const err = await fail(start());
    expect(err._tag).toBe("Conflict");
    expect(state.created).toEqual([]);
  });

  test("a session past its closing time is ended, so it refuses too", async () => {
    const { fail } = setup({ session: { closesAt: minutesAgo(5) } });
    expect((await fail(start()))._tag).toBe("Conflict");
  });

  test("a game can't be played through the attempt calls", async () => {
    const { fail } = setup({ session: { mode: "game" } });
    expect((await fail(start()))._tag).toBe("PlayInGame");
  });

  test("starting creates attempt number 1 on the student's device and announces it", async () => {
    const { run, state } = setup();
    const attempt = await run(start({ deviceId: "laptop" }, { [clientIpHeader]: "10.0.0.7" }));
    expect(state.created).toHaveLength(1);
    expect(state.created[0]).toMatchObject({ studentId: "student1", attemptNumber: 1, deviceId: "laptop", ip: "10.0.0.7", pledgeAcceptedAt: null });
    expect(attempt.id).toBe(state.created[0]!.id);
    expect(state.changes.map((c) => c.attemptId)).toEqual([attempt.id]);
  });

  test("the attempts allowed are enforced, and a retake granted by the teacher adds one", async () => {
    const used = attemptItem({ id: "old", status: "graded", submittedAt: minutesAgo(30) });
    const refused = setup({ attempts: [used] });
    const err = await refused.fail(start());
    expect(err._tag).toBe("Conflict");
    expect(refused.state.created).toEqual([]);

    const granted = setup({ attempts: [attemptItem({ ...used })], grantedRetakes: 1 });
    await granted.run(start());
    expect(granted.state.created[0]!.attemptNumber).toBe(2);
  });

  test("unlimited attempts never run out", async () => {
    const attempts = [1, 2, 3].map((n) => attemptItem({ id: `old${n}`, attemptNumber: n, status: "graded", submittedAt: minutesAgo(30 - n) }));
    const { run, state } = setup({ session: { attemptsAllowed: null }, attempts });
    await run(start());
    expect(state.created[0]!.attemptNumber).toBe(4);
  });

  test("an exam needs the honor pledge, which is stored with the attempt", async () => {
    const { run, fail, state } = setup({ session: { mode: "exam", exam } });
    const err = await fail(start({}, {}));
    expect(err._tag).toBe("Conflict");
    expect(state.created).toEqual([]);
    await run(start({ pledgeAccepted: true }));
    expect(state.created[0]!.pledgeAcceptedAt).not.toBeNull();
  });

  test("a computers-only exam turns a phone away before anything else", async () => {
    const { fail, state } = setup({ session: { mode: "exam", exam } });
    const err = await fail(start({ pledgeAccepted: true }, { "sec-ch-ua-mobile": "?1" }));
    expect(err._tag).toBe("ComputersOnly");
    expect(state.created).toEqual([]);
  });

  test("a desktop app older than DESKTOP_MIN_VERSION is refused with where to update; current builds and browsers pass", async () => {
    const ua = (version: string) => ({ "user-agent": `Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 ExaminusDesktop/${version}` });
    const { fail, run, state } = setup();
    const err = await fail(start({}, ua("1.1.9")));
    expect(err._tag).toBe("ClientOutdated");
    expect(err).toMatchObject({ version: "1.1.9", minVersion: "1.2.0", releasesUrl: "https://github.com/ejluv143/ExamSIC/releases" });
    expect(state.created).toEqual([]);
    await run(start({}, ua("1.2.0")));
    expect(state.created).toHaveLength(1);
    const browser = setup();
    await browser.run(start({}, { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) Firefox/133.0" }));
    expect(browser.state.created).toHaveLength(1);
  });

  test("a session for one client only turns the other away, before an attempt exists", async () => {
    const desktop = { "user-agent": "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 ExaminusDesktop/1.2.0" };
    const browser = { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) Firefox/133.0" };
    const desktopOnly = setup({ session: { integrity: { ...integrity, allowedClients: ["desktop"] } } });
    expect(await desktopOnly.fail(start({}, browser))).toMatchObject({ _tag: "Forbidden", message: expect.stringContaining("Desktop app") });
    expect(desktopOnly.state.created).toEqual([]);
    await desktopOnly.run(start({}, desktop));
    expect(desktopOnly.state.created).toHaveLength(1);
    const webOnly = setup({ session: { integrity: { ...integrity, allowedClients: ["web"] } } });
    expect((await webOnly.fail(start({}, desktop)))._tag).toBe("Forbidden");
    await webOnly.run(start({}, browser));
    expect(webOnly.state.created).toHaveLength(1);
  });

  test("the mobile app is recorded with what it says and whether its device was verified; outside exams it is welcome", async () => {
    const mobile = { "user-agent": "ExaminusMobile/1.2.3 (Android 15)" };
    const declared = { kind: "mobile", version: "9.9.9", platform: "Android 15" } as const;
    const verified = signAttestation(testSecret, { uid: "student1", did: "dev1", kind: "mobile", platform: "android", exp: Date.now() + 60_000 });
    const quiz = setup();
    await quiz.run(start({ client: declared }, mobile));
    expect(quiz.state.created[0]?.client).toEqual({ kind: "mobile", version: "1.2.3", platform: "Android 15", attested: false });
    const attested = setup();
    await attested.run(start({ client: declared, attestation: verified }, mobile));
    expect(attested.state.created[0]?.client).toMatchObject({ kind: "mobile", attested: true });
    const browser = setup();
    await browser.run(start({}, { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) Firefox/133.0" }));
    expect(browser.state.created[0]?.client).toEqual({ kind: "web", version: "", platform: "browser", attested: false });
  });

  test("an exam takes the mobile app only when the teacher allows it and the device is verified", async () => {
    const mobile = { "user-agent": "ExaminusMobile/1.2.3 (Android 15)" };
    const declared = { kind: "mobile", version: "1.2.3", platform: "Android 15" } as const;
    const verified = signAttestation(testSecret, { uid: "student1", did: "dev1", kind: "mobile", platform: "android", exp: Date.now() + 60_000 });
    const notAllowed = setup({ session: { mode: "exam", exam } });
    const err = await notAllowed.fail(start({ pledgeAccepted: true, client: declared, attestation: verified }, mobile));
    expect(err).toMatchObject({ _tag: "DeviceAttestationRequired", message: "This exam needs the Examinus app on a verified device." });
    expect(notAllowed.state.created).toEqual([]);
    const allowed = setup({ session: { mode: "exam", exam: { ...exam, allowMobile: true } } });
    expect((await allowed.fail(start({ pledgeAccepted: true, client: declared }, mobile)))._tag).toBe("DeviceAttestationRequired");
    expect(allowed.state.created).toEqual([]);
    // The app's user agent looks like a phone: a computers-only exam still lets a verified device in.
    await allowed.run(start({ pledgeAccepted: true, client: declared, attestation: verified }, mobile));
    expect(allowed.state.created[0]?.client).toMatchObject({ kind: "mobile", attested: true });
  });

  test("the late-join cutoff counts from when the session started", async () => {
    const { fail, run, state } = setup({ session: { lateJoinMinutes: 10, startedAt: minutesAgo(11) } });
    expect((await fail(start()))._tag).toBe("Conflict");
    expect(state.created).toEqual([]);
    const inTime = setup({ session: { lateJoinMinutes: 10, startedAt: minutesAgo(9) } });
    await inTime.run(start());
    expect(inTime.state.created).toHaveLength(1);
  });

  test("the room password must match (surrounding spaces ignored), else Forbidden", async () => {
    const { fail, run, state } = setup({ session: { roomPassword: "tiger" } });
    expect((await fail(start({ roomPassword: "lion" })))._tag).toBe("Forbidden");
    expect((await fail(start()))._tag).toBe("Forbidden");
    expect(state.created).toEqual([]);
    await run(start({ roomPassword: "  tiger " }));
    expect(state.created).toHaveLength(1);
  });

  test("the network allowlist refuses an outside or unknown address and admits one inside a range", async () => {
    const { fail, run, state } = setup({ session: { ipAllowlist: ["10.0.4.0/24"] } });
    expect((await fail(start({}, { [clientIpHeader]: "192.168.1.5" })))._tag).toBe("Forbidden");
    expect((await fail(start()))._tag).toBe("Forbidden");
    expect(state.created).toEqual([]);
    await run(start({}, { [clientIpHeader]: "10.0.4.77" }));
    expect(state.created).toHaveLength(1);
  });

  test("starting again on the same device resumes the open attempt instead of creating another", async () => {
    const open = attemptItem({ id: "open", startedAt: minutesAgo(2) });
    const { run, state } = setup({ attempts: [open] });
    const attempt = await run(start({ deviceId: "dev1" }));
    expect(attempt.id).toBe("open");
    expect(state.created).toEqual([]);
    expect(state.checkIns.map((c) => c.attemptId)).toEqual(["open"]);
  });

  test("another browser can't resume a quiz attempt: OpenElsewhere, and the clash is logged", async () => {
    const { fail, state } = setup({ attempts: [attemptItem({ id: "open", deviceId: "dev1" })] });
    const err = await fail(start({ deviceId: "other-browser" }));
    expect(err._tag).toBe("OpenElsewhere");
    expect(state.events).toEqual([{ attemptId: "open", type: "device_changed" }]);
    expect(state.checkIns).toEqual([]);
  });

  test("in an exam, another browser waits for the teacher's approval instead", async () => {
    const { fail } = setup({ session: { mode: "exam", exam }, attempts: [attemptItem({ id: "open", deviceId: "dev1" })] });
    expect((await fail(start({ deviceId: "other-browser", pledgeAccepted: true })))._tag).toBe("DeviceApprovalRequired");
  });

  test("an exam attempt away longer than the grace period needs approval even on its own device", async () => {
    const { fail } = setup({
      session: { mode: "exam", exam: { ...exam, deviceGraceMinutes: 5 } },
      attempts: [attemptItem({ id: "open", deviceId: "dev1", lastSeenAt: minutesAgo(10) })],
    });
    expect((await fail(start({ pledgeAccepted: true })))._tag).toBe("DeviceApprovalRequired");
  });

  test("an attempt whose time ran out can't be resumed", async () => {
    const { fail } = setup({
      session: { timeLimitMinutes: 10 },
      attempts: [attemptItem({ id: "open", startedAt: minutesAgo(30) })],
    });
    const err = await fail(start());
    expect(err).toMatchObject({ _tag: "Conflict", message: "Time is up." });
  });

  test("a student on the same browser as another student of the session is flagged on both attempts", async () => {
    const other = attemptItem({ id: "theirs", studentId: "student2", deviceId: "shared" });
    const { run, state } = setup({ attempts: [other], roster: ["student1", "student2"] });
    await run(start({ deviceId: "shared" }));
    const created = state.created[0]!;
    expect(state.events).toEqual([
      { attemptId: created.id, type: "shared_device" },
      { attemptId: "theirs", type: "shared_device" },
    ]);
  });
});

describe("Taking.verifyExitPassword", () => {
  const verify = (password: string) =>
    Effect.gen(function* () {
      return yield* (yield* Taking).verifyExitPassword(player("student1"), { sessionId: "sess1", password });
    });

  test("the right password lets the desktop app close; a wrong one is refused and counted against the attempt", async () => {
    const { run, limiter } = setup({ session: { exitPassword: "LEAVE22" }, attempts: [attemptItem({ id: "open" })] });
    expect(await run(verify("wrong"))).toEqual({ ok: false });
    expect(limiter.counts.get("exit-password:open")).toBe(1);
    expect(await run(verify(" LEAVE22 "))).toEqual({ ok: true });
  });

  test("too many wrong passwords is Forbidden", async () => {
    const { run, fail } = setup({ session: { exitPassword: "LEAVE22" }, attempts: [attemptItem({ id: "open" })] });
    for (let i = 0; i < 10; i++) await run(verify("wrong"));
    expect((await fail(verify("wrong")))._tag).toBe("Forbidden");
  });

  test("without an exit password, or without an attempt in progress, the app may always close", async () => {
    const noPassword = setup({ attempts: [attemptItem({ id: "open" })] });
    expect(await noPassword.run(verify(""))).toEqual({ ok: true });
    const notTaking = setup({ session: { exitPassword: "LEAVE22" } });
    expect(await notTaking.run(verify("wrong"))).toEqual({ ok: true });
  });

  test("a student who isn't on the roster can't probe the password", async () => {
    const { fail } = setup({ session: { exitPassword: "LEAVE22" } });
    expect((await fail(Effect.gen(function* () {
      return yield* (yield* Taking).verifyExitPassword(player("stranger"), { sessionId: "sess1", password: "LEAVE22" });
    })))._tag).toBe("NotFound");
  });
});

describe("Taking.paper", () => {
  test("before starting, a closed session or used-up attempts can't be opened", async () => {
    const closed = setup({ session: { status: "scheduled", startedAt: null } });
    const err = await closed.fail(
      Effect.gen(function* () {
        return yield* (yield* Taking).paper(player("student1"), { sessionId: "sess1" }, {});
      }),
    );
    expect(err._tag).toBe("Conflict");
  });

  test("in the lobby the paper has no questions yet; arriving is recorded once and shown to the teacher", async () => {
    const { run, state } = setup({ session: { status: "lobby", startedAt: null } });
    const read = Effect.gen(function* () {
      return yield* (yield* Taking).paper(player("student1"), { sessionId: "sess1" }, {});
    });
    const paper = await run(read);
    expect(paper.session.status).toBe("lobby");
    expect(paper.attempt).toBeNull();
    expect(paper.parts).toEqual([]);
    await run(read);
    expect(state.joined).toEqual(["sess1:student1"]);
    expect(state.sessionChanged).toEqual(["sess1"]);
  });

  test("in the lobby an attempt can't start yet", async () => {
    const { fail, state } = setup({ session: { status: "lobby", startedAt: null } });
    expect(await fail(start())).toMatchObject({ _tag: "Conflict", message: "The session hasn't started yet. Wait in the lobby." });
    expect(state.created).toEqual([]);
  });

  test("the paper sent to a student has no answer key and carries only their saved answers", async () => {
    const open = attemptItem({ id: "open" });
    const { run } = setup({ attempts: [open], answers: [answerItem("open", "q1", { value: "a" })] });
    const paper = await run(
      Effect.gen(function* () {
        return yield* (yield* Taking).paper(player("student1"), { sessionId: "sess1", deviceId: "dev1" }, {});
      }),
    );
    expect(paper.attempt?.id).toBe("open");
    expect(paper.answers).toEqual({ q1: "a" });
    expect(JSON.stringify(paper.parts)).not.toContain("correctChoiceIds");
    expect(paper.parts.flatMap((p) => p.questions).map((q) => q.id)).toEqual(["q1", "q2"]);
  });

  test("reading the paper from a browser without the attempt's token is refused", async () => {
    const { fail } = setup({ attempts: [attemptItem({ id: "open", deviceId: "dev1" })] });
    const err = await fail(
      Effect.gen(function* () {
        return yield* (yield* Taking).paper(player("student1"), { sessionId: "sess1" }, {});
      }),
    );
    expect(err._tag).toBe("OpenElsewhere");
  });
});

describe("Taking.mine", () => {
  const mine = Effect.gen(function* () {
    return yield* (yield* Taking).mine(player("student1"));
  });

  test("the score of a submitted attempt shows only once the results are released", async () => {
    const submitted = attemptItem({ id: "done", status: "graded", submittedAt: minutesAgo(5) });
    const answers = [answerItem("done", "q1", { value: "b", autoScore: 1 }), answerItem("done", "q2", { value: "my essay" })];
    const hidden = setup({ session: { resultsRelease: "manual" }, attempts: [submitted], answers });
    const [held] = await hidden.run(mine);
    expect(held!.result).toBeNull();
    expect(held!.attemptsUsed).toBe(1);

    const released = setup({ session: { resultsRelease: "manual", resultsReleased: true }, attempts: [submitted], answers });
    const [shown] = await released.run(mine);
    expect(shown!.result).toEqual({ score: 2, max: 7, pendingEssays: 1 });
  });

  test("an attempt in progress is reported, and a student off the roster sees nothing", async () => {
    const { run } = setup({ attempts: [attemptItem({ id: "open" })] });
    const [item] = await run(mine);
    expect(item!.inProgress).toBe(true);
    expect(item!.result).toBeNull();
    const none = await run(Effect.gen(function* () { return yield* (yield* Taking).mine(player("stranger")); }));
    expect(none).toEqual([]);
  });

  test("a retake granted by the teacher shows in the attempts the student may still make", async () => {
    const { run } = setup({ session: { attemptsAllowed: 1 }, grantedRetakes: 2 });
    const [item] = await run(mine);
    expect(item!.session.attemptsAllowed).toBe(3);
  });
});

describe("Taking.setMarked and goTo", () => {
  const mark = (questionId: string, marked: boolean) =>
    Effect.gen(function* () {
      return yield* (yield* Taking).setMarked(player("student1"), { attemptId: "open", deviceId: "dev1", questionId, marked }, {});
    });
  const open = attemptItem({ id: "open" });

  test("marking is refused when the session switched it off, and nothing is stored", async () => {
    const { fail, state } = setup({ session: { maxMarked: 0 }, attempts: [open] });
    expect((await fail(mark("q1", true)))._tag).toBe("Conflict");
    expect(state.marks).toEqual([]);
  });

  test("a question that isn't on the student's paper is NotFound", async () => {
    const { fail } = setup({ attempts: [open] });
    expect((await fail(mark("elsewhere", true)))._tag).toBe("NotFound");
  });

  test("the limit of marked questions is enforced with a message that names it", async () => {
    const { fail, run, state } = setup({
      session: { maxMarked: 1 },
      attempts: [open],
      answers: [answerItem("open", "q1", { markedForReview: true })],
    });
    const err = await fail(mark("q2", true));
    expect(err._tag).toBe("Conflict");
    expect(state.marks).toEqual([]);
    // Taking a mark off is never refused.
    await run(mark("q1", false));
    expect(state.marks).toEqual([{ questionId: "q1", marked: false }]);
  });

  test("a locked attempt or paused session can't be changed", async () => {
    const locked = setup({ attempts: [attemptItem({ id: "open", locked: true })] });
    expect((await locked.fail(mark("q1", true)))._tag).toBe("Conflict");
    const paused = setup({ session: { pausedAt: new Date() }, attempts: [open] });
    expect((await paused.fail(mark("q1", true)))._tag).toBe("Conflict");
    expect(paused.state.marks).toEqual([]);
  });

  test("going to a question needs a session that shows one question at a time", async () => {
    const { fail } = setup({ attempts: [open] });
    const err = await fail(
      Effect.gen(function* () {
        return yield* (yield* Taking).goTo(player("student1"), { attemptId: "open", deviceId: "dev1", index: 1 }, {});
      }),
    );
    expect(err._tag).toBe("Conflict");
  });

  test("another student's attempt is NotFound", async () => {
    const { fail } = setup({ attempts: [open] });
    const err = await fail(
      Effect.gen(function* () {
        return yield* (yield* Taking).setMarked(player("student2"), { attemptId: "open", deviceId: "dev1", questionId: "q1", marked: true }, {});
      }),
    );
    expect(err._tag).toBe("NotFound");
  });
});

describe("accommodations", () => {
  const read = Effect.gen(function* () {
    return yield* (yield* Taking).paper(player("student1"), { sessionId: "sess1", deviceId: "dev1" }, {});
  });
  const given = (over: Partial<Accommodations>): Accommodations => ({ ...noAccommodations, ...over });

  test("the time multiplier scales the limit and extra minutes come after it, past the close time", async () => {
    const startedAt = minutesAgo(5);
    const open = attemptItem({ id: "open", startedAt });
    const plain = setup({ session: { timeLimitMinutes: 10 }, attempts: [open] });
    expect(Date.parse((await plain.run(read)).deadline!)).toBe(startedAt.getTime() + 10 * 60_000);

    const scaled = setup({ session: { timeLimitMinutes: 10 }, attempts: [open], accommodations: given({ timeMultiplier: 1.5, extraMinutes: 2 }) });
    expect(Date.parse((await scaled.run(read)).deadline!)).toBe(startedAt.getTime() + 17 * 60_000);

    // The multiplier never goes past the close time, but the extra minutes do.
    const closesAt = new Date(startedAt.getTime() + 12 * 60_000);
    const capped = setup({ session: { timeLimitMinutes: 10, closesAt }, attempts: [open], accommodations: given({ timeMultiplier: 3, extraMinutes: 4 }) });
    expect(Date.parse((await capped.run(read)).deadline!)).toBe(closesAt.getTime() + 4 * 60_000);
  });

  test("extra attempts add to the attempts allowed when starting and in the lists", async () => {
    const used = attemptItem({ id: "old", status: "graded", submittedAt: minutesAgo(30) });
    const without = setup({ attempts: [used] });
    expect((await without.fail(start()))._tag).toBe("Conflict");

    const extra = setup({ attempts: [used], accommodations: given({ extraAttempts: 1 }) });
    await extra.run(start());
    expect(extra.state.created[0]!.attemptNumber).toBe(2);

    const mine = await extra.run(Effect.gen(function* () { return yield* (yield* Taking).mine(player("student1")); }));
    expect(mine[0]!.session.attemptsAllowed).toBe(2);
  });

  test("extra attempts stay unlimited for an unlimited session", async () => {
    const { run } = setup({ session: { attemptsAllowed: null }, accommodations: given({ extraAttempts: 3 }) });
    const paper = await run(Effect.gen(function* () { return yield* (yield* Taking).paper(player("student1"), { sessionId: "sess1" }, {}); }));
    expect(paper.session.attemptsAllowed).toBeNull();
  });

  test("a student exempt from computers-only may start from a phone; the others are still turned away", async () => {
    const phone = { "sec-ch-ua-mobile": "?1" };
    const exempt = setup({ session: { mode: "exam", exam }, accommodations: given({ exempt: ["computers_only"] }) });
    await exempt.run(start({ pledgeAccepted: true }, phone));
    expect(exempt.state.created).toHaveLength(1);

    const other = setup({ session: { mode: "exam", exam }, accommodations: given({ exempt: ["fullscreen"] }) });
    expect((await other.fail(start({ pledgeAccepted: true }, phone)))._tag).toBe("ComputersOnly");
  });

  test("the paper and the lists show the rules the student is exempt from as off", async () => {
    const rules = { ...integrity, requireFullscreen: true, blockSecondScreen: true };
    const session = { mode: "exam" as const, exam, integrity: rules };
    const { run } = setup({ session, attempts: [attemptItem({ id: "open" })], accommodations: given({ exempt: ["fullscreen", "computers_only"] }) });
    const paper = await run(read);
    expect(paper.session.integrity.requireFullscreen).toBe(false);
    expect(paper.session.integrity.blockSecondScreen).toBe(true);
    expect(paper.session.exam?.computersOnly).toBe(false);
    const mine = await run(Effect.gen(function* () { return yield* (yield* Taking).mine(player("student1")); }));
    expect(mine[0]!.session.integrity.requireFullscreen).toBe(false);
  });
});

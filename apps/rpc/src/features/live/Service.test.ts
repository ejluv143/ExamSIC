import { describe, expect, test } from "bun:test";
import { Conflict, Forbidden, NotFound, Unauthorized } from "@examinus/contract/errors";
import { LiveClaims, LiveAuthMiddleware, LiveRpcs, LiveTicketRpcs, liveTicketHeader, type TicketTarget } from "@examinus/contract/live";
import type { LiveStudentEvent } from "@examinus/contract/live";
import { CurrentUser } from "@examinus/contract/middleware";
import type { Role } from "@examinus/domain/roles";
import type { SessionUser } from "@examinus/domain/user";
import { Effect, Fiber, Layer, Option, Stream, type Context } from "effect";
import { createHmac } from "node:crypto";
import { harness, stub, testConfig } from "../../testing/config.ts";
import { memoryBus, memoryCache, until } from "../../testing/live.ts";
import { attemptRow, sessionRow } from "../../testing/rows.ts";
import { handlersOf } from "../../testing/rpc.ts";
import { quizDetail, quizItem } from "../../testing/session-rows.ts";
import { Cache } from "../../platform/Cache.ts";
import { LiveBus } from "../../platform/LiveBus.ts";
import { Game } from "../game/Service.ts";
import { QuizRepo } from "../quiz/Repo.ts";
import { LiveAuthMiddlewareLive, LiveHandlers, LiveTicketHandlers } from "./Handlers.ts";
import { LiveRepo } from "./Repo.ts";
import { LiveHub, type TicketUser } from "./Service.ts";

const secret = "test-secret-test-secret-test-secret-00";

// The ticket a hub would issue, signed by hand so a test can choose its claims (expiry, role) freely.
const signed = (claims: Record<string, unknown>, key = secret) => {
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${body}.${createHmac("sha256", key).update(body).digest("base64url")}`;
};

const teacher: TicketUser = { userId: "t1", role: "teacher", target: { _tag: "teacher", sessionId: "s1" } };

type RepoMembers = Partial<LiveRepo["Service"]>;

// A hub over a fake repo; `attempts` are the attempts the repo knows, by id.
const setup = (repoMembers: RepoMembers = {}) => {
  const cache = memoryCache();
  const bus = memoryBus();
  const repo = Layer.succeed(LiveRepo, stub<LiveRepo["Service"]>("LiveRepo", repoMembers));
  const layer = LiveHub.layer.pipe(
    Layer.provide([
      repo,
      Layer.succeed(QuizRepo, stub<QuizRepo["Service"]>("QuizRepo", { detail: () => Effect.succeed(quizDetail()) })),
      Layer.succeed(Cache, cache.service),
      Layer.succeed(LiveBus, bus.service),
      testConfig,
    ]),
  );
  return { ...harness(layer), cache, bus, layer };
};

describe("LiveHub tickets", () => {
  test("a ticket is good once: the first redeem names the user and stream, the second finds nothing", async () => {
    const { run, cache } = setup();
    const result = await run(
      Effect.gen(function* () {
        const hub = yield* LiveHub;
        const { ticket } = yield* hub.issueTicket(teacher);
        const first = yield* hub.redeemTicket(ticket);
        const second = yield* hub.redeemTicket(ticket);
        return { first, second };
      }),
    );
    expect(result.first).toEqual(Option.some(teacher));
    expect(Option.isNone(result.second)).toBe(true);
    // Remembered only until it would have expired anyway: at most the minute a ticket lives.
    const [ttl] = [...cache.claims.values()];
    expect(cache.claims.size).toBe(1);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60_000);
  });

  test("a ticket expires a minute after it is issued", async () => {
    const { run } = setup();
    const { expiresAt } = await run(
      Effect.gen(function* () {
        const hub = yield* LiveHub;
        return yield* hub.issueTicket(teacher);
      }),
    );
    const left = new Date(expiresAt).getTime() - Date.now();
    expect(left).toBeGreaterThan(55_000);
    expect(left).toBeLessThanOrEqual(60_000);
  });

  test("an expired ticket is refused and not even remembered as used", async () => {
    const { run, cache } = setup();
    const ticket = signed({ jti: "old", uid: "t1", role: "teacher", target: teacher.target, exp: Date.now() - 1 });
    const result = await run(Effect.gen(function* () {
        const hub = yield* LiveHub;
        return yield* hub.redeemTicket(ticket);
      }));
    expect(Option.isNone(result)).toBe(true);
    expect(cache.claims.size).toBe(0);
  });

  test("a ticket whose claims were changed, or signed with another secret, is refused", async () => {
    const { run } = setup();
    const claims = { jti: "j1", uid: "t1", role: "teacher", target: teacher.target, exp: Date.now() + 30_000 };
    const real = signed(claims);
    const [, mac] = real.split(".");
    // The same signature on a body that names a different user.
    const forged = `${Buffer.from(JSON.stringify({ ...claims, uid: "someone-else" })).toString("base64url")}.${mac}`;
    const otherKey = signed({ ...claims, jti: "j2" }, "another-secret-another-secret-another-0");
    const verdicts = await run(
      Effect.gen(function* () {
        const hub = yield* LiveHub;
        return [yield* hub.redeemTicket(forged), yield* hub.redeemTicket(otherKey), yield* hub.redeemTicket(real)];
      }),
    );
    expect(verdicts.map(Option.isSome)).toEqual([false, false, true]);
  });

  test("anything that isn't a well-formed signed ticket is refused", async () => {
    const { run, cache } = setup();
    const notClaims = signed({ jti: "j3", uid: "t1", role: "emperor", target: teacher.target, exp: Date.now() + 30_000 });
    const missingTarget = signed({ jti: "j4", uid: "t1", role: "teacher", exp: Date.now() + 30_000 });
    const notJson = (() => {
      const body = Buffer.from("not json").toString("base64url");
      return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
    })();
    const verdicts = await run(
      Effect.gen(function* () {
        const hub = yield* LiveHub;
        const tickets = ["", ".", "abc", "a.b.c", ".mac", "body.", notClaims, missingTarget, notJson];
        return yield* Effect.forEach(tickets, (t) => hub.redeemTicket(t));
      }),
    );
    expect(verdicts.every(Option.isNone)).toBe(true);
    expect(cache.claims.size).toBe(0);
  });
});

describe("LiveHub incidents and streams", () => {
  const session = sessionRow({ id: "s1", quizId: "quiz1" });
  const loaded = (attempt = attemptRow({ id: "a1", sessionId: "s1", studentId: "u1" })) =>
    Effect.succeed({ attempt, session, quiz: quizItem(), rosterId: "r1" });

  test("a teacher action is stored and then shown to the teachers watching that session only", async () => {
    const inserted: unknown[] = [];
    const { run, bus } = setup({
      insertIncident: (input) =>
        Effect.sync(() => {
          inserted.push(input);
          return {
            id: "i1",
            sessionId: input.sessionId,
            attemptId: input.attemptId,
            actorId: input.actorId,
            kind: input.kind,
            message: input.message ?? null,
            seconds: input.seconds ?? null,
            at: new Date("2026-10-13T08:00:00.000Z"),
          };
        }),
    });
    await run(
      Effect.gen(function* () {
        const hub = yield* LiveHub;
        yield* hub.record({ sessionId: "s1", attemptId: "a1", actorId: "t1", kind: "warn", message: "Eyes on your own paper" });
      }),
    );
    expect(inserted).toEqual([{ sessionId: "s1", attemptId: "a1", actorId: "t1", kind: "warn", message: "Eyes on your own paper" }]);
    expect(bus.published).toHaveLength(1);
    expect(bus.published[0]!.channel).toBe("live:s1:teacher");
    expect(bus.published[0]!.message).toMatchObject({
      _tag: "incident",
      incident: { id: "i1", kind: "warn", message: "Eyes on your own paper", at: "2026-10-13T08:00:00.000Z" },
    });
  });

  test("a warning reaches only the student it is for, and nothing is sent for an attempt that doesn't exist", async () => {
    const { run, bus } = setup({ loadAttempt: (id) => (id === "a1" ? loaded() : Effect.succeed(null)) });
    await run(
      Effect.gen(function* () {
        const hub = yield* LiveHub;
        yield* hub.warn("missing", "hello");
        yield* hub.warn("a1", "Put the phone away");
      }),
    );
    expect(bus.published).toHaveLength(1);
    expect(bus.published[0]!.channel).toBe("live:s1:student");
    expect(bus.published[0]!.message).toMatchObject({ attemptId: "a1", event: { _tag: "warning", message: "Put the phone away" } });
  });

  test("a student's stream opens with the attempt's state and closes when the attempt ends; other attempts' news is ignored", async () => {
    const { run, bus } = setup({
      loadAttempt: () => loaded(),
      attemptData: () => Effect.succeed({ answerRows: [], eventRows: [] }),
    });
    const events = await run(
      Effect.gen(function* () {
        const hub = yield* LiveHub;
        const fiber = yield* Effect.forkChild(Stream.runCollect(hub.studentStream("a1")));
        yield* until(() => bus.subscribers("live:s1:student") > 0);
        // Someone else's warning, then ours; the stream must end on ours.
        yield* bus.service.publish("live:s1:student", {
          attemptId: "other",
          event: { _tag: "warning", message: "not yours", at: "2026-10-13T08:00:00.000Z" },
        });
        yield* hub.attemptChanged("a1", { ended: "teacher" });
        return yield* Fiber.join(fiber);
      }),
    );
    expect(events.map((e: LiveStudentEvent) => e._tag)).toEqual(["state", "ended"]);
    expect(events[1]).toEqual({ _tag: "ended", reason: "teacher" });
    expect(events[0]).toMatchObject({ status: "in_progress", paused: false, locked: false });
  });

  test("a stream for a submitted attempt gives the final state and ends at once", async () => {
    const submitted = attemptRow({ id: "a1", sessionId: "s1", studentId: "u1", status: "graded" });
    const { run } = setup({ loadAttempt: () => loaded(submitted) });
    const events = await run(Effect.gen(function* () {
        const hub = yield* LiveHub;
        return yield* Stream.runCollect(hub.studentStream("a1"));
      }));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ _tag: "state", status: "graded" });
  });

  test("a stream for an attempt that doesn't exist is empty", async () => {
    const { run } = setup({ loadAttempt: () => Effect.succeed(null) });
    const events = await run(Effect.gen(function* () {
        const hub = yield* LiveHub;
        return yield* Stream.runCollect(hub.studentStream("nope"));
      }));
    expect(events).toEqual([]);
  });

  test("a pause or lock on a running attempt makes the student's page reload its state (a resync)", async () => {
    let locked = false;
    const { run, bus } = setup({
      loadAttempt: () => loaded(attemptRow({ id: "a1", sessionId: "s1", studentId: "u1", locked })),
      attemptData: () => Effect.succeed({ answerRows: [], eventRows: [] }),
    });
    const events = await run(
      Effect.gen(function* () {
        const hub = yield* LiveHub;
        const fiber = yield* Effect.forkChild(Stream.runCollect(hub.studentStream("a1").pipe(Stream.take(2))));
        yield* until(() => bus.subscribers("live:s1:student") > 0);
        locked = true;
        yield* hub.attemptChanged("a1", { state: true });
        return yield* Fiber.join(fiber);
      }),
    );
    expect(events.map((e: LiveStudentEvent) => (e._tag === "state" ? e.locked : null))).toEqual([false, true]);
  });
});

// --- Handlers ---

const user = (role: Role, id = "u1"): SessionUser =>
  ({ id, role, name: id, email: `${id}@x.ph`, avatar: null, profile: null }) as unknown as SessionUser;

type Claims = { userId: string; role: Role; target: TicketTarget };
const claimsOf = (role: Role, target: TicketTarget, userId = "u1"): Claims => ({ userId, role, target });

describe("live.ticket", () => {
  const build = (over: { owns?: boolean; attemptStatus?: "in_progress" | "graded" | null; rostered?: boolean } = {}) => {
    const issued: TicketUser[] = [];
    const hub = Layer.succeed(
      LiveHub,
      stub<LiveHub["Service"]>("LiveHub", {
        ownsSession: () => Effect.succeed(over.owns ?? true),
        issueTicket: (u) => Effect.sync(() => (issued.push(u), { ticket: "tkt", expiresAt: "2026-10-13T08:01:00.000Z" })),
      }),
    );
    const repo = Layer.succeed(
      LiveRepo,
      stub<LiveRepo["Service"]>("LiveRepo", { attemptStatus: () => Effect.succeed(over.attemptStatus === undefined ? "in_progress" : over.attemptStatus) }),
    );
    const game = Layer.succeed(Game, stub<Game["Service"]>("Game", { isRostered: () => Effect.succeed(over.rostered ?? true) }));
    const layer = LiveTicketHandlers.pipe(Layer.provide([hub, repo, game]));
    const call = (role: Role, target: TicketTarget) =>
      Effect.scoped(
        Effect.gen(function* () {
          const context = yield* Layer.build(layer);
          return yield* handlersOf(LiveTicketRpcs, context).call<"live.ticket", CurrentUser>("live.ticket", { target });
        }),
      ).pipe(Effect.provideService(CurrentUser, user(role)));
    return { issued, call };
  };
  const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(Effect.flip(effect));
  const ok = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect);

  test("a teacher gets a ticket for a session they own", async () => {
    const { issued, call } = build();
    const target = { _tag: "teacher", sessionId: "s1" } as const;
    const result = await ok(call("teacher", target));
    expect(result.ticket).toBe("tkt");
    expect(issued).toEqual([{ userId: "u1", role: "teacher", target }]);
  });

  test("a teacher can't watch a session they don't own: NotFound, and no ticket is issued", async () => {
    const { issued, call } = build({ owns: false });
    const err = await run(call("teacher", { _tag: "teacher", sessionId: "s1" }));
    expect(err).toBeInstanceOf(NotFound);
    expect(issued).toEqual([]);
  });

  test("a student can't ask for a teacher's stream", async () => {
    const { issued, call } = build();
    const err = await run(call("student", { _tag: "teacher", sessionId: "s1" }));
    expect(err).toBeInstanceOf(Forbidden);
    expect(issued).toEqual([]);
  });

  test("a game ticket: a teacher needs to own the game, a student needs to be on its roster", async () => {
    const target = { _tag: "game", sessionId: "g1" } as const;
    expect(await run(build({ owns: false }).call("teacher", target))).toBeInstanceOf(NotFound);
    expect(await run(build({ rostered: false }).call("student", target))).toBeInstanceOf(NotFound);
    const { issued, call } = build();
    await ok(call("student", target));
    await ok(call("teacher", target));
    expect(issued.map((i) => i.role)).toEqual(["student", "teacher"]);
  });

  test("an attempt ticket needs the student's own, still open attempt", async () => {
    const target = { _tag: "student", attemptId: "a1" } as const;
    expect(await run(build({ attemptStatus: null }).call("student", target))).toBeInstanceOf(NotFound);
    expect(await run(build({ attemptStatus: "graded" }).call("student", target))).toBeInstanceOf(Conflict);
    expect(await run(build().call("teacher", target))).toBeInstanceOf(Forbidden);
    const { issued, call } = build();
    await ok(call("student", target));
    expect(issued).toHaveLength(1);
  });
});

describe("live streams: who may open which", () => {
  const build = (over: { owns?: boolean; ownsAttempt?: boolean; rostered?: boolean } = {}) => {
    const hub = Layer.succeed(
      LiveHub,
      stub<LiveHub["Service"]>("LiveHub", {
        ownsSession: () => Effect.succeed(over.owns ?? true),
        ownsAttempt: () => Effect.succeed(over.ownsAttempt ?? true),
        teacherStream: () => Stream.make({ _tag: "teacher-stream" } as never),
        studentStream: () => Stream.empty,
      }),
    );
    const viewers: unknown[] = [];
    const game = Layer.succeed(
      Game,
      stub<Game["Service"]>("Game", {
        isRostered: () => Effect.succeed(over.rostered ?? true),
        stream: (_id, viewer) => (viewers.push(viewer), Stream.empty),
      }),
    );
    const layer = LiveHandlers.pipe(Layer.provide([hub, game]));
    const open = (tag: "live.teacher" | "live.game" | "live.student", payload: { sessionId?: string; attemptId?: string }, claims: Claims) =>
      Effect.scoped(
        Effect.gen(function* () {
          const context = yield* Layer.build(layer);
          const handlers = handlersOf(LiveRpcs, context);
          const stream = handlers.stream<unknown, typeof tag, LiveClaims>(tag, payload as never);
          return yield* Stream.runCollect(Stream.provideService(stream, LiveClaims, claims));
        }),
      );
    return { open, viewers };
  };
  const refusal = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(Effect.flip(effect));

  test("a teacher ticket for session s1 doesn't open session s2, and a student ticket doesn't open the teacher's stream", async () => {
    const { open } = build();
    expect(await refusal(open("live.teacher", { sessionId: "s2" }, claimsOf("teacher", { _tag: "teacher", sessionId: "s1" })))).toBeInstanceOf(Forbidden);
    expect(await refusal(open("live.teacher", { sessionId: "s1" }, claimsOf("student", { _tag: "teacher", sessionId: "s1" })))).toBeInstanceOf(Forbidden);
    // A ticket for an attempt can't open a session.
    expect(await refusal(open("live.teacher", { sessionId: "s1" }, claimsOf("teacher", { _tag: "student", attemptId: "a1" })))).toBeInstanceOf(Forbidden);
  });

  test("the teacher stream also re-checks ownership at connect time", async () => {
    const { open } = build({ owns: false });
    expect(await refusal(open("live.teacher", { sessionId: "s1" }, claimsOf("teacher", { _tag: "teacher", sessionId: "s1" })))).toBeInstanceOf(NotFound);
    const owner = build();
    const events = await Effect.runPromise(owner.open("live.teacher", { sessionId: "s1" }, claimsOf("teacher", { _tag: "teacher", sessionId: "s1" })));
    expect(events).toHaveLength(1);
  });

  test("a student stream needs a ticket for that attempt and an attempt the student owns; teachers have no student stream", async () => {
    const target = { _tag: "student", attemptId: "a1" } as const;
    expect(await refusal(build().open("live.student", { attemptId: "a2" }, claimsOf("student", target)))).toBeInstanceOf(Forbidden);
    expect(await refusal(build().open("live.student", { attemptId: "a1" }, claimsOf("teacher", target)))).toBeInstanceOf(Forbidden);
    expect(await refusal(build({ ownsAttempt: false }).open("live.student", { attemptId: "a1" }, claimsOf("student", target)))).toBeInstanceOf(NotFound);
    await Effect.runPromise(build().open("live.student", { attemptId: "a1" }, claimsOf("guest", target)));
  });

  test("a game stream: the owner presents, a rostered player plays, anyone else is turned away", async () => {
    const target = { _tag: "game", sessionId: "g1" } as const;
    expect(await refusal(build().open("live.game", { sessionId: "g2" }, claimsOf("student", target)))).toBeInstanceOf(Forbidden);
    expect(await refusal(build({ owns: false }).open("live.game", { sessionId: "g1" }, claimsOf("teacher", target)))).toBeInstanceOf(NotFound);
    expect(await refusal(build({ rostered: false }).open("live.game", { sessionId: "g1" }, claimsOf("student", target, "u9")))).toBeInstanceOf(NotFound);

    const presenter = build();
    await Effect.runPromise(presenter.open("live.game", { sessionId: "g1" }, claimsOf("teacher", target, "t1")));
    expect(presenter.viewers).toEqual([{ kind: "presenter" }]);
    const player = build();
    await Effect.runPromise(player.open("live.game", { sessionId: "g1" }, claimsOf("guest", target, "u7")));
    expect(player.viewers).toEqual([{ kind: "player", userId: "u7" }]);
  });
});

describe("LiveAuthMiddleware", () => {
  const build = (redeem: (ticket: string) => Option.Option<TicketUser>) => {
    const hub = Layer.succeed(LiveHub, stub<LiveHub["Service"]>("LiveHub", { redeemTicket: (t) => Effect.succeed(redeem(t)) }));
    return Layer.build(LiveAuthMiddlewareLive.pipe(Layer.provide(hub)));
  };
  const apply = (redeem: (ticket: string) => Option.Option<TicketUser>, headers: Record<string, string>) =>
    Effect.scoped(
      Effect.gen(function* () {
        const context = yield* build(redeem);
        const middleware = Context_get(context);
        return yield* middleware(Effect.gen(function* () {
          return yield* LiveClaims;
        }), { headers } as never);
      }),
    );
  // The middleware service is the function itself.
  const Context_get = (context: Context.Context<LiveAuthMiddleware>) =>
    context.mapUnsafe.get(LiveAuthMiddleware.key) as (
      effect: Effect.Effect<{ userId: string; role: Role; target: TicketTarget }, never, LiveClaims>,
      options: { headers: Record<string, string> },
    ) => Effect.Effect<{ userId: string; role: Role; target: TicketTarget }, Unauthorized>;

  test("a request with a good ticket in the header carries the ticket's user; one without is Unauthorized", async () => {
    const seen: string[] = [];
    const redeem = (t: string) => (seen.push(t), t === "good" ? Option.some(teacher) : Option.none<TicketUser>());
    const claims = await Effect.runPromise(apply(redeem, { [liveTicketHeader]: "good" }));
    expect(claims).toEqual(teacher);
    const err = await Effect.runPromise(Effect.flip(apply(redeem, {})));
    expect(err).toBeInstanceOf(Unauthorized);
    expect(seen).toEqual(["good", ""]);
  });
});

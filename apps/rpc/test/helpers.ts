// Helpers for the integration tests: sign in over Better Auth, call RPCs as a user, read a player's live GameView.
// They talk to a running API whose database was migrated and has the test fixture (test/fixture).
import { ApiRpcs, rpcPath } from "@examinus/contract/api";
import { type GameView } from "@examinus/contract/game";
import { LiveRpcs, liveRpcPath, liveTicketHeader } from "@examinus/contract/live";
import { Context, Effect, Layer, ManagedRuntime, Result, Stream } from "effect";
import { FetchHttpClient } from "effect/http";
import { RpcClient, RpcSerialization } from "effect/rpc";
import { Socket } from "effect/socket";

export const base = process.env.API_URL ?? "http://127.0.0.1:3001";
const origin = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

// The typed client is not needed here: calls go by tag, so its type is kept loose in this one place.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = Record<string, (payload: unknown) => Effect.Effect<any, any>>;
class Api extends Context.Service<Api, Client>()("test/Api") {}
const runtime = ManagedRuntime.make(
  Layer.effect(Api, RpcClient.make(ApiRpcs) as unknown as Effect.Effect<Client>).pipe(
    Layer.provide(RpcClient.layerProtocolHttp({ url: `${base}${rpcPath}` })),
    Layer.provide([FetchHttpClient.layer, RpcSerialization.layerJson]),
  ),
);

const cookies = new Map<string, string>();

export async function signIn(name: string, email: string, password: string) {
  if (cookies.has(name)) return;
  const r = await fetch(`${base}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) throw new Error(`sign in ${email}: ${r.status} ${await r.text()}`);
  cookies.set(name, r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; "));
}

export type Reply = { ok?: any; err?: string }; // eslint-disable-line @typescript-eslint/no-explicit-any

// One RPC call as a user: { ok } or { err } for a declared error (Conflict, NotFound...).
export async function call(who: string, tag: string, payload: unknown = {}): Promise<Reply> {
  const result = await runtime.runPromise(
    Effect.gen(function* () {
      const api = yield* Api;
      return yield* api[tag]!(payload);
    }).pipe(Effect.result, RpcClient.withHeaders({ cookie: cookies.get(who)! })),
  );
  if (Result.isSuccess(result)) return { ok: result.success };
  const f = result.failure as { _tag?: string; message?: string };
  return { err: `${f._tag}: ${f.message ?? JSON.stringify(f)}` };
}

// A call that must succeed.
export async function ok(who: string, tag: string, payload: unknown = {}) {
  const r = await call(who, tag, payload);
  if (r.err) throw new Error(`${who} ${tag} failed: ${r.err}`);
  return r.ok;
}

// A call that must be refused; returns the refusal text.
export async function refused(who: string, tag: string, payload: unknown = {}) {
  const r = await call(who, tag, payload);
  if (r.err === undefined) throw new Error(`${who} ${tag}: expected a refusal, got ${JSON.stringify(r.ok)}`);
  return r.err;
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// The first GameView of the live stream (the presenter's if the user is the teacher).
export async function view(who: string, sessionId: string): Promise<GameView> {
  const issued = await ok(who, "live.ticket", { target: { _tag: "game", sessionId } });
  const sockets = Socket.layerWebSocket(`${base.replace("http", "ws")}${liveRpcPath}`).pipe(
    Layer.provide(Socket.layerWebSocketConstructorGlobal),
  );
  const protocol = RpcClient.layerProtocolSocket({ retryTransientErrors: false }).pipe(
    Layer.provide([sockets, RpcSerialization.layerJson]),
  );
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const client = (yield* RpcClient.make(LiveRpcs)) as unknown as Client;
        const events = yield* client["live.game"]!({ sessionId }).pipe(
          Stream.take(1),
          Stream.runCollect,
          RpcClient.withHeaders({ [liveTicketHeader]: issued.ticket }),
        );
        return (events as GameView[])[0]!;
      }),
    ).pipe(Effect.provide(protocol)) as Effect.Effect<GameView>,
  );
}

// The demo quiz's answers by question type (quiz a2 of the fixture): the right one, or a wrong one.
export function answerFor(q: { type: string }, right: boolean): unknown {
  switch (q.type) {
    case "multiple_choice":
      return right ? "b" : "a";
    case "true_false":
      return right;
    case "blank":
      return right ? ["HAVING"] : ["WHERE"];
    case "sql":
      return right
        ? "SELECT s.name, c.title\nFROM enrollments e\nJOIN students s ON s.id = e.student_id\nJOIN courses c ON c.id = e.course_id;"
        : "SELECT 1;";
    default:
      throw new Error(`unexpected question type ${q.type}`);
  }
}

// The roster students of class c1 (password of the demo accounts).
export const students = ["andrea.santos", "miguel.reyes", "bea.cruz", "carlo.bautista", "denise.garcia", "enzo.mendoza"];
export const studentEmail = (s: string) => `${s}@student.sic.edu.ph`;
export const demoPassword = "examinus-demo";

// Plays a player's questions to the end: every answer right (or wrong for the first one, with `firstWrong`).
export async function finishAll(who: string, sessionId: string, firstWrong = false) {
  let v = await view(who, sessionId);
  let wrong = firstWrong;
  for (let i = 0; i < 8 && !v.finished; i++) {
    if (v.phase === "question") {
      await ok(who, "game.answer", { sessionId, questionId: v.question!.id, value: answerFor(v.question!, !wrong) });
      wrong = false;
    }
    await ok(who, "game.next", { sessionId });
    v = await view(who, sessionId);
  }
  return v;
}

export const nameStarts = (full: string, user: string) => full.toLowerCase().startsWith(user.split(".")[0]!);

// What session.update / session.create take, from a session as session.get returns it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const settingsOf = (got: any, relay: unknown, relayPassword: string | null = "teamwork") => ({
  mode: got.session.mode,
  opensAt: null,
  closesAt: null,
  timeLimitMinutes: null,
  attemptsAllowed: 1,
  resultsRelease: got.session.resultsRelease,
  integrity: got.session.integrity,
  mastery: null,
  exam: null,
  game: { ...got.session.game, relay },
  pacing: "student",
  countInRecord: false,
  oneQuestionAtATime: false,
  questionTimeLimitSeconds: null,
  navigation: got.session.navigation,
  maxMarked: 0,
  lateJoinMinutes: null,
  roomPassword: null,
  ipAllowlist: [],
  allowGuests: false,
  relayPassword,
  relayClues: [],
});

// The fixture's quiz "SQL Joins Quick Check" and its class, whose members are `students`. The test teacher owns them;
// the demo teacher j.reyes@ owns neither, so a call as that teacher is refused.
export const demoQuizId = "a2";
export const demoClassId = "c1";
export const teacherEmail = "teacher@sic.edu.ph";
export const teacherPassword = "12341234";
export const otherTeacherEmail = "j.reyes@sic.edu.ph";

// Settings for a plain quiz session of the demo quiz (what session.create takes besides quizId, classId and startNow),
// with `overrides` on top. The integrity settings are the fixture session's, so they are always valid.
export async function quizSettings(overrides: Record<string, unknown> = {}) {
  const seeded = await ok("teacher", "session.get", { sessionId: `sess-${demoQuizId}` });
  return {
    ...settingsOf(seeded, null, null),
    mode: "quiz",
    game: null,
    resultsRelease: "immediately",
    maxMarked: null,
    ...overrides,
  };
}

// A session of the demo quiz for the demo class, made as the teacher.
export async function createSession(overrides: Record<string, unknown> = {}, startNow = true) {
  return ok("teacher", "session.create", {
    quizId: demoQuizId,
    classId: demoClassId,
    startNow,
    ...(await quizSettings(overrides)),
  });
}

// A classic (not relay) game of the demo quiz for the demo class, teacher-paced unless `pacing` says otherwise; its
// lobby is open when this returns.
export async function createGame(pacing: "teacher" | "student" = "teacher", overrides: Record<string, unknown> = {}) {
  return ok("teacher", "session.create", {
    quizId: demoQuizId,
    classId: demoClassId,
    startNow: true,
    ...(await quizSettings({
      mode: "game",
      pacing,
      game: { questionSeconds: 30, showLeaderboard: true, streakBonus: true, relay: null },
      maxMarked: 0,
      ...overrides,
    })),
  });
}

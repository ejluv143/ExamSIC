import "./load-env.ts";
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { ApiRpcs, LiveRpcs, liveRpcPath, rpcPath } from "@examora/contract";
import { Config, Effect, Layer, Schedule } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http";
import { RpcSerialization, RpcServer } from "effect/rpc";
import { createServer } from "node:http";
import { Assets } from "./Assets.ts";
import { BetterAuth } from "./BetterAuth.ts";
import { Database } from "./Database.ts";
import { AdminHandlers } from "./handlers/AdminHandlers.ts";
import { AssetHandlers } from "./handlers/AssetHandlers.ts";
import { AuthHandlers } from "./handlers/AuthHandlers.ts";
import { AttemptHandlers } from "./handlers/AttemptHandlers.ts";
import { LiveAuthMiddlewareLive, LiveHandlers, LiveTicketHandlers } from "./handlers/LiveHandlers.ts";
import { QuizHandlers } from "./handlers/QuizHandlers.ts";
import { SessionHandlers } from "./handlers/SessionHandlers.ts";
import { LiveHub } from "./Live.ts";
import { Quizzes } from "./Quizzes.ts";
import { Runner } from "./Runner.ts";
import { Storage } from "./Storage.ts";
import { AuthMiddlewareLive } from "./Session.ts";

// Better Auth's own HTTP endpoints, for the browser-driven OAuth flow (the web app forwards /api/auth/*).
const BetterAuthRoute = HttpRouter.use(
  Effect.fn(function* (router) {
    const auth = yield* BetterAuth;
    yield* router.add("*", "/api/auth/*", (request) =>
      HttpServerRequest.toWeb(request).pipe(
        Effect.flatMap((webRequest) => Effect.promise(() => auth.handler(webRequest))),
        Effect.map(HttpServerResponse.fromWeb),
      ),
    );
  }),
);

const HealthRoute = HttpRouter.add("GET", "/health", HttpServerResponse.text("ok"));

// Everything else the web app needs goes through typed RPC (packages/contract/src/rpc.ts).
const RpcRoute = RpcServer.layerHttp({ group: ApiRpcs, path: rpcPath, protocol: "http" }).pipe(
  Layer.provide([
    AuthHandlers,
    AdminHandlers,
    QuizHandlers,
    SessionHandlers,
    AttemptHandlers,
    AssetHandlers,
    LiveTicketHandlers,
    AuthMiddlewareLive,
    RpcSerialization.layerJson,
  ]),
);

// Live sessions: streams over WebSocket, authorised by the ticket `live.ticket` hands out (no login cookie).
const LiveRoute = RpcServer.layerHttp({ group: LiveRpcs, path: liveRpcPath, protocol: "websocket" }).pipe(
  Layer.provide([LiveHandlers, LiveAuthMiddlewareLive, RpcSerialization.layerJson]),
);

// Browsers must connect to the live endpoint from the web app's origin (a ticket is still required). Allowed
// origins: LIVE_ALLOWED_ORIGINS (comma separated), else the origin of BETTER_AUTH_URL. Requests without an
// Origin header aren't browsers and are left to the ticket.
const checkLiveOrigin = <E, R>(effect: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const origin = request.headers["origin"];
    if (origin === undefined || !request.url.startsWith(liveRpcPath)) return yield* effect;
    const configured = yield* Config.String("LIVE_ALLOWED_ORIGINS").pipe(Config.withDefault(""), Effect.orDie);
    const web = yield* Config.String("BETTER_AUTH_URL").pipe(Effect.orDie);
    const allowed = configured
      ? configured.split(",").map((o) => o.trim())
      : [new URL(web).origin];
    return allowed.includes(origin) ? yield* effect : HttpServerResponse.text("Origin not allowed", { status: 403 });
  });

// Every 30 seconds: open and end sessions on schedule, and submit attempts that ran out of time.
const QuizSweep = Layer.effectDiscard(
  Effect.gen(function* () {
    const quizzes = yield* Quizzes;
    yield* quizzes.sweep.pipe(Effect.repeat(Schedule.spaced("30 seconds")), Effect.forkScoped);
  }),
);

// Once a day: delete uploads nothing uses (see Assets.cleanup).
const AssetCleanup = Layer.effectDiscard(
  Effect.gen(function* () {
    const assets = yield* Assets;
    yield* assets.cleanup().pipe(Effect.repeat(Schedule.spaced("1 day")), Effect.forkScoped);
  }),
);

const Routes = Layer.mergeAll(BetterAuthRoute, HealthRoute, RpcRoute, LiveRoute, QuizSweep, AssetCleanup).pipe(
  Layer.provide(Quizzes.layer),
  Layer.provide(LiveHub.layer),
  Layer.provide(Runner.layer),
  Layer.provide(Assets.layer),
  Layer.provide(Storage.layer),
  Layer.provide(BetterAuth.layer),
  Layer.provide(Database.layer),
);

const Server = HttpRouter.serve(Routes, { middleware: checkLiveOrigin }).pipe(
  Layer.provide(
    NodeHttpServer.layerConfig(createServer, {
      port: Config.Port("PORT").pipe(Config.withDefault(3001)),
      // Only the web app talks to the API; keep it off public interfaces unless HOST says otherwise.
      host: Config.String("HOST").pipe(Config.withDefault("127.0.0.1")),
    }),
  ),
);

Layer.launch(Server).pipe(NodeRuntime.runMain);

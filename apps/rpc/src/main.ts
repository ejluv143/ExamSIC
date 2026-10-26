import { BunHttpServer, BunRuntime } from "@effect/platform-bun";
import { ApiRpcs, clientIpHeader, internalSecretHeader, rpcPath } from "@examinus/contract/api";
import { LiveRpcs, liveRpcPath } from "@examinus/contract/live";
import { Effect, Layer, Option, Redacted } from "effect";
import { Headers, HttpEffect, HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http";
import { RpcSerialization, RpcServer } from "effect/rpc";
import * as Admin from "./features/admin/index.ts";
import * as Ai from "./features/ai/index.ts";
import * as Assets from "./features/assets/index.ts";
import * as Attempt from "./features/attempt/index.ts";
import * as Attendance from "./features/attendance/index.ts";
import * as Auth from "./features/auth/index.ts";
import { BetterAuth } from "./features/auth/BetterAuth.ts";
import * as Bank from "./features/bank/index.ts";
import * as Classes from "./features/classes/index.ts";
import * as Client from "./features/client/index.ts";
import * as Exam from "./features/exam/index.ts";
import * as Game from "./features/game/index.ts";
import * as Live from "./features/live/index.ts";
import * as Mastery from "./features/mastery/index.ts";
import * as Organization from "./features/organization/index.ts";
import * as Quiz from "./features/quiz/index.ts";
import * as Records from "./features/records/index.ts";
import * as Session from "./features/session/index.ts";
import { AppConfig } from "./platform/AppConfig.ts";
import { Cache } from "./platform/Cache.ts";
import { Database } from "./platform/Database.ts";
import { resolveClientIp } from "./platform/network.ts";
import { LiveBus } from "./platform/LiveBus.ts";
import { Observability } from "./platform/Observability.ts";
import { rpcSpanPrefix } from "./platform/RpcCallLog.ts";
import { RateLimiter } from "./platform/RateLimiter.ts";
import { Runner } from "./platform/Runner.ts";
import { Storage } from "./platform/Storage.ts";

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

// Each feature (features/<name>/index.ts) exports three layers:
// - `Live`: its RPC handlers and background jobs;
// - `Services`: its services, which other features may use too;
// - `Repo`: its database access.
// Services are stacked so each feature's services sit above the ones they use (a feature's services and its
// handlers can't come as one layer: live's handlers stream game views while the game publishes through LiveHub).
// Every layer here is built once, so all features share one instance of each service.
const Platform = Layer.mergeAll(RateLimiter.layer, Runner.layer, Storage.layer).pipe(
  Layer.provideMerge(Layer.mergeAll(Database.layer, Cache.layer, LiveBus.layer)),
);

const Repos = Layer.mergeAll(
  Admin.Repo,
  Ai.Repo,
  Assets.Repo,
  Attempt.Repo,
  Attendance.Repo,
  Auth.Repo,
  Bank.Repo,
  Classes.Repo,
  Exam.Repo,
  Game.Repo,
  Live.Repo,
  Mastery.Repo,
  Organization.Repo,
  Quiz.Repo,
  Records.Repo,
  Session.Repo,
);

const Services = Layer.mergeAll(Admin.Services, Records.Services, Attendance.Services).pipe(
  Layer.provideMerge(Classes.Services),
  Layer.provideMerge(Organization.Services),
  Layer.provideMerge(Auth.Services),
  Layer.provideMerge(Layer.mergeAll(Session.Services, Mastery.Services)),
  Layer.provideMerge(Game.Services),
  Layer.provideMerge(Attempt.Services),
  Layer.provideMerge(Exam.Services),
  Layer.provideMerge(Layer.mergeAll(Live.Services, Ai.Services, Assets.Services, Bank.Services, Client.Services, Quiz.Services)),
  Layer.provideMerge(Repos),
  Layer.provideMerge(Platform),
);

const Features = Layer.mergeAll(
  Admin.Live,
  Ai.Live,
  Assets.Live,
  Attempt.Live,
  Attendance.Live,
  Auth.Live,
  Bank.Live,
  Classes.Live,
  Client.Live,
  Exam.Live,
  Game.Live,
  Live.Live,
  Mastery.Live,
  Organization.Live,
  Quiz.Live,
  Records.Live,
  Session.Live,
);

// The client address `sent` settles to, for this request (see resolveClientIp): `clientIpHeader` set to it, and the
// caller's own value there, and the internal secret, dropped.
const settler = (request: HttpServerRequest.HttpServerRequest, server: AppConfig["Service"]["server"]) => (sent: Headers.Headers) => {
  const ip = resolveClientIp({
    transport: request.headers,
    sent,
    remoteAddress: Option.getOrNull(request.remoteAddress),
    internalSecret: Redacted.value(server.internalSecret),
    trustedProxyHops: server.trustedProxyHops,
  });
  const rest = Headers.removeMany(sent, [clientIpHeader, internalSecretHeader]);
  return ip === null ? rest : Headers.set(rest, clientIpHeader, ip);
};

// Every request's client address is settled once, here, into `clientIpHeader` for the handlers and Better Auth.
const settleClientIp = <E, R>(effect: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const { server } = yield* AppConfig;
    const headers = settler(request, server)(request.headers);
    return yield* Effect.provideService(effect, HttpServerRequest.HttpServerRequest, request.modify({ headers }));
  });

// An RPC carries headers inside each message too (the web app's client sends the browser's address and the secret
// that way), and the RPC server lets those override the HTTP ones, so the RPC route settles each message as well.
// It runs on the route, not on a path, so every spelling the router accepts (/rpc/, /RPC) goes through it. The live
// WebSocket isn't covered: its handlers don't read the client address.
const SettleRpcMessages = HttpRouter.middleware(
  Effect.gen(function* () {
    const { server } = yield* AppConfig;
    return (effect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const settle = settler(request, server);
        const body = yield* Effect.orDie(request.text);
        // The HTTP headers were settled already (settleClientIp); a message that names no address or secret of its own
        // keeps that address, and one that does is settled again with what it sent (the secret must come with it).
        const settled = settleMessages(body, (sent) => {
          const own = Headers.fromInput(sent);
          const merged = Headers.merge(request.headers, own);
          return clientIpHeader in own || internalSecretHeader in own ? settle(merged) : merged;
        });
        const rewritten = HttpServerRequest.fromWeb(
          new Request(new URL(request.url, "http://api").href, {
            method: request.method,
            headers: Object.entries(Headers.remove(request.headers, "content-length")),
            body: settled,
          }),
        );
        return yield* Effect.provideService(effect, HttpServerRequest.HttpServerRequest, rewritten);
      });
  }),
).layer;

// The JSON body of an RPC request (one message or an array) with every request message's headers replaced by
// `settle`'s. A body that isn't JSON is left for the RPC server to refuse.
function settleMessages(body: string, settle: (sent: ReadonlyArray<[string, string]>) => Headers.Headers): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return body;
  }
  const messages = (Array.isArray(parsed) ? parsed : [parsed]) as Array<{ _tag?: unknown; headers?: unknown }>;
  for (const message of messages) {
    if (message === null || typeof message !== "object" || message._tag !== "Request") continue;
    const sent = Array.isArray(message.headers) ? (message.headers as Array<[string, string]>) : [];
    message.headers = Object.entries(settle(sent));
  }
  return JSON.stringify(parsed);
}

// Everything else the web app needs goes through typed RPC (packages/contract/src/rpc.ts).
const RpcRoute = RpcServer.layerHttp({ group: ApiRpcs, path: rpcPath, protocol: "http", spanPrefix: rpcSpanPrefix }).pipe(
  Layer.provide([Features, RpcSerialization.layerJson]),
  Layer.provide(SettleRpcMessages),
);

// Live sessions: streams over WebSocket, authorised by the ticket `live.ticket` hands out (no login cookie).
const LiveRoute = RpcServer.layerHttp({ group: LiveRpcs, path: liveRpcPath, protocol: "websocket", spanPrefix: rpcSpanPrefix }).pipe(
  Layer.provide([Features, RpcSerialization.layerJson]),
);

// Browsers must connect to the live endpoint from the web app's origin (a ticket is still required). Allowed
// origins: LIVE_ALLOWED_ORIGINS (comma separated), else the origin of BETTER_AUTH_URL. Requests without an
// Origin header aren't browsers and are left to the ticket.
const checkLiveOrigin = <E, R>(effect: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const origin = request.headers["origin"];
    if (origin === undefined || !request.url.startsWith(liveRpcPath)) return yield* effect;
    const { server, auth } = yield* AppConfig;
    const allowed = server.liveAllowedOrigins.length > 0 ? server.liveAllowedOrigins : [new URL(auth.url).origin];
    return allowed.includes(origin) ? yield* effect : HttpServerResponse.text("Origin not allowed", { status: 403 });
  });

// Only Expo's web build (a browser) calls the API from another origin. For origins in LIVE_ALLOWED_ORIGINS this answers
// preflight requests and lets the page send `Authorization` and read `set-auth-token` (the session token that
// sign-in returns). Native apps send no Origin header and are untouched; so is every other origin.
const cors = <E, R>(effect: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const origin = request.headers["origin"];
    const { server } = yield* AppConfig;
    const allowed = origin !== undefined && server.liveAllowedOrigins.includes(origin);
    const headers = allowed
      ? {
          "access-control-allow-origin": origin,
          "access-control-allow-headers": "authorization, content-type, x-live-ticket",
          "access-control-allow-methods": "GET, POST, OPTIONS",
          "access-control-expose-headers": "set-auth-token",
          vary: "Origin",
        }
      : {};
    if (request.method === "OPTIONS") return HttpServerResponse.empty({ status: 204, headers });
    // A matched route writes its response before this middleware sees it, so the headers go on in a pre-response handler.
    return yield* HttpEffect.withPreResponseHandler(effect, (_request, response) =>
      Effect.succeed(HttpServerResponse.setHeaders(response, headers)),
    );
  });

const Routes = Layer.mergeAll(BetterAuthRoute, HealthRoute, RpcRoute, LiveRoute).pipe(
  Layer.provide(Services),
  Layer.provide(AppConfig.layer),
);

const HttpServer = Layer.unwrap(
  Effect.gen(function* () {
    const { server } = yield* AppConfig;
    return BunHttpServer.layer({ port: server.port, hostname: server.host });
  }),
);

const Server = HttpRouter.serve(Routes, { middleware: (effect) => cors(checkLiveOrigin(settleClientIp(effect))) }).pipe(
  Layer.provide(HttpServer),
  // Logger, minimum log level and the per-RPC-call log line (see platform/Observability.ts).
  Layer.provide(Observability),
  Layer.provide(AppConfig.layer),
);

Layer.launch(Server).pipe(BunRuntime.runMain);

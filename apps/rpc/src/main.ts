import { BunHttpServer, BunRuntime } from "@effect/platform-bun";
import { ApiRpcs, rpcPath } from "@examinus/contract/api";
import { LiveRpcs, liveRpcPath } from "@examinus/contract/live";
import { Effect, Layer } from "effect";
import { HttpEffect, HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http";
import { RpcSerialization, RpcServer } from "effect/rpc";
import { BetterAuth } from "./features/auth/BetterAuth.ts";
import { Handlers, Services } from "./features/registry.ts";
import { AppConfig } from "./platform/AppConfig.ts";
import { Cache } from "./platform/Cache.ts";
import { Database } from "./platform/Database.ts";
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

// What each feature contributes (repo, services, handlers) is declared in features/registry.ts. The platform
// underneath is built once, so all features share one instance of each service.
const Platform = Layer.mergeAll(RateLimiter.layer, Runner.layer, Storage.layer).pipe(
  Layer.provideMerge(Layer.mergeAll(Database.layer, Cache.layer, LiveBus.layer)),
);

const AllServices = Services.pipe(Layer.provideMerge(Platform));

// Everything else the web app needs goes through typed RPC (packages/contract/src/rpc.ts).
const RpcRoute = RpcServer.layerHttp({ group: ApiRpcs, path: rpcPath, protocol: "http", spanPrefix: rpcSpanPrefix }).pipe(
  Layer.provide([Handlers, RpcSerialization.layerJson]),
);

// Live sessions: streams over WebSocket, authorised by the ticket `live.ticket` hands out (no login cookie).
const LiveRoute = RpcServer.layerHttp({ group: LiveRpcs, path: liveRpcPath, protocol: "websocket", spanPrefix: rpcSpanPrefix }).pipe(
  Layer.provide([Handlers, RpcSerialization.layerJson]),
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
  Layer.provide(AllServices),
  Layer.provide(AppConfig.layer),
);

const HttpServer = Layer.unwrap(
  Effect.gen(function* () {
    const { server } = yield* AppConfig;
    return BunHttpServer.layer({ port: server.port, hostname: server.host });
  }),
);

const Server = HttpRouter.serve(Routes, { middleware: (effect) => cors(checkLiveOrigin(effect)) }).pipe(
  Layer.provide(HttpServer),
  // Logger, minimum log level and the per-RPC-call log line (see platform/Observability.ts).
  Layer.provide(Observability),
  Layer.provide(AppConfig.layer),
);

Layer.launch(Server).pipe(BunRuntime.runMain);

import "./load-env.ts";
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { ApiRpcs, rpcPath } from "@examora/contract";
import { Config, Effect, Layer } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http";
import { RpcSerialization, RpcServer } from "effect/rpc";
import { createServer } from "node:http";
import { BetterAuth } from "./BetterAuth.ts";
import { Database } from "./Database.ts";
import { AdminHandlers } from "./handlers/AdminHandlers.ts";
import { AuthHandlers } from "./handlers/AuthHandlers.ts";
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
  Layer.provide([AuthHandlers, AdminHandlers, AuthMiddlewareLive, RpcSerialization.layerJson]),
);

const Routes = Layer.mergeAll(BetterAuthRoute, HealthRoute, RpcRoute).pipe(
  Layer.provide(BetterAuth.layer),
  Layer.provide(Database.layer),
);

const Server = HttpRouter.serve(Routes).pipe(
  Layer.provide(
    NodeHttpServer.layerConfig(createServer, {
      port: Config.Port("PORT").pipe(Config.withDefault(3001)),
      // Only the web app talks to the API; keep it off public interfaces unless HOST says otherwise.
      host: Config.String("HOST").pipe(Config.withDefault("127.0.0.1")),
    }),
  ),
);

Layer.launch(Server).pipe(NodeRuntime.runMain);

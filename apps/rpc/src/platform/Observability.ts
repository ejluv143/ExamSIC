import { Effect, Layer, Logger, Redacted, References } from "effect";
import { FetchHttpClient, HttpMiddleware } from "effect/http";
import { Otlp } from "effect/observability";
import { AppConfig } from "./AppConfig.ts";
import { ProcessMetrics } from "./Metrics.ts";
import { rpcCallLog } from "./RpcCallLog.ts";

// Logging, tracing and metrics for the whole API.
// - LOG_FORMAT picks pretty console lines (the default, for people) or one JSON object per line (for log
//   collectors); LOG_LEVEL sets the minimum level.
// - Every RPC call logs one line and records its duration (see RpcCallLog.ts).
// - With OTEL_EXPORTER_OTLP_ENDPOINT set, spans, metrics (Metrics.ts) and logs are also sent there over
//   OTLP/HTTP; without it nothing leaves the process.
const LogOutput = Layer.unwrap(
  Effect.gen(function* () {
    const { log } = yield* AppConfig;
    return Layer.merge(
      Logger.layer([log.format === "json" ? Logger.consoleJson : Logger.consolePretty()]),
      Layer.succeed(References.MinimumLogLevel, log.level),
    );
  }),
);

// Built on top of LogOutput, so the OTLP logger joins the console one and the RPC tracer wraps the OTLP tracer.
const Telemetry = Layer.unwrap(
  Effect.gen(function* () {
    const { telemetry } = yield* AppConfig;
    const tracer = rpcCallLog(telemetry.sampleRatio);
    if (telemetry.endpoint === "") return tracer;
    const otlp = Otlp.layerProtobuf({
      baseUrl: telemetry.endpoint,
      resource: { serviceName: telemetry.serviceName, serviceVersion: process.env.npm_package_version },
      headers: Redacted.value(telemetry.headers),
      metricsExportInterval: "15 seconds",
    }).pipe(Layer.provide(FetchHttpClient.layer));
    return tracer.pipe(Layer.provideMerge(otlp));
  }),
);

// HTTP server spans named `POST /rpc` instead of just the method; the query string stays out of the name.
const HttpSpanNames = Layer.succeed(HttpMiddleware.SpanNameGenerator, (request) => `${request.method} ${request.url.split("?")[0]}`);

export const Observability = Layer.mergeAll(Telemetry, ProcessMetrics, HttpSpanNames).pipe(Layer.provideMerge(LogOutput));

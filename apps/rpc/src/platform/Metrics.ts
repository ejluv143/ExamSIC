// The API's metrics, exported over OTLP when OTEL_EXPORTER_OTLP_ENDPOINT is set (see Observability.ts) and
// charted by the Grafana dashboards in observability/grafana. Without an endpoint they are still counted in memory,
// which costs next to nothing.
//
// Attribute values must stay few (names, outcomes, types): never ids, emails or answers. Every distinct combination
// is its own time series. Names are already Prometheus-style; counters gain `_total` and histograms
// `_bucket`/`_sum`/`_count` once ingested.
import { Cause, Effect, Exit, Layer, Metric, Option, Schedule } from "effect";

// Milliseconds, from a cache hit to a slow AI call.
const durationBoundaries = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000, 60000];

const duration = (name: string, description: string) => Metric.histogram(name, { description, boundaries: durationBoundaries });
const events = (name: string, description: string) => Metric.counter(name, { description, incremental: true });

// Every RPC call (HTTP and live streams), recorded as its `RpcServer.<rpc>` span ends. Attributes: rpc, outcome.
export const rpcDuration = duration("examinus_rpc_duration_ms", "RPC call duration in milliseconds");
// Every Database.query / queryUnique. Attributes: operation, outcome.
export const dbQueryDuration = duration("examinus_db_query_duration_ms", "PostgreSQL query duration in milliseconds");
// Every code-runner request. Attributes: outcome (ok, failed, rejected, unreachable).
export const runnerDuration = duration("examinus_runner_duration_ms", "Code runner request duration in milliseconds");
// Every AI provider call. Attributes: provider, model, outcome.
export const aiDuration = duration("examinus_ai_duration_ms", "AI provider call duration in milliseconds");

// Attempt lifecycle. Attributes: event (start, save, submit, heartbeat, auto_submit); auto_submit also has reason
// (time_up, session_ended, teacher). Submits include game and mastery attempts.
export const attemptEvents = events("examinus_attempt_events", "Attempt lifecycle events");
// Anti-cheating events stored for attempts. Attributes: type.
export const integrityEvents = events("examinus_integrity_events", "Integrity events recorded for attempts");
// Requests refused by a rate limit. Attributes: limit.
export const rateLimited = events("examinus_rate_limited", "Requests refused by a rate limit");
// Cache reads. Attributes: result (hit, miss).
export const cacheReads = events("examinus_cache_reads", "Cache reads by result");
// Confirmed uploads. Attributes: purpose, outcome.
export const assetUploads = events("examinus_asset_uploads", "Asset uploads confirmed");

// Open live streams on this instance (teacher monitors, student and game views). Goes up and down. Attributes: stream.
export const liveStreams = Metric.counter("examinus_live_streams", { description: "Open live streams" });
// Game rooms held in memory by this instance.
export const gameRooms = Metric.gauge("examinus_game_rooms", { description: "Game rooms held in memory" });

const heapUsed = Metric.gauge("examinus_process_heap_used_bytes", { description: "JavaScript heap in use" });
const rss = Metric.gauge("examinus_process_rss_bytes", { description: "Resident set size" });
const eventLoopLag = Metric.gauge("examinus_event_loop_lag_ms", { description: "Delay of a zero-millisecond timer" });

// Records `input` on `metric` with `attributes`.
export const record = <I>(metric: Metric.Metric<I, unknown>, input: I, attributes: Record<string, string>) =>
  Metric.update(Metric.withAttributes(metric, attributes), input);

export const count = (metric: Metric.Metric<number, unknown>, attributes: Record<string, string>, n = 1) =>
  record(metric, n, attributes);

// How an effect ended, as a metric or span attribute: "ok", the declared error's tag (Forbidden, NotFound…),
// "defect" for a crash, or "interrupted" when the caller went away.
export const outcomeOf = (exit: Exit.Exit<unknown, unknown>): string => {
  if (Exit.isSuccess(exit)) return "ok";
  const error = Cause.findErrorOption(exit.cause);
  if (Option.isSome(error)) {
    const value: unknown = error.value;
    return typeof value === "object" && value !== null && "_tag" in value ? String(value._tag) : "failed";
  }
  return Cause.hasInterruptsOnly(exit.cause) ? "interrupted" : "defect";
};

// Records how long `self` took on `metric`, with `attributes` plus its outcome (`outcomeOf`, unless `outcome` says
// otherwise, e.g. for effects that report failure in their value).
export const timed =
  <A, E>(
    metric: Metric.Metric<number, unknown>,
    attributes: Record<string, string>,
    outcome: (exit: Exit.Exit<A, E>) => string = outcomeOf,
  ) =>
  <R>(self: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    Effect.suspend(() => {
      const start = performance.now();
      return self.pipe(
        Effect.onExit((exit) => record(metric, performance.now() - start, { ...attributes, outcome: outcome(exit) })),
      );
    });

const sampleProcess = Effect.gen(function* () {
  const start = performance.now();
  yield* Effect.promise(() => {
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, 0);
    return promise;
  });
  yield* Metric.update(eventLoopLag, performance.now() - start);
  const memory = process.memoryUsage();
  yield* Metric.update(heapUsed, memory.heapUsed);
  yield* Metric.update(rss, memory.rss);
});

// Heap, RSS and event-loop lag every 10 seconds, plus Effect's fiber counts.
export const ProcessMetrics = Layer.merge(
  Layer.effectDiscard(Effect.forkScoped(sampleProcess.pipe(Effect.repeat(Schedule.spaced("10 seconds"))))),
  Metric.enableRuntimeMetricsLayer,
);

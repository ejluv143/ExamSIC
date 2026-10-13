// One console line and one `examinus_rpc_duration_ms` sample per RPC call: its name, how it ended and how long it
// took, e.g.
//   INFO (#12): session.list ok { 'rpc.ms': 14 }
//   INFO (#40): attempt.start Conflict { 'rpc.ms': 6 }
// main.ts names every RPC call's span `RpcServer.<rpc>` (the `spanPrefix` of both RPC routes); this tracer wraps
// the current one (the OTLP exporter when telemetry is on, else Effect's native tracer) and acts as each of those
// spans ends, so every group (HTTP and live streams) is covered without touching the handlers.
//
// It also applies head sampling: a trace that starts here (no incoming traceparent) is kept with probability
// `sampleRatio`; its spans inherit the decision. Metrics and log lines are kept for every call either way.
import { Effect, Layer, Tracer } from "effect";
import { outcomeOf, record, rpcDuration } from "./Metrics.ts";

export const rpcSpanPrefix = "RpcServer";
const prefix = `${rpcSpanPrefix}.`;

export const rpcCallLog = (sampleRatio: number) =>
  Layer.effect(
    Tracer.Tracer,
    Effect.gen(function* () {
      const inner = yield* Tracer.Tracer;
      // The layer's own context carries the configured loggers (console, and OTLP when on).
      const run = Effect.runForkWith(yield* Effect.context<never>());
      return Tracer.make({
        context: inner.context,
        span(options) {
          const sampled = options.parent._tag === "None" && sampleRatio < 1 ? options.sampled && Math.random() < sampleRatio : options.sampled;
          const span = inner.span({ ...options, sampled });
          if (!options.name.startsWith(prefix)) return span;
          const end = span.end.bind(span);
          span.end = (endTime, exit) => {
            const outcome = outcomeOf(exit);
            span.attribute("rpc.outcome", outcome);
            end(endTime, exit);
            const ms = Number((endTime - options.startTime) / 1_000_000n);
            const rpc = options.name.slice(prefix.length);
            // Defects are already reported in full by the RPC server; this line only names the call.
            const log = Effect.logInfo(`${rpc} ${outcome}`).pipe(Effect.annotateLogs("rpc.ms", ms));
            run(Effect.andThen(record(rpcDuration, ms, { rpc, outcome }), log));
          };
          return span;
        },
      });
    }),
  );


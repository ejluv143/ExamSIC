// One console line per RPC call: its name, how it ended and how long it took, e.g.
//   INFO (#12): session.list ok { 'rpc.ms': 14 }
//   INFO (#40): attempt.start Conflict { 'rpc.ms': 6 }
// The RPC server already wraps every call in a span named `RpcServer.<rpc>`; this tracer is the default one with a
// line logged as each of those spans ends, so every group (HTTP and live streams) is covered without touching
// the handlers.
import { Cause, Effect, Layer, Option, Tracer } from "effect";

const prefix = "RpcServer.";

// What a failed call failed with: the declared error's tag (Forbidden, NotFound…), "defect" for a crash, or
// "interrupted" when the client went away.
function outcome(cause: Cause.Cause<unknown>): string {
  const error = Cause.findErrorOption(cause);
  if (Option.isSome(error)) {
    const value: unknown = error.value;
    return typeof value === "object" && value !== null && "_tag" in value ? String(value._tag) : "failed";
  }
  return Cause.hasInterruptsOnly(cause) ? "interrupted" : "defect";
}

const tracer = Tracer.make({
  span(options) {
    const span = Tracer.nativeTracer.span(options);
    if (!options.name.startsWith(prefix)) return span;
    const end = span.end.bind(span);
    span.end = (endTime, exit) => {
      end(endTime, exit);
      const ms = Number((endTime - options.startTime) / 1_000_000n);
      const name = options.name.slice(prefix.length);
      const log = exit._tag === "Success" ? Effect.logInfo(`${name} ok`) : Effect.logInfo(`${name} ${outcome(exit.cause)}`);
      // Defects are already reported in full by the RPC server; this line only names the call.
      Effect.runFork(log.pipe(Effect.annotateLogs("rpc.ms", ms)));
    };
    return span;
  },
});

export const RpcCallLog = Layer.succeed(Tracer.Tracer, tracer);

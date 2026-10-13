import { Effect, Layer, Logger, References } from "effect";
import { AppConfig } from "./AppConfig.ts";
import { RpcCallLog } from "./RpcCallLog.ts";

// Logging and tracing for the whole API: LOG_FORMAT picks pretty console lines (the default, for people) or one
// JSON object per line (for log collectors), LOG_LEVEL sets the minimum level, and every RPC call logs one line
// (see RpcCallLog.ts).
const LogOutput = Layer.unwrap(
  Effect.gen(function* () {
    const { log } = yield* AppConfig;
    return Layer.merge(
      Logger.layer([log.format === "json" ? Logger.consoleJson : Logger.consolePretty()]),
      Layer.succeed(References.MinimumLogLevel, log.level),
    );
  }),
);

export const Observability = Layer.merge(LogOutput, RpcCallLog);

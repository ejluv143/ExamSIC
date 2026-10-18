// Shared by the service tests: an AppConfig with fixed values, and helpers to run an Effect and read how it failed.
import { Cause, Effect, Exit, Layer, Option, Redacted } from "effect";
import { AppConfig } from "../platform/AppConfig.ts";

export const testConfig = Layer.succeed(
  AppConfig,
  AppConfig.of({
    server: { port: 0, host: "127.0.0.1", liveAllowedOrigins: [] },
    log: { level: "Error", format: "pretty" },
    telemetry: { endpoint: "", serviceName: "examinus-api", headers: Redacted.make({}), sampleRatio: 1 },
    database: { url: Redacted.make("postgresql://test") },
    cache: { url: Redacted.make("redis://test") },
    auth: {
      secret: Redacted.make("test-secret-test-secret-test-secret-00"),
      url: "http://localhost:3000",
      googleClientId: Option.none(),
      googleClientSecret: Option.none(),
      mcpResourceUrl: "http://127.0.0.1:3002/mcp",
    },
    runner: { url: "", secret: "" },
    storage: {
      bucket: "test",
      region: "test",
      endpoint: "http://localhost:9000",
      publicEndpoint: "http://localhost:9000",
      accessKeyId: "test",
      secretAccessKey: Redacted.make("test"),
    },
    classroom: { apiUrl: "http://localhost/classroom", tokenUrl: "http://localhost/token" },
    organizations: { customRoles: false },
    api: { version: "0.1.0" },
    desktop: { minVersion: "1.2.0", releasesRepo: "ejluv143/ExamSIC" },
  }),
);

// The typed failure of an effect that is expected to fail (a refusal such as Forbidden or NotFound).
export const failureOf = async <A, E>(effect: Effect.Effect<A, E>): Promise<E> => {
  const exit = await Effect.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) throw new Error(`expected a failure, got ${JSON.stringify(exit.value)}`);
  const failure = Cause.findErrorOption(exit.cause);
  if (Option.isNone(failure)) throw new Error(`expected a typed failure, got ${Cause.pretty(exit.cause)}`);
  return failure.value;
};

// A stand-in for a service with only the members a test uses. Services read their dependencies' members when they are
// built, so an unused member can't throw on access: it is a function and an effect that both die with a clear message
// when actually called or run.
export const stub = <S extends object>(name: string, members: Partial<S>): S =>
  new Proxy(members as S, {
    get: (target, key) => {
      if (key in target) return target[key as keyof S];
      if (typeof key === "symbol" || key === "then") return undefined;
      const message = `${name}.${key} was used but the test's stub doesn't provide it`;
      const died = Effect.die(new Error(message));
      const unused = () => died;
      return Object.assign(Object.setPrototypeOf(unused, Object.getPrototypeOf(died)), died);
    },
  });

// Runs effects against a layer that provides everything they need: `run` for the result, `fail` for the typed failure.
export const harness = <R, E>(layer: Layer.Layer<R, E>) => ({
  run: <A, F>(effect: Effect.Effect<A, F, R>) => Effect.runPromise(Effect.provide(effect, layer)),
  fail: <A, F>(effect: Effect.Effect<A, F, R>) => failureOf(Effect.provide(effect, layer)),
});

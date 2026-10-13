import { Config, Context, Effect, Layer, Option, Redacted } from "effect";
import type { LogLevel } from "effect/LogLevel";

const text = (name: string) => Config.String(name).pipe(Config.withDefault(""));

// Every environment value the API reads, in one place. It is read once when the layer is built, so a missing
// required value stops the API at startup, and services take what they need from here instead of reading the
// environment themselves. (The database scripts under src/database run without the server layers and read their own.)
export class AppConfig extends Context.Service<
  AppConfig,
  {
    readonly server: {
      readonly port: number;
      // Only the web app talks to the API; keep it off public interfaces unless HOST says otherwise.
      readonly host: string;
      // LIVE_ALLOWED_ORIGINS split on commas; empty means the origin of `auth.url`.
      readonly liveAllowedOrigins: readonly string[];
    };
    readonly log: {
      readonly level: LogLevel;
      readonly format: "pretty" | "json";
    };
    // OpenTelemetry export (see platform/Observability.ts). Empty endpoint: nothing is exported.
    readonly telemetry: {
      readonly endpoint: string;
      readonly serviceName: string;
      // OTEL_EXPORTER_OTLP_HEADERS, e.g. a vendor's authorization header.
      readonly headers: Redacted.Redacted<Record<string, string>>;
      // OTEL_TRACES_SAMPLER_ARG: share of traces started here that are kept, 0 to 1.
      readonly sampleRatio: number;
    };
    readonly database: { readonly url: Redacted.Redacted };
    readonly cache: { readonly url: Redacted.Redacted };
    readonly auth: {
      // Also derives the key that encrypts school AI keys, and signs live tickets.
      readonly secret: Redacted.Redacted;
      readonly url: string;
      readonly googleClientId: Option.Option<string>;
      readonly googleClientSecret: Option.Option<Redacted.Redacted>;
    };
    readonly runner: { readonly url: string; readonly secret: string };
    readonly storage: {
      readonly bucket: string;
      readonly region: string;
      readonly endpoint: string;
      readonly publicEndpoint: string;
      readonly accessKeyId: string;
      readonly secretAccessKey: Redacted.Redacted;
    };
    readonly classroom: {
      // Overridable so tests can stand in for Google.
      readonly apiUrl: string;
      readonly tokenUrl: string;
    };
  }
>()("examinus/api/AppConfig") {
  static readonly layer = Layer.effect(
    AppConfig,
    Effect.gen(function* () {
      const liveAllowedOrigins = yield* text("LIVE_ALLOWED_ORIGINS");
      return AppConfig.of({
        server: {
          port: yield* Config.Port("PORT").pipe(Config.withDefault(3001)),
          host: yield* Config.String("HOST").pipe(Config.withDefault("127.0.0.1")),
          liveAllowedOrigins: liveAllowedOrigins ? liveAllowedOrigins.split(",").map((o) => o.trim()) : [],
        },
        log: {
          level: yield* Config.LogLevel("LOG_LEVEL").pipe(Config.withDefault("Info" as const)),
          format: (yield* text("LOG_FORMAT")) === "json" ? "json" : "pretty",
        },
        telemetry: {
          endpoint: yield* text("OTEL_EXPORTER_OTLP_ENDPOINT"),
          serviceName: yield* Config.String("OTEL_SERVICE_NAME").pipe(Config.withDefault("examinus-api")),
          headers: Redacted.make(
            Object.fromEntries(
              (yield* text("OTEL_EXPORTER_OTLP_HEADERS"))
                .split(",")
                .filter((pair) => pair.includes("="))
                .map((pair) => {
                  const at = pair.indexOf("=");
                  return [decodeURIComponent(pair.slice(0, at).trim()), decodeURIComponent(pair.slice(at + 1).trim())];
                }),
            ),
          ),
          sampleRatio: Math.min(1, Math.max(0, yield* Config.Number("OTEL_TRACES_SAMPLER_ARG").pipe(Config.withDefault(1)))),
        },
        database: { url: yield* Config.Redacted("DATABASE_URL") },
        cache: {
          url: yield* Config.Redacted("REDIS_URL").pipe(Config.withDefault(Redacted.make("redis://127.0.0.1:6390"))),
        },
        auth: {
          secret: yield* Config.Redacted("BETTER_AUTH_SECRET"),
          url: yield* Config.String("BETTER_AUTH_URL"),
          googleClientId: yield* Config.option(Config.NonEmptyString("GOOGLE_CLIENT_ID")),
          googleClientSecret: yield* Config.option(Config.Redacted("GOOGLE_CLIENT_SECRET")),
        },
        runner: { url: yield* text("RUNNER_URL"), secret: yield* text("RUNNER_SECRET") },
        storage: {
          bucket: yield* text("S3_BUCKET"),
          region: yield* text("S3_REGION"),
          endpoint: yield* text("S3_ENDPOINT"),
          publicEndpoint: yield* text("S3_PUBLIC_ENDPOINT"),
          accessKeyId: yield* text("S3_ACCESS_KEY_ID"),
          secretAccessKey: yield* Config.Redacted("S3_SECRET_ACCESS_KEY").pipe(Config.withDefault(Redacted.make(""))),
        },
        classroom: {
          apiUrl: yield* Config.String("CLASSROOM_API_URL").pipe(
            Config.withDefault("https://classroom.googleapis.com/v1"),
          ),
          tokenUrl: yield* Config.String("GOOGLE_TOKEN_URL").pipe(
            Config.withDefault("https://oauth2.googleapis.com/token"),
          ),
        },
      });
    }),
  );
}

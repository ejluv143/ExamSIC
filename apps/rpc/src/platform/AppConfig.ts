import { parseSemver, semverPattern } from "@examinus/domain/client";
import { Config, Context, Effect, Layer, Option, Redacted, Schema } from "effect";
import type { LogLevel } from "effect/LogLevel";
import { readFileSync } from "node:fs";

const text = (name: string) => Config.String(name).pipe(Config.withDefault(""));

// The version field of apps/rpc/package.json: the API follows semantic versioning and is released as `rpc-v<version>`.
function packageVersion(): string {
  const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version?: unknown };
  if (typeof pkg.version !== "string" || parseSemver(pkg.version) === null)
    throw new Error(`apps/rpc/package.json needs a semantic "version"; found ${JSON.stringify(pkg.version)}`);
  return pkg.version;
}

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
      // MCP_RESOURCE_URL: the MCP server's endpoint (apps/mcp), the audience of the access tokens MCP clients get.
      readonly mcpResourceUrl: string;
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
    readonly organizations: {
      // ORG_CUSTOM_ROLES: organizations may define roles of their own (Better Auth's dynamic access control).
      readonly customRoles: boolean;
    };
    // The API's own version (apps/rpc/package.json), published as auth.config so clients can show it.
    readonly api: { readonly version: string };
    readonly desktop: {
      // DESKTOP_MIN_VERSION: the oldest desktop app build allowed to open a paper or start an attempt. Raise it after
      // a security fix so every lab machine updates before the next exam.
      readonly minVersion: string;
      // DESKTOP_RELEASES_REPO: the GitHub repository (owner/name) whose releases carry the desktop installers.
      readonly releasesRepo: string;
    };
    readonly mobile: {
      // MOBILE_APP_SCHEME: the URL scheme of the mobile app (Better Auth's Expo plugin trusts it as an origin).
      readonly scheme: string;
      // MOBILE_MIN_VERSION: the oldest mobile app build allowed to open a paper or start an attempt.
      readonly minVersion: string;
      // MOBILE_UPDATE_URL: the store page (or download page) a mobile app older than that is sent to.
      readonly storeUrl: Option.Option<string>;
    };
    // What `client.attest` checks a device against (features/client/Attestation.ts). A platform whose values are
    // missing refuses its devices.
    readonly attestation: {
      // DESKTOP_ATTEST_KEY: the key built into the desktop app. An embedded key only raises the bar.
      readonly desktopKey: Redacted.Redacted;
      readonly playIntegrity: {
        // PLAY_INTEGRITY_PACKAGE_NAME: the Android app's package name.
        readonly packageName: string;
        // PLAY_INTEGRITY_SERVICE_ACCOUNT: the Google service account (JSON) allowed to decode integrity tokens.
        readonly serviceAccount: Option.Option<Redacted.Redacted>;
        // PLAY_INTEGRITY_API_URL: overridable so tests can stand in for Google.
        readonly apiUrl: string;
      };
      readonly appAttest: {
        // APP_ATTEST_APP_ID: `<team id>.<bundle id>` of the iOS app.
        readonly appId: string;
        // APP_ATTEST_ENV=development: accept the development App Attest environment instead of production.
        readonly development: boolean;
      };
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
          mcpResourceUrl: yield* Config.String("MCP_RESOURCE_URL").pipe(Config.withDefault("http://127.0.0.1:3002/mcp")),
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
        organizations: { customRoles: yield* Config.Boolean("ORG_CUSTOM_ROLES").pipe(Config.withDefault(false)) },
        api: { version: packageVersion() },
        desktop: {
          minVersion: yield* Config.schema(
            Schema.String.check(Schema.isPattern(semverPattern, { message: "DESKTOP_MIN_VERSION must be a semantic version like 1.2.0" })),
            "DESKTOP_MIN_VERSION",
          ).pipe(Config.withDefault("0.0.0")),
          releasesRepo: yield* Config.schema(
            Schema.String.check(Schema.isPattern(/^[\w.-]+\/[\w.-]+$/, { message: "DESKTOP_RELEASES_REPO must be owner/name" })),
            "DESKTOP_RELEASES_REPO",
          ).pipe(Config.withDefault("ejluv143/ExamSIC")),
        },
        mobile: {
          scheme: yield* Config.String("MOBILE_APP_SCHEME").pipe(Config.withDefault("examinus://")),
          minVersion: yield* Config.schema(
            Schema.String.check(Schema.isPattern(semverPattern, { message: "MOBILE_MIN_VERSION must be a semantic version like 1.2.0" })),
            "MOBILE_MIN_VERSION",
          ).pipe(Config.withDefault("0.0.0")),
          storeUrl: yield* Config.option(Config.NonEmptyString("MOBILE_UPDATE_URL")),
        },
        attestation: {
          desktopKey: yield* Config.Redacted("DESKTOP_ATTEST_KEY").pipe(Config.withDefault(Redacted.make(""))),
          playIntegrity: {
            packageName: yield* text("PLAY_INTEGRITY_PACKAGE_NAME"),
            serviceAccount: yield* Config.option(Config.Redacted("PLAY_INTEGRITY_SERVICE_ACCOUNT")),
            apiUrl: yield* Config.String("PLAY_INTEGRITY_API_URL").pipe(Config.withDefault("https://playintegrity.googleapis.com/v1")),
          },
          appAttest: {
            appId: yield* text("APP_ATTEST_APP_ID"),
            development: (yield* text("APP_ATTEST_ENV")) === "development",
          },
        },
      });
    }),
  );
}

// Proving what a client is: a challenge (`nonce`), the platform's proof of the app and the device over it (`attest`),
// and the signed attestation that `attempt.paper` and `attempt.start` accept (`verify`).
import { AttestationRejected, type AttestationPlatform } from "@examinus/contract/client";
import { Context, Effect, Layer, Option, Redacted, Schema } from "effect";
import { createSign } from "node:crypto";
import { AppConfig } from "../../platform/AppConfig.ts";
import { Cache } from "../../platform/Cache.ts";
import {
  attestationTtlMs,
  checkDesktop,
  checkPlayIntegrity,
  newNonce,
  nonceTtlMs,
  readAttestation,
  serverNotSetUp,
  signAttestation,
  verifyAppAttest,
  type AttestationClaims,
  type Verdict,
} from "./rules.ts";

const ServiceAccount = Schema.Struct({
  client_email: Schema.String,
  private_key: Schema.String,
  token_uri: Schema.optionalKey(Schema.String),
});
const decodeServiceAccount = Schema.decodeUnknownOption(Schema.fromJsonString(ServiceAccount));
const GoogleToken = Schema.Struct({ access_token: Schema.String, expires_in: Schema.Number });
const DecodedIntegrityToken = Schema.Struct({ tokenPayloadExternal: Schema.optionalKey(Schema.Unknown) });

const playIntegrityScope = "https://www.googleapis.com/auth/playintegrity";
const googleTokenUrl = "https://oauth2.googleapis.com/token";

export type AttestInput = {
  nonce: string;
  platform: AttestationPlatform;
  token: string;
  keyId: string | undefined;
  deviceId: string;
};

export class Attestation extends Context.Service<
  Attestation,
  {
    // A single-use challenge for this user, good for five minutes.
    readonly nonce: (userId: string) => Effect.Effect<string>;
    // Checks the platform's proof for a nonce this user was given, and issues an attestation for the device.
    readonly attest: (userId: string, input: AttestInput) => Effect.Effect<{ attestation: string; expiresAt: string }, AttestationRejected>;
    // The claims of an attestation that is genuine, unexpired, this user's and this device's; none otherwise.
    readonly verify: (attestation: string | undefined, userId: string, deviceId: string | undefined) => Effect.Effect<Option.Option<AttestationClaims>>;
  }
>()("examinus/api/Attestation") {
  static readonly layer = Layer.effect(
    Attestation,
    Effect.gen(function* () {
      const cache = yield* Cache;
      const { auth, attestation: config } = yield* AppConfig;
      const secret = Redacted.value(auth.secret);
      const nonceKey = (userId: string, nonce: string) => `attest-nonce:${userId}:${nonce}`;

      const nonce = (userId: string) =>
        Effect.gen(function* () {
          const fresh = newNonce();
          yield* cache.setJson(nonceKey(userId, fresh), true, nonceTtlMs);
          return fresh;
        });

      // A nonce was issued to this user, and is used once.
      const consume = (userId: string, value: string) =>
        Effect.gen(function* () {
          const key = nonceKey(userId, value);
          if ((yield* cache.getJson<boolean>(key)) === null) return false;
          const first = yield* cache.claim(`${key}:used`, nonceTtlMs);
          yield* cache.del(key);
          return first;
        });

      const rejection = (message: string) => new AttestationRejected({ message });
      const unavailable = (what: string) => (cause: unknown) =>
        Effect.logError(`Attestation: ${what} failed`, cause).pipe(
          Effect.andThen(Effect.succeed<Verdict>({ ok: false, message: "Couldn't check this device right now. Try again." })),
        );

      // Google's OAuth token for the service account, kept until shortly before it expires.
      let googleToken: { value: string; expiresAt: number } | null = null;
      const googleAccessToken = (accountJson: string) =>
        Effect.tryPromise(async () => {
          if (googleToken && googleToken.expiresAt > Date.now() + 60_000) return googleToken.value;
          const account = decodeServiceAccount(accountJson);
          if (Option.isNone(account)) throw new Error("PLAY_INTEGRITY_SERVICE_ACCOUNT isn't a service account key.");
          const tokenUrl = account.value.token_uri ?? googleTokenUrl;
          const issuedAt = Math.floor(Date.now() / 1000);
          const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
          const unsigned = `${part({ alg: "RS256", typ: "JWT" })}.${part({ iss: account.value.client_email, scope: playIntegrityScope, aud: tokenUrl, iat: issuedAt, exp: issuedAt + 3600 })}`;
          const signature = createSign("RSA-SHA256").update(unsigned).sign(account.value.private_key).toString("base64url");
          const response = await fetch(tokenUrl, {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
          });
          if (!response.ok) throw new Error(`Google's token endpoint answered ${response.status}`);
          const { access_token, expires_in } = Schema.decodeUnknownSync(GoogleToken)(await response.json());
          googleToken = { value: access_token, expiresAt: Date.now() + expires_in * 1000 };
          return access_token;
        });

      const playIntegrity = (value: string, token: string): Effect.Effect<Verdict> => {
        const { packageName, serviceAccount, apiUrl } = config.playIntegrity;
        if (packageName === "" || Option.isNone(serviceAccount)) return Effect.succeed({ ok: false, message: serverNotSetUp });
        return googleAccessToken(Redacted.value(serviceAccount.value)).pipe(
          Effect.flatMap((accessToken) =>
            Effect.tryPromise(async () => {
              const response = await fetch(`${apiUrl}/${encodeURIComponent(packageName)}:decodeIntegrityToken`, {
                method: "POST",
                headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
                body: JSON.stringify({ integrity_token: token }),
              });
              if (response.status === 400) return null;
              if (!response.ok) throw new Error(`Play Integrity answered ${response.status}`);
              return Schema.decodeUnknownSync(DecodedIntegrityToken)(await response.json()).tokenPayloadExternal;
            }),
          ),
          Effect.flatMap((payload): Effect.Effect<Verdict> => {
            if (payload === null) return Effect.succeed({ ok: false, message: "Google couldn't read the integrity token." });
            const verdict = checkPlayIntegrity(payload, { nonce: value, packageName, now: Date.now() });
            return "hint" in verdict
              ? Effect.logWarning(`Attestation: ${verdict.hint}`).pipe(Effect.as<Verdict>(verdict))
              : Effect.succeed(verdict);
          }),
          Effect.catch(unavailable("Play Integrity")),
        );
      };

      const appAttest = (value: string, token: string, keyId: string | undefined): Effect.Effect<Verdict> => {
        const { appId, development } = config.appAttest;
        if (appId === "") return Effect.succeed({ ok: false, message: serverNotSetUp });
        if (keyId === undefined) return Effect.succeed({ ok: false, message: "The App Attest key is missing." });
        return Effect.tryPromise(() =>
          verifyAppAttest({ attestation: new Uint8Array(Buffer.from(token, "base64")), nonce: value, keyId, appId, development, now: new Date() }),
        ).pipe(Effect.catch(unavailable("App Attest")));
      };

      const check = (input: AttestInput): Effect.Effect<Verdict> => {
        switch (input.platform) {
          case "android":
            return playIntegrity(input.nonce, input.token);
          case "ios":
            return appAttest(input.nonce, input.token, input.keyId);
          case "desktop":
            return Effect.succeed(checkDesktop(Redacted.value(config.desktopKey), input.nonce, input.token));
        }
      };

      const attest = Effect.fn("Attestation.attest")(function* (userId: string, input: AttestInput) {
        if (!(yield* consume(userId, input.nonce))) return yield* rejection("That challenge has expired. Try again.");
        const verdict = yield* check(input);
        if (!verdict.ok) return yield* rejection(verdict.message);
        const exp = Date.now() + attestationTtlMs;
        const claims: AttestationClaims = {
          uid: userId,
          did: input.deviceId,
          kind: input.platform === "desktop" ? "desktop" : "mobile",
          platform: input.platform,
          exp,
        };
        return { attestation: signAttestation(secret, claims), expiresAt: new Date(exp).toISOString() };
      });

      const verify = (attestation: string | undefined, userId: string, deviceId: string | undefined) =>
        Effect.sync(() => {
          if (attestation === undefined || deviceId === undefined) return Option.none<AttestationClaims>();
          return Option.filter(readAttestation(secret, attestation, Date.now()), (claims) => claims.uid === userId && claims.did === deviceId);
        });

      return Attestation.of({ nonce, attest, verify });
    }),
  );
}

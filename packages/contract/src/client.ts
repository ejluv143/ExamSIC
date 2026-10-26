// Proving what a client is (`client.*`): the native apps ask the device's platform to vouch for the app and the device
// (Play Integrity on Android, App Attest on iOS), the desktop app signs with its built-in key, and the API hands back an
// `attestation` that `attempt.paper` and `attempt.start` accept. Times are ISO 8601 strings.
import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { Forbidden } from "./errors.ts";
import { AuthMiddleware } from "./middleware.ts";

// The device didn't pass the check, or the server can't check this platform. `message` is written for people.
export class AttestationRejected extends Schema.TaggedError<AttestationRejected>()("AttestationRejected", {
  message: Schema.String,
}) {}

export const AttestationPlatform = Schema.Literals(["android", "ios", "desktop"]);
export type AttestationPlatform = typeof AttestationPlatform.Type;

export class ClientRpcs extends RpcGroup.make(
  // A single-use challenge for the signed-in user, good for five minutes. The platform check must be made over it
  // (Play Integrity `nonce`, App Attest `clientDataHash`, the desktop app's HMAC message).
  Rpc.make("nonce", { success: Schema.Struct({ nonce: Schema.String }), error: Forbidden }),
  // Verifies the platform's proof (`token`) for a nonce and the device it came from. `deviceId` is the id the client
  // sends as `deviceId` when it takes an attempt; the attestation is only good for that device. `keyId` is App Attest's
  // key identifier (iOS only). Returns a ten-minute `attestation` to send with `attempt.paper` and `attempt.start`.
  Rpc.make("attest", {
    payload: {
      nonce: Schema.String,
      platform: AttestationPlatform,
      token: Schema.String,
      keyId: Schema.optionalKey(Schema.String),
      deviceId: Schema.String,
    },
    success: Schema.Struct({ attestation: Schema.String, expiresAt: Schema.String }),
    error: Schema.Union([AttestationRejected, Forbidden]),
  }),
)
  .prefix("client.")
  .middleware(AuthMiddleware) {}

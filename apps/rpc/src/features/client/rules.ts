// Device attestation, pure: what each platform's proof must say, and the signed attestation the API hands back. The
// service (Attestation.ts) fetches what needs the network and calls these.
// @peculiar/x509 reads decorator metadata, which needs this polyfill loaded before it.
import "reflect-metadata";
import { AttestationPlatform } from "@examinus/contract/client";
import { X509Certificate } from "@peculiar/x509";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { decode } from "cbor-x";
import { Option, Schema } from "effect";

export const nonceTtlMs = 5 * 60_000;
export const attestationTtlMs = 10 * 60_000;
export const serverNotSetUp = "Device attestation isn't set up on this server.";

const sha256 = (...parts: Uint8Array[]) => {
  const hash = createHash("sha256");
  for (const part of parts) hash.update(part);
  return new Uint8Array(hash.digest());
};

const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && timingSafeEqual(a, b);

export const newNonce = () => randomBytes(32).toString("base64url");

export type Verdict = { ok: true } | { ok: false; message: string };
const refuse = (message: string): Verdict => ({ ok: false, message });

// --- Desktop app ---

// The desktop app proves itself with the HMAC-SHA256 (hex) of the nonce under a key built into the app. An embedded key
// can be extracted, so this only raises the bar: it stops a browser or a script that doesn't have the app's build.
export const desktopToken = (key: string, nonce: string) => createHmac("sha256", key).update(nonce).digest("hex");

export function checkDesktop(key: string, nonce: string, token: string): Verdict {
  if (key === "") return refuse(serverNotSetUp);
  const expected = Buffer.from(desktopToken(key, nonce));
  const given = Buffer.from(token);
  return sameBytes(expected, given) ? { ok: true } : refuse("This copy of the desktop app couldn't be verified.");
}

// --- Android: Play Integrity ---

// What the decoded integrity verdict (`tokenPayloadExternal`) must hold. Google sends more; only this is read.
const PlayIntegrityPayload = Schema.Struct({
  requestDetails: Schema.Struct({
    nonce: Schema.String,
    timestampMillis: Schema.optionalKey(Schema.String),
  }),
  appIntegrity: Schema.Struct({
    appRecognitionVerdict: Schema.String,
    packageName: Schema.optionalKey(Schema.String),
  }),
  deviceIntegrity: Schema.Struct({ deviceRecognitionVerdict: Schema.optionalKey(Schema.Array(Schema.String)) }),
});
const decodePlayIntegrity = Schema.decodeUnknownOption(PlayIntegrityPayload);

export type DeviceHint = "rooted_device" | "emulator";
export type PlayIntegrityVerdict = Verdict | { ok: false; message: string; hint: DeviceHint };

// The verdict is for this nonce and app, the app is the one Google Play recognizes, and the device meets Android's
// device integrity. A device that only meets virtual integrity is an emulator; one that meets neither is rooted or
// modified. `now` bounds the verdict's age to the nonce's lifetime.
export function checkPlayIntegrity(payload: unknown, expected: { nonce: string; packageName: string; now: number }): PlayIntegrityVerdict {
  if (expected.packageName === "") return refuse(serverNotSetUp);
  const decoded = decodePlayIntegrity(payload);
  if (Option.isNone(decoded)) return refuse("Google's integrity verdict couldn't be read.");
  const { requestDetails, appIntegrity, deviceIntegrity } = decoded.value;
  if (requestDetails.nonce !== expected.nonce) return refuse("The integrity check was made for a different request.");
  const issuedAt = Number(requestDetails.timestampMillis);
  if (!Number.isFinite(issuedAt) || Math.abs(expected.now - issuedAt) > nonceTtlMs) return refuse("The integrity check is too old. Try again.");
  if (appIntegrity.packageName !== expected.packageName) return refuse("This isn't the Examinus app.");
  if (appIntegrity.appRecognitionVerdict !== "PLAY_RECOGNIZED") return refuse("This copy of the app isn't the one from Google Play.");
  const verdicts = deviceIntegrity.deviceRecognitionVerdict ?? [];
  if (verdicts.includes("MEETS_DEVICE_INTEGRITY")) return { ok: true };
  const hint: DeviceHint = verdicts.includes("MEETS_VIRTUAL_INTEGRITY") ? "emulator" : "rooted_device";
  return {
    ok: false,
    hint,
    message: hint === "emulator" ? "Exams can't be taken on an emulator." : "This device doesn't pass Android's integrity check (rooted or modified).",
  };
}

// --- iOS: App Attest ---

// Apple App Attest Root CA, https://www.apple.com/certificateauthority/Apple_App_Attestation_Root_CA.pem
export const appleAppAttestRoot = `-----BEGIN CERTIFICATE-----
MIICITCCAaegAwIBAgIQC/O+DvHN0uD7jG5yH2IXmDAKBggqhkjOPQQDAzBSMSYw
JAYDVQQDDB1BcHBsZSBBcHAgQXR0ZXN0YXRpb24gUm9vdCBDQTETMBEGA1UECgwK
QXBwbGUgSW5jLjETMBEGA1UECAwKQ2FsaWZvcm5pYTAeFw0yMDAzMTgxODMyNTNa
Fw00NTAzMTUwMDAwMDBaMFIxJjAkBgNVBAMMHUFwcGxlIEFwcCBBdHRlc3RhdGlv
biBSb290IENBMRMwEQYDVQQKDApBcHBsZSBJbmMuMRMwEQYDVQQIDApDYWxpZm9y
bmlhMHYwEAYHKoZIzj0CAQYFK4EEACIDYgAERTHhmLW07ATaFQIEVwTtT4dyctdh
NbJhFs/Ii2FdCgAHGbpphY3+d8qjuDngIN3WVhQUBHAoMeQ/cLiP1sOUtgjqK9au
Yen1mMEvRq9Sk3Jm5X8U62H+xTD3FE9TgS41o0IwQDAPBgNVHRMBAf8EBTADAQH/
MB0GA1UdDgQWBBSskRBTM72+aEH/pwyp5frq5eWKoTAOBgNVHQ8BAf8EBAMCAQYw
CgYIKoZIzj0EAwMDaAAwZQIwQgFGnByvsiVbpTKwSga0kP0e8EeDS4+sQmTvb7vn
53O5+FRXgeLhpJ06ysC5PrOyAjEAp5U4xDgEgllF7En3VcE3iexZZtKeYnpqtijV
oyFraWVIyd/dganmrduC1bmTBGwD
-----END CERTIFICATE-----`;

// The certificate extension that carries App Attest's nonce.
export const appAttestNonceOid = "1.2.840.113635.100.8.2";

const bytes = Schema.instanceOf(Uint8Array);
const AppAttestObject = Schema.Struct({
  fmt: Schema.String,
  attStmt: Schema.Struct({ x5c: Schema.Array(bytes) }),
  authData: bytes,
});
const decodeAppAttestObject = Schema.decodeUnknownOption(AppAttestObject);

function parseAppAttestObject(raw: Uint8Array): typeof AppAttestObject.Type | null {
  try {
    return Option.getOrNull(decodeAppAttestObject(decode(raw)));
  } catch {
    return null;
  }
}

// The value inside the nonce extension: SEQUENCE { [1] { OCTET STRING nonce } }.
function nonceInExtension(value: Uint8Array): Uint8Array | null {
  const read = (at: number) => {
    const tag = value[at];
    let length = value[at + 1];
    if (tag === undefined || length === undefined) return null;
    let start = at + 2;
    if (length & 0x80) {
      const bytes = length & 0x7f;
      length = 0;
      for (let i = 0; i < bytes; i++) length = length * 256 + (value[start++] ?? 0);
    }
    return { tag, start, end: start + length };
  };
  const sequence = read(0);
  const tagged = sequence?.tag === 0x30 ? read(sequence.start) : null;
  const octets = tagged?.tag === 0xa1 ? read(tagged.start) : null;
  return octets?.tag === 0x04 && octets.end <= value.length ? value.slice(octets.start, octets.end) : null;
}

const aaguid = (development: boolean) => {
  const bytes = new Uint8Array(16);
  bytes.set(new TextEncoder().encode(development ? "appattestdevelop" : "appattest"));
  return bytes;
};

export type AppAttestInput = {
  // The attestation object from `DCAppAttestService.attestKey`, CBOR.
  attestation: Uint8Array;
  // The server's challenge: App Attest's client data is its SHA-256.
  nonce: string;
  // The key identifier `generateKey` returned, base64.
  keyId: string;
  // `<team id>.<bundle id>`.
  appId: string;
  development: boolean;
  now: Date;
  // PEM root certificates the chain must end in; Apple's, unless a test brings its own.
  roots?: readonly string[];
};

// Apple's checks for a new App Attest key (https://developer.apple.com/documentation/devicecheck/validating-apps-that-connect-to-your-server):
// the certificate chain ends in Apple's root; the nonce in the leaf certificate is SHA-256(authData ‖ SHA-256(challenge));
// the key identifier is the SHA-256 of the leaf's public key and the credential id; the relying party hash is the SHA-256
// of the app id; the counter is 0; and the environment (`aaguid`) is the one expected.
export async function verifyAppAttest(input: AppAttestInput): Promise<Verdict> {
  if (input.appId === "") return refuse(serverNotSetUp);
  const parsed = parseAppAttestObject(input.attestation);
  const { authData } = parsed ?? {};
  if (!parsed || !authData || parsed.fmt !== "apple-appattest" || parsed.attStmt.x5c.length < 2 || authData.length < 55)
    return refuse("The App Attest object is malformed.");

  // authData: rpIdHash(32) flags(1) counter(4) aaguid(16) credentialIdLength(2) credentialId.
  if (!sameBytes(authData.slice(0, 32), sha256(new TextEncoder().encode(input.appId)))) return refuse("This isn't the Examinus app.");
  if (new DataView(authData.buffer, authData.byteOffset + 33, 4).getUint32(0) !== 0) return refuse("This App Attest key was used before.");
  if (!sameBytes(authData.slice(37, 53), aaguid(input.development))) return refuse("This App Attest environment isn't accepted here.");
  const credentialIdLength = new DataView(authData.buffer, authData.byteOffset + 53, 2).getUint16(0);
  const credentialId = authData.slice(55, 55 + credentialIdLength);
  const keyId = new Uint8Array(Buffer.from(input.keyId, "base64"));
  if (!sameBytes(credentialId, keyId)) return refuse("The App Attest key doesn't match.");

  let certs: X509Certificate[];
  try {
    certs = parsed.attStmt.x5c.map((der) => new X509Certificate(der));
  } catch {
    return refuse("The App Attest certificates are malformed.");
  }
  const leaf = certs[0]!;
  // Each certificate is signed by the next, and the last by a root.
  for (let i = 0; i < certs.length - 1; i++) {
    if (!(await certs[i]!.verify({ publicKey: certs[i + 1]!, date: input.now }))) return refuse("The App Attest certificates aren't valid.");
  }
  const last = certs[certs.length - 1]!;
  const roots = (input.roots ?? [appleAppAttestRoot]).map((pem) => new X509Certificate(pem));
  const checks = await Promise.all(roots.map((root) => last.verify({ publicKey: root, date: input.now })));
  if (!checks.includes(true)) return refuse("The App Attest certificates don't come from Apple.");

  // The leaf's public key is the uncompressed EC point at the end of its SubjectPublicKeyInfo.
  const publicKey = new Uint8Array(leaf.publicKey.rawData).slice(-65);
  if (publicKey[0] !== 0x04 || !sameBytes(sha256(publicKey), keyId)) return refuse("The App Attest key doesn't match.");

  const clientDataHash = sha256(new TextEncoder().encode(input.nonce));
  const expected = sha256(authData, clientDataHash);
  const extension = leaf.getExtension(appAttestNonceOid);
  const nonce = extension ? nonceInExtension(new Uint8Array(extension.value)) : null;
  if (!nonce || !sameBytes(nonce, expected)) return refuse("The App Attest check was made for a different request.");
  return { ok: true };
}

// --- The attestation the API hands back ---

export const AttestationClaims = Schema.Struct({
  uid: Schema.String,
  // The device the attestation is good for: the hardware id the native app sends as `deviceId`.
  did: Schema.String,
  kind: Schema.Literals(["mobile", "desktop"]),
  platform: AttestationPlatform,
  exp: Schema.Number,
});
export type AttestationClaims = typeof AttestationClaims.Type;
const decodeClaims = Schema.decodeUnknownOption(AttestationClaims);

// A compact signed token, built like the live tickets: `<base64url claims>.<base64url HMAC-SHA256>`. The key is derived
// from BETTER_AUTH_SECRET, so an attestation can't be mistaken for a live ticket.
const signingKey = (secret: string) => createHmac("sha256", secret).update("examinus/attestation").digest();
const mac = (secret: string, body: string) => createHmac("sha256", signingKey(secret)).update(body).digest("base64url");

export function signAttestation(secret: string, claims: AttestationClaims): string {
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${body}.${mac(secret, body)}`;
}

// The claims of a genuine, unexpired attestation; none otherwise.
export function readAttestation(secret: string, token: string, now: number): Option.Option<AttestationClaims> {
  const [body = "", given = "", ...rest] = token.split(".");
  if (rest.length > 0 || body === "" || given === "") return Option.none();
  if (!sameBytes(Buffer.from(mac(secret, body)), Buffer.from(given))) return Option.none();
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return Option.none();
  }
  return Option.filter(decodeClaims(json), (claims) => claims.exp > now);
}

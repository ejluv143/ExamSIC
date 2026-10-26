import "reflect-metadata";
import { describe, expect, test } from "bun:test";
import * as x509 from "@peculiar/x509";
import { encode } from "cbor-x";
import { createHash } from "node:crypto";
import { Option } from "effect";
import {
  appAttestNonceOid,
  checkDesktop,
  checkPlayIntegrity,
  desktopToken,
  readAttestation,
  serverNotSetUp,
  signAttestation,
  verifyAppAttest,
  type AttestationClaims,
} from "./rules.ts";

const sha256 = (...parts: Uint8Array[]) => {
  const hash = createHash("sha256");
  for (const part of parts) hash.update(part);
  return new Uint8Array(hash.digest());
};
const text = (value: string) => new TextEncoder().encode(value);

describe("the desktop app's check", () => {
  test("the HMAC of the nonce under the app's key passes; anything else doesn't", () => {
    const token = desktopToken("key", "nonce-1");
    expect(checkDesktop("key", "nonce-1", token)).toEqual({ ok: true });
    expect(checkDesktop("key", "nonce-2", token).ok).toBe(false);
    expect(checkDesktop("other-key", "nonce-1", token).ok).toBe(false);
    expect(checkDesktop("key", "nonce-1", "").ok).toBe(false);
    expect(checkDesktop("key", "nonce-1", `${token}00`).ok).toBe(false);
  });

  test("a server without the key refuses every desktop app", () => {
    expect(checkDesktop("", "nonce-1", desktopToken("", "nonce-1"))).toEqual({ ok: false, message: serverNotSetUp });
  });
});

describe("Play Integrity", () => {
  const now = Date.parse("2026-10-25T10:00:00Z");
  const expected = { nonce: "nonce-1", packageName: "app.examinus", now };
  // The decoded verdict (`tokenPayloadExternal`) of a genuine app on a genuine device.
  const verdict = (over: { nonce?: string; timestampMillis?: string; packageName?: string; app?: string; device?: string[] } = {}) => ({
    requestDetails: { requestPackageName: "app.examinus", nonce: over.nonce ?? "nonce-1", timestampMillis: over.timestampMillis ?? String(now - 5_000) },
    appIntegrity: {
      appRecognitionVerdict: over.app ?? "PLAY_RECOGNIZED",
      packageName: over.packageName ?? "app.examinus",
      certificateSha256Digest: ["abc"],
      versionCode: "12",
    },
    deviceIntegrity: { deviceRecognitionVerdict: over.device ?? ["MEETS_DEVICE_INTEGRITY", "MEETS_STRONG_INTEGRITY"] },
    accountDetails: { appLicensingVerdict: "LICENSED" },
  });

  test("the right nonce, the Play-recognized app and a device that meets device integrity pass", () => {
    expect(checkPlayIntegrity(verdict(), expected)).toEqual({ ok: true });
    expect(checkPlayIntegrity(verdict({ device: ["MEETS_DEVICE_INTEGRITY"] }), expected)).toEqual({ ok: true });
  });

  test("another nonce, an old verdict, another package or an unrecognized app is refused", () => {
    expect(checkPlayIntegrity(verdict({ nonce: "nonce-2" }), expected)).toMatchObject({ ok: false, message: expect.stringContaining("different request") });
    expect(checkPlayIntegrity(verdict({ timestampMillis: String(now - 10 * 60_000) }), expected)).toMatchObject({ ok: false, message: expect.stringContaining("too old") });
    expect(checkPlayIntegrity(verdict({ packageName: "evil.app" }), expected)).toMatchObject({ ok: false, message: "This isn't the Examinus app." });
    expect(checkPlayIntegrity(verdict({ app: "UNRECOGNIZED_VERSION" }), expected).ok).toBe(false);
    expect(checkPlayIntegrity(verdict({ app: "UNEVALUATED" }), expected).ok).toBe(false);
  });

  test("a device that fails device integrity is an emulator when it only meets virtual integrity, else rooted", () => {
    expect(checkPlayIntegrity(verdict({ device: ["MEETS_VIRTUAL_INTEGRITY"] }), expected)).toMatchObject({ ok: false, hint: "emulator" });
    expect(checkPlayIntegrity(verdict({ device: [] }), expected)).toMatchObject({ ok: false, hint: "rooted_device" });
    expect(checkPlayIntegrity({ ...verdict(), deviceIntegrity: {} }, expected)).toMatchObject({ ok: false, hint: "rooted_device" });
  });

  test("something that isn't a verdict, or a server without the package name, is refused", () => {
    expect(checkPlayIntegrity({ requestDetails: {} }, expected).ok).toBe(false);
    expect(checkPlayIntegrity(null, expected).ok).toBe(false);
    expect(checkPlayIntegrity(verdict(), { ...expected, packageName: "" })).toEqual({ ok: false, message: serverNotSetUp });
  });
});

// A made-up App Attest chain: a root standing in for Apple's, an intermediate and the key's leaf certificate, which
// carries the nonce the way Apple's does.
describe("App Attest", () => {
  const appId = "TEAMID1234.app.examinus";
  const challenge = "challenge-1";
  const ec = { name: "ECDSA", namedCurve: "P-256" } as const;
  const signing = { name: "ECDSA", hash: "SHA-256" } as const;
  const notBefore = new Date(Date.now() - 3_600_000);
  const notAfter = new Date(Date.now() + 86_400_000);

  async function authority(name: string) {
    const keys = await crypto.subtle.generateKey(ec, true, ["sign", "verify"]);
    const certificate = await x509.X509CertificateGenerator.createSelfSigned({ serialNumber: "01", name, notBefore, notAfter, signingAlgorithm: signing, keys });
    return { keys, certificate };
  }

  // SEQUENCE { [1] { OCTET STRING nonce } }, the value of Apple's nonce extension.
  const nonceExtension = (nonce: Uint8Array) => new Uint8Array([0x30, 0x24, 0xa1, 0x22, 0x04, 0x20, ...nonce]);

  type Options = {
    rpId?: string;
    counter?: number;
    aaguid?: string;
    challengeSigned?: string;
    keyIdOf?: (keyId: Uint8Array) => Uint8Array;
    fmt?: string;
  };

  async function attestation(options: Options = {}) {
    const root = await authority("CN=Test App Attest Root");
    const intermediateKeys = await crypto.subtle.generateKey(ec, true, ["sign", "verify"]);
    const intermediate = await x509.X509CertificateGenerator.create({
      serialNumber: "02",
      subject: "CN=Test App Attest CA 1",
      issuer: root.certificate.subject,
      notBefore,
      notAfter,
      signingAlgorithm: signing,
      publicKey: intermediateKeys.publicKey,
      signingKey: root.keys.privateKey,
    });
    const leafKeys = await crypto.subtle.generateKey(ec, true, ["sign", "verify"]);
    const point = new Uint8Array(await crypto.subtle.exportKey("raw", leafKeys.publicKey));
    const keyId = sha256(point);

    const authData = new Uint8Array(55 + keyId.length);
    authData.set(sha256(text(options.rpId ?? appId)), 0);
    authData[32] = 0x40;
    new DataView(authData.buffer).setUint32(33, options.counter ?? 0);
    authData.set(text(options.aaguid ?? "appattest"), 37);
    new DataView(authData.buffer).setUint16(53, keyId.length);
    authData.set(keyId, 55);

    const nonce = sha256(authData, sha256(text(options.challengeSigned ?? challenge)));
    const leaf = await x509.X509CertificateGenerator.create({
      serialNumber: "03",
      subject: "CN=Test App Attest key",
      issuer: intermediate.subject,
      notBefore,
      notAfter,
      signingAlgorithm: signing,
      publicKey: leafKeys.publicKey,
      signingKey: intermediateKeys.privateKey,
      extensions: [new x509.Extension(appAttestNonceOid, false, nonceExtension(nonce))],
    });
    const object = encode({
      fmt: options.fmt ?? "apple-appattest",
      attStmt: { x5c: [new Uint8Array(leaf.rawData), new Uint8Array(intermediate.rawData)], receipt: new Uint8Array([1, 2, 3]) },
      authData,
    });
    return {
      root,
      input: {
        attestation: new Uint8Array(object),
        nonce: challenge,
        keyId: Buffer.from(options.keyIdOf ? options.keyIdOf(keyId) : keyId).toString("base64"),
        appId,
        development: false,
        now: new Date(),
        roots: [root.certificate.toString("pem")],
      },
    };
  }

  test("a genuine attestation passes: chain, nonce, key id, app id, counter and environment", async () => {
    const { input } = await attestation();
    expect(await verifyAppAttest(input)).toEqual({ ok: true });
  });

  test("the development environment has its own aaguid", async () => {
    const { input } = await attestation({ aaguid: "appattestdevelop" });
    expect(await verifyAppAttest(input)).toMatchObject({ ok: false, message: expect.stringContaining("environment") });
    expect(await verifyAppAttest({ ...input, development: true })).toEqual({ ok: true });
  });

  test("a nonce made for another challenge is refused", async () => {
    const { input } = await attestation({ challengeSigned: "someone-elses-challenge" });
    expect(await verifyAppAttest(input)).toMatchObject({ ok: false, message: expect.stringContaining("different request") });
    const genuine = await attestation();
    expect(await verifyAppAttest({ ...genuine.input, nonce: "replayed-challenge" })).toMatchObject({ ok: false, message: expect.stringContaining("different request") });
  });

  test("another app's relying party hash is refused", async () => {
    const { input } = await attestation({ rpId: "TEAMID1234.evil.app" });
    expect(await verifyAppAttest(input)).toEqual({ ok: false, message: "This isn't the Examinus app." });
    const genuine = await attestation();
    expect(await verifyAppAttest({ ...genuine.input, appId: "TEAMID1234.other" })).toEqual({ ok: false, message: "This isn't the Examinus app." });
  });

  test("a counter above zero (a key that attested before) is refused", async () => {
    const { input } = await attestation({ counter: 1 });
    expect(await verifyAppAttest(input)).toMatchObject({ ok: false, message: expect.stringContaining("used before") });
  });

  test("a key id that isn't the credential's is refused", async () => {
    const { input } = await attestation({ keyIdOf: (id) => sha256(id) });
    expect(await verifyAppAttest(input)).toMatchObject({ ok: false, message: expect.stringContaining("key doesn't match") });
  });

  test("a chain that doesn't end in the trusted root is refused", async () => {
    const { input } = await attestation();
    const other = await authority("CN=Not Apple");
    expect(await verifyAppAttest({ ...input, roots: [other.certificate.toString("pem")] })).toMatchObject({
      ok: false,
      message: expect.stringContaining("don't come from Apple"),
    });
    // Apple's real root doesn't vouch for a test chain either.
    const { roots: _roots, ...withApple } = input;
    expect(await verifyAppAttest(withApple)).toMatchObject({ ok: false });
  });

  test("a malformed object, another format or no app id is refused", async () => {
    const { input } = await attestation();
    expect((await verifyAppAttest({ ...input, attestation: new Uint8Array([1, 2, 3]) })).ok).toBe(false);
    expect((await verifyAppAttest({ ...input, attestation: new Uint8Array(encode({ fmt: "apple-appattest" })) })).ok).toBe(false);
    const wrongFormat = await attestation({ fmt: "packed" });
    expect((await verifyAppAttest(wrongFormat.input)).ok).toBe(false);
    expect(await verifyAppAttest({ ...input, appId: "" })).toEqual({ ok: false, message: serverNotSetUp });
  });
});

describe("the attestation token", () => {
  const secret = "test-secret-test-secret-test-secret-00";
  const claims: AttestationClaims = { uid: "student1", did: "dev1", kind: "mobile", platform: "android", exp: Date.now() + 60_000 };

  test("carries who and which device, and reads back", () => {
    expect(readAttestation(secret, signAttestation(secret, claims), Date.now())).toEqual(Option.some(claims));
  });

  test("a changed body, another secret, an expired one and junk are refused", () => {
    const token = signAttestation(secret, claims);
    const [body, mac] = token.split(".") as [string, string];
    const forged = Buffer.from(JSON.stringify({ ...claims, uid: "student2" })).toString("base64url");
    expect(Option.isNone(readAttestation(secret, `${forged}.${mac}`, Date.now()))).toBe(true);
    expect(Option.isNone(readAttestation("another-secret-another-secret-0000", token, Date.now()))).toBe(true);
    expect(Option.isNone(readAttestation(secret, token, claims.exp + 1))).toBe(true);
    for (const junk of ["", "x", `${body}`, `${body}.`, `${body}.${mac}.extra`]) expect(Option.isNone(readAttestation(secret, junk, Date.now()))).toBe(true);
  });
});

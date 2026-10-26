// The native apps over the real API: a session token as `Authorization: Bearer` instead of cookies, device attestation
// (`client.nonce`, `client.attest`), and what exams do with the browser, desktop and mobile clients. Needs an API
// (API_URL) on a migrated database with the test fixture loaded (test/fixture), started with DESKTOP_ATTEST_KEY; the
// test reads that key and BETTER_AUTH_SECRET from its own environment, which must be the API's values.
//
// Play Integrity and App Attest can't be reached from a test, so a verified mobile device is an attestation signed with
// the API's secret, the way `client.attest` issues one after a platform check passes; those checks are tested with
// Google's and Apple's data in features/client/rules.test.ts.
import { beforeAll, describe, expect, test } from "bun:test";
import { defaultIntegrity } from "@examinus/domain/integrity";
import { createHmac } from "node:crypto";
import { signAttestation } from "../src/features/client/rules.ts";
import {
  callAs,
  callFrom,
  callWith,
  createSession,
  demoPassword,
  ok,
  refused,
  signIn,
  studentEmail,
  students,
  teacherEmail,
  teacherPassword,
} from "./helpers.ts";

const [ann, ben] = students as [string, string, ...string[]];
const device = "hardware-id-1";

// The values a local API is started with for these tests (DESKTOP_ATTEST_KEY, BETTER_AUTH_SECRET); CI exports its own.
const desktopKey = process.env.DESKTOP_ATTEST_KEY ?? "test-desktop-attest-key";
const apiSecret = process.env.BETTER_AUTH_SECRET ?? "local-only-secret-not-used-anywhere-else-0000";

const browserUa = "Mozilla/5.0 (X11; Linux x86_64) Firefox/133.0";
const desktopUa = "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 ExaminusDesktop/1.2.0";
const mobileUa = "ExaminusMobile/1.0.0 (Android 15)";

const desktopClient = { kind: "desktop", version: "1.2.0", platform: "windows" };
const mobileClient = { kind: "mobile", version: "1.0.0", platform: "Android 15" };

beforeAll(async () => {
  await signIn("teacher", teacherEmail, teacherPassword);
  for (const s of [ann, ben]) await signIn(s, studentEmail(s), demoPassword);
}, 30_000);

const userIdOf = async (who: string): Promise<string> => (await ok(who, "auth.session")).user.id;

// What `client.attest` answers once the desktop app's check passes.
async function desktopAttestation(who: string, deviceId = device) {
  const { nonce } = await ok(who, "client.nonce");
  const token = createHmac("sha256", desktopKey).update(nonce).digest("hex");
  return (await ok(who, "client.attest", { nonce, platform: "desktop", token, deviceId })).attestation as string;
}

// A verified phone: what `client.attest` issues after Play Integrity or App Attest passes.
async function mobileAttestation(who: string, deviceId = device) {
  return signAttestation(apiSecret, { uid: await userIdOf(who), did: deviceId, kind: "mobile", platform: "android", exp: Date.now() + 60_000 });
}

// An exam of the demo quiz. `allowedClients` and `allowMobile` are what the teacher chose for where it can be taken.
const examSession = (choice: { allowedClients?: string[]; allowMobile?: boolean } = {}) =>
  createSession({
    mode: "exam",
    integrity: { ...defaultIntegrity("exam"), ...(choice.allowedClients ? { allowedClients: choice.allowedClients } : {}) },
    exam: { computersOnly: false, honorPledge: "I will do this exam on my own.", deviceGraceMinutes: 10, allowMobile: choice.allowMobile ?? false },
  });

const startExam = (who: string, sessionId: string, ua: string, extra: Record<string, unknown> = {}) =>
  callAs(who, { "user-agent": ua }, "attempt.start", { sessionId, deviceId: device, pledgeAccepted: true, ...extra });

// The client the teacher sees on the one attempt of a session.
async function clientOfAttempt(sessionId: string) {
  const attempts = await ok("teacher", "session.attempts", { sessionId });
  expect(attempts).toHaveLength(1);
  return attempts[0].client;
}

describe("bearer sessions", () => {
  test("the token from auth.signInEmail is a session on its own: no cookie needed", async () => {
    const signedIn = await callFrom("10.9.0.1", "auth.signInEmail", { email: studentEmail(ann), password: demoPassword });
    expect(signedIn.err).toBeUndefined();
    const { token, user } = signedIn.ok;
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(20);
    const mine = await callWith({ authorization: `Bearer ${token}` }, "attempt.mine", {});
    expect(mine.err).toBeUndefined();
    expect(Array.isArray(mine.ok)).toBe(true);
    const session = await callWith({ authorization: `Bearer ${token}` }, "auth.session", {});
    expect(session.ok.user.id).toBe(user.id);
  });

  test("a made-up or tampered token is Unauthorized", async () => {
    const { token } = (await callFrom("10.9.0.2", "auth.signInEmail", { email: studentEmail(ben), password: demoPassword })).ok;
    const tampered = `${token.slice(0, -4)}AAAA`;
    for (const bearer of ["not-a-token", tampered]) {
      const reply = await callWith({ authorization: `Bearer ${bearer}` }, "attempt.mine", {});
      expect(reply.err).toContain("Unauthorized");
    }
  });

  test("auth.config tells the app what it must run", async () => {
    const config = await callFrom("10.9.0.3", "auth.config");
    expect(config.ok.mobile).toMatchObject({ minVersion: expect.any(String) });
  });
});

describe("device attestation", () => {
  test("the desktop app's HMAC of the nonce gets an attestation; a forged one is rejected", async () => {
    const { nonce } = await ok(ann, "client.nonce");
    const forged = await refused(ann, "client.attest", { nonce, platform: "desktop", token: "0".repeat(64), deviceId: device });
    expect(forged).toContain("AttestationRejected");
    // A rejected check uses the nonce up.
    const token = createHmac("sha256", desktopKey).update(nonce).digest("hex");
    expect(await refused(ann, "client.attest", { nonce, platform: "desktop", token, deviceId: device })).toContain("AttestationRejected");

    const { nonce: fresh } = await ok(ann, "client.nonce");
    const attested = await ok(ann, "client.attest", {
      nonce: fresh,
      platform: "desktop",
      token: createHmac("sha256", desktopKey).update(fresh).digest("hex"),
      deviceId: device,
    });
    expect(typeof attested.attestation).toBe("string");
    expect(Date.parse(attested.expiresAt)).toBeGreaterThan(Date.now());
  });

  test("a nonce is for the student it was given to, and works once", async () => {
    const { nonce } = await ok(ann, "client.nonce");
    const token = createHmac("sha256", desktopKey).update(nonce).digest("hex");
    expect(await refused(ben, "client.attest", { nonce, platform: "desktop", token, deviceId: device })).toContain("AttestationRejected");
    await ok(ann, "client.attest", { nonce, platform: "desktop", token, deviceId: device });
    expect(await refused(ann, "client.attest", { nonce, platform: "desktop", token, deviceId: device })).toContain("AttestationRejected");
  });

  test("a platform the server isn't set up for says so", async () => {
    for (const body of [
      { platform: "ios", token: "AAAA", keyId: "AAAA" },
      { platform: "android", token: "AAAA" },
    ]) {
      const { nonce } = await ok(ann, "client.nonce");
      expect(await refused(ann, "client.attest", { nonce, deviceId: device, ...body })).toContain("isn't set up");
    }
  });

  test("starting with the attestation records a verified desktop client; another device's attestation doesn't count", async () => {
    const { id } = await createSession();
    const attestation = await desktopAttestation(ann);
    const started = await callAs(ann, { "user-agent": desktopUa }, "attempt.start", { sessionId: id, deviceId: device, client: desktopClient, attestation });
    expect(started.err).toBeUndefined();
    expect(await clientOfAttempt(id)).toEqual({ ...desktopClient, attested: true });

    const other = await createSession();
    const bound = await desktopAttestation(ben, "some-other-device");
    const startedOther = await callAs(ben, { "user-agent": desktopUa }, "attempt.start", { sessionId: other.id, deviceId: device, client: desktopClient, attestation: bound });
    expect(startedOther.err).toBeUndefined();
    expect(await clientOfAttempt(other.id)).toEqual({ ...desktopClient, attested: false });
  });
});

describe("what exams do with each client", () => {
  test("a browser attempt is recorded as the web", async () => {
    const { id } = await createSession();
    const started = await callAs(ann, { "user-agent": browserUa }, "attempt.start", { sessionId: id, deviceId: device });
    expect(started.err).toBeUndefined();
    expect(await clientOfAttempt(id)).toEqual({ kind: "web", version: "", platform: "browser", attested: false });
  });

  test("a desktop-only exam refuses a browser with the desktop message, and the mobile app too", async () => {
    const { id } = await examSession({ allowedClients: ["desktop"] });
    const browser = await startExam(ann, id, browserUa);
    expect(browser.err).toContain("Forbidden");
    expect(browser.err).toContain("Desktop app");
    const mobile = await startExam(ann, id, mobileUa, { client: mobileClient, attestation: await mobileAttestation(ann) });
    expect(mobile.err).toContain("Forbidden");
    const desktop = await startExam(ann, id, desktopUa, { client: desktopClient });
    expect(desktop.err).toBeUndefined();
  });

  test("an exam that doesn't allow the mobile app refuses it, verified or not", async () => {
    const { id } = await examSession();
    const unverified = await startExam(ann, id, mobileUa, { client: mobileClient });
    expect(unverified.err).toContain("DeviceAttestationRequired");
    expect(unverified.err).toContain("verified device");
    const verified = await startExam(ann, id, mobileUa, { client: mobileClient, attestation: await mobileAttestation(ann) });
    expect(verified.err).toContain("DeviceAttestationRequired");
    // Opening the paper is refused the same way.
    const paper = await callAs(ann, { "user-agent": mobileUa }, "attempt.paper", { sessionId: id, deviceId: device, client: mobileClient });
    expect(paper.err).toContain("DeviceAttestationRequired");
  });

  test("an exam that allows the mobile app needs a verified device; with one it starts and the report shows the app", async () => {
    const { id } = await examSession({ allowMobile: true });
    const unverified = await startExam(ann, id, mobileUa, { client: mobileClient });
    expect(unverified.err).toContain("DeviceAttestationRequired");
    // An attestation for another device is not this device's.
    const wrongDevice = await startExam(ann, id, mobileUa, { client: mobileClient, attestation: await mobileAttestation(ann, "someone-elses-phone") });
    expect(wrongDevice.err).toContain("DeviceAttestationRequired");
    // The desktop app's attestation is not a phone's.
    const desktopOnly = await startExam(ann, id, mobileUa, { client: mobileClient, attestation: await desktopAttestation(ann) });
    expect(desktopOnly.err).toContain("DeviceAttestationRequired");

    const verified = await startExam(ann, id, mobileUa, { client: mobileClient, attestation: await mobileAttestation(ann) });
    expect(verified.err).toBeUndefined();
    expect(await clientOfAttempt(id)).toEqual({ ...mobileClient, attested: true });
  });

  test("a browser that says it is the mobile app is a browser: the app is told apart by its user agent", async () => {
    const { id } = await examSession();
    const started = await startExam(ann, id, browserUa, { client: mobileClient });
    expect(started.err).toBeUndefined();
    expect(await clientOfAttempt(id)).toEqual({ kind: "web", version: "", platform: "browser", attested: false });
  });

  test("outside exams the mobile app is welcome, and unverified is only recorded", async () => {
    const { id } = await createSession();
    const started = await callAs(ann, { "user-agent": mobileUa }, "attempt.start", { sessionId: id, deviceId: device, client: mobileClient });
    expect(started.err).toBeUndefined();
    expect(await clientOfAttempt(id)).toEqual({ ...mobileClient, attested: false });
  });
});

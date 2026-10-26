import { describe, expect, test } from "bun:test";
import type { AttemptClient } from "@examinus/domain/client";
import { Option } from "effect";
import type { AttestationClaims } from "../client/rules.ts";
import { deviceRefusal, isPhoneRefused, outdatedClient, resolveClient, wrongClient } from "./rules.ts";

const browser = { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) Firefox/133.0" };
const desktop = { "user-agent": "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 ExaminusDesktop/1.2.0" };
const mobile = { "user-agent": "ExaminusMobile/1.0.0 (Android 15)" };
const phoneBrowser = { "user-agent": "Mozilla/5.0 (Linux; Android 15) Chrome/130 Mobile", "sec-ch-ua-mobile": "?1" };

const claims = (kind: "mobile" | "desktop"): AttestationClaims => ({
  uid: "student1",
  did: "dev1",
  kind,
  platform: kind === "mobile" ? "android" : "desktop",
  exp: Date.now() + 60_000,
});

const client = (kind: AttemptClient["kind"], attested = false): AttemptClient => ({ kind, version: kind === "web" ? "" : "1.0.0", platform: "x", attested });

describe("resolveClient", () => {
  test("a browser is the web, whatever the payload claims", () => {
    const web = { kind: "web", version: "", platform: "browser", attested: false } as const;
    expect(resolveClient(undefined, browser, undefined)).toEqual(web);
    expect(resolveClient({ kind: "desktop", version: "9.9.9", platform: "windows" }, browser, undefined)).toEqual(web);
    expect(resolveClient({ kind: "mobile", version: "1.0.0", platform: "Android 15" }, browser, undefined)).toEqual(web);
  });

  test("the desktop app is told apart by its user agent alone, and its version is the user agent's", () => {
    expect(resolveClient(undefined, desktop, undefined)).toEqual({ kind: "desktop", version: "1.2.0", platform: "desktop", attested: false });
    expect(resolveClient({ kind: "desktop", version: "9.9.9", platform: "windows" }, desktop, undefined)).toEqual({
      kind: "desktop",
      version: "1.2.0",
      platform: "windows",
      attested: false,
    });
  });

  test("the mobile app needs the payload and its user agent to agree", () => {
    const declared = { kind: "mobile", version: "7.0.0", platform: "Android 15" } as const;
    expect(resolveClient(declared, mobile, undefined)).toEqual({ kind: "mobile", version: "1.0.0", platform: "Android 15", attested: false });
    // The app's user agent without the payload, or the payload of another kind, is a browser.
    expect(resolveClient(undefined, mobile, undefined).kind).toBe("web");
    expect(resolveClient({ kind: "desktop", version: "1.0.0", platform: "windows" }, mobile, undefined).kind).toBe("web");
  });

  test("an attestation counts only for the kind of app it was made for", () => {
    const declared = { kind: "mobile", version: "1.0.0", platform: "Android 15" } as const;
    expect(resolveClient(declared, mobile, claims("mobile")).attested).toBe(true);
    expect(resolveClient(declared, mobile, claims("desktop")).attested).toBe(false);
    expect(resolveClient(undefined, desktop, claims("desktop")).attested).toBe(true);
    expect(resolveClient(undefined, browser, claims("desktop")).attested).toBe(false);
  });

  test("the platform is a short label or the kind's default", () => {
    const declare = (platform: string) => resolveClient({ kind: "mobile", version: "1.0.0", platform }, mobile, undefined).platform;
    expect(declare("  ios 18 ")).toBe("ios 18");
    expect(declare("")).toBe("mobile");
    expect(declare("<script>alert(1)</script>")).toBe("mobile");
    expect(declare("x".repeat(41))).toBe("mobile");
  });
});

describe("the exam rules for each client", () => {
  const exam = { computersOnly: true, honorPledge: "pledge", deviceGraceMinutes: 10 };

  test("phones are refused on computers-only exams, but the mobile app is judged by deviceRefusal", () => {
    expect(isPhoneRefused("exam", exam, phoneBrowser, client("web"))).toBe(true);
    expect(isPhoneRefused("exam", exam, mobile, client("mobile", true))).toBe(false);
    expect(isPhoneRefused("quiz", exam, phoneBrowser, client("web"))).toBe(false);
  });

  test("in an exam the mobile app needs the teacher's allowance and a verified device", () => {
    expect(deviceRefusal("exam", exam, client("mobile", true))?._tag).toBe("DeviceAttestationRequired");
    expect(deviceRefusal("exam", { ...exam, allowMobile: true }, client("mobile"))?._tag).toBe("DeviceAttestationRequired");
    expect(deviceRefusal("exam", { ...exam, allowMobile: true }, client("mobile", true))).toBeNull();
    expect(deviceRefusal("exam", { ...exam, allowMobile: true }, client("web"))).toBeNull();
    expect(deviceRefusal("quiz", null, client("mobile"))).toBeNull();
    expect(deviceRefusal("exam", exam, client("mobile", true))?.message).toBe("This exam needs the Examinus app on a verified device.");
  });

  const integrity = {
    requireFullscreen: true,
    trackFocus: true,
    blockSecondScreen: true,
    blockRightClick: true,
    blockCopy: true,
    blockPaste: true,
    blockPrint: true,
    clearClipboardOnStart: true,
    allowPasteInCode: false,
    watermark: true,
    autoSubmitAfter: null,
  };
  const desktopConfig = { releasesRepo: "ejluv143/ExamSIC" };

  test("a session for some clients turns the others away, saying where it can be taken", () => {
    const desktopOnly = { ...integrity, allowedClients: ["desktop" as const] };
    expect(wrongClient(client("desktop"), desktopOnly, desktopConfig)).toBeNull();
    expect(wrongClient(client("web"), desktopOnly, desktopConfig)?.message).toContain("Desktop app");
    expect(wrongClient(client("mobile"), desktopOnly, desktopConfig)?.message).toBe(
      "This can only be taken in the Examinus Desktop app, not in the Examinus mobile app.",
    );
    expect(wrongClient(client("mobile"), { ...integrity, allowedClients: ["web" as const, "desktop" as const] }, desktopConfig)?._tag).toBe("Forbidden");
    expect(wrongClient(client("mobile"), integrity, desktopConfig)).toBeNull();
    expect(wrongClient(client("mobile"), { ...integrity, allowedClients: ["mobile" as const] }, desktopConfig)).toBeNull();
  });

  const config = {
    desktop: { minVersion: "1.2.0", releasesRepo: "ejluv143/ExamSIC" },
    mobile: { minVersion: "2.0.0", storeUrl: Option.some("https://play.google.com/store/apps/details?id=app.examinus") },
  };

  test("an app older than its minimum version is sent to where it is updated", () => {
    const old = outdatedClient({ kind: "mobile", version: "1.9.0", platform: "ios 18", attested: false }, config);
    expect(old).toMatchObject({
      _tag: "ClientOutdated",
      version: "1.9.0",
      minVersion: "2.0.0",
      releasesUrl: "https://play.google.com/store/apps/details?id=app.examinus",
      message: "This Examinus app (1.9.0) is out of date. Update to 2.0.0 or newer to continue.",
    });
    expect(outdatedClient({ kind: "mobile", version: "2.0.0", platform: "ios 18", attested: false }, config)).toBeNull();
    expect(outdatedClient({ kind: "desktop", version: "1.1.0", platform: "linux", attested: false }, config)?.releasesUrl).toBe(
      "https://github.com/ejluv143/ExamSIC/releases",
    );
    expect(outdatedClient(client("web"), config)).toBeNull();
    // Without a store page the mobile app is sent to the releases.
    const noStore = { ...config, mobile: { ...config.mobile, storeUrl: Option.none<string>() } };
    expect(outdatedClient({ kind: "mobile", version: "1.0.0", platform: "x", attested: false }, noStore)?.releasesUrl).toBe(
      "https://github.com/ejluv143/ExamSIC/releases",
    );
  });
});

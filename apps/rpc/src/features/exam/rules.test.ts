import { describe, expect, test } from "bun:test";
import type { AttestationClaims } from "../client/rules.ts";
import { resolveClient } from "./rules.ts";

const browser = { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) Firefox/133.0" };
const desktop = { "user-agent": "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 ExaminusDesktop/1.2.0" };
const mobile = { "user-agent": "ExaminusMobile/1.0.0 (Android 15)" };

const claims = (kind: "mobile" | "desktop"): AttestationClaims => ({
  uid: "student1",
  did: "dev1",
  kind,
  platform: kind === "mobile" ? "android" : "desktop",
  exp: Date.now() + 60_000,
});

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

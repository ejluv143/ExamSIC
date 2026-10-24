import { describe, expect, test } from "bun:test";
import { clientLabel, clientOf, compareSemver, isOutdated, parseSemver, releaseUrl } from "./client.ts";

const v = (s: string) => parseSemver(s)!;

describe("clientOf", () => {
  test("the desktop app is recognised by its user-agent token and version", () => {
    expect(clientOf("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/130 ExaminusDesktop/1.4.0")).toEqual({ kind: "desktop", version: "1.4.0" });
    expect(clientOf("ExaminusDesktop/2.0.0-beta.3 (Linux)")).toEqual({ kind: "desktop", version: "2.0.0-beta.3" });
  });

  test("browsers, a missing user agent and a token without a version are the web", () => {
    expect(clientOf("Mozilla/5.0 (X11; Linux x86_64) Firefox/133.0")).toEqual({ kind: "web" });
    expect(clientOf(undefined)).toEqual({ kind: "web" });
    expect(clientOf("ExaminusDesktop/latest")).toEqual({ kind: "web" });
    expect(clientOf("NotExaminusDesktop/1.0.0")).toEqual({ kind: "web" });
  });

  test("the mobile app is recognised by its token; the desktop token wins when both appear", () => {
    expect(clientOf("ExaminusMobile/1.0.0 (Android 15)")).toEqual({ kind: "mobile", version: "1.0.0" });
    expect(clientOf("ExaminusMobile/latest")).toEqual({ kind: "web" });
    expect(clientOf("ExaminusDesktop/1.4.0 ExaminusMobile/1.0.0")).toEqual({ kind: "desktop", version: "1.4.0" });
  });
});

describe("clientLabel", () => {
  test("names the client the way the teacher's views show it", () => {
    expect(clientLabel({ kind: "web", version: "", platform: "browser", attested: false })).toBe("Web browser");
    expect(clientLabel({ kind: "desktop", version: "1.2.0", platform: "windows", attested: false })).toBe("Desktop 1.2.0 · Windows");
    expect(clientLabel({ kind: "mobile", version: "1.0.0", platform: "Android 15", attested: true })).toBe("Mobile 1.0.0 · Android 15 · verified");
    expect(clientLabel(null)).toBe("Not recorded");
  });
});

describe("semver", () => {
  test("parses releases, pre-releases, build metadata and a leading v", () => {
    expect(v("1.2.3")).toEqual({ major: 1, minor: 2, patch: 3, prerelease: [] });
    expect(v("v10.0.1-rc.2+sha.abc")).toEqual({ major: 10, minor: 0, patch: 1, prerelease: ["rc", "2"] });
    for (const bad of ["1.2", "1.2.3.4", "a.b.c", "", "1.2.3-"]) expect(parseSemver(bad)).toBeNull();
  });

  test("precedence follows SemVer 2.0", () => {
    const order = ["1.0.0-alpha", "1.0.0-alpha.1", "1.0.0-alpha.beta", "1.0.0-beta", "1.0.0-beta.2", "1.0.0-beta.11", "1.0.0-rc.1", "1.0.0", "1.0.1", "1.1.0", "2.0.0"];
    for (let i = 1; i < order.length; i++) {
      expect(compareSemver(v(order[i - 1]!), v(order[i]!))).toBe(-1);
      expect(compareSemver(v(order[i]!), v(order[i - 1]!))).toBe(1);
    }
    expect(compareSemver(v("1.2.3"), v("v1.2.3+build"))).toBe(0);
  });

  test("isOutdated: older is outdated, equal and newer are not, unparsable is outdated", () => {
    expect(isOutdated("1.3.9", "1.4.0")).toBe(true);
    expect(isOutdated("1.4.0-beta.1", "1.4.0")).toBe(true);
    expect(isOutdated("1.4.0", "1.4.0")).toBe(false);
    expect(isOutdated("2.0.0", "1.4.0")).toBe(false);
    expect(isOutdated("dev", "1.4.0")).toBe(true);
    // A minimum nobody can parse requires nothing.
    expect(isOutdated("0.0.1", "none")).toBe(false);
  });

  test("release URLs point at the tag", () => {
    expect(releaseUrl("ejluv143/ExamSIC", "desktop-v1.4.0")).toBe("https://github.com/ejluv143/ExamSIC/releases/tag/desktop-v1.4.0");
  });
});

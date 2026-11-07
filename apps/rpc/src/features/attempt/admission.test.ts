import { describe, expect, test } from "bun:test";
import { noAccommodations } from "@examinus/domain/accommodations";
import type { AttemptClient } from "@examinus/domain/client";
import { Effect, Option } from "effect";
import type { QuizSessionItem } from "../../database/schemas/index.ts";
import { exam, integrity, sessionItem, t0 } from "../../testing/session-rows.ts";
import type { ExamRepo } from "../exam/Repo.ts";
import { clientRefusal, introRefusal, startRefusal, studentView, studentViews, type ClientConfig, type Seat } from "./admission.ts";

const now = t0.getTime();
const seat = (over: Partial<QuizSessionItem> = {}, accommodations: Seat["accommodations"] = null): Seat => ({ session: sessionItem(over), accommodations });
const player = { id: "student1", organizationId: "org1" };
const repoWith = (granted: Record<string, number>) => ({ grantedRetakes: () => Effect.succeed(new Map(Object.entries(granted))) }) as unknown as ExamRepo["Service"];
const view = (s: Seat, granted = 0) => Effect.runPromise(studentView(repoWith({ [s.session.id]: granted }), player, s, now));

describe("what the student sees", () => {
  test("the allowance is the teacher's attempts plus granted retakes plus the student's extra attempts", async () => {
    const s = seat({ attemptsAllowed: 2 }, { ...noAccommodations, extraAttempts: 1 });
    expect((await view(s, 2)).attemptsAllowed).toBe(5);
  });

  test("unlimited attempts stay unlimited", async () => {
    expect((await view(seat({ attemptsAllowed: null }), 3)).attemptsAllowed).toBeNull();
  });

  test("an exemption turns the rule off for this student only", async () => {
    const own = seat({ mode: "exam", exam }, { ...noAccommodations, exempt: ["computers_only"] });
    expect((await view(own)).exam?.computersOnly).toBe(false);
    expect((await view(seat({ mode: "exam", exam }))).exam?.computersOnly).toBe(true);
  });

  test("several sessions are answered with one lookup each, by session id", async () => {
    const a = seat({ id: "a", attemptsAllowed: 1 });
    const b = seat({ id: "b", attemptsAllowed: 1 });
    const views = await Effect.runPromise(studentViews(repoWith({ a: 1 }), player, [a, b], now));
    expect([views.get("a")?.attemptsAllowed, views.get("b")?.attemptsAllowed]).toEqual([2, 1]);
  });
});

describe("introRefusal", () => {
  const seen = async (over: Partial<QuizSessionItem>) => view(seat(over));

  test("the lobby and a running session open, anything else doesn't", async () => {
    expect(introRefusal(await seen({ status: "lobby" }), 0)).toBeNull();
    expect(introRefusal(await seen({ status: "running" }), 0)).toBeNull();
    expect(introRefusal(await seen({ status: "scheduled" }), 0)?.message).toBe("This session isn't open.");
    expect(introRefusal(await seen({ status: "ended" }), 0)?.message).toBe("This session isn't open.");
  });

  test("a student with no attempts left is turned away", async () => {
    expect(introRefusal(await seen({ attemptsAllowed: 1 }), 1)?.message).toBe("You've used all your attempts.");
  });
});

describe("startRefusal", () => {
  type Input = Parameters<typeof startRefusal>[2];
  const input: Input = { used: 0, pledgeAccepted: true, roomPassword: undefined, ip: null, now };
  const check = async (over: Partial<QuizSessionItem>, extra: Partial<Input> = {}) => {
    const s = seat(over);
    return startRefusal(await view(s), s.session, { ...input, ...extra })?.message ?? null;
  };

  test("a session that can be started has no refusal", async () => {
    expect(await check({})).toBeNull();
  });

  test("the lobby says to wait; other states say the session isn't open", async () => {
    expect(await check({ status: "lobby" })).toBe("The session hasn't started yet. Wait in the lobby.");
    expect(await check({ status: "ended" })).toBe("This session isn't open.");
  });

  test("the order is fixed: attempts, pledge, late join, password, network", async () => {
    const everything = {
      mode: "exam" as const,
      attemptsAllowed: 1,
      lateJoinMinutes: 5,
      startedAt: new Date(now - 10 * 60_000),
      roomPassword: "secret",
      ipAllowlist: ["10.0.0.0/8"],
    };
    const bad = { used: 1, pledgeAccepted: false, roomPassword: "nope", ip: "8.8.8.8" };
    expect(await check(everything, bad)).toBe("You've used all your attempts.");
    expect(await check(everything, { ...bad, used: 0 })).toBe("Accept the honor pledge before you start the exam.");
    expect(await check(everything, { ...bad, used: 0, pledgeAccepted: true })).toBe("It's too late to join: students could start in the first 5 minutes.");
    expect(await check({ ...everything, lateJoinMinutes: null }, { ...bad, used: 0, pledgeAccepted: true })).toBe("That room password isn't right.");
    expect(await check({ ...everything, lateJoinMinutes: null }, { ...bad, used: 0, pledgeAccepted: true, roomPassword: " secret " })).toBe(
      "This isn't on the network allowed for this session.",
    );
  });

  test("the pledge is only asked for exams", async () => {
    expect(await check({ mode: "quiz" }, { pledgeAccepted: undefined })).toBeNull();
  });
});

describe("clientRefusal", () => {
  const web: AttemptClient = { kind: "web", version: "", platform: "browser", attested: false };
  const mobile = (attested = false): AttemptClient => ({ kind: "mobile", version: "2.0.0", platform: "ios 18", attested });
  const phone = { "user-agent": "Mozilla/5.0 (Linux; Android 15) Chrome/130 Mobile", "sec-ch-ua-mobile": "?1" };
  const desktopConfig = { minVersion: "1.2.0", releasesRepo: "ejluv143/ExamSIC" };
  const config: ClientConfig = {
    desktop: desktopConfig,
    mobile: { minVersion: "2.0.0", storeUrl: Option.some("https://play.google.com/store/apps/details?id=app.examinus") },
  };
  const refusal = (s: Seat, client: AttemptClient, headers = {}) => clientRefusal(s, client, headers, config, now);
  const examSeat = (over: Partial<QuizSessionItem> = {}, accommodations: Seat["accommodations"] = null) => seat({ mode: "exam", exam, ...over }, accommodations);

  test("a phone browser is turned away from a computers-only exam, unless the student is exempt", () => {
    expect(refusal(examSeat(), web, phone)?._tag).toBe("ComputersOnly");
    expect(refusal(examSeat({}, { ...noAccommodations, exempt: ["computers_only"] }), web, phone)).toBeNull();
    expect(refusal(seat({ mode: "quiz" }), web, phone)).toBeNull();
  });

  test("in an exam the mobile app needs the teacher's allowance and a verified device", () => {
    expect(refusal(examSeat(), mobile(true))?._tag).toBe("DeviceAttestationRequired");
    expect(refusal(examSeat({ exam: { ...exam, allowMobile: true } }), mobile())?._tag).toBe("DeviceAttestationRequired");
    expect(refusal(examSeat({ exam: { ...exam, allowMobile: true } }), mobile(true))).toBeNull();
    expect(refusal(examSeat({ exam: { ...exam, allowMobile: true } }), web)).toBeNull();
    expect(refusal(seat({ mode: "quiz" }), mobile())).toBeNull();
    expect(refusal(examSeat(), mobile(true))?.message).toBe("This exam needs the Examinus app on a verified device.");
  });

  test("an app older than its minimum version is sent to where it is updated", () => {
    const old = refusal(seat(), { ...mobile(), version: "1.9.0" });
    expect(old).toMatchObject({
      _tag: "ClientOutdated",
      version: "1.9.0",
      minVersion: "2.0.0",
      releasesUrl: "https://play.google.com/store/apps/details?id=app.examinus",
      message: "This Examinus app (1.9.0) is out of date. Update to 2.0.0 or newer to continue.",
    });
    expect(refusal(seat(), { kind: "desktop", version: "1.1.0", platform: "linux", attested: false })).toMatchObject({
      releasesUrl: "https://github.com/ejluv143/ExamSIC/releases",
    });
    const noStore: ClientConfig = { ...config, mobile: { ...config.mobile, storeUrl: Option.none() } };
    expect(clientRefusal(seat(), { ...mobile(), version: "1.0.0" }, {}, noStore, now)).toMatchObject({ releasesUrl: "https://github.com/ejluv143/ExamSIC/releases" });
  });

  test("a session for some clients turns the others away, saying where it can be taken", () => {
    const only = (allowedClients: ("web" | "desktop" | "mobile")[]) => seat({ integrity: { ...integrity, allowedClients } });
    const desktop: AttemptClient = { kind: "desktop", version: "1.2.0", platform: "linux", attested: false };
    expect(refusal(only(["desktop"]), desktop)).toBeNull();
    expect(refusal(only(["desktop"]), web)?.message).toContain("Desktop app");
    expect(refusal(only(["desktop"]), mobile())?.message).toBe("This can only be taken in the Examinus Desktop app, not in the Examinus mobile app.");
    expect(refusal(only(["web", "desktop"]), mobile())?._tag).toBe("Forbidden");
    expect(refusal(seat(), mobile())).toBeNull();
    expect(refusal(only(["mobile"]), mobile())).toBeNull();
  });

  test("the order is fixed: phone, outdated, wrong client, device", () => {
    const s = examSeat({ integrity: { ...integrity, allowedClients: ["desktop"] } });
    const old = { ...mobile(), version: "1.0.0" };
    expect(refusal(s, old, phone)?._tag).toBe("ClientOutdated");
    expect(refusal(s, web, phone)?._tag).toBe("ComputersOnly");
    expect(refusal(s, mobile())?._tag).toBe("Forbidden");
  });
});

import { afterAll, describe, expect, test } from "bun:test";
import { Effect, Layer, Option } from "effect";
import { Headers } from "effect/http";
import { AppConfig } from "../../platform/AppConfig.ts";
import { harness, stub, testConfig } from "../../testing/config.ts";
import { BetterAuth } from "../auth/BetterAuth.ts";
import { ClassroomService } from "./Classroom.ts";
import { classItem, fakeClassRepo, googleAccount, studentItem, type ClassWorld } from "./fixtures.ts";
import { ClassService } from "./Service.ts";
import type { Actor } from "../auth/Session.ts";

const actor = (id: string): Actor => ({ id, organizationId: "org1" });

// A stand-in for Google: the API (`apiUrl`) and the token endpoint (`tokenUrl`) of one local server. Tests set what
// it answers in `google`, and read what was asked of it from `requests`.
type CourseStudent = { profile: { name?: { givenName?: string; familyName?: string; fullName?: string }; emailAddress?: string } };
const google = {
  apiStatus: 200,
  tokenStatus: 200,
  courses: [] as Array<{ id: string; name: string; section?: string; room?: string; alternateLink: string }>,
  // The course's students in pages of the given sizes.
  studentPages: [] as CourseStudent[][],
  requests: [] as Array<{ path: string; authorization: string | null }>,
};
const reset = () => {
  google.apiStatus = 200;
  google.tokenStatus = 200;
  google.courses = [];
  google.studentPages = [];
  google.requests = [];
};

const server = Bun.serve({
  port: 0,
  fetch: async (request) => {
    const url = new URL(request.url);
    google.requests.push({ path: url.pathname + url.search, authorization: request.headers.get("authorization") });
    if (url.pathname === "/token") {
      return google.tokenStatus === 200
        ? Response.json({ access_token: "fresh-token", expires_in: 3600 })
        : new Response("no", { status: google.tokenStatus });
    }
    if (google.apiStatus !== 200) return new Response("no", { status: google.apiStatus });
    if (url.pathname === "/api/courses") return Response.json({ courses: google.courses });
    const students = /^\/api\/courses\/([^/]+)\/students$/.exec(url.pathname);
    if (students) {
      const page = Number(url.searchParams.get("pageToken") ?? 0);
      return Response.json({
        students: google.studentPages[page] ?? [],
        ...(page + 1 < google.studentPages.length && { nextPageToken: String(page + 1) }),
      });
    }
    const course = /^\/api\/courses\/([^/]+)$/.exec(url.pathname);
    const found = google.courses.find((c) => c.id === decodeURIComponent(course?.[1] ?? ""));
    return found ? Response.json(found) : new Response("none", { status: 404 });
  },
});
afterAll(() => void server.stop(true));

const config = Layer.effect(
  AppConfig,
  Effect.gen(function* () {
    const base = yield* AppConfig;
    return AppConfig.of({
      ...base,
      classroom: { apiUrl: `http://localhost:${server.port}/api`, tokenUrl: `http://localhost:${server.port}/token` },
    });
  }),
).pipe(Layer.provide(testConfig));

const setup = (world: ClassWorld = {}, options: { google?: boolean } = {}) => {
  reset();
  const fake = fakeClassRepo(world);
  const auth = Layer.succeed(
    BetterAuth,
    stub<BetterAuth["Service"]>("BetterAuth", {
      google: options.google === false ? Option.none() : Option.some({ clientId: "id", clientSecret: "secret" }),
    }),
  );
  const classes = ClassService.layer.pipe(Layer.provide(fake.layer));
  const layer = ClassroomService.layer.pipe(Layer.provide([fake.layer, classes, auth, config]));
  return { ...harness(layer), ...fake };
};

const teacherWorld: ClassWorld = { accounts: [googleAccount()] };
const course = (id: string, name = "IT302 Database Systems") => ({ id, name, section: "A", alternateLink: `https://classroom/${id}` });
const withEmail = (emailAddress: string, givenName?: string): CourseStudent => ({
  profile: { emailAddress, ...(givenName && { name: { givenName, familyName: "Reyes" } }) },
});

describe("ClassroomService", () => {
  test("Classroom counts as connected only when every Classroom scope was granted", async () => {
    const partial = googleAccount({ scope: "https://www.googleapis.com/auth/classroom.courses.readonly" });
    const status = Effect.gen(function* () {
      return yield* (yield* ClassroomService).status("t1");
    });
    expect(await setup(teacherWorld).run(status)).toEqual({ configured: true, connected: true });
    expect(await setup({ accounts: [partial] }).run(status)).toEqual({ configured: true, connected: false });
    expect(await setup().run(status)).toEqual({ configured: true, connected: false });
    expect(await setup(teacherWorld, { google: false }).run(status)).toEqual({ configured: false, connected: true });
  });

  test("listing courses without a connected account is a Conflict and Google isn't called", async () => {
    const { fail } = setup();
    const err = await fail(
      Effect.gen(function* () {
        return yield* (yield* ClassroomService).courses(actor("t1"));
      }),
    );
    expect(err._tag).toBe("Conflict");
    expect(google.requests).toEqual([]);
  });

  test("courses are read with the stored token and show which are already imported", async () => {
    const imported = classItem({ id: "c7", teacherId: "t1", classroom: { courseId: "co2", link: "l", lastSyncedAt: "x" } });
    const { run } = setup({ ...teacherWorld, classes: [imported] });
    google.courses = [course("co1"), course("co2")];
    const result = await run(
      Effect.gen(function* () {
        return yield* (yield* ClassroomService).courses(actor("t1"));
      }),
    );
    expect(result.map((c) => [c.courseId, c.classId, c.room])).toEqual([
      ["co1", null, ""],
      ["co2", "c7", ""],
    ]);
    expect(google.requests[0]?.authorization).toBe("Bearer token");
  });

  test("an expired token is refreshed and the new one saved; a refused refresh asks to connect again", async () => {
    const expired = googleAccount({ accessTokenExpiresAt: new Date(Date.now() - 1000) });
    const ok = setup({ accounts: [expired] });
    const list = Effect.gen(function* () {
      return yield* (yield* ClassroomService).courses(actor("t1"));
    });
    await ok.run(list);
    expect(ok.savedTokens).toEqual([{ accountId: "acc1", accessToken: "fresh-token" }]);
    expect(google.requests.at(-1)?.authorization).toBe("Bearer fresh-token");

    const refused = setup({ accounts: [expired] });
    google.tokenStatus = 400;
    const err = await refused.fail(list);
    expect(err).toMatchObject({ _tag: "GoogleUnavailable", message: "Google access ended. Connect Google Classroom again." });
    expect(refused.savedTokens).toEqual([]);
  });

  test("an expired token without a refresh token is a Conflict, and without a Google client on the server it is unavailable", async () => {
    const list = Effect.gen(function* () {
      return yield* (yield* ClassroomService).courses(actor("t1"));
    });
    const noRefresh = setup({ accounts: [googleAccount({ accessTokenExpiresAt: null, refreshToken: null })] });
    expect((await noRefresh.fail(list))._tag).toBe("Conflict");
    const noClient = setup({ accounts: [googleAccount({ accessToken: null })] }, { google: false });
    expect((await noClient.fail(list))._tag).toBe("GoogleUnavailable");
  });

  test("Google's refusals become GoogleUnavailable with a message for people", async () => {
    const list = Effect.gen(function* () {
      return yield* (yield* ClassroomService).courses(actor("t1"));
    });
    const messages: string[] = [];
    for (const status of [401, 403, 500]) {
      const { fail } = setup(teacherWorld);
      google.apiStatus = status;
      const err = await fail(list);
      expect(err._tag).toBe("GoogleUnavailable");
      messages.push(err.message);
    }
    expect(new Set(messages).size).toBe(3);
  });

  test("importing a course makes a class named after it and fills its roster from every page of students", async () => {
    const world: ClassWorld = {
      ...teacherWorld,
      students: [studentItem({ id: "s1", userId: "u1", email: "ann@x.ph" })],
    };
    const { run, classes, students, members, sessionChanges } = setup(world);
    google.courses = [course("co1")];
    google.studentPages = [
      [withEmail(" ANN@x.ph "), { profile: { name: { fullName: "No Email" } } }],
      [withEmail("bo@x.ph", "Bo")],
    ];
    const { classIds } = await run(
      Effect.gen(function* () {
        return yield* (yield* ClassroomService).importCourses(actor("t1"), ["co1", "co1"]);
      }),
    );
    expect(classIds).toHaveLength(1);
    expect(classes[0]).toMatchObject({ teacherId: "t1", courseCode: "IT302", title: "IT302 Database Systems", section: "A" });
    expect(classes[0]?.classroom).toMatchObject({ courseId: "co1", link: "https://classroom/co1" });
    // The existing entry is reused; the new one has no account yet; the student without an email is skipped.
    expect(students.map((s) => [s.email, s.userId, s.firstName])).toEqual([
      ["ann@x.ph", "u1", "Ann"],
      ["bo@x.ph", null, "Bo"],
    ]);
    expect(members.map((m) => m.studentId)).toHaveLength(2);
    expect(sessionChanges).toEqual([`join ${classIds[0]} u1`]);
  });

  test("a course that is already imported isn't imported again", async () => {
    const imported = classItem({ id: "c7", teacherId: "t1", classroom: { courseId: "co1", link: "l", lastSyncedAt: "x" } });
    const { run, classes } = setup({ ...teacherWorld, classes: [imported] });
    google.courses = [course("co1")];
    const { classIds } = await run(
      Effect.gen(function* () {
        return yield* (yield* ClassroomService).importCourses(actor("t1"), ["co1"]);
      }),
    );
    expect(classIds).toEqual(["c7"]);
    expect(classes).toHaveLength(1);
  });

  test("importing a course that Google doesn't know is GoogleUnavailable and no class is made", async () => {
    const { fail, classes } = setup(teacherWorld);
    const err = await fail(
      Effect.gen(function* () {
        return yield* (yield* ClassroomService).importCourses(actor("t1"), ["gone"]);
      }),
    );
    expect(err).toMatchObject({ _tag: "GoogleUnavailable", message: "That Classroom course doesn't exist or isn't yours." });
    expect(classes).toEqual([]);
  });

  test("syncing adds only students not in the class yet, reports the totals and stamps the sync time", async () => {
    const linked = classItem({ id: "c1", teacherId: "t1", classroom: { courseId: "co1", link: "l", lastSyncedAt: "old" } });
    const world: ClassWorld = {
      ...teacherWorld,
      classes: [linked],
      students: [studentItem({ id: "s1", userId: "u1", email: "ann@x.ph" }), studentItem({ id: "s2", userId: null, email: "bo@x.ph" })],
      members: [["c1", "s1"]],
    };
    const { run, classes, sessionChanges } = setup(world);
    google.studentPages = [[withEmail("ann@x.ph"), withEmail("bo@x.ph"), withEmail("cy@x.ph", "Cy")]];
    const result = await run(
      Effect.gen(function* () {
        return yield* (yield* ClassroomService).sync(actor("t1"), "c1");
      }),
    );
    expect(result).toEqual({ added: 2, total: 3 });
    expect(classes[0]?.classroom?.lastSyncedAt).not.toBe("old");
    // Bo and Cy have no account, so there are no sessions to put anyone on.
    expect(sessionChanges).toEqual([]);
  });

  test("syncing a class that isn't linked is a Conflict, and one that isn't the teacher's is NotFound", async () => {
    const world: ClassWorld = {
      ...teacherWorld,
      classes: [classItem({ id: "c1", teacherId: "t1" }), classItem({ id: "c2", teacherId: "t2", classroom: { courseId: "co", link: "l", lastSyncedAt: "x" } })],
    };
    const { fail } = setup(world);
    const sync = (classId: string) =>
      Effect.gen(function* () {
        return yield* (yield* ClassroomService).sync(actor("t1"), classId);
      });
    expect((await fail(sync("c1")))._tag).toBe("Conflict");
    expect((await fail(sync("c2")))._tag).toBe("NotFound");
    expect(google.requests).toEqual([]);
  });

  test("connecting without a Google client set up is GoogleUnavailable", async () => {
    const { fail } = setup(teacherWorld, { google: false });
    const err = await fail(
      Effect.gen(function* () {
        return yield* (yield* ClassroomService).connect({ callbackURL: "/a", errorCallbackURL: "/b" }, Headers.empty);
      }),
    );
    expect(err._tag).toBe("GoogleUnavailable");
  });
});

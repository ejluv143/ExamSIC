import {
  ClassroomRpcs,
  ClassroomUnavailable,
  classroomScopes,
  Conflict,
  NotFound,
  type ClassroomCourse,
} from "@examora/contract";
import { and, eq, isNull, sql } from "drizzle-orm";
import { Config, Effect, Option } from "effect";
import { BetterAuth, cookiesFrom } from "../BetterAuth.ts";
import { Database } from "../Database.ts";
import { newId } from "../database/schemas/_helpers.ts";
import { accounts, classes, classMembers, students } from "../database/schemas/index.ts";
import { requirePermission, webHeaders } from "../Session.ts";
import { ClassQueries, newJoinCode } from "./ClassHandlers.ts";

// The parts of Classroom's REST API (v1) we read.
type Course = { id: string; name: string; section?: string; room?: string; alternateLink: string };
type CourseStudent = {
  userId: string;
  profile: { name?: { givenName?: string; familyName?: string; fullName?: string }; emailAddress?: string };
};
type Page<K extends string, T> = { [key in K]?: T[] } & { nextPageToken?: string };

const notConnected = () => new Conflict({ message: "Connect Google Classroom first." });

export const ClassroomHandlers = ClassroomRpcs.toLayer(
  Effect.gen(function* () {
    const db = yield* Database;
    const auth = yield* BetterAuth;
    const { joinSessions } = yield* ClassQueries;
    // Overridable so tests can stand in for Google.
    const apiUrl = yield* Config.String("CLASSROOM_API_URL").pipe(
      Config.withDefault("https://classroom.googleapis.com/v1"),
    );
    const tokenUrl = yield* Config.String("GOOGLE_TOKEN_URL").pipe(
      Config.withDefault("https://oauth2.googleapis.com/token"),
    );

    const unavailable = (message: string) => new ClassroomUnavailable({ message });

    // The teacher's linked Google account, if it was granted Classroom access.
    const googleAccount = (userId: string) =>
      db
        .query((d) =>
          d
            .select()
            .from(accounts)
            .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "google"))),
        )
        .pipe(
          Effect.map((rows) =>
            rows.find((a) => classroomScopes.every((scope) => a.scope?.split(/[\s,]+/).includes(scope))),
          ),
        );

    // A Classroom access token for the teacher, refreshed with the stored refresh token when it's about to expire.
    const accessToken = Effect.fn("classroom.accessToken")(function* (userId: string) {
      const account = yield* googleAccount(userId);
      if (!account) return yield* notConnected();
      const fresh = account.accessTokenExpiresAt && account.accessTokenExpiresAt.getTime() > Date.now() + 60_000;
      if (account.accessToken && fresh) return account.accessToken;
      const client = Option.getOrUndefined(auth.google);
      if (!client) return yield* unavailable("Google sign-in isn't set up on this server.");
      if (!account.refreshToken) return yield* notConnected();
      const refreshToken = account.refreshToken;
      const token = yield* Effect.tryPromise({
        try: async () => {
          const res = await fetch(tokenUrl, {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: client.clientId,
              client_secret: client.clientSecret,
              refresh_token: refreshToken,
              grant_type: "refresh_token",
            }),
          });
          if (!res.ok) throw new Error(String(res.status));
          return (await res.json()) as { access_token: string; expires_in: number };
        },
        catch: () => unavailable("Google access ended. Connect Google Classroom again."),
      });
      const expiresAt = new Date(Date.now() + token.expires_in * 1000);
      yield* db.query((d) =>
        d
          .update(accounts)
          .set({ accessToken: token.access_token, accessTokenExpiresAt: expiresAt })
          .where(eq(accounts.id, account.id)),
      );
      return token.access_token;
    });

    const get = <A>(token: string, path: string) =>
      Effect.tryPromise({
        try: async () => {
          const res = await fetch(`${apiUrl}${path}`, { headers: { authorization: `Bearer ${token}` } });
          if (res.status === 401) throw unavailable("Google access ended. Connect Google Classroom again.");
          if (res.status === 403)
            throw unavailable("Google Classroom refused. The Classroom API may be turned off for your account.");
          if (res.status === 404) throw unavailable("That Classroom course doesn't exist or isn't yours.");
          if (!res.ok) throw unavailable("Google Classroom isn't answering. Try again in a minute.");
          return (await res.json()) as A;
        },
        catch: (cause) =>
          cause instanceof ClassroomUnavailable ? cause : unavailable("Couldn't reach Google Classroom. Try again."),
      });

    // Every page of a Classroom list.
    const getAll = Effect.fn("classroom.getAll")(function* <K extends string, T>(token: string, path: string, key: K) {
      const items: T[] = [];
      let pageToken: string | undefined;
      do {
        const sep = path.includes("?") ? "&" : "?";
        const page: Page<K, T> = yield* get<Page<K, T>>(
          token,
          `${path}${sep}pageSize=100${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`,
        );
        items.push(...(page[key] ?? []));
        pageToken = page.nextPageToken;
      } while (pageToken);
      return items;
    });

    // The teacher's classes imported from Classroom, by course id.
    const importedClasses = (teacherId: string) =>
      db
        .query((d) =>
          d
            .select({ id: classes.id, classroom: classes.classroom })
            .from(classes)
            .where(and(eq(classes.teacherId, teacherId), isNull(classes.archivedAt))),
        )
        .pipe(
          Effect.map(
            (rows) => new Map(rows.flatMap((r) => (r.classroom ? [[r.classroom.courseId, r.id] as const] : []))),
          ),
        );

    // Adds the course's students to the class: an existing roster entry with the same email is reused; anyone
    // else gets a new one without an account, which becomes theirs when they sign in with that Google email.
    const syncRoster = Effect.fn("classroom.syncRoster")(function* (token: string, classId: string, courseId: string) {
      const courseStudents = yield* getAll<"students", CourseStudent>(
        token,
        `/courses/${encodeURIComponent(courseId)}/students`,
        "students",
      );
      let added = 0;
      for (const { profile } of courseStudents) {
        const email = profile.emailAddress?.trim().toLowerCase();
        // Without an email there's nothing to match an account (or a later sync) with.
        if (!email) continue;
        let [entry] = yield* db.query((d) =>
          d
            .select({ id: students.id, userId: students.userId })
            .from(students)
            .where(sql`lower(${students.email}) = ${email}`)
            .limit(1),
        );
        if (!entry) {
          const id = newId("s");
          yield* db.query((d) =>
            d.insert(students).values({
              id,
              email,
              firstName: profile.name?.givenName?.trim() || profile.name?.fullName?.trim() || email,
              lastName: profile.name?.familyName?.trim() ?? "",
            }),
          );
          entry = { id, userId: null };
        }
        const inserted = yield* db.query((d) =>
          d
            .insert(classMembers)
            .values({ classId, studentId: entry.id })
            .onConflictDoNothing()
            .returning({ studentId: classMembers.studentId }),
        );
        if (inserted.length) {
          added++;
          if (entry.userId) yield* joinSessions(classId, entry.userId);
        }
      }
      const total = yield* db.query((d) => d.$count(classMembers, eq(classMembers.classId, classId)));
      return { added, total };
    });

    const setSynced = (classId: string, course: { courseId: string; link: string }) =>
      db.query((d) =>
        d
          .update(classes)
          .set({ classroom: { ...course, lastSyncedAt: new Date().toISOString() } })
          .where(eq(classes.id, classId)),
      );

    return ClassroomRpcs.of({
      "classroom.status": Effect.fn("classroom.status")(function* () {
        const me = yield* requirePermission({ class: ["create"] });
        return { configured: Option.isSome(auth.google), connected: !!(yield* googleAccount(me.id)) };
      }),

      "classroom.connect": Effect.fn("classroom.connect")(function* ({ callbackURL, errorCallbackURL }, { headers }) {
        yield* requirePermission({ class: ["create"] });
        if (Option.isNone(auth.google)) return yield* unavailable("Google sign-in isn't set up on this server.");
        const { headers: responseHeaders, response } = yield* auth
          .call((api) =>
            api.linkSocialAccount({
              body: {
                provider: "google",
                callbackURL,
                errorCallbackURL,
                scopes: [...classroomScopes],
                // A refresh token, so syncing keeps working after the first hour.
                additionalParams: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" },
                disableRedirect: true,
              },
              headers: webHeaders(headers),
              returnHeaders: true,
            }),
          )
          .pipe(Effect.mapError((error) => unavailable(error.message)));
        if (!response.url) return yield* Effect.die("Better Auth returned no Google authorization URL.");
        return { url: response.url, cookies: cookiesFrom(responseHeaders) };
      }),

      "classroom.courses": Effect.fn("classroom.courses")(function* () {
        const me = yield* requirePermission({ class: ["read"] });
        const token = yield* accessToken(me.id);
        const [courses, imported] = yield* Effect.all([
          getAll<"courses", Course>(token, "/courses?teacherId=me&courseStates=ACTIVE", "courses"),
          importedClasses(me.id),
        ]);
        return courses.map((c): ClassroomCourse => ({
          courseId: c.id,
          name: c.name,
          section: c.section ?? "",
          room: c.room ?? "",
          link: c.alternateLink,
          classId: imported.get(c.id) ?? null,
        }));
      }),

      "classroom.import": Effect.fn("classroom.import")(function* ({ courseIds }) {
        const me = yield* requirePermission({ class: ["create"], roster: ["update"] });
        const token = yield* accessToken(me.id);
        const imported = yield* importedClasses(me.id);
        const classIds: string[] = [];
        for (const courseId of new Set(courseIds)) {
          const existing = imported.get(courseId);
          if (existing) {
            classIds.push(existing);
            continue;
          }
          const course = yield* get<Course>(token, `/courses/${encodeURIComponent(courseId)}`);
          const id = newId("c");
          const name = course.name.trim();
          yield* db.query((d) =>
            d.insert(classes).values({
              id,
              teacherId: me.id,
              joinCode: newJoinCode(),
              // Classroom has no course code; the first word of the name usually is one ("IT302 Database …").
              courseCode: (name.split(/\s+/)[0] ?? name).slice(0, 40),
              title: name.slice(0, 120),
              section: (course.section ?? "").slice(0, 60),
              room: (course.room ?? "").slice(0, 60),
              classroom: { courseId, link: course.alternateLink, lastSyncedAt: new Date().toISOString() },
            }),
          );
          yield* syncRoster(token, id, courseId);
          classIds.push(id);
        }
        return { classIds };
      }),

      "classroom.sync": Effect.fn("classroom.sync")(function* ({ classId }) {
        const me = yield* requirePermission({ roster: ["update"] });
        const [cls] = yield* db.query((d) =>
          d
            .select()
            .from(classes)
            .where(and(eq(classes.id, classId), eq(classes.teacherId, me.id), isNull(classes.archivedAt))),
        );
        if (!cls) return yield* new NotFound({ message: "That class doesn't exist or isn't yours." });
        if (!cls.classroom) return yield* new Conflict({ message: "This class isn't linked to Google Classroom." });
        const token = yield* accessToken(me.id);
        const change = yield* syncRoster(token, cls.id, cls.classroom.courseId);
        yield* setSynced(cls.id, cls.classroom);
        return change;
      }),
    });
  }),
);

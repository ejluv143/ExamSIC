// Google Classroom: reads the teacher's courses and students with their linked Google account, and turns courses
// into classes.
import { type ClassroomCourse } from "@examinus/contract/classroom";
import { Conflict, NotFound } from "@examinus/contract/errors";
import { classroomScopes } from "@examinus/domain/classroom";
import { type ResponseCookie } from "@examinus/domain/user";
import { Context, Effect, Layer, Option, Schema } from "effect";
import type { Headers as EffectHeaders } from "effect/http";
import { newId } from "../../platform/ids.ts";
import { AppConfig } from "../../platform/AppConfig.ts";
import { BetterAuth, cookiesFrom } from "../auth/BetterAuth.ts";
import { webHeaders, type Actor } from "../auth/Session.ts";
import { ClassRepo } from "./Repo.ts";
import { ClassService } from "./Service.ts";
import { newJoinCode } from "./rules.ts";

// The parts of Classroom's REST API (v1) we read.
type Course = { id: string; name: string; section?: string; room?: string; alternateLink: string };
type CourseStudent = {
  userId: string;
  profile: { name?: { givenName?: string; familyName?: string; fullName?: string }; emailAddress?: string };
};
type Page<K extends string, T> = { [key in K]?: T[] } & { nextPageToken?: string };

// Google (or its sign-in setup) can't be used right now; `message` is written for people. The handlers turn it into
// the contract's `GoogleUnavailable`.
export class GoogleUnavailable extends Schema.TaggedError<GoogleUnavailable>()("GoogleUnavailable", { message: Schema.String }) {}

const notConnected = () => new Conflict({ message: "Connect Google Classroom first." });

export class ClassroomService extends Context.Service<
  ClassroomService,
  {
    readonly status: (userId: string) => Effect.Effect<{ configured: boolean; connected: boolean }>;
    // Google's authorization URL for linking Classroom access, plus Better Auth's OAuth state cookie.
    readonly connect: (
      input: { callbackURL: string; errorCallbackURL: string },
      headers: EffectHeaders.Headers,
    ) => Effect.Effect<{ url: string; cookies: ResponseCookie[] }, GoogleUnavailable>;
    // The courses the teacher teaches, marking those already imported into the active organization.
    readonly courses: (actor: Actor) => Effect.Effect<ClassroomCourse[], GoogleUnavailable | Conflict>;
    // The Google account link is the user's; the classes go into the active organization.
    readonly importCourses: (
      actor: Actor,
      courseIds: readonly string[],
    ) => Effect.Effect<{ classIds: string[] }, GoogleUnavailable | Conflict>;
    readonly sync: (
      actor: Actor,
      classId: string,
    ) => Effect.Effect<{ added: number; total: number }, GoogleUnavailable | Conflict | NotFound>;
  }
>()("examinus/api/ClassroomService") {
  static readonly layer = Layer.effect(
    ClassroomService,
    Effect.gen(function* () {
      const repo = yield* ClassRepo;
      const classes = yield* ClassService;
      const auth = yield* BetterAuth;
      // Overridable so tests can stand in for Google.
      const { apiUrl, tokenUrl } = (yield* AppConfig).classroom;

      const unavailable = (message: string) => new GoogleUnavailable({ message });

      // The teacher's linked Google account, if it was granted Classroom access.
      const googleAccount = (userId: string) =>
        repo
          .googleAccounts(userId)
          .pipe(
            Effect.map((rows) =>
              rows.find((a) => classroomScopes.every((scope) => a.scope?.split(/[\s,]+/).includes(scope))),
            ),
          );

      // A Classroom access token for the teacher, refreshed with the stored refresh token when it's about to expire.
      const accessToken = Effect.fn("ClassroomService.accessToken")(function* (userId: string) {
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
        yield* repo.saveToken(account.id, token.access_token, new Date(Date.now() + token.expires_in * 1000));
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
            cause instanceof GoogleUnavailable ? cause : unavailable("Couldn't reach Google Classroom. Try again."),
        });

      // Every page of a Classroom list.
      const getAll = Effect.fn("ClassroomService.getAll")(function* <K extends string, T>(
        token: string,
        path: string,
        key: K,
      ) {
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

      // The teacher's classes in the organization imported from Classroom, by course id.
      const importedClasses = (actor: Actor) =>
        repo
          .imported(actor)
          .pipe(
            Effect.map(
              (rows) => new Map(rows.flatMap((r) => (r.classroom ? [[r.classroom.courseId, r.id] as const] : []))),
            ),
          );

      // Adds the course's students to the class: an existing roster entry of the class's organization with the same
      // email is reused; anyone else gets a new one without an account, which becomes theirs when they sign in with
      // that Google email.
      const syncRoster = Effect.fn("ClassroomService.syncRoster")(function* (
        token: string,
        organizationId: string | null,
        classId: string,
        courseId: string,
      ) {
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
          let entry = yield* repo.studentByEmail(organizationId, email);
          if (!entry) {
            const id = newId("s");
            yield* repo.insertStudent({
              id,
              organizationId,
              email,
              firstName: profile.name?.givenName?.trim() || profile.name?.fullName?.trim() || email,
              lastName: profile.name?.familyName?.trim() ?? "",
            });
            entry = { id, userId: null };
          }
          if (yield* repo.addMember(classId, entry.id)) {
            added++;
            if (entry.userId) yield* repo.joinSessions(classId, entry.userId);
          }
        }
        return { added, total: yield* repo.countMembers(classId) };
      });

      return ClassroomService.of({
        status: Effect.fn("ClassroomService.status")(function* (userId) {
          return { configured: Option.isSome(auth.google), connected: !!(yield* googleAccount(userId)) };
        }),

        connect: Effect.fn("ClassroomService.connect")(function* ({ callbackURL, errorCallbackURL }, headers) {
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

        courses: Effect.fn("ClassroomService.courses")(function* (actor) {
          const token = yield* accessToken(actor.id);
          const [courses, imported] = yield* Effect.all([
            getAll<"courses", Course>(token, "/courses?teacherId=me&courseStates=ACTIVE", "courses"),
            importedClasses(actor),
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

        importCourses: Effect.fn("ClassroomService.importCourses")(function* (actor, courseIds) {
          const token = yield* accessToken(actor.id);
          const imported = yield* importedClasses(actor);
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
            yield* repo.insert({
              id,
              teacherId: actor.id,
              organizationId: actor.organizationId,
              joinCode: newJoinCode(),
              // Classroom has no course code; the first word of the name usually is one ("IT302 Database …").
              courseCode: (name.split(/\s+/)[0] ?? name).slice(0, 40),
              title: name.slice(0, 120),
              section: (course.section ?? "").slice(0, 60),
              room: (course.room ?? "").slice(0, 60),
              classroom: { courseId, link: course.alternateLink, lastSyncedAt: new Date().toISOString() },
            });
            yield* syncRoster(token, actor.organizationId, id, courseId);
            classIds.push(id);
          }
          return { classIds };
        }),

        sync: Effect.fn("ClassroomService.sync")(function* (actor, classId) {
          const cls = yield* classes.ownClass(actor, classId);
          if (!cls.classroom) return yield* new Conflict({ message: "This class isn't linked to Google Classroom." });
          const token = yield* accessToken(actor.id);
          const change = yield* syncRoster(token, cls.organizationId, cls.id, cls.classroom.courseId);
          yield* repo.update(cls.id, { classroom: { ...cls.classroom, lastSyncedAt: new Date().toISOString() } });
          return change;
        }),
      });
    }),
  );
}

// A teacher's classes: who owns one, its roster, and the teacher's changes to both.
import { NotFound } from "@examinus/contract/errors";
import { type ClassFields } from "@examinus/domain/classes";
import { Context, Effect, Layer } from "effect";
import { newId } from "../../platform/ids.ts";
import type { Actor } from "../auth/Session.ts";
import type { ClassItem, StudentItem } from "../../database/schemas/index.ts";
import { classColumns } from "./mappers.ts";
import { ClassRepo } from "./Repo.ts";
import { newJoinCode } from "./rules.ts";

const noSuchClass = () => new NotFound({ message: "That class doesn't exist or isn't yours." });

export type ClassWithRoster = { row: ClassItem; studentIds: string[] };

export class ClassService extends Context.Service<
  ClassService,
  {
    // The signed-in teacher's class in their organization, unless it's archived.
    readonly ownClass: (actor: Actor, classId: string) => Effect.Effect<ClassItem, NotFound>;
    // Each class with its roster, in the order students joined.
    readonly withRosters: (rows: readonly ClassItem[]) => Effect.Effect<ClassWithRoster[]>;
    // The teacher's classes that aren't archived.
    readonly ownClasses: (actor: Actor) => Effect.Effect<ClassItem[]>;
    // The ids of the class's members.
    readonly memberIds: (classId: string) => Effect.Effect<string[]>;
    // The class and roster entry of a student who belongs to it; null when they don't (or it is archived).
    readonly membership: (userId: string, classId: string) => Effect.Effect<{ cls: ClassItem; studentId: string } | null>;
    readonly list: (actor: Actor) => Effect.Effect<ClassWithRoster[]>;
    // The teacher's class with its roster, or null when it isn't theirs (or is archived).
    readonly get: (actor: Actor, classId: string) => Effect.Effect<ClassWithRoster | null>;
    readonly create: (actor: Actor, fields: ClassFields) => Effect.Effect<{ id: string }>;
    readonly update: (actor: Actor, classId: string, fields: ClassFields) => Effect.Effect<void, NotFound>;
    readonly archive: (actor: Actor, classId: string) => Effect.Effect<void, NotFound>;
    readonly newJoinCode: (actor: Actor, classId: string) => Effect.Effect<{ joinCode: string }, NotFound>;
    readonly removeStudent: (actor: Actor, classId: string, studentId: string) => Effect.Effect<void, NotFound>;
    // The roster entries among `studentIds` that the teacher may see.
    readonly students: (actor: Actor, studentIds: readonly string[]) => Effect.Effect<StudentItem[]>;
  }
>()("examinus/api/ClassService") {
  static readonly layer = Layer.effect(
    ClassService,
    Effect.gen(function* () {
      const repo = yield* ClassRepo;

      const ownClass = Effect.fn("ClassService.ownClass")(function* (actor: Actor, classId: string) {
        const row = yield* repo.findOwn(actor, classId);
        if (!row) return yield* noSuchClass();
        return row;
      });

      const withRosters = Effect.fn("ClassService.withRosters")(function* (rows: readonly ClassItem[]) {
        if (rows.length === 0) return [];
        const members = yield* repo.members(rows.map((r) => r.id));
        return rows.map((row) => ({
          row,
          studentIds: members.filter((m) => m.classId === row.id).map((m) => m.studentId),
        }));
      });

      return ClassService.of({
        ownClass,
        withRosters,
        ownClasses: repo.ofTeacher,
        memberIds: repo.memberIds,
        membership: repo.membership,
        list: Effect.fn("ClassService.list")(function* (actor) {
          return yield* withRosters(yield* repo.ofTeacher(actor));
        }),
        get: Effect.fn("ClassService.get")(function* (actor, classId) {
          const row = yield* repo.findOwn(actor, classId);
          if (!row) return null;
          const [withRoster] = yield* withRosters([row]);
          return withRoster!;
        }),
        create: Effect.fn("ClassService.create")(function* (actor, fields) {
          const id = newId("c");
          yield* repo.insert({ id, teacherId: actor.id, organizationId: actor.organizationId, joinCode: newJoinCode(), ...classColumns(fields) });
          return { id };
        }),
        update: Effect.fn("ClassService.update")(function* (actor, classId, fields) {
          yield* ownClass(actor, classId);
          yield* repo.update(classId, classColumns(fields));
        }),
        archive: Effect.fn("ClassService.archive")(function* (actor, classId) {
          yield* ownClass(actor, classId);
          yield* repo.update(classId, { archivedAt: new Date() });
        }),
        newJoinCode: Effect.fn("ClassService.newJoinCode")(function* (actor, classId) {
          yield* ownClass(actor, classId);
          const joinCode = newJoinCode();
          yield* repo.update(classId, { joinCode });
          return { joinCode };
        }),
        removeStudent: Effect.fn("ClassService.removeStudent")(function* (actor, classId, studentId) {
          yield* ownClass(actor, classId);
          const removed = yield* repo.removeMember(classId, studentId);
          if (!removed) return yield* new NotFound({ message: "That student isn't in this class." });
          const userId = yield* repo.accountOfStudent(studentId);
          if (userId) yield* repo.leaveSessions(classId, userId);
        }),
        students: Effect.fn("ClassService.students")(function* (actor, studentIds) {
          if (studentIds.length === 0) return [];
          const found = yield* repo.teacherStudents(actor, studentIds);
          return [...new Map(found.map((student) => [student.id, student])).values()];
        }),
      });
    }),
  );
}

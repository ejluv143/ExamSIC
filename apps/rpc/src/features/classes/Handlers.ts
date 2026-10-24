import { ClassRpcs } from "@examinus/contract/class";
import { ClassroomRpcs, ClassroomUnavailable } from "@examinus/contract/classroom";
import { EnrollmentRpcs } from "@examinus/contract/enrollment";
import { CurrentUser } from "@examinus/contract/middleware";
import { Forbidden } from "@examinus/contract/errors";
import { Effect, Layer } from "effect";
import { requireActor, requirePermission } from "../auth/Session.ts";
import { ClassroomService, type GoogleUnavailable } from "./Classroom.ts";
import { EnrollmentService } from "./Enrollment.ts";
import { toClassInfo, toRosterStudent, toTeacherClass } from "./mappers.ts";
import { ClassService } from "./Service.ts";

export const ClassHandlers = ClassRpcs.toLayer(
  Effect.gen(function* () {
    const classes = yield* ClassService;

    return ClassRpcs.of({
      "class.list": Effect.fn("class.list")(function* () {
        const me = yield* requireActor({ class: ["read"] });
        return (yield* classes.list(me.actor)).map(toTeacherClass);
      }),

      "class.get": Effect.fn("class.get")(function* ({ classId }) {
        const me = yield* requireActor({ class: ["read"] });
        const found = yield* classes.get(me.actor, classId);
        return found && toTeacherClass(found);
      }),

      "class.create": Effect.fn("class.create")(function* (fields) {
        const me = yield* requireActor({ class: ["create"] });
        return yield* classes.create(me.actor, fields);
      }),

      "class.update": Effect.fn("class.update")(function* ({ classId, fields }) {
        const me = yield* requireActor({ class: ["update"] });
        yield* classes.update(me.actor, classId, fields);
      }),

      "class.archive": Effect.fn("class.archive")(function* ({ classId }) {
        const me = yield* requireActor({ class: ["delete"] });
        yield* classes.archive(me.actor, classId);
      }),

      "class.newJoinCode": Effect.fn("class.newJoinCode")(function* ({ classId }) {
        const me = yield* requireActor({ class: ["update"] });
        return yield* classes.newJoinCode(me.actor, classId);
      }),

      "class.removeStudent": Effect.fn("class.removeStudent")(function* ({ classId, studentId }) {
        const me = yield* requireActor({ roster: ["update"] });
        yield* classes.removeStudent(me.actor, classId, studentId);
      }),

      "class.students": Effect.fn("class.students")(function* ({ studentIds }) {
        const me = yield* requireActor({ roster: ["read"] });
        return (yield* classes.students(me.actor, studentIds)).map(toRosterStudent);
      }),
    });
  }),
);

export const EnrollmentHandlers = EnrollmentRpcs.toLayer(
  Effect.gen(function* () {
    const enrollment = yield* EnrollmentService;

    return EnrollmentRpcs.of({
      "enrollment.mine": Effect.fn("enrollment.mine")(function* () {
        const me = yield* requireActor({ enrollment: ["read"] });
        const { student, classes } = yield* enrollment.mine(me.actor);
        if (!student) return { student: null, classes: [] };
        return {
          student: toRosterStudent(student),
          classes: classes.map(({ row, studentIds }) => toClassInfo(row, studentIds)),
        };
      }),

      "enrollment.join": Effect.fn("enrollment.join")(function* (input, { headers }) {
        // The code says which organization the class is in, so a student with none yet may join.
        const user = yield* CurrentUser;
        if (user.role !== "user") return yield* new Forbidden({ message: "Only students join classes." });
        return yield* enrollment.join(user, input, headers);
      }),

      "enrollment.leave": Effect.fn("enrollment.leave")(function* ({ classId }) {
        const me = yield* requireActor({ enrollment: ["delete"] });
        yield* enrollment.leave(me.actor, classId);
      }),
    });
  }),
);

// Google's failures are worded for people.
const unavailable = (error: GoogleUnavailable) => new ClassroomUnavailable({ message: error.message });

export const ClassroomHandlers = ClassroomRpcs.toLayer(
  Effect.gen(function* () {
    const classroom = yield* ClassroomService;

    return ClassroomRpcs.of({
      "classroom.status": Effect.fn("classroom.status")(function* () {
        const me = yield* requirePermission({ class: ["create"] });
        return yield* classroom.status(me.id);
      }),

      "classroom.connect": Effect.fn("classroom.connect")(function* (input, { headers }) {
        yield* requirePermission({ class: ["create"] });
        return yield* classroom.connect(input, headers).pipe(Effect.catchTag("GoogleUnavailable", (e) => Effect.fail(unavailable(e))));
      }),

      "classroom.courses": Effect.fn("classroom.courses")(function* () {
        const me = yield* requireActor({ class: ["read"] });
        return yield* classroom.courses(me.actor).pipe(Effect.catchTag("GoogleUnavailable", (e) => Effect.fail(unavailable(e))));
      }),

      "classroom.import": Effect.fn("classroom.import")(function* ({ courseIds }) {
        const me = yield* requireActor({ class: ["create"], roster: ["update"] });
        return yield* classroom.importCourses(me.actor, courseIds).pipe(Effect.catchTag("GoogleUnavailable", (e) => Effect.fail(unavailable(e))));
      }),

      "classroom.sync": Effect.fn("classroom.sync")(function* ({ classId }) {
        const me = yield* requireActor({ roster: ["update"] });
        return yield* classroom.sync(me.actor, classId).pipe(Effect.catchTag("GoogleUnavailable", (e) => Effect.fail(unavailable(e))));
      }),
    });
  }),
);

export const Handlers = Layer.mergeAll(ClassHandlers, EnrollmentHandlers, ClassroomHandlers);

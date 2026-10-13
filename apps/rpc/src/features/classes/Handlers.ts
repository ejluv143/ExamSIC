import { ClassRpcs } from "@examinus/contract/class";
import { ClassroomRpcs } from "@examinus/contract/classroom";
import { EnrollmentRpcs } from "@examinus/contract/enrollment";
import { Effect, Layer } from "effect";
import { requirePermission } from "../auth/Session.ts";
import { ClassroomService } from "./Classroom.ts";
import { EnrollmentService } from "./Enrollment.ts";
import { toClassInfo, toRosterStudent, toTeacherClass } from "./mappers.ts";
import { ClassService } from "./Service.ts";

export const ClassHandlers = ClassRpcs.toLayer(
  Effect.gen(function* () {
    const classes = yield* ClassService;

    return ClassRpcs.of({
      "class.list": Effect.fn("class.list")(function* () {
        const me = yield* requirePermission({ class: ["read"] });
        return (yield* classes.list(me.id)).map(toTeacherClass);
      }),

      "class.get": Effect.fn("class.get")(function* ({ classId }) {
        const me = yield* requirePermission({ class: ["read"] });
        const found = yield* classes.get(me.id, classId);
        return found && toTeacherClass(found);
      }),

      "class.create": Effect.fn("class.create")(function* (fields) {
        const me = yield* requirePermission({ class: ["create"] });
        return yield* classes.create(me.id, fields);
      }),

      "class.update": Effect.fn("class.update")(function* ({ classId, fields }) {
        const me = yield* requirePermission({ class: ["update"] });
        yield* classes.update(me.id, classId, fields);
      }),

      "class.archive": Effect.fn("class.archive")(function* ({ classId }) {
        const me = yield* requirePermission({ class: ["delete"] });
        yield* classes.archive(me.id, classId);
      }),

      "class.newJoinCode": Effect.fn("class.newJoinCode")(function* ({ classId }) {
        const me = yield* requirePermission({ class: ["update"] });
        return yield* classes.newJoinCode(me.id, classId);
      }),

      "class.removeStudent": Effect.fn("class.removeStudent")(function* ({ classId, studentId }) {
        const me = yield* requirePermission({ roster: ["update"] });
        yield* classes.removeStudent(me.id, classId, studentId);
      }),

      "class.students": Effect.fn("class.students")(function* ({ studentIds }) {
        const me = yield* requirePermission({ roster: ["read"] });
        return (yield* classes.students(me.id, studentIds)).map(toRosterStudent);
      }),
    });
  }),
);

export const EnrollmentHandlers = EnrollmentRpcs.toLayer(
  Effect.gen(function* () {
    const enrollment = yield* EnrollmentService;

    return EnrollmentRpcs.of({
      "enrollment.mine": Effect.fn("enrollment.mine")(function* () {
        const user = yield* requirePermission({ enrollment: ["read"] });
        const { student, classes } = yield* enrollment.mine(user);
        if (!student) return { student: null, classes: [] };
        return {
          student: toRosterStudent(student),
          classes: classes.map(({ row, studentIds }) => toClassInfo(row, studentIds)),
        };
      }),

      "enrollment.join": Effect.fn("enrollment.join")(function* (input) {
        const user = yield* requirePermission({ enrollment: ["create"] });
        return yield* enrollment.join(user, input);
      }),

      "enrollment.leave": Effect.fn("enrollment.leave")(function* ({ classId }) {
        const user = yield* requirePermission({ enrollment: ["delete"] });
        yield* enrollment.leave(user, classId);
      }),
    });
  }),
);

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
        return yield* classroom.connect(input, headers);
      }),

      "classroom.courses": Effect.fn("classroom.courses")(function* () {
        const me = yield* requirePermission({ class: ["read"] });
        return yield* classroom.courses(me.id);
      }),

      "classroom.import": Effect.fn("classroom.import")(function* ({ courseIds }) {
        const me = yield* requirePermission({ class: ["create"], roster: ["update"] });
        return yield* classroom.importCourses(me.id, courseIds);
      }),

      "classroom.sync": Effect.fn("classroom.sync")(function* ({ classId }) {
        const me = yield* requirePermission({ roster: ["update"] });
        return yield* classroom.sync(me.id, classId);
      }),
    });
  }),
);

export const Handlers = Layer.mergeAll(ClassHandlers, EnrollmentHandlers, ClassroomHandlers);

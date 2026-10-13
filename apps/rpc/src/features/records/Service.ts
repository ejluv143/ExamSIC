// The class record (grade sheet): the teacher's, and a student's own part of it.
import { type ClassRecord } from "@examinus/contract/class-record";
import { NotFound } from "@examinus/contract/errors";
import { Context, Effect, Layer } from "effect";
import { ClassService } from "../classes/Service.ts";
import { RecordsRepo } from "./Repo.ts";
import { cleanRecord, onlyStudent } from "./rules.ts";

export class RecordsService extends Context.Service<
  RecordsService,
  {
    readonly get: (teacherId: string, classId: string) => Effect.Effect<ClassRecord | null, NotFound>;
    readonly save: (teacherId: string, record: ClassRecord) => Effect.Effect<ClassRecord, NotFound>;
    // A student's part of the record of a class they belong to.
    readonly mine: (userId: string, classId: string) => Effect.Effect<ClassRecord | null, NotFound>;
  }
>()("examinus/api/RecordsService") {
  static readonly layer = Layer.effect(
    RecordsService,
    Effect.gen(function* () {
      const repo = yield* RecordsRepo;
      const classes = yield* ClassService;

      return RecordsService.of({
        get: Effect.fn("RecordsService.get")(function* (teacherId, classId) {
          yield* classes.ownClass(teacherId, classId);
          return yield* repo.find(classId);
        }),

        save: Effect.fn("RecordsService.save")(function* (teacherId, record) {
          const { classId } = record;
          yield* classes.ownClass(teacherId, classId);
          const [roster, sessions] = yield* Effect.all(
            [classes.memberIds(classId), repo.sessionIds(classId, teacherId)],
            { concurrency: "unbounded" },
          );
          const kept = cleanRecord(record, new Set(roster), new Set(sessions));
          yield* repo.save(classId, kept, teacherId);
          return { classId, ...kept };
        }),

        mine: Effect.fn("RecordsService.mine")(function* (userId, classId) {
          const membership = yield* classes.membership(userId, classId);
          if (!membership) return yield* new NotFound({ message: "You're not in that class." });
          const record = yield* repo.find(classId);
          // Classmates' scores stay with the teacher.
          return record && onlyStudent(record, membership.studentId);
        }),
      });
    }),
  );
}

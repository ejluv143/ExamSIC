// The attendance table: the meetings a teacher took attendance for.
import type { AttendanceStatus } from "@examinus/contract";
import { inArray } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";
import { Database } from "../../platform/Database.ts";
import { classMeetings } from "../../database/schemas/index.ts";

export type StoredMeeting = typeof classMeetings.$inferSelect;

export class AttendanceRepo extends Context.Service<
  AttendanceRepo,
  {
    // The meetings attendance was taken for, in any of the classes.
    readonly stored: (classIds: readonly string[]) => Effect.Effect<StoredMeeting[]>;
    // Stores the meeting's records, replacing the ones taken before.
    readonly save: (meeting: {
      classId: string;
      date: string;
      records: Record<string, AttendanceStatus>;
      takenAt: Date;
      takenBy: string;
    }) => Effect.Effect<void>;
  }
>()("examinus/api/AttendanceRepo") {
  static readonly layer = Layer.effect(
    AttendanceRepo,
    Effect.gen(function* () {
      const db = yield* Database;
      return AttendanceRepo.of({
        stored: Effect.fn("AttendanceRepo.stored")(function* (classIds) {
          if (classIds.length === 0) return [];
          return yield* db.query((d) =>
            d
              .select()
              .from(classMeetings)
              .where(inArray(classMeetings.classId, [...classIds])),
          );
        }),
        save: Effect.fn("AttendanceRepo.save")(function* ({ classId, date, records, takenAt, takenBy }) {
          yield* db.query((d) =>
            d
              .insert(classMeetings)
              .values({ classId, date, records, takenAt, takenBy })
              .onConflictDoUpdate({
                target: [classMeetings.classId, classMeetings.date],
                set: { records, takenAt, takenBy },
              }),
          );
        }),
      });
    }),
  );
}

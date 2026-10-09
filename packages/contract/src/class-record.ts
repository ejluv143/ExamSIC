// Class records (grade books), laid out like the school's Excel class record. The API stores what teachers type
// in; scores linked to quiz sessions and attendance are filled in by the web app when it shows the record.
import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { Forbidden, NotFound } from "./errors.ts";
import { AuthMiddleware } from "./middleware.ts";

export const RecordItem = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  maxScore: Schema.Number,
  // Linked to a quiz session: scores fill in from students' submitted attempts.
  sessionId: Schema.NullOr(Schema.String),
  // "attendance": the score is the term's attendance (meetings held minus absences); maxScore follows it.
  source: Schema.optionalKey(Schema.Literal("attendance")),
});

export const RecordCategory = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  // Percent of the term grade.
  weight: Schema.Number,
  // The major exam is listed apart from ADW (activities and daily work).
  isExam: Schema.Boolean,
  items: Schema.Array(RecordItem),
});

const Categories = Schema.Array(RecordCategory);
// Absences in a term, by roster id.
const Absences = Schema.Record(Schema.String, Schema.Number);

export const ClassRecord = Schema.Struct({
  classId: Schema.String,
  terms: Schema.Struct({ midterm: Categories, final: Categories }),
  // Typed-in scores by item id, then roster id. Linked items aren't stored here.
  scores: Schema.Record(Schema.String, Schema.Record(Schema.String, Schema.NullOr(Schema.Number))),
  absences: Schema.Struct({ midterm: Absences, final: Absences }),
  // Students marked DR (dropped), by roster id.
  dropped: Schema.Array(Schema.String),
  // Sessions the teacher took out of this record, so they aren't added back automatically.
  unlinked: Schema.optionalKey(Schema.Array(Schema.String)),
  signatories: Schema.Struct({ dean: Schema.String, vpaa: Schema.String, registrar: Schema.String }),
});
export type ClassRecord = typeof ClassRecord.Type;

const ClassId = { classId: Schema.String };
const Errors = Schema.Union([Forbidden, NotFound]);

export class ClassRecordRpcs extends RpcGroup.make(
  // A teacher's class: its record as saved, or null before the first save.
  Rpc.make("get", { payload: ClassId, success: Schema.NullOr(ClassRecord), error: Errors }),
  // Replaces the record. The API keeps only the class's own students and sessions and clamps numbers, and
  // returns what it kept.
  Rpc.make("save", { payload: { record: ClassRecord }, success: ClassRecord, error: Errors }),
  // A student's record in one of their classes, with only their own scores, absences and DR mark.
  Rpc.make("mine", { payload: ClassId, success: Schema.NullOr(ClassRecord), error: Errors }),
)
  .prefix("classRecord.")
  .middleware(AuthMiddleware) {}

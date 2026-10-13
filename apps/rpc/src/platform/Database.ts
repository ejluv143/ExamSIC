import { SQL } from "bun";
import { drizzle, type BunSQLDatabase } from "drizzle-orm/bun-sql";
import { Context, Effect, Layer, Redacted, Schema } from "effect";
import * as schema from "../database/schemas/index.ts";
import { AppConfig } from "./AppConfig.ts";

export class DatabaseError extends Schema.TaggedError<DatabaseError>()("DatabaseError", {
  cause: Schema.Defect(),
}) {}

export type Drizzle = BunSQLDatabase<typeof schema>;

// Drizzle's database or a transaction of it: what the repository functions take, so they run in either.
export type Db = Pick<Drizzle, "select" | "insert" | "update" | "delete">;

// A unique index or constraint refused a row. `constraint` is the name Postgres reports (the index name for a
// unique index), so a caller can tell which of several constraints it hit.
export class UniqueViolation extends Schema.TaggedError<UniqueViolation>()("UniqueViolation", {
  constraint: Schema.String,
}) {}

// The unique violation behind a failed query, or null for any other failure. Drizzle wraps the driver's error in a
// DrizzleQueryError, so look through `cause`; Bun's SQL error carries the Postgres SQLSTATE in `errno`
// (23505 = unique_violation) and the constraint's name in `constraint`.
export const uniqueViolationOf = (error: unknown): UniqueViolation | null => {
  for (let e = error, depth = 0; typeof e === "object" && e !== null && depth < 5; e = (e as { cause?: unknown }).cause, depth++) {
    const { errno, constraint } = e as { errno?: unknown; constraint?: unknown };
    if (String(errno) === "23505") return new UniqueViolation({ constraint: typeof constraint === "string" ? constraint : "" });
  }
  return null;
};

// Postgres through Drizzle on Bun's built-in client. The pool closes when the layer is released. Query failures
// are defects: handlers have nothing to recover, and RPC clients see an internal error. Where a failure is an
// expected outcome, `queryUnique` observes it in the error channel: a unique violation becomes a typed
// `UniqueViolation` and everything else stays a defect. For example, a repository turning a clash into the
// contract's error (inside, `.onConflict…` is simply left out so the database refuses the row):
//
//   db.queryUnique((d) => d.insert(classes).values(row).returning()).pipe(
//     Effect.catchTag("UniqueViolation", (e) => (e.constraint === "classes_join_code_idx" ? retry : Effect.fail(new Conflict()))),
//   )
export class Database extends Context.Service<
  Database,
  {
    readonly drizzle: Drizzle;
    readonly query: <A>(run: (db: Drizzle) => Promise<A>) => Effect.Effect<A>;
    readonly queryUnique: <A>(run: (db: Drizzle) => Promise<A>) => Effect.Effect<A, UniqueViolation>;
  }
>()("examinus/api/Database") {
  // Opens the pool; shared by the server layer and the standalone database scripts, which supply their own URL.
  static readonly make = (url: Redacted.Redacted) =>
    Effect.gen(function* () {
      const sql = yield* Effect.acquireRelease(
        Effect.sync(() => new SQL(Redacted.value(url))),
        (sql) => Effect.promise(() => sql.close()),
      );
      const db = drizzle(sql, { schema });
      return Database.of({
        drizzle: db,
        query: (run) =>
          Effect.tryPromise({ try: () => run(db), catch: (cause) => new DatabaseError({ cause }) }).pipe(Effect.orDie),
        queryUnique: (run) =>
          Effect.tryPromise({ try: () => run(db), catch: (cause) => uniqueViolationOf(cause) ?? new DatabaseError({ cause }) }).pipe(
            Effect.catchTag("DatabaseError", Effect.die),
          ),
      });
    });

  static readonly layer = Layer.effect(
    Database,
    Effect.gen(function* () {
      const { database } = yield* AppConfig;
      return yield* Database.make(database.url);
    }),
  );
}

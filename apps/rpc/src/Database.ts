import { SQL } from "bun";
import { drizzle, type BunSQLDatabase } from "drizzle-orm/bun-sql";
import { Config, Context, Effect, Layer, Redacted, Schema } from "effect";
import * as schema from "./database/schemas/index.ts";

export class DatabaseError extends Schema.TaggedError<DatabaseError>()("DatabaseError", {
  cause: Schema.Defect(),
}) {}

export type Drizzle = BunSQLDatabase<typeof schema>;

// Postgres through Drizzle on Bun's built-in client. The pool closes when the layer is released. Query failures
// are defects: handlers have nothing to recover, and RPC clients see an internal error.
export class Database extends Context.Service<
  Database,
  {
    readonly drizzle: Drizzle;
    readonly query: <A>(run: (db: Drizzle) => Promise<A>) => Effect.Effect<A>;
  }
>()("examora/api/Database") {
  static readonly layer = Layer.effect(
    Database,
    Effect.gen(function* () {
      const url = yield* Config.Redacted("DATABASE_URL");
      const sql = yield* Effect.acquireRelease(
        Effect.sync(() => new SQL(Redacted.value(url))),
        (sql) => Effect.promise(() => sql.close()),
      );
      const db = drizzle(sql, { schema });
      return Database.of({
        drizzle: db,
        query: (run) =>
          Effect.tryPromise({ try: () => run(db), catch: (cause) => new DatabaseError({ cause }) }).pipe(Effect.orDie),
      });
    }),
  );
}

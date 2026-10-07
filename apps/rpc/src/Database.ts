import { Config, Context, Effect, Layer, Redacted, Schema } from "effect";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./database/schemas/index.ts";

export class DatabaseError extends Schema.TaggedError<DatabaseError>()("DatabaseError", {
  cause: Schema.Defect(),
}) {}

export type Drizzle = NodePgDatabase<typeof schema>;

// Postgres through Drizzle. The pool closes when the layer is released. Query failures are defects:
// handlers have nothing to recover, and RPC clients see an internal error.
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
      const pool = yield* Effect.acquireRelease(
        Effect.sync(() => new Pool({ connectionString: Redacted.value(url) })),
        (pool) => Effect.promise(() => pool.end()),
      );
      const db = drizzle(pool, { schema });
      return Database.of({
        drizzle: db,
        query: (run) =>
          Effect.tryPromise({ try: () => run(db), catch: (cause) => new DatabaseError({ cause }) }).pipe(Effect.orDie),
      });
    }),
  );
}

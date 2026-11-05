// In-process Postgres (PGlite) for repository tests: the real migrations applied once, the real Repos on top. Rules that
// live in SQL (row locks, conflict handling, joins on NULL organizations) can only be tested against a real engine.
import { PGlite } from "@electric-sql/pglite";
import { getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { Layer } from "effect";
import * as schema from "../database/schemas/index.ts";
import { Database } from "../platform/Database.ts";

export type TestDb = PgliteDatabase<typeof schema>;

const migrationsFolder = new URL("../database/migrations", import.meta.url).pathname;

const tables = Object.values(schema)
  .filter((t): t is (typeof schema)[keyof typeof schema] & PgTable => is(t, PgTable))
  .map((t) => `"${getTableName(t)}"`);

// Boots a database with the schema in place. Call `reset()` before each test (it empties every table) and `close()` after
// the file. One boot per test file: migrating takes a moment, truncating does not.
export const testPostgres = async () => {
  const client = new PGlite();
  const db: TestDb = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  return {
    db,
    // What Repos are built on: `AttemptRepo.layer.pipe(Layer.provide(postgres.layer))`.
    layer: Layer.succeed(Database, Database.fromDrizzle(db)),
    reset: async () => void (await client.exec(`truncate ${tables.join(", ")} restart identity cascade`)),
    close: () => client.close(),
  };
};

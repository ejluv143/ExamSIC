// Sets a teacher's plan until payments exist: `pnpm plan:set <email> <free|pro> [YYYY-MM-DD]`.
// Without a date the plan doesn't end; after the date, the teacher is on the free plan again.
import { BunRuntime } from "@effect/platform-bun";
import { isPlan, planNames } from "@examora/contract/roles";
import { and, eq, sql } from "drizzle-orm";
import { Effect } from "effect";
import { Database } from "../Database.ts";
import { users } from "./schemas/index.ts";

const [email, plan, until] = process.argv.slice(2);

const setPlan = Effect.gen(function* () {
  if (!email || !isPlan(plan)) {
    return yield* Effect.die(`Usage: pnpm plan:set <email> <${planNames.join("|")}> [YYYY-MM-DD]`);
  }
  const planExpiresAt = until ? new Date(`${until}T23:59:59`) : null;
  if (planExpiresAt && Number.isNaN(planExpiresAt.getTime())) return yield* Effect.die(`Not a date: ${until}`);
  const db = yield* Database;
  const [row] = yield* db.query((d) =>
    d
      .update(users)
      .set({ plan, planExpiresAt })
      .where(and(eq(sql`lower(${users.email})`, email.trim().toLowerCase()), eq(users.role, "teacher")))
      .returning({ name: users.name }),
  );
  if (!row) return yield* Effect.die(`No teacher account with the email ${email}.`);
  yield* Effect.log(`${row.name} is on ${plan}${planExpiresAt ? ` until ${until}` : ""}.`);
});

setPlan.pipe(Effect.provide(Database.layer), BunRuntime.runMain);

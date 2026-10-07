// Server environment variables, checked with zod so a missing or malformed value fails fast with a clear message.
// No "server-only" here: drizzle.config.ts and the seed script read it outside Next.js.
import { z } from "zod";

// `FOO=` in an env file means "not set", not "set to an empty string".
const optional = z.preprocess((v) => (v === "" ? undefined : v), z.string().optional());

const databaseSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/, error: "must be a postgres:// or postgresql:// URL" }),
});

const authSchema = z
  .object({
    BETTER_AUTH_SECRET: z.string().min(32, "must be at least 32 characters; generate with: openssl rand -base64 32"),
    BETTER_AUTH_URL: z.url({ protocol: /^https?$/, error: "must be the app's http(s) origin, e.g. http://localhost:3000" }),
    GOOGLE_CLIENT_ID: optional,
    GOOGLE_CLIENT_SECRET: optional,
  })
  .refine((env) => !env.GOOGLE_CLIENT_ID === !env.GOOGLE_CLIENT_SECRET, {
    path: ["GOOGLE_CLIENT_SECRET"],
    error: "set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or neither",
  });

function parse<T extends z.ZodType>(schema: T): z.output<T> {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    throw new Error(`Invalid environment variables (see apps/web/.env.example):\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

export const databaseEnv = () => parse(databaseSchema);
export const authEnv = () => parse(authSchema);

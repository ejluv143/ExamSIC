import "./src/database/load-env";
import { defineConfig } from "drizzle-kit";
import { databaseEnv } from "./src/env";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/database/schemas/index.ts",
  out: "./src/database/migrations",
  dbCredentials: { url: databaseEnv().DATABASE_URL },
  strict: true,
  verbose: true,
});

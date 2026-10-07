import "./src/load-env.ts";
import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set (see apps/rpc/.env.example).");

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/database/schemas/index.ts",
  out: "./src/database/migrations",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});

import { defineConfig } from "drizzle-kit";
import { existsSync } from "node:fs";

// drizzle-kit runs under Node, which doesn't read .env on its own (Bun does for the API itself).
if (existsSync(".env")) process.loadEnvFile(".env");

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

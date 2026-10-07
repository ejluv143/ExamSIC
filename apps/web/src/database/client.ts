import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { databaseEnv } from "../env";
import * as schema from "./schemas";

export type Database = NodePgDatabase<typeof schema> & { $client: Pool };

// Reuse one pool across dev hot reloads instead of opening a new one per reload.
const globalForDb = globalThis as unknown as { db?: Database };

export const db: Database = globalForDb.db ?? drizzle(databaseEnv().DATABASE_URL, { schema });
if (process.env.NODE_ENV !== "production") globalForDb.db = db;

import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/server/env";
import * as schema from "./schema";

function createDb() {
  // Supabase transaction pooler (port 6543) does not support prepared statements.
  const client = postgres(env().DATABASE_URL, { prepare: false, max: 5 });
  return drizzle(client, { schema });
}

export type Database = ReturnType<typeof createDb>;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type DbOrTx = Database | Transaction;

const globalForDb = globalThis as unknown as { __db?: Database };

/** Shared database connection (reused across hot reloads in development). */
export function db(): Database {
  if (!globalForDb.__db) globalForDb.__db = createDb();
  return globalForDb.__db;
}

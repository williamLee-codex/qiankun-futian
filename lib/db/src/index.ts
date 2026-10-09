import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export function createDatabaseConnection(
  options: Omit<pg.PoolConfig, "connectionString"> = {},
) {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ...options,
  });
  return { pool, db: drizzle(pool, { schema }) };
}

export const { pool, db } = createDatabaseConnection();

export * from "./schema";

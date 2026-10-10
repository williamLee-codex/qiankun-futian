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
  // pg removes failed clients itself. Active-client and idle-pool error
  // listeners keep a broken connection from crashing the API after rollback.
  // Do not log the driver error: it may contain connection details.
  pool.on("connect", (client) => {
    client.on("error", () => console.error("PG_CONNECTION_FAILED"));
  });
  pool.on("error", () => console.error("PG_POOL_IDLE_CONNECTION_FAILED"));
  return { pool, db: drizzle(pool, { schema }) };
}

export const { pool, db } = createDatabaseConnection();

export * from "./schema";

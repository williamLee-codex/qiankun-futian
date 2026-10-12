import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

// Gameplay can hold all main-pool connections while waiting on player locks.
// Durable wallet intents/receipts must still be writable by the lock holder.
// Keep those short journal queries on a separate bounded pool, in the same DB.
export const walletJournalPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 2,
  connectionTimeoutMillis: 5_000,
  query_timeout: 5_000,
});
export const walletJournalDb = drizzle(walletJournalPool, { schema });

export * from "./schema";

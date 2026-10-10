import type { PoolConfig } from "pg";
import { readFileSync } from "node:fs";

/** Runtime only; migrations use a separate operator connection. Never log URLs. */
export function farmDatabaseConfig(env: NodeJS.ProcessEnv): PoolConfig {
  if (!env.DATABASE_URL) throw new Error("FARM_DATABASE_URL_REQUIRED");
  let url: URL;
  try {
    url = new URL(env.DATABASE_URL);
  } catch {
    throw new Error("INVALID_FARM_DATABASE_CONFIG");
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.hostname ||
    !url.pathname.slice(1) ||
    url.hash
  )
    throw new Error("INVALID_FARM_DATABASE_CONFIG");
  const production = env.NODE_ENV === "production";
  const max = Number(env.FARM_DB_POOL_MAX ?? (production ? "2" : "10"));
  if (!Number.isInteger(max) || max < 1 || max > (production ? 2 : 20))
    throw new Error("INVALID_FARM_POOL_LIMIT");
  const config: PoolConfig = {
    connectionString: url.toString(),
    max,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 5000,
    allowExitOnIdle: true,
    application_name: "farm_v2_api",
  };
  if (production) {
    if (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
      throw new Error("FARM_PRODUCTION_DATABASE_REQUIRED");
    const mode = url.searchParams.get("sslmode");
    if (mode && !["require", "verify-full", "verify-ca"].includes(mode))
      throw new Error("FARM_DATABASE_TLS_REQUIRED");
    if (
      url.searchParams.has("ssl") ||
      url.searchParams.has("sslcert") ||
      url.searchParams.has("sslkey") ||
      url.searchParams.has("sslrootcert")
    )
      throw new Error("INVALID_FARM_DATABASE_TLS_CONFIG");
    // pg connectionString SSL parameters otherwise override explicit TLS options.
    url.searchParams.delete("sslmode");
    config.connectionString = url.toString();
    config.ssl = {
      rejectUnauthorized: true,
      ...(env.FARM_DB_CA_FILE
        ? { ca: readFileSync(env.FARM_DB_CA_FILE, "utf8") }
        : {}),
    };
  }
  return config;
}

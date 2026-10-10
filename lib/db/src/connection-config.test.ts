import { expect, test } from "vitest";
import { farmDatabaseConfig } from "./connection-config";
test("production enforces verified TLS and a bounded reusable pool", () => {
  const config = farmDatabaseConfig({
    NODE_ENV: "production",
    FARM_DB_CONNECTION_MODE: "session",
    DATABASE_URL:
      "postgresql://runtime:example@pooler.example/db?sslmode=require",
  });
  expect(config.ssl).toEqual({ rejectUnauthorized: true });
  expect(config.connectionString).not.toContain("sslmode");
  expect(config.max).toBe(1);
  expect(config.options).toContain("statement_timeout=15000");
  expect(config.options).toContain("lock_timeout=3000");
  expect(config.options).toContain("idle_in_transaction_session_timeout=8000");
  expect(config.allowExitOnIdle).toBe(true);
});
test("rejects invalid or insecure production configuration with fixed error codes", () => {
  for (const url of [
    "bad",
    "https://example/db",
    "postgresql://example/db?sslmode=no-verify",
    "postgresql://example/db?ssl=false",
    "postgresql://127.0.0.1/db",
  ]) {
    expect(() =>
      farmDatabaseConfig({
        NODE_ENV: "production",
        FARM_DB_CONNECTION_MODE: "session",
        DATABASE_URL: url,
      }),
    ).toThrow(/^(INVALID_FARM|FARM_)/);
  }
  expect(() =>
    farmDatabaseConfig({
      NODE_ENV: "production",
      FARM_DB_CONNECTION_MODE: "session",
      DATABASE_URL: "postgresql://example/db",
      FARM_DB_POOL_MAX: "10",
    }),
  ).toThrow("INVALID_FARM_POOL_LIMIT");
  expect(() => farmDatabaseConfig({})).toThrow("FARM_DATABASE_URL_REQUIRED");
});
test("isolated local database remains available without production TLS", () => {
  expect(
    farmDatabaseConfig({
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://127.0.0.1/farm_v2_local",
    }).ssl,
  ).toBeUndefined();
});

test("production refuses absent or transaction pooling declarations", () => {
  for (const mode of [undefined, "transaction"])
    expect(() =>
      farmDatabaseConfig({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://runtime@pooler.example/db",
        FARM_DB_CONNECTION_MODE: mode,
      }),
    ).toThrow("FARM_SESSION_CONNECTION_REQUIRED");
});

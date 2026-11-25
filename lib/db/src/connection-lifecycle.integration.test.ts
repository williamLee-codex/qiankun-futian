import { afterAll, expect, test } from "vitest";
import { Pool } from "pg";
import { farmDatabaseConfig } from "./connection-config";

const enabled = Boolean(process.env.FARM_V2_TEST_DATABASE_URL);
const connection =
  process.env.FARM_V2_TEST_DATABASE_URL ??
  "postgresql://127.0.0.1/farm_v2_unused";
const url = new URL(connection);
if (url.hostname !== "127.0.0.1" || !url.pathname.startsWith("/farm_v2_"))
  throw new Error("ISOLATED_DATABASE_REQUIRED");
const config = farmDatabaseConfig({
  NODE_ENV: "test",
  DATABASE_URL: connection,
});
const primary = new Pool({ ...config, max: 1 });
const authority = new Pool({ ...config, max: 1 });
const journal = new Pool({ ...config, max: 1 });
afterAll(async () => {
  await Promise.all([primary.end(), authority.end(), journal.end()]);
});

test.skipIf(!enabled)(
  "server applies timeouts and interrupts a slow statement",
  async () => {
    const client = await primary.connect();
    try {
      for (const [name, value] of [
        ["statement_timeout", "15s"],
        ["lock_timeout", "3s"],
        ["idle_in_transaction_session_timeout", "8s"],
      ]) {
        expect((await client.query(`SHOW ${name}`)).rows[0][name]).toBe(value);
      }
      await expect(client.query("SELECT pg_sleep(16)")).rejects.toMatchObject({
        code: "57014",
      });
      expect((await client.query("SELECT 1 AS ok")).rows[0].ok).toBe(1);
    } finally {
      client.release();
    }
  },
  20_000,
);

test.skipIf(!enabled)(
  "session lock stays on its client; independent journal survives occupied gameplay pool",
  async () => {
    const held = await authority.connect();
    const game = await primary.connect();
    try {
      const pid = (await held.query("SELECT pg_backend_pid() AS pid")).rows[0]
        .pid;
      await held.query("SELECT pg_advisory_lock(834225710)");
      await game.query("BEGIN");
      expect(
        (await journal.query("SELECT pg_try_advisory_lock(834225710) AS got"))
          .rows[0].got,
      ).toBe(false);
      await expect(
        game.query("SELECT pg_advisory_lock(834225710)"),
      ).rejects.toMatchObject({ code: "55P03" });
      await game.query("ROLLBACK");
      expect(
        (await held.query("SELECT pg_backend_pid() AS pid")).rows[0].pid,
      ).toBe(pid);
      await held.query("SELECT pg_advisory_unlock(834225710)");
      expect(
        (await game.query("SELECT pg_try_advisory_lock(834225710) AS got"))
          .rows[0].got,
      ).toBe(true);
      await game.query("SELECT pg_advisory_unlock(834225710)");
    } finally {
      held.release(true);
      game.release(true);
    }
  },
  8_000,
);

test.skipIf(!enabled)(
  "exhaustion is bounded and releasing the only client restores the pool",
  async () => {
    const client = await primary.connect();
    try {
      await expect(primary.connect()).rejects.toThrow(/timeout/);
    } finally {
      client.release();
    }
    expect((await primary.query("SELECT 1 AS ok")).rows[0].ok).toBe(1);
  },
  8_000,
);

test.skipIf(!enabled)(
  "idle transaction is terminated and its writes roll back",
  async () => {
    const client = await primary.connect();
    client.on("error", () => {
      /* Socket closure after PostgreSQL termination is expected. */
    });
    const failed = new Promise<string>((resolve) =>
      client.once("error", (error) =>
        resolve((error as { code?: string }).code ?? ""),
      ),
    );
    try {
      await client.query("BEGIN");
      await client.query("CREATE TABLE farm_v2_timeout_probe(id integer)");
      expect(await failed).toBe("25P03");
      expect(
        (
          await journal.query(
            "SELECT to_regclass('farm_v2_timeout_probe') AS probe",
          )
        ).rows[0].probe,
      ).toBeNull();
    } finally {
      client.release(true);
    }
  },
  12_000,
);

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { readFileSync } from "node:fs";

const enabled = Boolean(
  process.env.FARM_V2_TEST_DATABASE_URL &&
  process.env.FARM_V2_PLATFORM_CHECKOUT,
);
describe.skipIf(!enabled)(
  "durable Farm/Core transaction integration on isolated PostgreSQL",
  () => {
    let corePool: typeof import("@workspace/db").pool;
    let storage: typeof import("@workspace/db");
    let purchase: typeof import("./farm-v2-seed-purchase").purchaseFarmV2SeedPacks;
    let exchange: typeof import("./farm-v2-crop-exchange").exchangeFarmV2Crops;
    const userId = "00000000-0000-0000-0000-000000000001";
    let dropWalletResponse = false;
    let dropFarmCommit = false;
    beforeAll(async () => {
      const url = new URL(process.env.FARM_V2_TEST_DATABASE_URL!);
      if (url.hostname !== "127.0.0.1" || !url.pathname.startsWith("/farm_v2_"))
        throw new Error("Isolated test database required");
      vi.stubEnv("DATABASE_URL", url.toString());
      vi.stubEnv("PLATFORM_BASE_URL", "https://platform.test");
      vi.stubEnv("REPLIT_APP_SHARED_SECRET", "test-only");
      storage = await import("@workspace/db");
      const PoolClass = storage.pool.constructor as new (options: {
        connectionString: string;
      }) => typeof storage.pool;
      corePool = new PoolClass({ connectionString: url.toString() });
      purchase = (await import("./farm-v2-seed-purchase"))
        .purchaseFarmV2SeedPacks;
      exchange = (await import("./farm-v2-crop-exchange")).exchangeFarmV2Crops;
      await storage.pool.query(
        `create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql as 'select null::uuid'; insert into auth.users values ('${userId}');`,
      );
      const root = process.env.FARM_V2_PLATFORM_CHECKOUT!;
      await storage.pool.query(
        readFileSync(
          `${root}/supabase/migrations/0019_create_core_wallet_runtime.sql`,
          "utf8",
        ),
      );
      const bridge = `${root}/supabase/migrations/0123_farm_v2_wallet_bridge.sql`;
      try {
        await storage.pool.query(readFileSync(bridge, "utf8"));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      await storage.pool.query(`
      create table farm_v2_player_state(user_id text primary key, first_farm_entered_at timestamptz, effective_paid_crystals integer not null default 0, access_state jsonb not null, warehouse_state jsonb not null, mission_state jsonb not null, pet_state jsonb not null, farmer_state jsonb not null, chaos_seed_state jsonb, updated_at timestamptz default now());
      create table farm_v2_mutation(user_id text,request_id text,action text not null,response jsonb,transaction_state text not null default 'PENDING',wallet_direction text,wallet_currency text,wallet_amount integer,wallet_transaction jsonb,failure_code text,updated_at timestamptz default now(),created_at timestamptz default now(),primary key(user_id,request_id));
      create table farm_test_failures(flag boolean); create function fail_farm_commit() returns trigger language plpgsql as $$ begin if new.transaction_state='COMPLETED' and exists(select 1 from farm_test_failures) then raise exception 'TEST_FARM_COMMIT_FAILURE'; end if; return new; end $$; create trigger farm_test_failure before update on farm_v2_mutation for each row execute function fail_farm_commit();
    `);
    });
    beforeEach(async () => {
      dropWalletResponse = false;
      dropFarmCommit = false;
      await storage.pool.query(
        `truncate farm_v2_mutation, farm_v2_player_state, farm_test_failures; truncate core_wallet_ledger, core_wallets; select core_wallet_get_or_create('${userId}'); update core_wallets set coin_balance=100;`,
      );
      const warehouse = {
        seeds: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
        crops: { 1: 20, 2: 20, 3: 20, 4: 20, 5: 20, 6: 20 },
      };
      const { createMissionState } =
        await import("../../../qiankun-farm/src/game/v2/missionRuntime");
      await storage.pool.query(
        `insert into farm_v2_player_state(user_id,access_state,warehouse_state,mission_state,pet_state,farmer_state) values($1,'{}',$2,$3,'{}','{}')`,
        [userId, warehouse, createMissionState(Date.now())],
      );
      vi.stubGlobal("fetch", async (_url: unknown, init: RequestInit) => {
        const input = JSON.parse(String(init.body));
        const result = await corePool.query(
          "select farm_v2_apply_wallet_transaction($1,$2,$3,$4,$5,$6,$7,$8,$9) as result",
          [
            userId,
            init.headers &&
              (init.headers as Record<string, string>)["x-request-id"],
            input.amount,
            input.currency,
            input.direction,
            input.reason,
            input.referenceId,
            input.referenceType,
            input.originalTransactionId ?? null,
          ],
        );
        const raw = result.rows[0].result;
        if (dropWalletResponse) {
          dropWalletResponse = false;
          throw new Error("TEST_LOST_CORE_RESPONSE");
        }
        if (dropFarmCommit) {
          dropFarmCommit = false;
          await corePool.query("insert into farm_test_failures values(true)");
        }
        if (!["created", "duplicate"].includes(raw.result_status))
          return new Response(JSON.stringify({ error: raw.result_status }), {
            status: 409,
          });
        const t = raw.transaction,
          w = raw.wallet;
        return Response.json({
          duplicate: raw.result_status === "duplicate",
          transaction: {
            id: t.id,
            ownerId: t.owner_id,
            amount: t.amount,
            currency: t.currency,
            direction: t.direction,
            reason: t.reason,
            referenceId: t.reference_id,
            referenceType: t.reference_type,
            idempotencyKey: t.idempotency_key,
            reversalOf: t.reversal_of,
            walletId: t.wallet_id,
          },
          wallet: {
            id: w.wallet_id,
            ownerId: w.owner_id,
            balances: { coin: w.coin_balance, crystal: w.crystal_balance },
          },
        });
      });
    });
    afterAll(async () => {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
      await (
        await import("./farm-v2-wallet-saga")
      ).farmV2WalletJournalPool.end();
      await storage?.pool.end();
      await corePool?.end();
    });
    const seedInput = () => ({
      userId,
      launchToken: "test-launch",
      requestId: "seed-1",
      landId: 1,
      packs: 2,
    });
    it("first purchase and simultaneous retries charge once and add seeds once", async () => {
      const results = await Promise.allSettled([
        purchase(seedInput()),
        purchase(seedInput()),
        purchase(seedInput()),
      ]).then((results) =>
        results.map((result) => {
          if (result.status === "rejected") throw result.reason;
          return result.value;
        }),
      );
      expect(results[0].warehouse.seeds[1]).toBe(40);
      expect(results[1]).toEqual(results[0]);
      expect(
        (await storage.pool.query("select coin_balance from core_wallets"))
          .rows[0].coin_balance,
      ).toBe(98);
      expect(
        (
          await storage.pool.query(
            "select count(*)::int as count from core_wallet_ledger",
          )
        ).rows[0].count,
      ).toBe(1);
    });
    it("recovers a lost Core response with the same immutable intent", async () => {
      dropWalletResponse = true;
      await expect(purchase(seedInput())).rejects.toThrow(
        "TEST_LOST_CORE_RESPONSE",
      );
      await expect(purchase(seedInput())).resolves.toMatchObject({
        seedsAdded: 40,
      });
      expect(
        (
          await storage.pool.query(
            "select count(*)::int as count from core_wallet_ledger",
          )
        ).rows[0].count,
      ).toBe(1);
    });
    it("retries after farm rollback without repeating a Core credit or recalculating the crop quantity", async () => {
      const input = {
        ...seedInput(),
        requestId: "crop-1",
        landId: 6,
        cropQuantity: 100,
      };
      dropFarmCommit = true;
      await expect(exchange(input)).rejects.toMatchObject({
        cause: { message: "TEST_FARM_COMMIT_FAILURE" },
      });
      await storage.pool.query("delete from farm_test_failures");
      await expect(exchange(input)).resolves.toMatchObject({
        cropsConsumed: 20,
        rewardQuantity: 20,
        currency: "crystal",
      });
      expect(
        (await storage.pool.query("select crystal_balance from core_wallets"))
          .rows[0].crystal_balance,
      ).toBe(20);
    });
    it("permanent recovery failure compensates and cannot be replayed as a purchase", async () => {
      dropFarmCommit = true;
      await expect(purchase(seedInput())).rejects.toMatchObject({
        cause: { message: "TEST_FARM_COMMIT_FAILURE" },
      });
      await storage.pool.query(
        "delete from farm_test_failures; delete from farm_v2_player_state",
      );
      await expect(purchase(seedInput())).rejects.toThrow(
        "FARM_MUTATION_COMPENSATED",
      );
      await expect(purchase(seedInput())).rejects.toThrow(
        "FARM_MUTATION_COMPENSATED",
      );
      expect(
        (await storage.pool.query("select coin_balance from core_wallets"))
          .rows[0].coin_balance,
      ).toBe(100);
      expect(
        (
          await storage.pool.query(
            "select count(*)::int as count from core_wallet_ledger",
          )
        ).rows[0].count,
      ).toBe(2);
    });
    it("retries compensation after a lost Core response without double refund or asset finalization", async () => {
      dropFarmCommit = true;
      await expect(purchase(seedInput())).rejects.toMatchObject({
        cause: { message: "TEST_FARM_COMMIT_FAILURE" },
      });
      await storage.pool.query(
        "delete from farm_test_failures;delete from farm_v2_player_state",
      );
      dropWalletResponse = true;
      await expect(purchase(seedInput())).rejects.toThrow(
        "TEST_LOST_CORE_RESPONSE",
      );
      expect(
        (
          await storage.pool.query(
            "select transaction_state from farm_v2_mutation",
          )
        ).rows[0].transaction_state,
      ).toBe("COMPENSATING");
      await expect(purchase(seedInput())).rejects.toThrow(
        "FARM_MUTATION_COMPENSATED",
      );
      expect(
        (await storage.pool.query("select coin_balance from core_wallets"))
          .rows[0].coin_balance,
      ).toBe(100);
      expect(
        (
          await storage.pool.query(
            "select count(*)::int as count from core_wallet_ledger",
          )
        ).rows[0].count,
      ).toBe(2);
    });
    it("never changes a reserved request payload and does not grant assets on insufficient funds", async () => {
      await purchase(seedInput());
      await expect(purchase({ ...seedInput(), packs: 3 })).rejects.toThrow(
        "REQUEST_ID_ACTION_MISMATCH",
      );
      await storage.pool.query("update core_wallets set coin_balance=0");
      await expect(
        purchase({ ...seedInput(), requestId: "no-funds" }),
      ).rejects.toThrow("insufficient_funds");
      expect(
        (
          await storage.pool.query(
            "select warehouse_state from farm_v2_player_state",
          )
        ).rows[0].warehouse_state.seeds["1"],
      ).toBe(40);
    });
    it("ten concurrent retries cannot starve the durable journal connection", async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const requests = Promise.allSettled(
        Array.from({ length: 10 }, () => purchase(seedInput())),
      );
      try {
        const results = await Promise.race([
          requests,
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new Error("JOURNAL_POOL_STARVED")),
              3000,
            );
          }),
        ]);
        expect(results.every((result) => result.status === "fulfilled")).toBe(
          true,
        );
        expect(
          (
            await corePool.query(
              "select count(*)::int as count from core_wallet_ledger",
            )
          ).rows[0].count,
        ).toBe(1);
      } catch (error) {
        await corePool.query(
          "select pg_terminate_backend(pid) from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid()",
        );
        await requests;
        throw error;
      } finally {
        clearTimeout(timer);
      }
    });
  },
);

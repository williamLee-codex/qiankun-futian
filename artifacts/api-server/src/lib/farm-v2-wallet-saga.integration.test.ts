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
        `create schema auth; create table auth.users(id uuid primary key,banned_until timestamptz,deleted_at timestamptz); create function auth.uid() returns uuid language sql as 'select null::uuid'; insert into auth.users(id) values ('${userId}');`,
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
      await storage.pool.query("create schema core");
      for (const file of [
        "0003_create_core_identity_tables.sql",
        "0006_create_core_wallet_tables.sql",
      ]) {
        await storage.pool.query(
          readFileSync(
            `${root}/supabase/baseline/dev-canonical-0001-0010/${file}`,
            "utf8",
          ),
        );
      }
      await storage.pool.query(
        `insert into core.users(id,auth_user_id,status) values('10000000-0000-0000-0000-000000000001','${userId}','active');insert into core.wallets(id,user_id) values('${userId}','10000000-0000-0000-0000-000000000001');insert into core.wallet_ledgers(wallet_id,currency_type,entry_type,amount,reference_type,idempotency_key) values('${userId}','paid_crystal','credit',600,'payment','fixture-payment');`,
      );
      await storage.pool.query(
        "create table launch_tokens(id uuid primary key default gen_random_uuid(),user_id uuid,app_id text,token_hash text unique,expires_at timestamptz,used_at timestamptz,revoked_at timestamptz)",
      );
      for (const file of [
        "0124_farm_v2_sessions.sql",
        "0125_farm_v2_paid_auth_identity.sql",
        "0126_farm_v2_account_revocation.sql",
        "0127_farm_v2_paid_operation_authority.sql",
        "0128_farm_v2_operator_reconciliation.sql",
        "0129_farm_v2_wallet_creation_and_historical_revocation.sql",
      ]) {
        await storage.pool.query(
          readFileSync(`${root}/supabase/migrations/${file}`, "utf8"),
        );
      }
      await storage.pool.query(
        readFileSync(
          new URL(
            "../../../../lib/db/migrations/0001_farm_v2_authority_reconciliation.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      await storage.pool.query(`
      create table farm_v2_player_state(user_id text primary key, first_farm_entered_at timestamptz, effective_paid_crystals integer not null default 0, access_state jsonb not null, warehouse_state jsonb not null, mission_state jsonb not null, pet_state jsonb not null, farmer_state jsonb not null, chaos_seed_state jsonb, updated_at timestamptz default now());
      create table farm_v2_land(user_id text,land_id integer,lifecycle text,access_active boolean,planted_quantity integer default 0,planted_at timestamptz,matures_at timestamptz,version bigint default 0,primary key(user_id,land_id));
      create table farm_v2_mutation(user_id text,request_id text,action text not null,response jsonb,transaction_state text not null default 'PENDING',wallet_direction text,wallet_currency text,wallet_amount integer,wallet_transaction jsonb,failure_code text,updated_at timestamptz default now(),created_at timestamptz default now(),primary key(user_id,request_id));
      create table farm_test_failures(flag boolean); create function fail_farm_commit() returns trigger language plpgsql as $$ begin if new.transaction_state='COMPLETED' and exists(select 1 from farm_test_failures) then raise exception 'TEST_FARM_COMMIT_FAILURE'; end if; return new; end $$; create trigger farm_test_failure before update on farm_v2_mutation for each row execute function fail_farm_commit();
    `);
    });
    async function gameplayFixture() {
      const { createInitialFarmAccess, reconcilePaidLandAccess } =
        await import("../../../qiankun-farm/src/game/v2/accessRuntime");
      const { encodeFarmAccessState } = await import("./farm-v2-json-codecs");
      const { createFarmerState } =
        await import("../../../qiankun-farm/src/game/v2/farmerRuntime");
      const access = reconcilePaidLandAccess({
        access: createInitialFarmAccess(),
        effectivePaidCrystals: 999,
        now: 0,
      }).access;
      const farmer = {
        ...createFarmerState(),
        entitled: true,
        enabledByLand: {
          1: true,
          2: false,
          3: false,
          4: false,
          5: false,
          6: false,
        },
      };
      await storage.pool.query(
        "UPDATE farm_v2_player_state SET first_farm_entered_at=to_timestamp(0),effective_paid_crystals=999,access_state=$2,farmer_state=$3,chaos_seed_state=$4 WHERE user_id=$1",
        [
          userId,
          encodeFarmAccessState(access),
          farmer,
          { anchorAt: 0, processedCycle: 0, pending: 0 },
        ],
      );
      await storage.pool.query(
        "INSERT INTO farm_v2_land(user_id,land_id,lifecycle,access_active,planted_quantity) SELECT $1,n,'EMPTY',true,0 FROM generate_series(1,6) n",
        [userId],
      );
    }
    it("CHAOS-CLAIM-001/TX-IDEMPOTENCY-001: parallel replay claims once, suspension rejects and rollback retains pending", async () => {
      await gameplayFixture();
      const { claimFarmV2ChaosSeeds } = await import("./farm-v2-gameplay");
      const command = {
        userId,
        requestId: "chaos-claim",
        now: 10 * 72 * 3600000,
      };
      const results = await Promise.all([
        claimFarmV2ChaosSeeds(command),
        claimFarmV2ChaosSeeds(command),
      ]);
      expect(results[0]).toEqual(results[1]);
      expect(results[0].claimed).toBe(3);
      let row = (
        await storage.pool.query(
          "SELECT warehouse_state,chaos_seed_state FROM farm_v2_player_state WHERE user_id=$1",
          [userId],
        )
      ).rows[0];
      expect(row.warehouse_state.seeds[6]).toBe(3);
      expect(row.chaos_seed_state).toEqual({
        anchorAt: 0,
        processedCycle: 10,
        pending: 0,
      });
      await storage.pool.query(
        "UPDATE farm_v2_player_state SET effective_paid_crystals=599 WHERE user_id=$1",
        [userId],
      );
      await expect(
        claimFarmV2ChaosSeeds({ ...command, requestId: "suspended" }),
      ).rejects.toThrow("LAND_NOT_ACCESSIBLE");
      await storage.pool.query(
        "UPDATE farm_v2_player_state SET effective_paid_crystals=999 WHERE user_id=$1",
        [userId],
      );
      await storage.pool.query("INSERT INTO farm_test_failures VALUES(true)");
      await expect(
        claimFarmV2ChaosSeeds({
          ...command,
          requestId: "rollback",
          now: 11 * 72 * 3600000,
        }),
      ).rejects.toMatchObject({
        cause: { message: "TEST_FARM_COMMIT_FAILURE" },
      });
      row = (
        await storage.pool.query(
          "SELECT warehouse_state,chaos_seed_state FROM farm_v2_player_state WHERE user_id=$1",
          [userId],
        )
      ).rows[0];
      expect(row.warehouse_state.seeds[6]).toBe(3);
      expect(row.chaos_seed_state.processedCycle).toBe(10);
    });
    it("FARMER-SETTLE-001/FARMER-PREF-001: concurrent login cannot duplicate assets and preference requires qualification", async () => {
      await gameplayFixture();
      const { settleFarmV2Farmer, configureFarmV2Farmer } =
        await import("./farm-v2-gameplay");
      await storage.pool.query(
        "UPDATE farm_v2_player_state SET warehouse_state=jsonb_set(warehouse_state,'{seeds,1}','40') WHERE user_id=$1",
        [userId],
      );
      await storage.pool.query(
        "UPDATE farm_v2_land SET lifecycle='GROWING',planted_quantity=20,planted_at=to_timestamp(0),matures_at=to_timestamp(14400) WHERE user_id=$1 AND land_id=1",
        [userId],
      );
      await Promise.all([
        settleFarmV2Farmer({ userId, requestId: "login-a", now: 10 * 3600000 }),
        settleFarmV2Farmer({ userId, requestId: "login-b", now: 10 * 3600000 }),
      ]);
      const row = (
        await storage.pool.query(
          "SELECT warehouse_state FROM farm_v2_player_state WHERE user_id=$1",
          [userId],
        )
      ).rows[0];
      expect(row.warehouse_state.crops[1]).toBe(260);
      expect(row.warehouse_state.seeds[1]).toBe(0);
      expect(
        (
          await storage.pool.query(
            "SELECT planted_quantity FROM farm_v2_land WHERE user_id=$1 AND land_id=2",
            [userId],
          )
        ).rows[0].planted_quantity,
      ).toBe(0);
      const result = await configureFarmV2Farmer({
        userId,
        requestId: "preference",
        landId: 1,
        enabled: false,
      });
      expect(result.farmer.enabledByLand[1]).toBe(false);
      await storage.pool.query(
        "UPDATE farm_v2_player_state SET effective_paid_crystals=998 WHERE user_id=$1",
        [userId],
      );
      await expect(
        configureFarmV2Farmer({
          userId,
          requestId: "unqualified",
          landId: 2,
          enabled: true,
        }),
      ).rejects.toThrow("FARMER_NOT_ENTITLED");
      await expect(
        settleFarmV2Farmer({ userId: "someone-else", requestId: "isolated" }),
      ).rejects.toThrow("FARM_PLAYER_STATE_NOT_FOUND");
    });
    beforeEach(async () => {
      dropWalletResponse = false;
      dropFarmCommit = false;
      await storage.pool.query(
        `truncate farm_v2_land, farm_v2_mutation, farm_v2_player_state, farm_test_failures, farm_v2_authorization_attempt, farm_v2_reconciliation_event, farm_v2_reconciliation_case; truncate farm_v2_paid_operations, farm_v2_wallet_closures, farm_v2_wallet_reconciliation_audit; truncate core.wallet_ledgers; insert into core.wallet_ledgers(wallet_id,currency_type,entry_type,amount,reference_type,idempotency_key) values('${userId}','paid_crystal','credit',600,'payment','fixture-payment'); truncate core_wallet_ledger, core_wallets; select core_wallet_get_or_create('${userId}'); update core_wallets set coin_balance=100;`,
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
        if (String(_url).endsWith("/authorization")) {
          if (input.phase === "begin") {
            const grant = await corePool.query(
              "select farm_v2_begin_paid_operation($1,$2,$3,$4) as grant",
              [userId, input.operationId, input.requestId, input.action],
            );
            return Response.json(grant.rows[0].grant);
          }
          await corePool.query("select farm_v2_end_paid_operation($1,$2)", [
            userId,
            input.operationId,
          ]);
          return Response.json({ settled: true });
        }
        const result = await corePool.query(
          input.operationId
            ? "select farm_v2_apply_authorized_wallet_transaction($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as result"
            : "select farm_v2_apply_wallet_transaction($1,$2,$3,$4,$5,$6,$7,$8,$9) as result",
          [
            ...(input.operationId ? [input.operationId] : []),
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
      await (await import("./farm-v2-authority")).farmAuthorityPool.end();
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
    it("spent crop rewards leave compensation pending until the exact inverse can settle", async () => {
      const input = {
        userId,
        launchToken: "test-launch",
        requestId: "spent-reward",
        landId: 6,
        cropQuantity: 6,
      };
      dropFarmCommit = true;
      await expect(exchange(input)).rejects.toMatchObject({
        cause: { message: "TEST_FARM_COMMIT_FAILURE" },
      });
      await storage.pool.query(
        "delete from farm_test_failures; delete from farm_v2_player_state; update core_wallets set crystal_balance=0",
      );
      await expect(exchange(input)).rejects.toThrow("insufficient_funds");
      expect(
        (
          await storage.pool.query(
            "select transaction_state from farm_v2_mutation",
          )
        ).rows[0].transaction_state,
      ).toBe("COMPENSATING");
      expect(
        (
          await storage.pool.query(
            "select count(*)::int as count from core_wallet_ledger",
          )
        ).rows[0].count,
      ).toBe(1);
      // Test-only available-funds restoration; production resolution needs an
      // approved authority operation, never a balance/journal edit.
      await storage.pool.query("update core_wallets set crystal_balance=6");
      await expect(exchange(input)).rejects.toThrow(
        "FARM_MUTATION_COMPENSATED",
      );
      expect(
        (await storage.pool.query("select crystal_balance from core_wallets"))
          .rows[0].crystal_balance,
      ).toBe(0);
      expect(
        (
          await storage.pool.query(
            "select transaction_state from farm_v2_mutation",
          )
        ).rows[0].transaction_state,
      ).toBe("COMPENSATED");
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
    it("holds the Core refund barrier across the Farm commit and reads refunded qualification on the next operation", async () => {
      const { withFarmAuthority } = await import("./farm-v2-authority");
      const { farmAuthorityContext } =
        await import("./farm-v2-authority-context");
      const refund = `insert into core.wallet_ledgers(wallet_id,currency_type,entry_type,amount,reference_type,idempotency_key) values('${userId}','paid_crystal','refund',600,'refund','barrier-refund')`;
      await withFarmAuthority(
        { ...seedInput(), action: "purchase" },
        async () => {
          expect(farmAuthorityContext.getStore()?.qualification).toBe(600);
          await expect(corePool.query(refund)).rejects.toMatchObject({
            message: "FARM_PAID_OPERATION_IN_PROGRESS",
          });
          await purchase(seedInput());
        },
      );
      await corePool.query(refund);
      await withFarmAuthority(
        { ...seedInput(), requestId: "after-refund", action: "purchase" },
        async () => {
          expect(farmAuthorityContext.getStore()?.qualification).toBe(0);
        },
      );
    });
    it("a fenced late Farm callback cannot write assets after its Core permit was settled", async () => {
      const { farmAuthorityContext } =
        await import("./farm-v2-authority-context");
      const id = "20000000-0000-0000-0000-000000000020";
      await storage.pool.query(
        "insert into farm_v2_authorization_attempt(id,user_id,request_id,action,state) values($1,$2,'seed-1','purchase','FENCED')",
        [id, userId],
      );
      await expect(
        farmAuthorityContext.run(
          { operationId: id, userId, qualification: 600 },
          () => purchase(seedInput()),
        ),
      ).rejects.toThrow("FARM_AUTHORIZATION_FENCED");
      expect(
        (
          await storage.pool.query(
            "select count(*)::int as count from core_wallet_ledger",
          )
        ).rows[0].count,
      ).toBe(0);
    });
    it("operator reconciliation is dry-run by default and closes a legacy applied journal with one audited inverse", async () => {
      const { reconcileFarmWallet } = await import("./farm-v2-reconciliation");
      dropFarmCommit = true;
      await expect(purchase(seedInput())).rejects.toMatchObject({
        cause: { message: "TEST_FARM_COMMIT_FAILURE" },
      });
      await storage.pool.query(
        "delete from farm_test_failures;update farm_v2_mutation set wallet_transaction=null",
      );
      const rpc = async (name: string, args: Record<string, unknown>) => {
        if (name === "farm_v2_end_paid_operation")
          return (
            await corePool.query("select farm_v2_end_paid_operation($1,$2)", [
              args.p_user_id,
              args.p_operation_id,
            ])
          ).rows[0];
        return (
          await corePool.query(
            "select farm_v2_operator_wallet_reconcile($1,$2,$3,$4,$5,$6) as result",
            [
              args.p_user_id,
              args.p_request_id,
              args.p_mode,
              args.p_case_id,
              args.p_actor,
              args.p_evidence,
            ],
          )
        ).rows[0].result;
      };
      const input = {
        userId,
        requestId: "seed-1",
        caseId: "case-legacy",
        actor: "operator-1",
        evidence: "ticket-42",
        apply: false,
      };
      expect(await reconcileFarmWallet(input, rpc)).toMatchObject({
        dryRun: true,
      });
      expect(
        (
          await storage.pool.query(
            "select count(*)::int as count from farm_v2_reconciliation_event",
          )
        ).rows[0].count,
      ).toBe(0);
      expect(
        await reconcileFarmWallet({ ...input, apply: true }, rpc),
      ).toMatchObject({ status: "CLOSED" });
      expect(
        await reconcileFarmWallet({ ...input, apply: true }, rpc),
      ).toMatchObject({ status: "CLOSED" });
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
      await expect(
        storage.pool.query("delete from farm_v2_reconciliation_event"),
      ).rejects.toMatchObject({ message: "FARM_AUDIT_IMMUTABLE" });
    });
    it("0128 and Farm 0001 reject duplicate application transactionally without losing audit tables", async () => {
      const client = await corePool.connect();
      try {
        for (const file of [
          process.env.FARM_V2_PLATFORM_CHECKOUT +
            "/supabase/migrations/0128_farm_v2_operator_reconciliation.sql",
          new URL(
            "../../../../lib/db/migrations/0001_farm_v2_authority_reconciliation.sql",
            import.meta.url,
          ),
        ]) {
          await expect(
            client.query(readFileSync(file, "utf8")),
          ).rejects.toThrow("already exists");
          await client.query("ROLLBACK");
        }
        expect(
          (
            await client.query(
              "select to_regclass('farm_v2_wallet_closures') is not null and to_regclass('farm_v2_reconciliation_event') is not null as intact",
            )
          ).rows[0].intact,
        ).toBe(true);
      } finally {
        client.release();
      }
    });
    it("operator reconciles an original legacy key without inventing a missing command", async () => {
      const { reconcileFarmWallet } = await import("./farm-v2-reconciliation");
      await corePool.query(
        "select core_wallet_apply_transaction($1,2,'coin','debit','farm-v2:legacy-key:primary:debit:coin','farm_seed_purchase','1:2','farm_seed_pack',null)",
        [userId],
      );
      await storage.pool.query(
        "insert into farm_v2_mutation(user_id,request_id,action,transaction_state,wallet_direction,wallet_currency,wallet_amount) values($1,'legacy-key','seed-purchase:1:2','WALLET_APPLIED','debit','coin',2)",
        [userId],
      );
      const rpc = async (_name: string, args: Record<string, unknown>) =>
        (
          await corePool.query(
            "select farm_v2_operator_wallet_reconcile($1,$2,$3,$4,$5,$6) as result",
            [
              args.p_user_id,
              args.p_request_id,
              args.p_mode,
              args.p_case_id,
              args.p_actor,
              args.p_evidence,
            ],
          )
        ).rows[0].result;
      expect(
        await reconcileFarmWallet(
          {
            userId,
            requestId: "legacy-key",
            caseId: "case-legacy-key",
            actor: "operator-1",
            evidence: "ticket-legacy",
            apply: true,
          },
          rpc,
        ),
      ).toMatchObject({ status: "CLOSED" });
      expect(
        (await corePool.query("select coin_balance from core_wallets")).rows[0]
          .coin_balance,
      ).toBe(100);
      expect(
        (
          await corePool.query(
            "select count(*)::int as count from core_wallet_ledger",
          )
        ).rows[0].count,
      ).toBe(2);
    });
    it("operator escalates conflicting immutable intent without reversing Core money", async () => {
      const { reconcileFarmWallet } = await import("./farm-v2-reconciliation");
      dropFarmCommit = true;
      await expect(purchase(seedInput())).rejects.toMatchObject({
        cause: { message: "TEST_FARM_COMMIT_FAILURE" },
      });
      await storage.pool.query(
        "delete from farm_test_failures;update farm_v2_mutation set wallet_transaction=jsonb_set(wallet_transaction,'{command,amount}','99')",
      );
      const rpc = async (_name: string, args: Record<string, unknown>) =>
        (
          await corePool.query(
            "select farm_v2_operator_wallet_reconcile($1,$2,$3,$4,$5,$6) as result",
            [
              args.p_user_id,
              args.p_request_id,
              args.p_mode,
              args.p_case_id,
              args.p_actor,
              args.p_evidence,
            ],
          )
        ).rows[0].result;
      expect(
        await reconcileFarmWallet(
          {
            userId,
            requestId: "seed-1",
            caseId: "case-conflict",
            actor: "operator-1",
            evidence: "ticket-conflict",
            apply: true,
          },
          rpc,
        ),
      ).toMatchObject({ status: "ESCALATED" });
      expect(
        (
          await corePool.query(
            "select count(*)::int as count from core_wallet_ledger",
          )
        ).rows[0].count,
      ).toBe(1);
      expect(
        (
          await storage.pool.query(
            "select details from farm_v2_reconciliation_event where action='ESCALATED'",
          )
        ).rows[0].details.reason,
      ).toBe("IMMUTABLE_INTENT_CONFLICT");
    });
    it("operator compensation remains auditable through insufficient funds and a lost inverse response", async () => {
      const { reconcileFarmWallet } = await import("./farm-v2-reconciliation");
      const input = {
        userId,
        launchToken: "test-launch",
        requestId: "operator-crop",
        landId: 6,
        cropQuantity: 6,
      };
      dropFarmCommit = true;
      await expect(exchange(input)).rejects.toMatchObject({
        cause: { message: "TEST_FARM_COMMIT_FAILURE" },
      });
      await storage.pool.query(
        "delete from farm_test_failures;update core_wallets set crystal_balance=0",
      );
      let lost = false;
      const rpc = async (name: string, args: Record<string, unknown>) => {
        const result = (
          await corePool.query(
            "select farm_v2_operator_wallet_reconcile($1,$2,$3,$4,$5,$6) as result",
            [
              args.p_user_id,
              args.p_request_id,
              args.p_mode,
              args.p_case_id,
              args.p_actor,
              args.p_evidence,
            ],
          )
        ).rows[0].result;
        if (lost && args.p_mode === "compensate") {
          lost = false;
          throw new Error("TEST_LOST_OPERATOR_RESPONSE");
        }
        return result;
      };
      const operator = {
        userId,
        requestId: input.requestId,
        caseId: "case-spent",
        actor: "operator-1",
        evidence: "ticket-43",
        apply: true,
      };
      expect(await reconcileFarmWallet(operator, rpc)).toMatchObject({
        status: "NEEDS_FUNDS",
      });
      expect(
        (
          await storage.pool.query(
            "select transaction_state from farm_v2_mutation",
          )
        ).rows[0].transaction_state,
      ).toBe("COMPENSATING");
      await storage.pool.query("update core_wallets set crystal_balance=6");
      lost = true;
      await expect(reconcileFarmWallet(operator, rpc)).rejects.toThrow(
        "TEST_LOST_OPERATOR_RESPONSE",
      );
      expect(await reconcileFarmWallet(operator, rpc)).toMatchObject({
        status: "CLOSED",
      });
      expect(
        (await storage.pool.query("select crystal_balance from core_wallets"))
          .rows[0].crystal_balance,
      ).toBe(0);
      expect(
        (
          await storage.pool.query(
            "select count(*)::int as count from core_wallet_ledger",
          )
        ).rows[0].count,
      ).toBe(2);
    });
    it("operator cancels an absent Core effect and blocks a late primary using the same request", async () => {
      const { reconcileFarmWallet } = await import("./farm-v2-reconciliation");
      await storage.pool.query(
        "insert into farm_v2_mutation(user_id,request_id,action) values($1,'never-applied','seed-purchase:1:2')",
        [userId],
      );
      const rpc = async (name: string, args: Record<string, unknown>) =>
        (
          await corePool.query(
            "select farm_v2_operator_wallet_reconcile($1,$2,$3,$4,$5,$6) as result",
            [
              args.p_user_id,
              args.p_request_id,
              args.p_mode,
              args.p_case_id,
              args.p_actor,
              args.p_evidence,
            ],
          )
        ).rows[0].result;
      expect(
        await reconcileFarmWallet(
          {
            userId,
            requestId: "never-applied",
            caseId: "case-absent",
            actor: "operator-1",
            evidence: "ticket-44",
            apply: true,
          },
          rpc,
        ),
      ).toMatchObject({ status: "CLOSED" });
      expect(
        (
          await corePool.query(
            "select farm_v2_apply_wallet_transaction($1,'never-applied',2,'coin','debit','farm_seed_purchase','1:2','farm_seed_pack',null) as result",
            [userId],
          )
        ).rows[0].result.result_status,
      ).toBe("compensated");
      expect(
        (await storage.pool.query("select coin_balance from core_wallets"))
          .rows[0].coin_balance,
      ).toBe(100);
    });
    it("paid sow/harvest use real persisted fields and a post-refund operation cannot retain paid land access", async () => {
      await storage.pool.query("delete from farm_v2_player_state");
      const { ensureFarmV2PlayerInitialized } = await import("./farm-v2-init");
      const { reconcileFarmV2PaidAccessFromCore } =
        await import("./farm-v2-paid-access");
      const { sowFarmV2Land } = await import("./farm-v2-sow");
      const { harvestFarmV2Land } = await import("./farm-v2-harvest");
      const { withFarmAuthority } = await import("./farm-v2-authority");
      await ensureFarmV2PlayerInitialized({ userId });
      await storage.pool.query(
        `update farm_v2_player_state set warehouse_state=jsonb_set(warehouse_state,'{seeds,6}','1')`,
      );
      await withFarmAuthority(
        { ...seedInput(), requestId: "paid-sow", action: "SOW:6" },
        async () => {
          await reconcileFarmV2PaidAccessFromCore({
            userId,
            launchToken: "test-launch",
            requestId: "paid-refresh",
          });
          expect(
            await sowFarmV2Land({ userId, requestId: "paid-sow", landId: 6 }),
          ).toMatchObject({ land: { landId: 6, lifecycle: "GROWING" } });
        },
      );
      await storage.pool.query(
        "update farm_v2_land set lifecycle='MATURE',matures_at=now()-interval '1 minute' where land_id=6",
      );
      await withFarmAuthority(
        { ...seedInput(), requestId: "paid-harvest", action: "HARVEST:6" },
        async () => {
          expect(
            await harvestFarmV2Land({
              userId,
              requestId: "paid-harvest",
              landId: 6,
            }),
          ).toMatchObject({ land: { landId: 6, lifecycle: "EMPTY" } });
        },
      );
      await corePool.query(
        `insert into core.wallet_ledgers(wallet_id,currency_type,entry_type,amount,reference_type,idempotency_key) values('${userId}','paid_crystal','refund',600,'refund','land-fixture-refund')`,
      );
      await withFarmAuthority(
        { ...seedInput(), requestId: "refunded-sow", action: "SOW:6" },
        async () => {
          await reconcileFarmV2PaidAccessFromCore({
            userId,
            launchToken: "test-launch",
            requestId: "paid-refresh",
          });
          await expect(
            sowFarmV2Land({ userId, requestId: "refunded-sow", landId: 6 }),
          ).rejects.toThrow("LAND_NOT_ACCESSIBLE");
        },
      );
      expect(
        (
          await storage.pool.query(
            "select access_active from farm_v2_land where land_id=6",
          )
        ).rows[0].access_active,
      ).toBe(false);
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

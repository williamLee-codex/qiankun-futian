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
        "CREATE TABLE platform_friendships(user_a_id uuid,user_b_id uuid,status text,PRIMARY KEY(user_a_id,user_b_id))",
      );
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
        "0130_farm_v2_workshop_wallet_contract.sql",
        "0131_farm_v2_friend_operation_barrier.sql",
        "0132_farm_v2_atomic_pot_settlement.sql",
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
    async function authorizedPot(
      requestId: string,
      command = {
        kind: "synthesize" as const,
        species: 1,
        grade: "黃" as const,
        useDisplayed: false,
      },
    ) {
      const { withFarmAuthority } = await import("./farm-v2-authority");
      const { mutateFarmV2Workshop } = await import("./farm-v2-workshop");
      return withFarmAuthority(
        {
          userId,
          requestId,
          launchToken: "test",
          action: "POST:/farm/v2/workshop",
        },
        () =>
          mutateFarmV2Workshop({
            userId,
            requestId,
            launchToken: "test",
            command,
          }),
      );
    }
    it("atomic pot: a late Farm commit failure rolls back Core, crops, materials, pot, gallery and journal together", async () => {
      await workshopFixture();
      vi.stubEnv("FARM_V2_ATOMIC_POT_ENABLED", "1");
      const before = (
        await storage.pool.query(
          "SELECT warehouse_state FROM farm_v2_player_state WHERE user_id=$1",
          [userId],
        )
      ).rows[0].warehouse_state;
      await storage.pool.query("INSERT INTO farm_test_failures VALUES(true)");
      try {
        await expect(authorizedPot("atomic-rollback")).rejects.toThrow();
        expect(
          (
            await storage.pool.query(
              "SELECT warehouse_state FROM farm_v2_player_state WHERE user_id=$1",
              [userId],
            )
          ).rows[0].warehouse_state,
        ).toEqual(before);
        expect(
          (
            await storage.pool.query(
              "SELECT coin_balance FROM core_wallets WHERE owner_id=$1",
              [userId],
            )
          ).rows[0].coin_balance,
        ).toBe(100);
        expect(
          (
            await storage.pool.query(
              "SELECT count(*)::int n FROM core_wallet_ledger WHERE reason='farm_pot_synthesis'",
            )
          ).rows[0].n,
        ).toBe(0);
        expect(
          (
            await storage.pool.query(
              "SELECT count(*)::int n FROM farm_v2_mutation WHERE request_id='atomic-rollback'",
            )
          ).rows[0].n,
        ).toBe(0);
      } finally {
        vi.stubEnv("FARM_V2_ATOMIC_POT_ENABLED", "");
      }
    });
    it("atomic pot: missing enablement blocks a new public-authorized synthesis", async () => {
      await workshopFixture();
      vi.stubEnv("FARM_V2_ATOMIC_POT_ENABLED", "");
      await expect(authorizedPot("atomic-disabled")).rejects.toThrow(
        "FARM_ATOMIC_POT_NOT_CONFIGURED",
      );
      expect(
        (
          await storage.pool.query(
            "SELECT count(*)::int n FROM core_wallet_ledger WHERE reason='farm_pot_synthesis'",
          )
        ).rows[0].n,
      ).toBe(0);
    });
    it("atomic pot: concurrent keys grant one first reward; replay cannot copy and independent Core compensation is rejected", async () => {
      await workshopFixture();
      vi.stubEnv("FARM_V2_ATOMIC_POT_ENABLED", "1");
      try {
        await Promise.all([
          authorizedPot("atomic-a"),
          authorizedPot("atomic-b"),
        ]);
        await authorizedPot("atomic-a");
        const w = (
          await storage.pool.query(
            "SELECT warehouse_state FROM farm_v2_player_state WHERE user_id=$1",
            [userId],
          )
        ).rows[0].warehouse_state;
        expect(w.workshop.pots).toHaveLength(2);
        expect(w.crops[1]).toBe(14);
        expect(w.workshop.materials.蘊靈砂).toBe(8);
        expect(
          (
            await storage.pool.query(
              "SELECT coin_balance FROM core_wallets WHERE owner_id=$1",
              [userId],
            )
          ).rows[0].coin_balance,
        ).toBe(109);
        expect(
          (
            await storage.pool.query(
              "SELECT count(*)::int n FROM farm_v2_atomic_pot_receipts",
            )
          ).rows[0].n,
        ).toBe(2);
        await expect(
          storage.pool.query(
            "SELECT farm_v2_operator_wallet_reconcile($1,'atomic-a','compensate','local-case','local-test','isolated')",
            [userId],
          ),
        ).rejects.toThrow("FARM_ATOMIC_COMPENSATION_NOT_ALLOWED");
        expect(
          (
            await storage.pool.query(
              "SELECT coin_balance FROM core_wallets WHERE owner_id=$1",
              [userId],
            )
          ).rows[0].coin_balance,
        ).toBe(109);
      } finally {
        vi.stubEnv("FARM_V2_ATOMIC_POT_ENABLED", "");
      }
    });
    it("atomic pot: gross affordability decline rolls back and the same key can safely retry after funds exist", async () => {
      await workshopFixture();
      vi.stubEnv("FARM_V2_ATOMIC_POT_ENABLED", "1");
      try {
        await storage.pool.query(
          "UPDATE core_wallets SET coin_balance=2 WHERE owner_id=$1",
          [userId],
        );
        await expect(authorizedPot("atomic-gross")).rejects.toThrow(
          "INSUFFICIENT_FUNDS",
        );
        expect(
          (
            await storage.pool.query(
              "SELECT count(*)::int n FROM farm_v2_mutation WHERE request_id='atomic-gross'",
            )
          ).rows[0].n,
        ).toBe(0);
        expect(
          (
            await storage.pool.query(
              "SELECT count(*)::int n FROM farm_v2_atomic_pot_receipts",
            )
          ).rows[0].n,
        ).toBe(0);
        await storage.pool.query(
          "UPDATE core_wallets SET coin_balance=3 WHERE owner_id=$1",
          [userId],
        );
        await authorizedPot("atomic-gross");
        expect(
          (
            await storage.pool.query(
              "SELECT coin_balance FROM core_wallets WHERE owner_id=$1",
              [userId],
            )
          ).rows[0].coin_balance,
        ).toBe(15);
      } finally {
        vi.stubEnv("FARM_V2_ATOMIC_POT_ENABLED", "");
      }
    });
    it("atomic pot: a fresh remote-only permit cannot mutate a different Farm database or clone", async () => {
      await workshopFixture();
      vi.stubEnv("FARM_V2_ATOMIC_POT_ENABLED", "1");
      const originalFetch = globalThis.fetch;
      vi.stubGlobal("fetch", async (url: unknown, init: RequestInit) => {
        if (String(url).endsWith("/authorization")) {
          const body = JSON.parse(String(init.body));
          return Response.json(
            body.phase === "begin"
              ? { operationId: body.operationId, effectivePaidCrystals: 600 }
              : { settled: true },
          );
        }
        return originalFetch(url as string, init);
      });
      try {
        await expect(authorizedPot("atomic-other-db")).rejects.toThrow(
          "FARM_ATOMIC_AUTHORITY_MISMATCH",
        );
        expect(
          (
            await storage.pool.query(
              "SELECT count(*)::int n FROM core_wallet_ledger",
            )
          ).rows[0].n,
        ).toBe(0);
        expect(
          (
            await storage.pool.query(
              "SELECT count(*)::int n FROM farm_v2_mutation WHERE request_id='atomic-other-db'",
            )
          ).rows[0].n,
        ).toBe(0);
      } finally {
        vi.stubEnv("FARM_V2_ATOMIC_POT_ENABLED", "");
        vi.stubGlobal("fetch", originalFetch);
      }
    });
    it("atomic pot: displayed upgrade replaces consumed pots and display in one commit", async () => {
      await workshopFixture();
      vi.stubEnv("FARM_V2_ATOMIC_POT_ENABLED", "1");
      await storage.pool.query(
        "UPDATE farm_v2_player_state SET warehouse_state=jsonb_set(warehouse_state,'{workshop,pots}',$2) WHERE user_id=$1",
        [
          userId,
          JSON.stringify(
            Array.from({ length: 3 }, (_, i) => ({
              id: "old-" + i,
              species: 1,
              grade: "黃",
              displayed: i === 0,
              acquiredAt: 0,
            })),
          ),
        ],
      );
      try {
        const { withFarmAuthority } = await import("./farm-v2-authority"),
          { mutateFarmV2Workshop } = await import("./farm-v2-workshop");
        const command = {
          kind: "synthesize" as const,
          species: 1,
          grade: "玄" as const,
          useDisplayed: true,
        };
        const run = () =>
          withFarmAuthority(
            {
              userId,
              requestId: "atomic-upgrade",
              launchToken: "test",
              action: "POST:/farm/v2/workshop",
            },
            () =>
              mutateFarmV2Workshop({
                userId,
                requestId: "atomic-upgrade",
                launchToken: "test",
                command,
              }),
          );
        await run();
        await run();
        const w = (
          await storage.pool.query(
            "SELECT warehouse_state FROM farm_v2_player_state WHERE user_id=$1",
            [userId],
          )
        ).rows[0].warehouse_state;
        expect(w.workshop.pots).toHaveLength(1);
        expect(w.workshop.pots[0]).toMatchObject({
          species: 1,
          grade: "玄",
          displayed: true,
        });
        expect(w.workshop.materials.蘊靈砂).toBe(9);
        expect(Object.keys(w.workshop.potGallery)).toEqual(["1:玄"]);
        expect(
          (
            await storage.pool.query(
              "SELECT coin_balance FROM core_wallets WHERE owner_id=$1",
              [userId],
            )
          ).rows[0].coin_balance,
        ).toBe(123);
      } finally {
        vi.stubEnv("FARM_V2_ATOMIC_POT_ENABLED", "");
      }
    });
    it("atomic pot: a suspended Core wallet and a canceled request never create Farm assets", async () => {
      await workshopFixture();
      vi.stubEnv("FARM_V2_ATOMIC_POT_ENABLED", "1");
      try {
        await storage.pool.query(
          "UPDATE core_wallets SET status='suspended' WHERE owner_id=$1",
          [userId],
        );
        await expect(authorizedPot("atomic-suspended")).rejects.toThrow(
          "WALLET_NOT_ACTIVE",
        );
        await storage.pool.query(
          "UPDATE core_wallets SET status='active' WHERE owner_id=$1",
          [userId],
        );
        await storage.pool.query(
          "SELECT farm_v2_operator_wallet_reconcile($1,'atomic-canceled','cancel','local-case','local-test','isolated')",
          [userId],
        );
        await expect(authorizedPot("atomic-canceled")).rejects.toThrow(
          "FARM_MUTATION_COMPENSATED",
        );
        expect(
          (
            await storage.pool.query(
              "SELECT count(*)::int n FROM farm_v2_atomic_pot_receipts",
            )
          ).rows[0].n,
        ).toBe(0);
        expect(
          (
            await storage.pool.query(
              "SELECT coin_balance FROM core_wallets WHERE owner_id=$1",
              [userId],
            )
          ).rows[0].coin_balance,
        ).toBe(100);
      } finally {
        vi.stubEnv("FARM_V2_ATOMIC_POT_ENABLED", "");
      }
    });
    it("atomic pot: pre-cutover Saga journals recover by their original key without pretending they are atomic", async () => {
      await workshopFixture();
      const { mutateLegacyFarmV2Workshop } = await import("./farm-v2-workshop");
      const command = {
        kind: "synthesize" as const,
        species: 1,
        grade: "黃" as const,
        useDisplayed: false,
      };
      dropWalletResponse = true;
      await expect(
        mutateLegacyFarmV2Workshop({
          userId,
          requestId: "legacy-cutover",
          launchToken: "test",
          command,
        }),
      ).rejects.toThrow("TEST_LOST_CORE_RESPONSE");
      vi.stubEnv("FARM_V2_ATOMIC_POT_ENABLED", "1");
      try {
        await authorizedPot("legacy-cutover");
        vi.stubEnv("FARM_V2_ATOMIC_POT_ENABLED", "");
        await authorizedPot("legacy-cutover");
        expect(
          (
            await storage.pool.query(
              "SELECT count(*)::int n FROM farm_v2_atomic_pot_receipts",
            )
          ).rows[0].n,
        ).toBe(0);
        expect(
          (
            await storage.pool.query(
              "SELECT count(*)::int n FROM core_wallet_ledger WHERE reason='farm_pot_synthesis'",
            )
          ).rows[0].n,
        ).toBe(1);
        const w = (
          await storage.pool.query(
            "SELECT warehouse_state FROM farm_v2_player_state WHERE user_id=$1",
            [userId],
          )
        ).rows[0].warehouse_state;
        expect(w.workshop.pots).toHaveLength(1);
      } finally {
        vi.stubEnv("FARM_V2_ATOMIC_POT_ENABLED", "");
      }
    });
    it("atomic pot: an in-flight Core posting is invisible; a killed domain connection rolls back and can retry safely", async () => {
      await workshopFixture();
      vi.stubEnv("FARM_V2_ATOMIC_POT_ENABLED", "1");
      const gate = await corePool.connect();
      let operation: Promise<unknown> | undefined;
      try {
        await gate.query("SELECT pg_advisory_lock(993341237)");
        await storage.pool.query(
          "CREATE FUNCTION farm_test_atomic_visibility() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN PERFORM pg_advisory_xact_lock(993341237);RETURN NEW;END$$; CREATE TRIGGER farm_test_atomic_visibility BEFORE UPDATE OF warehouse_state ON farm_v2_player_state FOR EACH ROW EXECUTE FUNCTION farm_test_atomic_visibility()",
        );
        operation = authorizedPot("atomic-visibility");
        const failure = expect(operation).rejects.toThrow();
        let pid: number | undefined;
        for (let i = 0; i < 100 && !pid; i++) {
          const r = await corePool.query(
            "SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND wait_event='advisory' AND query LIKE 'update \"farm_v2_player_state\"%' AND pid<>pg_backend_pid()",
          );
          pid = r.rows[0]?.pid;
          if (!pid) await new Promise((r) => setTimeout(r, 20));
        }
        expect(pid).toBeDefined();
        expect(
          (
            await corePool.query(
              "SELECT coin_balance FROM core_wallets WHERE owner_id=$1",
              [userId],
            )
          ).rows[0].coin_balance,
        ).toBe(100);
        expect(
          (
            await corePool.query(
              "SELECT count(*)::int n FROM farm_v2_atomic_pot_receipts",
            )
          ).rows[0].n,
        ).toBe(0);
        expect(
          (
            await corePool.query(
              "SELECT count(*)::int n FROM farm_v2_mutation WHERE request_id='atomic-visibility'",
            )
          ).rows[0].n,
        ).toBe(0);
        await corePool.query("SELECT pg_terminate_backend($1)", [pid]);
        await failure;
        await storage.pool.query(
          "DROP TRIGGER farm_test_atomic_visibility ON farm_v2_player_state; DROP FUNCTION farm_test_atomic_visibility()",
        );
        await authorizedPot("atomic-visibility");
        expect(
          (
            await corePool.query(
              "SELECT coin_balance FROM core_wallets WHERE owner_id=$1",
              [userId],
            )
          ).rows[0].coin_balance,
        ).toBe(112);
        expect(
          (
            await corePool.query(
              "SELECT count(*)::int n FROM farm_v2_atomic_pot_receipts",
            )
          ).rows[0].n,
        ).toBe(1);
      } finally {
        await gate.query("SELECT pg_advisory_unlock(993341237)");
        gate.release();
        await operation?.catch(() => {});
        await storage.pool.query(
          "DROP TRIGGER IF EXISTS farm_test_atomic_visibility ON farm_v2_player_state; DROP FUNCTION IF EXISTS farm_test_atomic_visibility()",
        );
        vi.stubEnv("FARM_V2_ATOMIC_POT_ENABLED", "");
      }
    });
    async function workshopFixture() {
      await storage.pool.query(
        "UPDATE farm_v2_player_state SET warehouse_state=jsonb_set(warehouse_state,'{workshop}',$2) WHERE user_id=$1",
        [
          userId,
          {
            pots: [],
            decor: [],
            potGallery: {},
            decorGallery: {},
            materials: { 蘊靈砂: 10, 九霄玉髓: 30 },
          },
        ],
      );
    }
    it("POT-GALLERY-004/TX-IDEMPOTENCY-001: concurrent synthesis grants first reward once; replay cannot copy assets", async () => {
      await workshopFixture();
      const { mutateLegacyFarmV2Workshop: mutateFarmV2Workshop } =
        await import("./farm-v2-workshop");
      const command = {
        kind: "synthesize" as const,
        species: 1,
        grade: "黃" as const,
        useDisplayed: false,
      };
      const input = {
        userId,
        launchToken: "token",
        requestId: "craft-a",
        command,
      };
      await Promise.all([
        mutateFarmV2Workshop(input),
        mutateFarmV2Workshop({ ...input, requestId: "craft-b" }),
      ]);
      await mutateFarmV2Workshop(input);
      const row = (
        await storage.pool.query(
          "SELECT warehouse_state FROM farm_v2_player_state WHERE user_id=$1",
          [userId],
        )
      ).rows[0].warehouse_state;
      expect(row.workshop.pots).toHaveLength(2);
      expect(row.crops[1]).toBe(14);
      expect(row.workshop.materials.蘊靈砂).toBe(8);
      expect(
        (
          await storage.pool.query(
            "SELECT coin_balance FROM core_wallets WHERE owner_id=$1",
            [userId],
          )
        ).rows[0].coin_balance,
      ).toBe(109);
      expect(
        (
          await storage.pool.query(
            "SELECT count(*)::int n FROM core_wallet_ledger WHERE reason='farm_pot_synthesis'",
          )
        ).rows[0].n,
      ).toBe(2);
    });
    it("POT-ATOMIC-001: gross funds required despite positive reward; Core rejects forged amount", async () => {
      await workshopFixture();
      const { mutateLegacyFarmV2Workshop: mutateFarmV2Workshop } =
        await import("./farm-v2-workshop");
      await storage.pool.query(
        "UPDATE core_wallets SET coin_balance=2 WHERE owner_id=$1",
        [userId],
      );
      await expect(
        mutateFarmV2Workshop({
          userId,
          launchToken: "token",
          requestId: "too-poor",
          command: {
            kind: "synthesize",
            species: 1,
            grade: "黃",
            useDisplayed: false,
          },
        }),
      ).rejects.toThrow("insufficient_funds");
      expect(
        (
          await storage.pool.query(
            "SELECT warehouse_state FROM farm_v2_player_state WHERE user_id=$1",
            [userId],
          )
        ).rows[0].warehouse_state.workshop.pots,
      ).toHaveLength(0);
      const declined = (
        await storage.pool.query(
          "SELECT wallet_transaction FROM farm_v2_mutation WHERE user_id=$1 AND request_id='too-poor'",
          [userId],
        )
      ).rows[0].wallet_transaction;
      expect(declined.assetPlan).toBeUndefined();
      expect(declined.rejectedPlan).toBeDefined();
      await mutateFarmV2Workshop({
        userId,
        launchToken: "token",
        requestId: "after-decline",
        command: { kind: "removePot", species: 1 },
      });
      await storage.pool.query(
        "UPDATE core_wallets SET coin_balance=10 WHERE owner_id=$1",
        [userId],
      );
      await mutateFarmV2Workshop({
        userId,
        launchToken: "token",
        requestId: "too-poor",
        command: {
          kind: "synthesize",
          species: 1,
          grade: "黃",
          useDisplayed: false,
        },
      });
      expect(
        (
          await storage.pool.query(
            "SELECT coin_balance FROM core_wallets WHERE owner_id=$1",
            [userId],
          )
        ).rows[0].coin_balance,
      ).toBe(22);
      const raw = await storage.pool.query(
        "SELECT farm_v2_apply_wallet_transaction($1,'forged',13,'coin','credit','farm_pot_synthesis','1:0:1','farm_pot_synthesis') result",
        [userId],
      );
      expect(raw.rows[0].result.result_status).toBe("invalid");
    });
    it("POT-ATOMIC-001: lost Core response reserves inputs and recovers exact result without double reward", async () => {
      await workshopFixture();
      const { mutateLegacyFarmV2Workshop: mutateFarmV2Workshop } =
        await import("./farm-v2-workshop");
      const input = {
        userId,
        launchToken: "token",
        requestId: "recover-craft",
        command: {
          kind: "synthesize" as const,
          species: 1,
          grade: "黃" as const,
          useDisplayed: false,
        },
      };
      dropWalletResponse = true;
      await expect(mutateFarmV2Workshop(input)).rejects.toThrow(
        "TEST_LOST_CORE_RESPONSE",
      );
      await expect(
        exchange({
          userId,
          launchToken: "token",
          requestId: "steal-reserved",
          landId: 1,
          cropQuantity: 20,
        }),
      ).rejects.toThrow("WORKSHOP_RECOVERY_REQUIRED");
      const recovered = await mutateFarmV2Workshop(input);
      expect(recovered.state.pots).toHaveLength(1);
      expect(recovered.warehouse.crops[1]).toBe(17);
      expect(
        (
          await storage.pool.query(
            "SELECT coin_balance FROM core_wallets WHERE owner_id=$1",
            [userId],
          )
        ).rows[0].coin_balance,
      ).toBe(112);
      await expect(
        mutateFarmV2Workshop({
          ...input,
          command: { ...input.command, species: 2 },
        }),
      ).rejects.toThrow("REQUEST_ID_ACTION_MISMATCH");
    });
    it("POT-GALLERY-004: interrupted Farm commit recovers gallery and asset together", async () => {
      await workshopFixture();
      const { mutateLegacyFarmV2Workshop: mutateFarmV2Workshop } =
        await import("./farm-v2-workshop");
      const input = {
        userId,
        launchToken: "token",
        requestId: "commit-craft",
        command: {
          kind: "synthesize" as const,
          species: 6,
          grade: "黃" as const,
          useDisplayed: false,
        },
      };
      dropFarmCommit = true;
      await expect(mutateFarmV2Workshop(input)).rejects.toThrow();
      expect(
        (
          await storage.pool.query(
            "SELECT warehouse_state FROM farm_v2_player_state WHERE user_id=$1",
            [userId],
          )
        ).rows[0].warehouse_state.workshop.pots,
      ).toHaveLength(0);
      await storage.pool.query("TRUNCATE farm_test_failures");
      const result = await mutateFarmV2Workshop(input);
      expect(result.state.pots).toHaveLength(1);
      expect(result.state.potGallery["6:黃"]).toBeTypeOf("number");
    });
    it("DECOR-PURCHASE-001/DECOR-LOCATION-001: purchase, placement and removal persist a single instance", async () => {
      await workshopFixture();
      const { mutateLegacyFarmV2Workshop: mutateFarmV2Workshop } =
        await import("./farm-v2-workshop");
      const first = await mutateFarmV2Workshop({
        userId,
        launchToken: "token",
        requestId: "decor-buy",
        command: { kind: "buyDecor", catalogId: "DF001" },
      });
      expect(first.reward).toBe(30);
      const id = first.state.decor[0].id;
      const placed = await mutateFarmV2Workshop({
        userId,
        launchToken: "token",
        requestId: "decor-place",
        command: { kind: "placeDecor", decorId: id, slot: 1 },
      });
      expect(placed.state.decor[0].slot).toBe(1);
      const removed = await mutateFarmV2Workshop({
        userId,
        launchToken: "token",
        requestId: "decor-remove",
        command: { kind: "placeDecor", decorId: id, slot: null },
      });
      expect(removed.state.decor[0].slot).toBe(null);
      expect(removed.state.decor).toHaveLength(1);
      expect(
        (
          await storage.pool.query(
            "SELECT coin_balance FROM core_wallets WHERE owner_id=$1",
            [userId],
          )
        ).rows[0].coin_balance,
      ).toBe(42);
      await expect(
        mutateFarmV2Workshop({
          userId,
          launchToken: "token",
          requestId: "unknown",
          command: { kind: "displayPot", potId: "someone-elses-pot" },
        }),
      ).rejects.toThrow("POT_NOT_OWNED");
    });
    it("MISSION-CLAIM-001/TX-IDEMPOTENCY-001: duplicate claims credit gold and material once; expired progress cannot claim", async () => {
      await workshopFixture();
      const { recordMissionEvent, createMissionState } =
        await import("../../../qiankun-farm/src/game/v2/missionRuntime");
      const missions = recordMissionEvent(
        createMissionState(Date.now()),
        "SOW",
        Date.now(),
      );
      await storage.pool.query(
        "UPDATE farm_v2_player_state SET mission_state=$2 WHERE user_id=$1",
        [userId, missions],
      );
      const { mutateLegacyFarmV2Workshop: mutateFarmV2Workshop } =
        await import("./farm-v2-workshop");
      const input = {
        userId,
        launchToken: "token",
        requestId: "mission-a",
        command: { kind: "claimMission" as const, missionId: "MISSION_D01" },
      };
      await mutateFarmV2Workshop(input);
      await mutateFarmV2Workshop(input);
      await expect(
        mutateFarmV2Workshop({ ...input, requestId: "mission-b" }),
      ).rejects.toThrow("MISSION_ALREADY_CLAIMED");
      const row = (
        await storage.pool.query(
          "SELECT warehouse_state,mission_state FROM farm_v2_player_state WHERE user_id=$1",
          [userId],
        )
      ).rows[0];
      expect(row.warehouse_state.workshop.materials.蘊靈砂).toBe(11);
      expect(row.mission_state.progress.MISSION_D01.claimed).toBe(true);
      expect(
        (
          await storage.pool.query(
            "SELECT coin_balance FROM core_wallets WHERE owner_id=$1",
            [userId],
          )
        ).rows[0].coin_balance,
      ).toBe(102);
      const old = recordMissionEvent(
        createMissionState(Date.now() - 86400000),
        "SOW",
        Date.now() - 86400000,
      );
      await storage.pool.query(
        "UPDATE farm_v2_player_state SET mission_state=$2 WHERE user_id=$1",
        [userId, old],
      );
      await expect(
        mutateFarmV2Workshop({ ...input, requestId: "expired" }),
      ).rejects.toThrow("MISSION_NOT_COMPLETE");
    });
    it("PET-FOOD-001/PET-REFEED-001: Core food purchase and feeding settle atomically with replay protection", async () => {
      await workshopFixture();
      await storage.pool.query(
        "UPDATE farm_v2_player_state SET effective_paid_crystals=999,pet_state=$2 WHERE user_id=$1",
        [userId, { owned: ["噬時諦聽"], activePetId: null, activeUntil: null }],
      );
      const { mutateLegacyFarmV2Workshop: mutateFarmV2Workshop } =
        await import("./farm-v2-workshop");
      await mutateFarmV2Workshop({
        userId,
        launchToken: "token",
        requestId: "food",
        command: { kind: "buyFood", quantity: 3 },
      });
      const feed = {
        userId,
        launchToken: "token",
        requestId: "feed",
        command: { kind: "feedPet" as const, petId: "噬時諦聽" },
      };
      await mutateFarmV2Workshop(feed);
      await mutateFarmV2Workshop(feed);
      const row = (
        await storage.pool.query(
          "SELECT warehouse_state,pet_state FROM farm_v2_player_state WHERE user_id=$1",
          [userId],
        )
      ).rows[0];
      expect(row.warehouse_state.workshop.petFood).toBe(0);
      expect(row.pet_state.activePetId).toBe("噬時諦聽");
      expect(row.pet_state.activeUntil).toBeGreaterThan(
        Date.now() + 23 * 3600000,
      );
      await expect(
        mutateFarmV2Workshop({ ...feed, requestId: "feed-empty" }),
      ).rejects.toThrow("INSUFFICIENT_PET_FOOD");
      expect(
        (
          await storage.pool.query(
            "SELECT coin_balance FROM core_wallets WHERE owner_id=$1",
            [userId],
          )
        ).rows[0].coin_balance,
      ).toBe(94);
    });
    it("POT-ATOMIC-001: unrecoverable reserved input compensates net posting once and cannot reopen", async () => {
      await workshopFixture();
      const { mutateLegacyFarmV2Workshop: mutateFarmV2Workshop } =
        await import("./farm-v2-workshop");
      const input = {
        userId,
        launchToken: "token",
        requestId: "compensate-craft",
        command: {
          kind: "synthesize" as const,
          species: 1,
          grade: "黃" as const,
          useDisplayed: false,
        },
      };
      dropWalletResponse = true;
      await expect(mutateFarmV2Workshop(input)).rejects.toThrow();
      await storage.pool.query(
        "UPDATE farm_v2_player_state SET warehouse_state=jsonb_set(warehouse_state,'{crops,1}','0') WHERE user_id=$1",
        [userId],
      );
      await expect(mutateFarmV2Workshop(input)).rejects.toThrow(
        "FARM_MUTATION_COMPENSATED",
      );
      await expect(mutateFarmV2Workshop(input)).rejects.toThrow(
        "FARM_MUTATION_COMPENSATED",
      );
      expect(
        (
          await storage.pool.query(
            "SELECT coin_balance FROM core_wallets WHERE owner_id=$1",
            [userId],
          )
        ).rows[0].coin_balance,
      ).toBe(100);
      const inspect = await storage.pool.query(
        "SELECT farm_v2_operator_wallet_reconcile($1,'compensate-craft','inspect','case','operator','isolated-test') result",
        [userId],
      );
      expect(inspect.rows[0].result.primary).toHaveLength(1);
      const again = await storage.pool.query(
        "SELECT farm_v2_apply_wallet_transaction($1,'compensate-craft',12,'coin','credit','farm_pot_synthesis','1:0:1','farm_pot_synthesis') result",
        [userId],
      );
      expect(again.rows[0].result.result_status).toBe("compensated");
    });
    it("PET-OWN-001/FORMATION-PREMIUM-001: correct currencies, permanent ownership and free switching", async () => {
      await workshopFixture();
      await storage.pool.query(
        "UPDATE farm_v2_player_state SET pet_state=$2 WHERE user_id=$1",
        [userId, { owned: [], activePetId: null, activeUntil: null }],
      );
      await storage.pool.query(
        "UPDATE core_wallets SET coin_balance=500,crystal_balance=500 WHERE owner_id=$1",
        [userId],
      );
      const { mutateLegacyFarmV2Workshop: mutateFarmV2Workshop } =
        await import("./farm-v2-workshop");
      await mutateFarmV2Workshop({
        userId,
        launchToken: "token",
        requestId: "dog-buy",
        command: { kind: "buyPet", petId: "尋星犬" },
      });
      await mutateFarmV2Workshop({
        userId,
        launchToken: "token",
        requestId: "lion-buy",
        command: { kind: "buyPet", petId: "辟邪狻猊" },
      });
      await mutateFarmV2Workshop({
        userId,
        launchToken: "token",
        requestId: "formation-buy",
        command: { kind: "buyFormation" },
      });
      const switched = await mutateFarmV2Workshop({
        userId,
        launchToken: "token",
        requestId: "formation-switch",
        command: {
          kind: "switchFormation",
          formationId: "FORMATION_PREMIUM_V2",
        },
      });
      expect(switched.state.activeFormation).toBe("FORMATION_PREMIUM_V2");
      await mutateFarmV2Workshop({
        userId,
        launchToken: "token",
        requestId: "formation-off",
        command: { kind: "switchFormation", formationId: null },
      });
      await expect(
        mutateFarmV2Workshop({
          userId,
          launchToken: "token",
          requestId: "formation-duplicate",
          command: { kind: "buyFormation" },
        }),
      ).rejects.toThrow("FORMATION_ALREADY_OWNED");
      const balance = (
        await storage.pool.query(
          "SELECT coin_balance,crystal_balance FROM core_wallets WHERE owner_id=$1",
          [userId],
        )
      ).rows[0];
      expect(balance).toEqual({ coin_balance: 200, crystal_balance: 12 });
      const raw = await storage.pool.query(
        "SELECT farm_v2_apply_wallet_transaction($1,'wrong-currency',100,'coin','debit','farm_pet_purchase','2','farm_pet_purchase') result",
        [userId],
      );
      expect(raw.rows[0].result.result_status).toBe("invalid");
    });
    it("FRIEND-REL-001/CAVE-VISIT-001: active reciprocal relation only, removal and suspension deny access", async () => {
      const target = "00000000-0000-0000-0000-000000000002";
      await storage.pool.query(
        "INSERT INTO auth.users(id) VALUES($1) ON CONFLICT DO NOTHING",
        [target],
      );
      await storage.pool.query(
        "INSERT INTO core.users(id,auth_user_id,status) VALUES('10000000-0000-0000-0000-000000000002',$1,'active') ON CONFLICT(id) DO UPDATE SET status='active'",
        [target],
      );
      await storage.pool.query(
        "INSERT INTO platform_friendships VALUES($1,$2,'active') ON CONFLICT(user_a_id,user_b_id) DO UPDATE SET status='active'",
        [userId, target],
      );
      const read = async () =>
        (
          await storage.pool.query(
            "SELECT farm_v2_read_friend_access($1,$2) result",
            [userId, target],
          )
        ).rows[0].result;
      await storage.pool.query(
        "INSERT INTO farm_v2_player_state(user_id,access_state,warehouse_state,mission_state,pet_state,farmer_state) SELECT $1,access_state,jsonb_set(warehouse_state,'{workshop}',$2),mission_state,pet_state,farmer_state FROM farm_v2_player_state WHERE user_id=$3",
        [
          target,
          {
            pots: [
              {
                id: "private-instance",
                species: 1,
                grade: "黃",
                displayed: true,
                acquiredAt: 0,
              },
            ],
            decor: [],
            potGallery: { "1:黃": 0 },
            decorGallery: {},
            materials: { 蘊靈砂: 20, 九霄玉髓: 10 },
          },
          userId,
        ],
      );
      const originalFetch = globalThis.fetch;
      vi.stubGlobal("fetch", async (url: unknown, init: RequestInit) => {
        if (String(url).endsWith("/friends")) {
          const body = JSON.parse(String(init.body));
          const result = (
            await storage.pool.query(
              "SELECT farm_v2_read_friend_access($1,$2) result",
              [userId, body.targetId ?? null],
            )
          ).rows[0].result;
          return new Response(JSON.stringify(result), {
            status: result.allowed === false ? 403 : 200,
          });
        }
        return originalFetch(url as Parameters<typeof originalFetch>[0], init);
      });
      const { visitFarmV2Cave } = await import("./farm-v2-friends");
      const projection = await visitFarmV2Cave({
        launchToken: "token",
        targetId: target,
      });
      expect(projection).toEqual({
        ownerId: target,
        readOnly: true,
        lingyun: 1,
        pots: [{ species: 1, grade: "黃" }],
        decor: [],
        activeFormation: null,
        activeFormationExpiresAt: null,
        lands: [],
        pets: { owned: [], activePetId: null, activeUntil: null },
      });
      const { mutateLegacyFarmV2Workshop: mutateFarmV2Workshop } =
        await import("./farm-v2-workshop");
      await expect(
        mutateFarmV2Workshop({
          userId,
          launchToken: "token",
          requestId: "foreign-asset",
          command: { kind: "displayPot", potId: "private-instance" },
        }),
      ).rejects.toThrow("POT_NOT_OWNED");
      expect(await read()).toEqual({ allowed: true, targetPaidCrystals: 0 });
      await storage.pool.query(
        "UPDATE platform_friendships SET status='blocked' WHERE user_b_id=$1",
        [target],
      );
      expect(await read()).toEqual({ allowed: false });
      await storage.pool.query(
        "UPDATE platform_friendships SET status='active' WHERE user_b_id=$1",
        [target],
      );
      await storage.pool.query(
        "UPDATE core.users SET status='archived' WHERE auth_user_id=$1",
        [target],
      );
      expect(await read()).toEqual({ allowed: false });
      await storage.pool.query(
        "DELETE FROM platform_friendships WHERE user_b_id=$1",
        [target],
      );
      expect(await read()).toEqual({ allowed: false });
    });
    it.skipIf(process.env.FARM_V2_BROWSER_ACCEPTANCE !== "1")(
      "desktop/mobile workshop clicks settle real isolated PostgreSQL assets (test identity only)",
      async () => {
        await workshopFixture();
        const express = (await import("express")).default;
        const { build } = await import("esbuild");
        const { fileURLToPath } = await import("node:url");
        const { mutateLegacyFarmV2Workshop: mutateFarmV2Workshop } =
          await import("./farm-v2-workshop");
        const { chromium } = await import(
          process.env.FARM_V2_PLATFORM_CHECKOUT +
            "/node_modules/@playwright/test/index.mjs"
        );
        const bundle = await build({
          stdin: {
            contents: `import React,{useState,useEffect} from 'react';import{createRoot}from'react-dom/client';import{FarmWorkshopPanel}from'./src/game/v2/FarmWorkshopPanel';function App(){const[data,setData]=useState(null);useEffect(()=>{fetch('/state').then(r=>r.json()).then(setData)},[]);if(!data)return <p>讀取中</p>;return <><p>隔離操作驗收・測試身分，非正式環境</p><FarmWorkshopPanel {...data} busy={false} transact={async command=>{const response=await fetch('/workshop',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(command)});if(!response.ok)throw new Error(await response.text());setData(await(await fetch('/state')).json());return true;}}/></>;}createRoot(document.getElementById('root')).render(<App/>);`,
            resolveDir: fileURLToPath(
              new URL("../../../qiankun-farm", import.meta.url),
            ),
            loader: "tsx",
          },
          bundle: true,
          write: false,
          platform: "browser",
          jsx: "automatic",
        });
        const app = express();
        app.use(express.json());
        app.get("/", (_req, res) =>
          res
            .type("html")
            .send(
              '<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{font-family:sans-serif;max-width:720px;margin:auto;padding:12px}button,select{min-height:44px;margin:4px}article{padding:8px;overflow-wrap:anywhere}fieldset{min-width:0}</style><div id="root"></div><script src="/app.js"></script>',
            ),
        );
        app.get("/app.js", (_req, res) =>
          res.type("js").send(bundle.outputFiles[0].text),
        );
        app.get("/state", async (_req, res) => {
          const row = (
            await storage.pool.query(
              "SELECT warehouse_state,mission_state,pet_state FROM farm_v2_player_state WHERE user_id=$1",
              [userId],
            )
          ).rows[0];
          res.json({
            warehouse: row.warehouse_state,
            missions: row.mission_state,
            pets: { owned: [], activePetId: null, activeUntil: null },
          });
        });
        app.post("/workshop", async (req, res) => {
          try {
            res.json(
              await mutateFarmV2Workshop({
                userId,
                launchToken: "token",
                requestId: crypto.randomUUID(),
                command: req.body,
              }),
            );
          } catch (e) {
            res.status(409).send(String(e));
          }
        });
        const server = await new Promise<import("node:http").Server>(
          (resolve) => {
            const s = app.listen(0, "127.0.0.1", () => resolve(s));
          },
        );
        const port = (server.address() as import("node:net").AddressInfo).port;
        const browser = await chromium.launch({
          executablePath: "/usr/bin/chromium",
          headless: true,
          args: ["--no-sandbox"],
        });
        try {
          for (const [label, width, height] of [
            ["desktop", 1280, 900],
            ["mobile", 390, 844],
          ] as const) {
            const page = await browser.newPage({ viewport: { width, height } });
            page.setDefaultTimeout(5000);
            page.on("dialog", (d: any) => d.accept());
            await page.goto("http://127.0.0.1:" + port);
            await page.getByRole("button", { name: "確認合成一株" }).click();
            await page
              .getByRole("button", { name: "展示／替換" })
              .first()
              .waitFor();
            await page
              .getByRole("button", { name: "展示／替換" })
              .first()
              .click();
            await page.getByRole("button", { name: "取下" }).waitFor();
            await page
              .getByRole("button", { name: "洞府", exact: true })
              .click();
            if (label === "desktop") {
              await page.getByText("陳設商店（V2）", { exact: true }).click();
              const purchaseDone = page.waitForResponse("**/workshop", {
                timeout: 5000,
              });
              await page
                .getByRole("button", { name: "購買入倉" })
                .first()
                .click();
              const purchaseResponse = await purchaseDone;
              expect(purchaseResponse.status()).toBe(200);
            }
            await page.getByLabel("位置", { exact: true }).waitFor();
            const placeDone = page.waitForResponse("**/workshop", {
              timeout: 5000,
            });
            await page.getByLabel("位置", { exact: true }).selectOption("1");
            await placeDone;
            await page.waitForFunction(
              "document.querySelector('select')?.value === '1'",
              undefined,
              { timeout: 5000 },
            );
            const removeDone = page.waitForResponse("**/workshop", {
              timeout: 5000,
            });
            await page.getByLabel("位置", { exact: true }).selectOption("");
            await removeDone;
            await page.waitForFunction(
              "document.querySelector('select')?.value === ''",
              undefined,
              { timeout: 5000 },
            );
            expect(
              await page.evaluate("document.body.scrollWidth <= innerWidth"),
            ).toBe(true);
            await page.screenshot({
              path: "/tmp/farm-v2-workshop-" + label + ".png",
              fullPage: true,
              animations: "disabled",
            });
            await page.close();
          }
          const row = (
            await storage.pool.query(
              "SELECT warehouse_state FROM farm_v2_player_state WHERE user_id=$1",
              [userId],
            )
          ).rows[0].warehouse_state;
          expect(row.workshop.pots).toHaveLength(2);
          expect(
            row.workshop.pots.filter(
              (p: { displayed: boolean }) => p.displayed,
            ),
          ).toHaveLength(1);
          expect(row.workshop.decor).toHaveLength(1);
          expect(row.workshop.decor[0].slot).toBe(null);
          expect(row.crops[1]).toBe(14);
        } finally {
          await browser.close();
          await new Promise<void>((resolve) => server.close(() => resolve()));
        }
      },
      20000,
    );
    it.skipIf(process.env.FARM_V2_BROWSER_ACCEPTANCE !== "1")(
      "approved scene: desktop/mobile real API sow, harvest, hotspots and bounded dialogs",
      async () => {
        await storage.pool.query(
          "UPDATE farm_v2_player_state SET first_farm_entered_at=now()-interval '10 days',warehouse_state=jsonb_set(warehouse_state,'{seeds,1}','40') WHERE user_id=$1",
          [userId],
        );
        await storage.pool.query(
          "INSERT INTO farm_v2_land(user_id,land_id,lifecycle,access_active,planted_quantity,planted_at,matures_at) SELECT $1,n,CASE WHEN n IN(2,3) THEN 'MATURE' ELSE 'EMPTY' END,true,CASE WHEN n=2 THEN 10 WHEN n=3 THEN 6 ELSE 0 END,now()-interval '2 days',CASE WHEN n IN(2,3) THEN now()-interval '2 hours' ELSE NULL END FROM generate_series(1,6)n",
          [userId],
        );
        const express = (await import("express")).default;
        const { build } = await import("esbuild");
        const { fileURLToPath } = await import("node:url");
        const { readdirSync } = await import("node:fs");
        const root = fileURLToPath(
          new URL("../../../qiankun-farm", import.meta.url),
        );
        const { sowFarmV2Land } = await import("./farm-v2-sow");
        const { harvestFarmV2Land } = await import("./farm-v2-harvest");
        const { chromium } = await import(
          process.env.FARM_V2_PLATFORM_CHECKOUT +
            "/node_modules/@playwright/test/index.mjs"
        );
        const bundle = await build({
          stdin: {
            contents: `import React from 'react';import{createRoot}from'react-dom/client';import{FarmV2AuthenticatedView}from'./src/game/v2/FarmV2AuthenticatedView';createRoot(document.getElementById('root')).render(<FarmV2AuthenticatedView apiBaseUrl={location.origin+'/api/'} launchToken="isolated-test-launch"/>);`,
            resolveDir: root,
            loader: "tsx",
          },
          alias: { "@": root + "/src" },
          define: { "import.meta.env.BASE_URL": JSON.stringify("/") },
          bundle: true,
          write: false,
          outfile: "/tmp/approved-scene-app.js",
          platform: "browser",
          jsx: "automatic",
        });
        const app = express();
        app.use(express.json());
        app.use("/images/farm", express.static(root + "/public/images/farm"));
        app.use("/assets", express.static(root + "/dist/public/assets"));
        const css = readdirSync(root + "/dist/public/assets").find((f) =>
          f.endsWith(".css"),
        );
        expect(css).toBeTruthy();
        app.get("/", (_q, r) =>
          r
            .type("html")
            .send(
              `<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/${css}"><link rel="stylesheet" href="/app.css"><div id="root"></div><script src="/app.js"></script>`,
            ),
        );
        app.get("/app.js", (_q, r) =>
          r
            .type("js")
            .send(bundle.outputFiles.find((f) => f.path.endsWith(".js"))!.text),
        );
        app.get("/app.css", (_q, r) =>
          r
            .type("css")
            .send(
              bundle.outputFiles.find((f) => f.path.endsWith(".css"))!.text,
            ),
        );
        // Only the test identity/session is synthetic. Every game asset/read/write
        // below uses the real domain API and isolated PostgreSQL; no route mocks.
        app.post("/api/farm/v2/session", (_q, r) =>
          r.json({
            userId,
            sessionToken: "fvs1.isolated-test",
            reauthenticateUrl: "https://platform.test/login",
          }),
        );
        app.use("/api/farm/v2", (q, r, next) => {
          if (q.header("authorization") !== "Bearer fvs1.isolated-test") {
            r.status(401).json({ error: "AUTH_REQUIRED" });
            return;
          }
          next();
        });
        app.get("/api/farm/v2/state", async (_q, r) => {
          const player = (
            await storage.pool.query(
              'SELECT warehouse_state AS "warehouseState",mission_state AS "missionState",first_farm_entered_at AS "firstFarmEnteredAt" FROM farm_v2_player_state WHERE user_id=$1',
              [userId],
            )
          ).rows[0];
          const lands = (
            await storage.pool.query(
              'SELECT land_id AS "landId",lifecycle,access_active AS "accessActive",planted_quantity AS "plantedQuantity",planted_at AS "plantedAt",matures_at AS "maturesAt" FROM farm_v2_land WHERE user_id=$1 ORDER BY land_id',
              [userId],
            )
          ).rows;
          r.json({ player, lands });
        });
        app.post("/api/farm/v2/lands/:landId/:operation", async (q, r) => {
          try {
            const result = await (
              q.params.operation === "sow" ? sowFarmV2Land : harvestFarmV2Land
            )({
              userId,
              requestId: String(q.header("x-request-id")),
              landId: Number(q.params.landId),
            });
            r.json(result);
          } catch (e) {
            r.status(409).json({ error: String(e) });
          }
        });
        const server = await new Promise<import("node:http").Server>(
          (resolve) => {
            const s = app.listen(0, "127.0.0.1", () => resolve(s));
          },
        );
        const port = (server.address() as import("node:net").AddressInfo).port;
        const browser = await chromium.launch({
          executablePath: "/usr/bin/chromium",
          headless: true,
          args: ["--no-sandbox"],
        });
        try {
          for (const [label, width, height, harvestId] of [
            ["desktop", 1280, 900, 2],
            ["mobile", 390, 844, 3],
          ] as const) {
            if (label === "mobile")
              await storage.pool.query(
                "UPDATE farm_v2_land SET lifecycle='EMPTY',planted_quantity=0,planted_at=NULL,matures_at=NULL WHERE user_id=$1 AND land_id=1",
                [userId],
              );
            const page = await browser.newPage({
              viewport: { width, height },
              deviceScaleFactor: 1,
            });
            page.setDefaultTimeout(8000);
            const errors: string[] = [];
            page.on("pageerror", (e: Error) => errors.push(e.message));
            await page.goto("http://127.0.0.1:" + port);
            await page.locator('[data-layout="' + label + '"]').waitFor();
            const image = page.locator(".farm-v2-scene-original");
            await page.waitForFunction(
              "document.querySelector('.farm-v2-scene-original')?.complete",
            );
            const dimensions = await image.evaluate((img: unknown) =>
              eval(
                `({width:img.naturalWidth,height:img.naturalHeight,ratio:img.getBoundingClientRect().width/img.getBoundingClientRect().height,fit:getComputedStyle(img).objectFit})`,
              ),
            );
            expect([dimensions.width, dimensions.height]).toEqual(
              label === "desktop" ? [1215, 1295] : [941, 1672],
            );
            expect(dimensions.ratio).toBeCloseTo(
              dimensions.width / dimensions.height,
              3,
            );
            expect(dimensions.fit).toBe("contain");
            expect(await page.locator(".farm-v2-land").count()).toBe(6);
            expect(await page.locator(".farm-v2-pot").count()).toBe(6);
            expect(await page.locator(".farm-v2-pet").count()).toBe(4);
            const bounded = async () => {
              await expect
                .poll(async () =>
                  page
                    .locator('[role="dialog"]')
                    .evaluate((el: unknown) =>
                      eval(
                        `(()=>{const b=el.getBoundingClientRect();return {left:Math.round(b.left),top:Math.round(b.top),right:Math.round(b.right),bottom:Math.round(b.bottom),viewport:[innerWidth,innerHeight],overflow:el.scrollWidth-el.clientWidth,bounded:b.left>=0&&b.top>=0&&b.right<=innerWidth&&b.bottom<=innerHeight&&el.scrollWidth<=el.clientWidth,opaque:getComputedStyle(el).backgroundColor!=="rgba(0, 0, 0, 0)"};})()`,
                      ),
                    ),
                )
                .toMatchObject({ bounded: true, opaque: true });
            };
            // Click every plot center: the correct land popup must open.
            const { FARM_V2_LANDS } =
              await import("../../../qiankun-farm/src/game/v2/canonicalLandData");
            for (let i = 0; i < 6; i++) {
              await page
                .locator(".farm-v2-land")
                .nth(i)
                .getByRole("button")
                .click();
              await page
                .getByRole("dialog")
                .getByRole("heading", {
                  name: FARM_V2_LANDS[i].landName,
                  exact: true,
                })
                .waitFor();
              await bounded();
              await page.keyboard.press("Escape");
            }
            await page
              .locator(".farm-v2-land")
              .nth(0)
              .getByRole("button")
              .click();
            const sowResponse = page.waitForResponse("**/lands/1/sow");
            await page
              .getByRole("dialog")
              .getByRole("button", { name: "整批播種", exact: true })
              .click();
            expect((await sowResponse).status()).toBe(200);
            await page
              .getByRole("dialog")
              .getByText("生長中", { exact: true })
              .waitFor();
            await page.screenshot({
              path: `/tmp/farm-v2-approved-${label}-dialog.png`,
              fullPage: false,
              animations: "disabled",
            });
            await page.keyboard.press("Escape");
            await page
              .locator(".farm-v2-land")
              .nth(harvestId - 1)
              .getByRole("button")
              .click();
            const harvestResponse = page.waitForResponse(
              `**/lands/${harvestId}/harvest`,
            );
            await page
              .getByRole("dialog")
              .getByRole("button", { name: "收成入庫", exact: true })
              .click();
            expect((await harvestResponse).status()).toBe(200);
            await page
              .getByRole("dialog")
              .getByText("待播種", { exact: true })
              .waitFor();
            await page.keyboard.press("Escape");
            // Hotspots must hit the expected existing panel, never an adjacent plot.
            for (const selector of [
              ".farm-v2-formation",
              ".farm-v2-pet",
              ".farm-v2-pot",
            ]) {
              for (const target of await page.locator(selector).all()) {
                await target.click();
                await page.getByRole("dialog").waitFor();
                await bounded();
                await page.keyboard.press("Escape");
                await page.getByRole("dialog").waitFor({ state: "hidden" });
              }
            }
            await page
              .getByRole("button", { name: "進入洞府", exact: true })
              .click();
            expect(await page.locator(".farm-v2-decor").count()).toBe(6);
            await page
              .getByRole("button", { name: "離開洞府・回到我的福田農場" })
              .click();
            expect(
              await page.evaluate("document.body.scrollWidth <= innerWidth"),
            ).toBe(true);
            await page.evaluate("scrollTo(0, 0)");
            await page.screenshot({
              path: `/tmp/farm-v2-approved-${label}.png`,
              fullPage: true,
              animations: "disabled",
            });
            // Narrow phone: no clipping, no horizontal overflow, a bounded popup.
            if (label === "mobile") {
              await page.setViewportSize({ width: 320, height: 568 });
              await page
                .locator(".farm-v2-land")
                .nth(5)
                .getByRole("button")
                .click();
              await bounded();
              await page.keyboard.press("Escape");
              expect(
                await page.evaluate("document.body.scrollWidth <= innerWidth"),
              ).toBe(true);
              await page.screenshot({
                path: "/tmp/farm-v2-approved-mobile-320.png",
                fullPage: true,
                animations: "disabled",
              });
            }
            expect(errors).toEqual([]);
            await page.close();
          }
          expect(
            (
              await storage.pool.query(
                "SELECT warehouse_state->'crops'->>'2' c2,warehouse_state->'crops'->>'3' c3,warehouse_state->'seeds'->>'1' seeds FROM farm_v2_player_state WHERE user_id=$1",
                [userId],
              )
            ).rows[0],
          ).toEqual({ c2: "30", c3: "26", seeds: "0" });
          expect(
            (
              await storage.pool.query(
                "SELECT count(*)::int n FROM farm_v2_mutation WHERE user_id=$1 AND transaction_state='COMPLETED'",
                [userId],
              )
            ).rows[0].n,
          ).toBe(4);
        } finally {
          await browser.close();
          await new Promise<void>((resolve) => server.close(() => resolve()));
        }
      },
      60000,
    );
    it("festival rights persist with workshop idempotency; client cannot choose a right or change a window", async () => {
      const { mutateLegacyFarmV2Workshop: mutateFarmV2Workshop } =
        await import("./farm-v2-workshop");
      const now = Date.now(),
        codeHash = "a".repeat(64);
      vi.stubEnv(
        "FARM_V2_FESTIVAL_CODES",
        JSON.stringify([
          {
            codeHash,
            id: "FORMATION_FESTIVAL_SPRING",
            startsAt: now - 1000,
            expiresAt: now + 60000,
            year: new Date(now + 8 * 3600000).getUTCFullYear(),
          },
        ]),
      );
      try {
        const input = {
          userId,
          launchToken: "test",
          requestId: "festival-once",
          command: { kind: "redeemFormationCode" as const, codeHash },
        };
        const r = await Promise.all([
          mutateFarmV2Workshop(input),
          mutateFarmV2Workshop(input),
        ]);
        expect(r[0]).toEqual(r[1]);
        const w = (
          await storage.pool.query(
            "SELECT warehouse_state FROM farm_v2_player_state WHERE user_id=$1",
            [userId],
          )
        ).rows[0].warehouse_state;
        expect(w.workshop.formations).toHaveLength(1);
        expect(w.workshop.formations[0].id).toBe("FORMATION_FESTIVAL_SPRING");
        await expect(
          mutateFarmV2Workshop({
            ...input,
            requestId: "invalid-code",
            command: { kind: "redeemFormationCode", codeHash: "b".repeat(64) },
          }),
        ).rejects.toThrow(/FORMATION_CODE/);
      } finally {
        vi.stubEnv("FARM_V2_FESTIVAL_CODES", "");
      }
    });
    async function friendFixture() {
      const target = "00000000-0000-0000-0000-000000000002";
      await storage.pool.query(
        "INSERT INTO auth.users(id) VALUES($1) ON CONFLICT(id) DO UPDATE SET banned_until=NULL,deleted_at=NULL",
        [target],
      );
      await storage.pool.query(
        "INSERT INTO core.users(id,auth_user_id,status) VALUES('10000000-0000-0000-0000-000000000002',$1,'active') ON CONFLICT(id) DO UPDATE SET status='active',deleted_at=NULL",
        [target],
      );
      await storage.pool.query(
        "INSERT INTO platform_friendships VALUES($1,$2,'active') ON CONFLICT(user_a_id,user_b_id) DO UPDATE SET status='active'",
        [userId, target],
      );
      await storage.pool.query(
        "INSERT INTO farm_v2_player_state(user_id,first_farm_entered_at,access_state,warehouse_state,mission_state,pet_state,farmer_state) SELECT $1,now()-interval '10 days',access_state,warehouse_state,mission_state,pet_state,farmer_state FROM farm_v2_player_state WHERE user_id=$2",
        [target, userId],
      );
      await storage.pool.query(
        "INSERT INTO farm_v2_land(user_id,land_id,lifecycle,access_active,planted_quantity,planted_at,matures_at) SELECT $1,n,'MATURE',true,(ARRAY[20,10,6,4,3,1])[n],now()-interval '2 days',now()-interval '2 hours' FROM generate_series(1,6)n",
        [target],
      );
      return target;
    }
    async function friendMutation(
      targetId: string,
      requestId: string,
      kind: "BORROW" | "ASSIST",
      landId = 2,
    ) {
      const { withFarmFriendAuthority } =
        await import("./farm-v2-friend-authority");
      const { mutateFarmV2Friend } = await import("./farm-v2-friend-actions");
      return withFarmFriendAuthority(
        { userId, targetId, requestId, kind, launchToken: "test" },
        () => mutateFarmV2Friend({ userId, targetId, requestId, kind, landId }),
      );
    }
    it("friend borrow: same-key concurrent retry consumes once, cooldown rejects a new key", async () => {
      const target = await friendFixture();
      const r = await Promise.all([
        friendMutation(target, "borrow-once", "BORROW"),
        friendMutation(target, "borrow-once", "BORROW"),
      ]);
      expect(r[0]).toEqual(r[1]);
      expect(
        (
          await storage.pool.query(
            "SELECT planted_quantity FROM farm_v2_land WHERE user_id=$1 AND land_id=2",
            [target],
          )
        ).rows[0].planted_quantity,
      ).toBe(7);
      expect(
        (
          await storage.pool.query(
            "SELECT warehouse_state->'crops'->>'2' qty FROM farm_v2_player_state WHERE user_id=$1",
            [userId],
          )
        ).rows[0].qty,
      ).toBe("23");
      await expect(
        friendMutation(target, "borrow-again", "BORROW"),
      ).rejects.toThrow(/COOLDOWN/);
      expect(
        (
          await storage.pool.query(
            "SELECT count(*)::int n FROM farm_v2_friend_operations WHERE state='OPEN'",
          )
        ).rows[0].n,
      ).toBe(0);
    });
    it("friend assist: concurrent requests cannot harvest or award twice", async () => {
      const target = await friendFixture();
      const r = await Promise.allSettled([
        friendMutation(target, "assist-1", "ASSIST"),
        friendMutation(target, "assist-2", "ASSIST"),
      ]);
      expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
      expect(
        (
          await storage.pool.query(
            "SELECT warehouse_state->'crops'->>'2' qty FROM farm_v2_player_state WHERE user_id=$1",
            [target],
          )
        ).rows[0].qty,
      ).toBe("30");
      expect(
        (
          await storage.pool.query(
            "SELECT warehouse_state->'crops'->>'2' qty FROM farm_v2_player_state WHERE user_id=$1",
            [userId],
          )
        ).rows[0].qty,
      ).toBe("21");
      expect(
        (
          await storage.pool.query(
            "SELECT lifecycle FROM farm_v2_land WHERE user_id=$1 AND land_id=2",
            [target],
          )
        ).rows[0].lifecycle,
      ).toBe("EMPTY");
    });
    it("ASSIST-RACE-001: owner harvest and friend assist share a single mature batch", async () => {
      const target = await friendFixture(),
        { harvestFarmV2Land } = await import("./farm-v2-harvest");
      const results = await Promise.allSettled([
        friendMutation(target, "assist-race", "ASSIST"),
        harvestFarmV2Land({
          userId: target,
          requestId: "owner-race",
          landId: 2,
        }),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(
        (
          await storage.pool.query(
            "SELECT warehouse_state->'crops'->>'2' qty FROM farm_v2_player_state WHERE user_id=$1",
            [target],
          )
        ).rows[0].qty,
      ).toBe("30");
      const actorQty = Number(
        (
          await storage.pool.query(
            "SELECT warehouse_state->'crops'->>'2' qty FROM farm_v2_player_state WHERE user_id=$1",
            [userId],
          )
        ).rows[0].qty,
      );
      expect(actorQty).toBe(results[0].status === "fulfilled" ? 21 : 20);
    });
    it("current target farmer entitlement rejects before quotas and rolls; refund removes that protection", async () => {
      const target = await friendFixture();
      await storage.pool.query(
        "INSERT INTO core.wallets(id,user_id) VALUES($1,'10000000-0000-0000-0000-000000000002') ON CONFLICT DO NOTHING",
        [target],
      );
      await storage.pool.query(
        "INSERT INTO core.wallet_ledgers(wallet_id,currency_type,entry_type,amount,reference_type,idempotency_key) VALUES($1,'paid_crystal','credit',999,'payment','target-payment')",
        [target],
      );
      await expect(
        friendMutation(target, "farmer-block", "BORROW"),
      ).rejects.toThrow("TARGET_FARMER_ACTIVE");
      expect(
        (
          await storage.pool.query(
            "SELECT warehouse_state->'workshop'->'friendInteractions' interactions FROM farm_v2_player_state WHERE user_id=$1",
            [userId],
          )
        ).rows[0].interactions,
      ).toBeNull();
      await storage.pool.query(
        "INSERT INTO core.wallet_ledgers(wallet_id,currency_type,entry_type,amount,reference_type,idempotency_key) VALUES($1,'paid_crystal','refund',999,'payment','target-refund')",
        [target],
      );
      expect(
        (await friendMutation(target, "after-refund", "BORROW")).successful,
      ).toBe(true);
    });
    it("friend cannot consume target assets reserved by an unresolved workshop Saga", async () => {
      const target = await friendFixture();
      await storage.pool.query(
        "INSERT INTO farm_v2_mutation(user_id,request_id,action,transaction_state,wallet_transaction) VALUES($1,'reserved-workshop','WORKSHOP','WALLET_PENDING',$2)",
        [target, { assetPlan: { reserved: true } }],
      );
      await expect(
        friendMutation(target, "reserved-friend", "ASSIST"),
      ).rejects.toThrow("WORKSHOP_RECOVERY_REQUIRED");
      expect(
        (
          await storage.pool.query(
            "SELECT planted_quantity FROM farm_v2_land WHERE user_id=$1 AND land_id=2",
            [target],
          )
        ).rows[0].planted_quantity,
      ).toBe(10);
      expect(
        (
          await storage.pool.query(
            "SELECT count(*)::int n FROM farm_v2_friend_operations WHERE state='OPEN'",
          )
        ).rows[0].n,
      ).toBe(0);
    });
    it("friend durable permits fence relationship/account changes until domain settlement", async () => {
      const target = await friendFixture();
      const { withFarmFriendAuthority } =
        await import("./farm-v2-friend-authority");
      await withFarmFriendAuthority(
        {
          userId,
          targetId: target,
          requestId: "barrier",
          kind: "BORROW",
          launchToken: "test",
        },
        async () => {
          await expect(
            corePool.query(
              "DELETE FROM platform_friendships WHERE user_b_id=$1",
              [target],
            ),
          ).rejects.toMatchObject({ code: "55P03" });
          await expect(
            corePool.query(
              "UPDATE core.users SET status='archived' WHERE auth_user_id=$1",
              [target],
            ),
          ).rejects.toMatchObject({ code: "55P03" });
        },
      );
      await corePool.query(
        "DELETE FROM platform_friendships WHERE user_b_id=$1",
        [target],
      );
      await expect(
        friendMutation(target, "after-removal", "BORROW"),
      ).rejects.toThrow("MUTUAL_FRIEND_REQUIRED");
      expect(
        (
          await storage.pool.query(
            "SELECT count(*)::int n FROM farm_v2_paid_operations WHERE state='OPEN'",
          )
        ).rows[0].n,
      ).toBe(0);
    });
    beforeEach(async () => {
      dropWalletResponse = false;
      dropFarmCommit = false;
      await storage.pool.query(
        `truncate farm_v2_land, farm_v2_mutation, farm_v2_player_state, farm_test_failures, farm_v2_authorization_attempt, farm_v2_reconciliation_event, farm_v2_reconciliation_case; truncate farm_v2_friend_operations, farm_v2_paid_operations, farm_v2_wallet_closures, farm_v2_wallet_reconciliation_audit; truncate core.wallet_ledgers; insert into core.wallet_ledgers(wallet_id,currency_type,entry_type,amount,reference_type,idempotency_key) values('${userId}','paid_crystal','credit',600,'payment','fixture-payment'); truncate farm_v2_atomic_pot_receipts, core_wallet_ledger, core_wallets; select core_wallet_get_or_create('${userId}'); update core_wallets set coin_balance=100;`,
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
        if (String(_url).endsWith("/friends/authorization")) {
          try {
            if (input.phase === "begin") {
              const r = await corePool.query(
                "SELECT farm_v2_begin_friend_operation($1,$2,$3,$4,$5,$6) result",
                [
                  userId,
                  input.targetId,
                  input.operationId,
                  input.targetOperationId,
                  input.requestId,
                  input.kind,
                ],
              );
              return Response.json(r.rows[0].result);
            }
            await corePool.query(
              "SELECT farm_v2_end_friend_operation($1,$2,$3,$4)",
              [
                userId,
                input.targetId,
                input.operationId,
                input.targetOperationId,
              ],
            );
            return Response.json({ settled: true });
          } catch (e) {
            return Response.json(
              {},
              {
                status: String(e).includes("MUTUAL_FRIEND_REQUIRED")
                  ? 403
                  : 503,
              },
            );
          }
        }
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

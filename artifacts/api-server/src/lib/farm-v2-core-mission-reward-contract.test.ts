import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it } from "vitest";

let db: PGlite;
const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const inactive = "33333333-3333-4333-8333-333333333333";
const rewards = [
  ["MISSION_D01", 2],
  ["MISSION_D02", 3],
  ["MISSION_D03", 3],
  ["MISSION_D04", 5],
  ["MISSION_W01", 10],
  ["MISSION_W02", 15],
  ["MISSION_W03", 15],
  ["MISSION_W04", 20],
] as const;

async function claim(missionId: string, requestId: string, user = owner) {
  const result = await db.query<{ result: any }>(
    "select public.farm_v2_claim_mission_reward($1::uuid,$2::text,$3::text) as result",
    [user, missionId, requestId],
  );
  return result.rows[0].result;
}
async function balance(user = owner) {
  return (
    await db.query<{ coin_balance: number }>(
      "select coin_balance from public.core_wallets where owner_id=$1",
      [user],
    )
  ).rows[0].coin_balance;
}
beforeEach(async () => {
  db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema core;create schema platform;create schema system;
    create table auth.users(id uuid primary key);
    create table core.users(id uuid primary key,auth_user_id uuid unique references auth.users(id),status text not null);
    create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create function system.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
    create function system.reject_immutable_change() returns trigger language plpgsql as $$ begin raise exception 'immutable'; end $$;
    insert into auth.users values ('${owner}'),('${other}'),('${inactive}');
    insert into core.users values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','${owner}','active'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','${other}','active'),('cccccccc-cccc-4ccc-8ccc-cccccccccccc','${inactive}','suspended');`);
  await db.exec(
    readFileSync(
      "contracts/core/reference/0019-core-wallet-runtime.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync("contracts/core/farm-v2-mission-reward.sql", "utf8"),
  );
  await db.exec(
    `select public.core_wallet_get_or_create('${owner}');select public.core_wallet_get_or_create('${other}');update public.core_wallets set coin_balance=0;`,
  );
});
afterEach(async () => {
  await db?.close();
});

it.each(rewards)(
  "credits the fixed Core Wallet amount for %s",
  async (missionId, amount) => {
    const result = await claim(missionId, `claim-${missionId}`);
    expect(result).toMatchObject({
      result_status: "created",
      mission_id: missionId,
      amount,
    });
    expect(result.transaction).toMatchObject({
      owner_id: owner,
      amount,
      currency: "coin",
      direction: "credit",
      reason: "farm_v2_mission_reward",
      reference_type: "farm_v2_mission_reward",
      reference_id: missionId,
      idempotency_key: `farm-v2:mission-claim:claim-${missionId}`,
    });
    expect(await balance()).toBe(amount);
  },
);

it("returns the original receipt on exact replay and rejects request reuse for another mission", async () => {
  const first = await claim("MISSION_D01", "stable");
  const replay = await claim("MISSION_D01", "stable");
  expect(replay).toMatchObject({
    result_status: "duplicate",
    mission_id: "MISSION_D01",
    amount: 2,
  });
  expect(replay.transaction.id).toBe(first.transaction.id);
  expect((await claim("MISSION_D02", "stable")).result_status).toBe(
    "duplicate_conflict",
  );
  expect(await balance()).toBe(2);
});

it("returns the original receipt when identity becomes inactive before a lost-response retry", async () => {
  const first = await claim("MISSION_D01", "inactive-retry");
  await db.exec(
    `update core.users set status='suspended' where auth_user_id='${owner}'`,
  );

  const replay = await claim("MISSION_D01", "inactive-retry");
  expect(replay).toMatchObject({
    result_status: "duplicate",
    mission_id: "MISSION_D01",
    amount: 2,
  });
  expect(replay.transaction.id).toBe(first.transaction.id);
  expect(await balance()).toBe(2);
});

it("rejects unknown missions and malformed request IDs without credit", async () => {
  expect((await claim("MISSION_X99", "unknown")).result_status).toBe(
    "invalid_request",
  );
  const nullMission = await db.query<{ result: any }>(
    "select public.farm_v2_claim_mission_reward($1::uuid,null,$2::text) as result",
    [owner, "null-mission"],
  );
  expect(nullMission.rows[0].result.result_status).toBe("invalid_request");
  for (const requestId of ["", "bad request", "x".repeat(121)])
    expect((await claim("MISSION_D01", requestId)).result_status).toBe(
      "invalid_request",
    );
  expect(await balance()).toBe(0);
});

it("requires an active Core identity and an active wallet", async () => {
  expect((await claim("MISSION_D01", "inactive", inactive)).result_status).toBe(
    "identity_unavailable",
  );
  await db.exec(
    `update public.core_wallets set status='suspended' where owner_id='${owner}'`,
  );
  expect((await claim("MISSION_D01", "suspended")).result_status).toBe(
    "wallet_unavailable",
  );
  expect(await balance()).toBe(0);
});

it("isolates account balances and writes exactly one ledger entry", async () => {
  await claim("MISSION_W04", "owner-claim", owner);
  await claim("MISSION_W04", "other-claim", other);
  expect(await balance(owner)).toBe(20);
  expect(await balance(other)).toBe(20);
  const entries = await db.query<{ n: number }>(
    "select count(*)::integer as n from public.core_wallet_ledger",
  );
  expect(entries.rows[0].n).toBe(2);
});

it("rolls back the wallet credit if ledger insertion fails", async () => {
  await db.exec(`create function public.fail_mission_reward_ledger() returns trigger language plpgsql as $$ begin raise exception 'ledger failed'; end $$;
    create trigger fail_mission_reward_ledger before insert on public.core_wallet_ledger for each row execute function public.fail_mission_reward_ledger();`);
  await expect(claim("MISSION_D01", "rollback")).rejects.toThrow(
    "ledger failed",
  );
  expect(await balance()).toBe(0);
  const entries = await db.query<{ n: number }>(
    "select count(*)::integer as n from public.core_wallet_ledger",
  );
  expect(entries.rows[0].n).toBe(0);
});

it("allows only service_role to execute the credit RPC", async () => {
  await db.exec("set role authenticated");
  await expect(claim("MISSION_D01", "client")).rejects.toThrow(
    /permission denied/,
  );
  await db.exec("reset role;set role service_role");
  expect((await claim("MISSION_D01", "backend")).result_status).toBe("created");
});

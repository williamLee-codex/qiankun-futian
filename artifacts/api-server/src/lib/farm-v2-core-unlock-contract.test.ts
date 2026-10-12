import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it } from "vitest";
let db: PGlite;
const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
async function unlock(land: number, key: string, user = owner) {
  const r = await db.query<{ result: any }>(
    "select public.farm_v2_purchase_coin_land($1::uuid,$2::smallint,$3::text) as result",
    [user, land, key],
  );
  return r.rows[0].result;
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
 insert into auth.users values ('${owner}'),('${other}');
 insert into core.users values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','${owner}','active'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','${other}','active');`);
  for (const file of [
    "reference/0019-core-wallet-runtime.sql",
    "reference/0006-platform-entitlements.sql",
    "farm-v2-coin-land-unlock.sql",
  ])
    await db.exec(readFileSync("contracts/core/" + file, "utf8"));
  await db.exec(
    `select public.core_wallet_get_or_create('${owner}');select public.core_wallet_get_or_create('${other}');update public.core_wallets set coin_balance=1000;`,
  );
});
afterEach(async () => {
  await db?.close();
});
it("enforces land 2 prerequisite then charges 88 and 888 with Core lifetime rights", async () => {
  expect((await unlock(3, "before")).result_status).toBe("land_2_required");
  expect(await balance()).toBe(1000);
  expect((await unlock(2, "land2")).result_status).toBe("created");
  expect(await balance()).toBe(912);
  expect((await unlock(3, "land3")).result_status).toBe("created");
  expect(await balance()).toBe(24);
  const r = await db.query<{ n: number }>(
    "select count(*)::integer as n from platform.entitlements where entitlement_type='lifetime' and status='active'",
  );
  expect(r.rows[0].n).toBe(2);
});
it("does not charge again with same or different request IDs and rejects reusing a request for another land", async () => {
  const first = await unlock(2, "same");
  const second = await unlock(2, "same");
  const third = await unlock(2, "different");
  expect(second.unlocked_at).toBe(first.unlocked_at);
  expect(third.unlocked_at).toBe(first.unlocked_at);
  expect((await unlock(3, "same")).result_status).toBe("duplicate_conflict");
  expect(await balance()).toBe(912);
});
it("does not grant an entitlement on insufficient funds and isolates account prerequisites", async () => {
  await db.exec(
    `update public.core_wallets set coin_balance=87 where owner_id='${owner}'`,
  );
  expect((await unlock(2, "poor")).result_status).toBe("insufficient_funds");
  expect(await balance()).toBe(87);
  await unlock(2, "other", other);
  expect((await unlock(3, "isolated")).result_status).toBe("land_2_required");
  expect(await balance(other)).toBe(912);
});
it("rolls back the debit and entitlement if its purchase event fails", async () => {
  await db.exec(`create function public.fail_unlock_event() returns trigger language plpgsql as $$ begin raise exception 'event failed'; end $$;
 create trigger fail_event before insert on platform.entitlement_events for each row execute function public.fail_unlock_event();`);
  await expect(unlock(2, "rollback")).rejects.toThrow("event failed");
  expect(await balance()).toBe(1000);
  expect(
    (
      await db.query<{ n: number }>(
        "select count(*)::integer as n from platform.entitlements",
      )
    ).rows[0].n,
  ).toBe(0);
  expect(
    (
      await db.query<{ n: number }>(
        "select count(*)::integer as n from public.core_wallet_ledger",
      )
    ).rows[0].n,
  ).toBe(0);
});
it("blocks direct client RPC and allows the trusted backend role", async () => {
  await db.exec("set role authenticated");
  await expect(unlock(2, "client")).rejects.toThrow(/permission denied/);
  await db.exec("reset role;set role service_role");
  expect((await unlock(2, "backend")).result_status).toBe("created");
});

it("rejects invalid land IDs and request IDs without spending", async () => {
  for (const land of [1, 4, 0, -1])
    expect((await unlock(land, "invalid")).result_status).toBe(
      "invalid_request",
    );
  for (const key of ["", "bad request", "x".repeat(121)])
    expect((await unlock(2, key)).result_status).toBe("invalid_request");
  expect(await balance()).toBe(1000);
});
it("does not debit a suspended wallet", async () => {
  await db.exec(
    `update public.core_wallets set status='suspended' where owner_id='${owner}'`,
  );
  expect((await unlock(2, "suspended")).result_status).toBe(
    "wallet_unavailable",
  );
  expect(await balance()).toBe(1000);
});

it.each(["suspended", "revoked", "expired"])(
  "uses historical land2 ownership without recharging a %s lifetime right",
  async (status) => {
    await unlock(2, "first-land2");
    await db.query(
      `update platform.entitlements set status=$1, revoked_at=case when $1='revoked' then now() else null end`,
      [status],
    );
    expect((await unlock(2, "suspended-retry")).result_status).toBe(
      "entitlement_unavailable",
    );
    expect(await balance()).toBe(912);
    expect((await unlock(3, "historical-land3")).result_status).toBe("created");
    expect(await balance()).toBe(24);
  },
);

it("honors an active platform regrant while preserving the first historical grant", async () => {
  const first = await unlock(2, "before-regrant");
  await db.exec(`update platform.entitlements set status='revoked',revoked_at=now();
 insert into platform.entitlements(user_id,product_id,entitlement_type,status,granted_at)
 select user_id,product_id,'lifetime','active',granted_at+interval '1 hour' from platform.entitlements;`);
  const retry = await unlock(2, "after-regrant");
  expect(retry.result_status).toBe("already_unlocked");
  expect(retry.cost).toBe(0);
  expect(retry.unlocked_at).toBe(first.unlocked_at);
  expect(retry.entitlement_id).not.toBe(first.entitlement_id);
  expect(await balance()).toBe(912);
});

it('reads first acquisition and current access exclusively from Core lifetime rights', async()=>{
 await unlock(2,'read-land2');
 const r=await db.query<{result:any}>('select public.farm_v2_coin_land_entitlements($1::uuid) as result',[owner]);
 expect(r.rows[0].result.lands).toHaveLength(2);
 expect(r.rows[0].result.lands[0]).toMatchObject({landId:2,historicallyUnlocked:true,accessActive:true});
 expect(r.rows[0].result.lands[1]).toMatchObject({landId:3,historicallyUnlocked:false,accessActive:false,firstUnlockedAt:null});
});

BEGIN;
-- Farm-only sign-in capability boundary. No Agent database dependency.
CREATE SCHEMA IF NOT EXISTS farm_v2_rewards;
REVOKE ALL ON SCHEMA farm_v2_rewards FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.farm_v2_resolve_verified_wallet_owner(p_user_id text)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE v_owner uuid;
BEGIN
 BEGIN v_owner:=p_user_id::uuid; EXCEPTION WHEN invalid_text_representation THEN RETURN NULL; END;
 IF v_owner IS NULL OR p_user_id<>v_owner::text THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.farm_v2_player_state WHERE user_id=p_user_id)
 OR NOT public.farm_v2_identity_active(v_owner)
 OR NOT EXISTS(SELECT 1 FROM public.core_wallets WHERE owner_id=v_owner AND status='active')
 THEN RETURN NULL; END IF;
 RETURN v_owner;
END; $$;
REVOKE ALL ON FUNCTION public.farm_v2_resolve_verified_wallet_owner(text) FROM PUBLIC,anon,authenticated,farm_v2_runtime;

-- Farm V2 sign-in consolidated isolated-install script.
-- Run only against a verified isolated database first. Requires existing farm player and wallet functions.
-- All DDL/functions execute as one transaction; failures roll back the entire install.
-- ===== artifacts/api-server/docs/sql/farm-v2-signin-foundation.sql =====
-- 30-day sign-in ledger foundation. Run only on a verified isolated database first.
-- Never overwrite legacy workshop.attendance; migration requires explicit mapping.
create table if not exists public.farm_v2_signin_cycles (
  user_id text not null,
  cycle_number integer not null check (cycle_number >= 1),
  cycle_start_day date not null,
  last_cycle_day integer not null default 0 check (last_cycle_day between 0 and 30),
  perfect_reward_claimed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key(user_id,cycle_number),
  unique(user_id,cycle_start_day)
);

create table if not exists public.farm_v2_signin_days (
  user_id text not null,
  cycle_number integer not null,
  cycle_day integer not null check (cycle_day between 1 and 30),
  signed_at timestamptz not null default now(),
  is_makeup boolean not null default false,
  reward_transaction_id uuid not null default gen_random_uuid(),
  primary key(user_id,cycle_number,cycle_day),
  unique(reward_transaction_id),
  foreign key(user_id,cycle_number) references public.farm_v2_signin_cycles(user_id,cycle_number)
);

create table if not exists public.farm_v2_signin_makeup_grants (
  user_id text not null,
  cycle_number integer not null,
  grant_day integer not null check (grant_day in (3,6,9,12,15,18,21,24,27,30)),
  created_at timestamptz not null default now(),
  primary key(user_id,cycle_number,grant_day),
  foreign key(user_id,cycle_number) references public.farm_v2_signin_cycles(user_id,cycle_number)
);

alter table public.farm_v2_signin_cycles enable row level security;
alter table public.farm_v2_signin_days enable row level security;
alter table public.farm_v2_signin_makeup_grants enable row level security;
revoke all on public.farm_v2_signin_cycles, public.farm_v2_signin_days, public.farm_v2_signin_makeup_grants from public, anon, authenticated;
-- Only trusted backend role may mutate. No client INSERT/UPDATE/DELETE grants.

-- ===== artifacts/api-server/docs/sql/farm-v2-signin-consumables.sql =====
-- Server-owned usable-item balances. Consumption will require an independently
-- verified farm action; never expose direct client decrement privileges.
create table if not exists public.farm_v2_consumable_balances(
 user_id text not null references public.farm_v2_player_state(user_id),
 item_id text not null check(item_id in
 ('instant_harvest','double_harvest','farm_protection_1h','yellow_upgrade','mystic_upgrade')),
 quantity integer not null default 0 check(quantity>=0),
 updated_at timestamptz not null default now(),
 primary key(user_id,item_id)
);
create table if not exists public.farm_v2_consumable_ledger(
 id uuid primary key default gen_random_uuid(),
 user_id text not null,
 item_id text not null,
 quantity integer not null check(quantity<>0),
 source_type text not null,
 source_key text not null,
 created_at timestamptz not null default now(),
 unique(user_id,source_type,source_key,item_id),
 foreign key(user_id,item_id) references public.farm_v2_consumable_balances(user_id,item_id)
);
alter table public.farm_v2_consumable_balances enable row level security;
alter table public.farm_v2_consumable_ledger enable row level security;
revoke all on public.farm_v2_consumable_balances,public.farm_v2_consumable_ledger from public,anon,authenticated;
create or replace function public.farm_v2_signin_claim_consumable_day(
 p_user_id text,p_cycle_number integer,p_cycle_day integer
) returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare
 v_cycle public.farm_v2_signin_cycles%rowtype;
 v_today date:=(now() at time zone 'Asia/Taipei' - interval '5 hours')::date;
 v_item text;
 v_qty integer;
 v_receipt uuid;
begin
 v_item:=case when p_cycle_day in (3,13) then 'instant_harvest'
 when p_cycle_day in (5,14,23) then 'double_harvest'
 when p_cycle_day in (8,18,28) then 'farm_protection_1h'
 when p_cycle_day=9 then 'yellow_upgrade'
 when p_cycle_day in (19,26) then 'mystic_upgrade' end;
 v_qty:=case p_cycle_day when 3 then 1 when 5 then 1 when 8 then 2 when 9 then 1
 when 13 then 2 when 14 then 2 when 18 then 3 when 19 then 1 when 23 then 3
 when 26 then 1 when 28 then 5 end;
 if v_item is null then return jsonb_build_object('status','unsupported_reward'); end if;
 select * into v_cycle from public.farm_v2_signin_cycles
 where user_id=p_user_id and cycle_number=p_cycle_number for update;
 if not found then return jsonb_build_object('status','cycle_not_found'); end if;
 if v_today-v_cycle.cycle_start_day+1<>p_cycle_day then
 return jsonb_build_object('status','not_today'); end if;
 if exists(select 1 from public.farm_v2_signin_days where user_id=p_user_id
 and cycle_number=p_cycle_number and cycle_day=p_cycle_day) then
 return jsonb_build_object('status','already_signed'); end if;
 if not exists(select 1 from public.farm_v2_player_state where user_id=p_user_id)
 then return jsonb_build_object('status','player_not_found'); end if;
 insert into public.farm_v2_consumable_balances(user_id,item_id,quantity)
 values(p_user_id,v_item,0) on conflict do nothing;
 update public.farm_v2_consumable_balances
 set quantity=quantity+v_qty,updated_at=now()
 where user_id=p_user_id and item_id=v_item and quantity<=2147483647-v_qty;
 if not found then return jsonb_build_object('status','inventory_overflow'); end if;
 insert into public.farm_v2_consumable_ledger(user_id,item_id,quantity,source_type,source_key)
 values(p_user_id,v_item,v_qty,'signin',p_cycle_number::text||':'||p_cycle_day)
 returning id into v_receipt;
 insert into public.farm_v2_signin_days(user_id,cycle_number,cycle_day,is_makeup,reward_transaction_id)
 values(p_user_id,p_cycle_number,p_cycle_day,false,v_receipt);
 return jsonb_build_object('status','claimed','cycleDay',p_cycle_day,
 'item',v_item,'quantity',v_qty,'transactionId',v_receipt);
end; $$;
revoke all on function public.farm_v2_signin_claim_consumable_day(text,integer,integer) from public,anon,authenticated;

-- ===== artifacts/api-server/docs/sql/farm-v2-signin-claim-coin-day.sql =====
-- Atomic sign-in coin rewards. Uses authoritative core wallet and sign-in ledger.
create or replace function public.farm_v2_signin_claim_coin_day(
 p_user_id text, p_cycle_number integer, p_cycle_day integer
) returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare
 v_cycle public.farm_v2_signin_cycles%rowtype;
 v_today date := (now() at time zone 'Asia/Taipei' - interval '5 hours')::date;
 v_amount integer;
 v_owner uuid;
 v_result jsonb;
 v_tx uuid;
begin
 v_amount:=case p_cycle_day
  when 1 then 10 when 4 then 20 when 7 then 30
  when 12 then 30 when 17 then 40 when 22 then 50 when 27 then 60
  else null end;
 if v_amount is null then return jsonb_build_object('status','unsupported_reward'); end if;
 select * into v_cycle from public.farm_v2_signin_cycles
 where user_id=p_user_id and cycle_number=p_cycle_number for update;
 if not found then return jsonb_build_object('status','cycle_not_found'); end if;
 if v_today-v_cycle.cycle_start_day+1<>p_cycle_day then
   return jsonb_build_object('status','not_today');
 end if;
 if exists(select 1 from public.farm_v2_signin_days where user_id=p_user_id and cycle_number=p_cycle_number and cycle_day=p_cycle_day) then
   return jsonb_build_object('status','already_signed');
 end if;
 v_owner:=public.farm_v2_resolve_verified_wallet_owner(p_user_id);
 if v_owner is null then return jsonb_build_object('status','unverified_identity'); end if;
 v_result:=public.core_wallet_apply_transaction(v_owner,v_amount,'coin','credit',
  'farm-v2:signin:'||p_user_id||':'||p_cycle_number||':'||p_cycle_day,
  'farm_v2_signin',p_cycle_number::text||':'||p_cycle_day,'farm_v2_signin',null);
 if v_result->>'result_status' not in ('created','duplicate') then
   raise exception 'SIGNIN_COIN_WALLET_FAILURE: %',v_result->>'result_status';
 end if;
 v_tx:=(v_result->'transaction'->>'id')::uuid;
 if v_tx is null then raise exception 'SIGNIN_COIN_MISSING_LEDGER_ID'; end if;
 insert into public.farm_v2_signin_days(user_id,cycle_number,cycle_day,is_makeup,reward_transaction_id)
 values(p_user_id,p_cycle_number,p_cycle_day,false,v_tx);
 return jsonb_build_object('status','claimed','cycleDay',p_cycle_day,'coins',v_amount,'transactionId',v_tx);
end; $$;
revoke all on function public.farm_v2_signin_claim_coin_day(text,integer,integer) from public,anon,authenticated;

-- ===== artifacts/api-server/docs/sql/farm-v2-signin-claim-crystal-day.sql =====
-- Day 10 and 25 crystal sign-in: same authoritative wallet/ledger as coins.
create or replace function public.farm_v2_signin_claim_crystal_day(
 p_user_id text, p_cycle_number integer, p_cycle_day integer
) returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare
 v_cycle public.farm_v2_signin_cycles%rowtype;
 v_today date := (now() at time zone 'Asia/Taipei' - interval '5 hours')::date;
 v_amount integer;
 v_owner uuid;
 v_result jsonb;
 v_tx uuid;
begin
 v_amount:=case p_cycle_day when 10 then 1 when 25 then 2 else null end;
 if v_amount is null then return jsonb_build_object('status','unsupported_reward'); end if;
 select * into v_cycle from public.farm_v2_signin_cycles
 where user_id=p_user_id and cycle_number=p_cycle_number for update;
 if not found then return jsonb_build_object('status','cycle_not_found'); end if;
 if v_today-v_cycle.cycle_start_day+1<>p_cycle_day then
   return jsonb_build_object('status','not_today');
 end if;
 if exists(select 1 from public.farm_v2_signin_days
   where user_id=p_user_id and cycle_number=p_cycle_number and cycle_day=p_cycle_day) then
   return jsonb_build_object('status','already_signed');
 end if;
 v_owner:=public.farm_v2_resolve_verified_wallet_owner(p_user_id);
 if v_owner is null then return jsonb_build_object('status','unverified_identity'); end if;
 v_result:=public.core_wallet_apply_transaction(v_owner,v_amount,'crystal','credit',
   'farm-v2:signin:'||p_user_id||':'||p_cycle_number||':'||p_cycle_day,
   'farm_v2_signin',p_cycle_number::text||':'||p_cycle_day,'farm_v2_signin',null);
 if v_result->>'result_status' not in ('created','duplicate') then
   raise exception 'SIGNIN_CRYSTAL_WALLET_FAILURE: %',v_result->>'result_status';
 end if;
 v_tx:=(v_result->'transaction'->>'id')::uuid;
 if v_tx is null then raise exception 'SIGNIN_CRYSTAL_MISSING_LEDGER_ID'; end if;
 insert into public.farm_v2_signin_days(user_id,cycle_number,cycle_day,is_makeup,reward_transaction_id)
 values(p_user_id,p_cycle_number,p_cycle_day,false,v_tx);
 return jsonb_build_object('status','claimed','cycleDay',p_cycle_day,'crystals',v_amount,'transactionId',v_tx);
end; $$;
revoke all on function public.farm_v2_signin_claim_crystal_day(text,integer,integer) from public,anon,authenticated;

-- ===== artifacts/api-server/docs/sql/farm-v2-signin-claim-material-day.sql =====
-- Atomic attendance + workshop material reward for material-only sign-in days.
-- Other rewards deliberately fail closed until their wallet/item issuance is implemented.
create or replace function public.farm_v2_signin_claim_material_day(
 p_user_id text, p_cycle_number integer, p_cycle_day integer
) returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare
 v_cycle public.farm_v2_signin_cycles%rowtype;
 v_today date := (now() at time zone 'Asia/Taipei' - interval '5 hours')::date;
 v_day integer;
 v_material text;
 v_quantity integer;
 v_state jsonb;
 v_workshop jsonb;
 v_materials jsonb;
 v_old integer;
begin
 if p_cycle_day not in (2,6,11,16,21,24,29) then
   return jsonb_build_object('status','unsupported_reward');
 end if;
 v_material:=case when p_cycle_day in (6,16,24) then '九霄玉髓' else '蘊靈砂' end;
 v_quantity:=case p_cycle_day when 2 then 1 when 6 then 1 when 11 then 2 when 16 then 2 when 21 then 3 when 24 then 3 when 29 then 5 end;
 select * into v_cycle from public.farm_v2_signin_cycles
 where user_id=p_user_id and cycle_number=p_cycle_number for update;
 if not found then return jsonb_build_object('status','cycle_not_found'); end if;
 v_day:=v_today-v_cycle.cycle_start_day+1;
 if v_day<>p_cycle_day or v_day not between 1 and 30 then
   return jsonb_build_object('status','not_today');
 end if;
 if exists(select 1 from public.farm_v2_signin_days where user_id=p_user_id and cycle_number=p_cycle_number and cycle_day=p_cycle_day) then
   return jsonb_build_object('status','already_signed');
 end if;
 select warehouse_state into v_state from public.farm_v2_player_state
 where user_id=p_user_id for update;
 if not found then return jsonb_build_object('status','player_not_found'); end if;
 v_workshop:=v_state->'workshop';
 v_materials:=v_workshop->'materials';
 if jsonb_typeof(v_materials)<>'object' then
   return jsonb_build_object('status','invalid_inventory');
 end if;
 if v_materials ? v_material and jsonb_typeof(v_materials->v_material)<>'number' then
   return jsonb_build_object('status','invalid_inventory');
 end if;
 v_old:=coalesce((v_materials->>v_material)::integer,0);
 if v_old<0 or v_old>2147483647-v_quantity then
   return jsonb_build_object('status','invalid_inventory');
 end if;
 update public.farm_v2_player_state
 set warehouse_state=jsonb_set(v_state,array['workshop','materials',v_material],to_jsonb(v_old+v_quantity),true),
 updated_at=now()
 where user_id=p_user_id;
 insert into public.farm_v2_signin_days(user_id,cycle_number,cycle_day,is_makeup)
 values(p_user_id,p_cycle_number,p_cycle_day,false);
 return jsonb_build_object('status','claimed','cycleDay',p_cycle_day,'item',v_material,'quantity',v_quantity);
end; $$;
revoke all on function public.farm_v2_signin_claim_material_day(text,integer,integer) from public,anon,authenticated;

-- ===== artifacts/api-server/docs/sql/farm-v2-signin-claim-pot-day.sql =====
-- Sign-in pot rewards go to workshop.pots, never the crop warehouse.
create or replace function public.farm_v2_signin_claim_pot_day(
 p_user_id text,p_cycle_number integer,p_cycle_day integer
) returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare
 v_cycle public.farm_v2_signin_cycles%rowtype;
 v_today date:=(now() at time zone 'Asia/Taipei' - interval '5 hours')::date;
 v_grade text;
 v_state jsonb;
 v_pots jsonb;
 v_id uuid:=gen_random_uuid();
 v_species integer;
 v_pot jsonb;
begin
 v_grade:=case p_cycle_day when 15 then '黃' when 20 then '玄' when 30 then '地' else null end;
 if v_grade is null then return jsonb_build_object('status','unsupported_reward'); end if;
 select * into v_cycle from public.farm_v2_signin_cycles
 where user_id=p_user_id and cycle_number=p_cycle_number for update;
 if not found then return jsonb_build_object('status','cycle_not_found'); end if;
 if v_today-v_cycle.cycle_start_day+1<>p_cycle_day then return jsonb_build_object('status','not_today'); end if;
 if exists(select 1 from public.farm_v2_signin_days where user_id=p_user_id and cycle_number=p_cycle_number and cycle_day=p_cycle_day)
 then return jsonb_build_object('status','already_signed'); end if;
 select warehouse_state into v_state from public.farm_v2_player_state where user_id=p_user_id for update;
 if not found then return jsonb_build_object('status','player_not_found'); end if;
 v_pots:=v_state #> '{workshop,pots}';
 if jsonb_typeof(v_pots)<>'array' then return jsonb_build_object('status','invalid_workshop'); end if;
 v_species:=1+floor(random()*6)::integer;
 v_pot:=jsonb_build_object('id',v_id,'grade',v_grade,'species',v_species,
   'displayed',false,'acquiredAt',floor(extract(epoch from clock_timestamp())*1000)::bigint);
 update public.farm_v2_player_state
 set warehouse_state=jsonb_set(v_state,'{workshop,pots}',v_pots||jsonb_build_array(v_pot),false),
 updated_at=now() where user_id=p_user_id;
 insert into public.farm_v2_signin_days(user_id,cycle_number,cycle_day,is_makeup,reward_transaction_id)
 values(p_user_id,p_cycle_number,p_cycle_day,false,v_id);
 return jsonb_build_object('status','claimed','cycleDay',p_cycle_day,'pot',v_pot);
end; $$;
revoke all on function public.farm_v2_signin_claim_pot_day(text,integer,integer) from public,anon,authenticated;

-- ===== artifacts/api-server/docs/sql/farm-v2-signin-makeup-coin.sql =====
-- Atomic makeup of coin sign-in days; chronological, once per earned credit.
create or replace function public.farm_v2_signin_makeup_coin_day(
 p_user_id text,p_cycle_number integer,p_cycle_day integer
) returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare
 v_cycle public.farm_v2_signin_cycles%rowtype;
 v_today date:=(now() at time zone 'Asia/Taipei' - interval '5 hours')::date;
 v_current integer;
 v_granted integer;
 v_used integer;
 v_amount integer;
 v_owner uuid;
 v_result jsonb;
 v_tx uuid;
begin
 v_amount:=case p_cycle_day when 1 then 10 when 4 then 20 when 7 then 30
  when 12 then 30 when 17 then 40 when 22 then 50 when 27 then 60 else null end;
 if v_amount is null then return jsonb_build_object('status','unsupported_reward'); end if;
 select * into v_cycle from public.farm_v2_signin_cycles
  where user_id=p_user_id and cycle_number=p_cycle_number for update;
 if not found then return jsonb_build_object('status','cycle_not_found'); end if;
 v_current:=v_today-v_cycle.cycle_start_day+1;
 if v_current not between 1 and 30 then return jsonb_build_object('status','cycle_inactive'); end if;
 if p_cycle_day>=v_current then return jsonb_build_object('status','not_past_day'); end if;
 if exists(select 1 from public.farm_v2_signin_days where user_id=p_user_id
  and cycle_number=p_cycle_number and cycle_day=p_cycle_day) then
  return jsonb_build_object('status','already_signed'); end if;
 select count(*) into v_granted from public.farm_v2_signin_makeup_grants
  where user_id=p_user_id and cycle_number=p_cycle_number and grant_day<=v_current;
 select count(*) into v_used from public.farm_v2_signin_days
  where user_id=p_user_id and cycle_number=p_cycle_number and is_makeup;
 if v_used>=v_granted then return jsonb_build_object('status','no_makeup_credit'); end if;
 if exists(select 1 from pg_catalog.generate_series(1,p_cycle_day-1) as d
  where not exists(select 1 from public.farm_v2_signin_days s
   where s.user_id=p_user_id and s.cycle_number=p_cycle_number and s.cycle_day=d)) then
  return jsonb_build_object('status','earlier_day_missing'); end if;
 v_owner:=public.farm_v2_resolve_verified_wallet_owner(p_user_id);
 if v_owner is null then return jsonb_build_object('status','unverified_identity'); end if;
 v_result:=public.core_wallet_apply_transaction(v_owner,v_amount,'coin','credit',
  'farm-v2:signin:'||p_user_id||':'||p_cycle_number||':'||p_cycle_day,
  'farm_v2_signin_makeup',p_cycle_number::text||':'||p_cycle_day,'farm_v2_signin',null);
 if v_result->>'result_status' not in ('created','duplicate') then
  raise exception 'SIGNIN_MAKEUP_WALLET_FAILURE: %',v_result->>'result_status'; end if;
 v_tx:=(v_result->'transaction'->>'id')::uuid;
 if v_tx is null then raise exception 'SIGNIN_MAKEUP_MISSING_LEDGER_ID'; end if;
 insert into public.farm_v2_signin_days(user_id,cycle_number,cycle_day,is_makeup,reward_transaction_id)
 values(p_user_id,p_cycle_number,p_cycle_day,true,v_tx);
 return jsonb_build_object('status','claimed','isMakeup',true,'cycleDay',p_cycle_day,
  'coins',v_amount,'transactionId',v_tx,'makeupCreditsRemaining',v_granted-v_used-1);
end; $$;
revoke all on function public.farm_v2_signin_makeup_coin_day(text,integer,integer) from public,anon,authenticated;

-- ===== artifacts/api-server/docs/sql/farm-v2-signin-makeup-crystal.sql =====
-- Atomic makeup of coin sign-in days; chronological, once per earned credit.
create or replace function public.farm_v2_signin_makeup_crystal_day(
 p_user_id text,p_cycle_number integer,p_cycle_day integer
) returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare
 v_cycle public.farm_v2_signin_cycles%rowtype;
 v_today date:=(now() at time zone 'Asia/Taipei' - interval '5 hours')::date;
 v_current integer;
 v_granted integer;
 v_used integer;
 v_amount integer;
 v_owner uuid;
 v_result jsonb;
 v_tx uuid;
begin
 v_amount:=case p_cycle_day when 10 then 1 when 25 then 2 else null end;
 if v_amount is null then return jsonb_build_object('status','unsupported_reward'); end if;
 select * into v_cycle from public.farm_v2_signin_cycles
  where user_id=p_user_id and cycle_number=p_cycle_number for update;
 if not found then return jsonb_build_object('status','cycle_not_found'); end if;
 v_current:=v_today-v_cycle.cycle_start_day+1;
 if v_current not between 1 and 30 then return jsonb_build_object('status','cycle_inactive'); end if;
 if p_cycle_day>=v_current then return jsonb_build_object('status','not_past_day'); end if;
 if exists(select 1 from public.farm_v2_signin_days where user_id=p_user_id
  and cycle_number=p_cycle_number and cycle_day=p_cycle_day) then
  return jsonb_build_object('status','already_signed'); end if;
 select count(*) into v_granted from public.farm_v2_signin_makeup_grants
  where user_id=p_user_id and cycle_number=p_cycle_number and grant_day<=v_current;
 select count(*) into v_used from public.farm_v2_signin_days
  where user_id=p_user_id and cycle_number=p_cycle_number and is_makeup;
 if v_used>=v_granted then return jsonb_build_object('status','no_makeup_credit'); end if;
 if exists(select 1 from pg_catalog.generate_series(1,p_cycle_day-1) as d
  where not exists(select 1 from public.farm_v2_signin_days s
   where s.user_id=p_user_id and s.cycle_number=p_cycle_number and s.cycle_day=d)) then
  return jsonb_build_object('status','earlier_day_missing'); end if;
 v_owner:=public.farm_v2_resolve_verified_wallet_owner(p_user_id);
 if v_owner is null then return jsonb_build_object('status','unverified_identity'); end if;
 v_result:=public.core_wallet_apply_transaction(v_owner,v_amount,'crystal','credit',
  'farm-v2:signin:'||p_user_id||':'||p_cycle_number||':'||p_cycle_day,
  'farm_v2_signin_makeup',p_cycle_number::text||':'||p_cycle_day,'farm_v2_signin',null);
 if v_result->>'result_status' not in ('created','duplicate') then
  raise exception 'SIGNIN_MAKEUP_WALLET_FAILURE: %',v_result->>'result_status'; end if;
 v_tx:=(v_result->'transaction'->>'id')::uuid;
 if v_tx is null then raise exception 'SIGNIN_MAKEUP_MISSING_LEDGER_ID'; end if;
 insert into public.farm_v2_signin_days(user_id,cycle_number,cycle_day,is_makeup,reward_transaction_id)
 values(p_user_id,p_cycle_number,p_cycle_day,true,v_tx);
 return jsonb_build_object('status','claimed','isMakeup',true,'cycleDay',p_cycle_day,
  'crystals',v_amount,'transactionId',v_tx,'makeupCreditsRemaining',v_granted-v_used-1);
end; $$;
revoke all on function public.farm_v2_signin_makeup_crystal_day(text,integer,integer) from public,anon,authenticated;

-- ===== artifacts/api-server/docs/sql/farm-v2-signin-makeup-material.sql =====
-- Makeup for material-reward days only. Counts toward perfect attendance.
-- Credits are earned on days 3,6,...30; makeup must target a past day.
create or replace function public.farm_v2_signin_makeup_material_day(
 p_user_id text,p_cycle_number integer,p_cycle_day integer
) returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare
 v_cycle public.farm_v2_signin_cycles%rowtype;
 v_today date:=(now() at time zone 'Asia/Taipei' - interval '5 hours')::date;
 v_current integer;
 v_granted integer;
 v_used integer;
 v_material text;
 v_qty integer;
 v_state jsonb;
 v_materials jsonb;
 v_old integer;
begin
 v_material:=case when p_cycle_day in (6,16,24) then '九霄玉髓'
  when p_cycle_day in (2,11,21,29) then '蘊靈砂' else null end;
 v_qty:=case p_cycle_day when 2 then 1 when 6 then 1 when 11 then 2
  when 16 then 2 when 21 then 3 when 24 then 3 when 29 then 5 end;
 if v_material is null then return jsonb_build_object('status','unsupported_reward'); end if;
 select * into v_cycle from public.farm_v2_signin_cycles
  where user_id=p_user_id and cycle_number=p_cycle_number for update;
 if not found then return jsonb_build_object('status','cycle_not_found'); end if;
 v_current:=v_today-v_cycle.cycle_start_day+1;
 if v_current not between 1 and 30 then return jsonb_build_object('status','cycle_inactive'); end if;
 if p_cycle_day>=v_current then return jsonb_build_object('status','not_past_day'); end if;
 if exists(select 1 from public.farm_v2_signin_days where user_id=p_user_id
  and cycle_number=p_cycle_number and cycle_day=p_cycle_day) then
  return jsonb_build_object('status','already_signed'); end if;
 select count(*) into v_granted from public.farm_v2_signin_makeup_grants
  where user_id=p_user_id and cycle_number=p_cycle_number and grant_day<=v_current;
 select count(*) into v_used from public.farm_v2_signin_days
  where user_id=p_user_id and cycle_number=p_cycle_number and is_makeup;
 if v_used>=v_granted then return jsonb_build_object('status','no_makeup_credit'); end if;
 -- Prevent skipping an earlier missed date; signed earlier dates need not be made up.
 if exists(select 1 from pg_catalog.generate_series(1,p_cycle_day-1) as d
  where not exists(select 1 from public.farm_v2_signin_days s
   where s.user_id=p_user_id and s.cycle_number=p_cycle_number and s.cycle_day=d)) then
  return jsonb_build_object('status','earlier_day_missing'); end if;
 select warehouse_state into v_state from public.farm_v2_player_state where user_id=p_user_id for update;
 if not found then return jsonb_build_object('status','player_not_found'); end if;
 v_materials:=v_state#>'{workshop,materials}';
 if jsonb_typeof(v_materials)<>'object' or
  (v_materials ? v_material and jsonb_typeof(v_materials->v_material)<>'number') then
  return jsonb_build_object('status','invalid_inventory'); end if;
 v_old:=coalesce((v_materials->>v_material)::integer,0);
 if v_old<0 or v_old>2147483647-v_qty then return jsonb_build_object('status','invalid_inventory'); end if;
 update public.farm_v2_player_state
 set warehouse_state=jsonb_set(v_state,array['workshop','materials',v_material],to_jsonb(v_old+v_qty),true),
 updated_at=now() where user_id=p_user_id;
 insert into public.farm_v2_signin_days(user_id,cycle_number,cycle_day,is_makeup)
 values(p_user_id,p_cycle_number,p_cycle_day,true);
 return jsonb_build_object('status','claimed','isMakeup',true,'cycleDay',p_cycle_day,
  'item',v_material,'quantity',v_qty,'makeupCreditsRemaining',v_granted-v_used-1);
end; $$;
revoke all on function public.farm_v2_signin_makeup_material_day(text,integer,integer) from public,anon,authenticated;

-- ===== artifacts/api-server/docs/sql/farm-v2-signin-makeup-pot.sql =====
-- Atomic makeup of pot sign-in days; chronological, once per earned credit.
create or replace function public.farm_v2_signin_makeup_pot_day(
 p_user_id text,p_cycle_number integer,p_cycle_day integer
) returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare
 v_cycle public.farm_v2_signin_cycles%rowtype;
 v_today date:=(now() at time zone 'Asia/Taipei' - interval '5 hours')::date;
 v_current integer;
 v_granted integer;
 v_used integer;
 v_grade text;
 v_state jsonb;
 v_pots jsonb;
 v_id uuid:=gen_random_uuid();
 v_species integer;
 v_pot jsonb;
begin
 v_grade:=case p_cycle_day when 15 then '黃' when 20 then '玄' when 30 then '地' else null end;
 if v_grade is null then return jsonb_build_object('status','unsupported_reward'); end if;
 select * into v_cycle from public.farm_v2_signin_cycles
  where user_id=p_user_id and cycle_number=p_cycle_number for update;
 if not found then return jsonb_build_object('status','cycle_not_found'); end if;
 v_current:=v_today-v_cycle.cycle_start_day+1;
 if v_current not between 1 and 30 then return jsonb_build_object('status','cycle_inactive'); end if;
 if p_cycle_day>=v_current then return jsonb_build_object('status','not_past_day'); end if;
 if exists(select 1 from public.farm_v2_signin_days where user_id=p_user_id
  and cycle_number=p_cycle_number and cycle_day=p_cycle_day) then
  return jsonb_build_object('status','already_signed'); end if;
 select count(*) into v_granted from public.farm_v2_signin_makeup_grants
  where user_id=p_user_id and cycle_number=p_cycle_number and grant_day<=v_current;
 select count(*) into v_used from public.farm_v2_signin_days
  where user_id=p_user_id and cycle_number=p_cycle_number and is_makeup;
 if v_used>=v_granted then return jsonb_build_object('status','no_makeup_credit'); end if;
 if exists(select 1 from pg_catalog.generate_series(1,p_cycle_day-1) as d
  where not exists(select 1 from public.farm_v2_signin_days s
   where s.user_id=p_user_id and s.cycle_number=p_cycle_number and s.cycle_day=d)) then
  return jsonb_build_object('status','earlier_day_missing'); end if;
 select warehouse_state into v_state from public.farm_v2_player_state where user_id=p_user_id for update;
 if not found then return jsonb_build_object('status','player_not_found'); end if;
 v_pots:=v_state #> '{workshop,pots}';
 if jsonb_typeof(v_pots)<>'array' then return jsonb_build_object('status','invalid_workshop'); end if;
 v_species:=1+floor(random()*6)::integer;
 v_pot:=jsonb_build_object('id',v_id,'grade',v_grade,'species',v_species,
   'displayed',false,'acquiredAt',floor(extract(epoch from clock_timestamp())*1000)::bigint);
 update public.farm_v2_player_state
 set warehouse_state=jsonb_set(v_state,'{workshop,pots}',v_pots||jsonb_build_array(v_pot),false),
 updated_at=now() where user_id=p_user_id;
 insert into public.farm_v2_signin_days(user_id,cycle_number,cycle_day,is_makeup,reward_transaction_id)
 values(p_user_id,p_cycle_number,p_cycle_day,true,v_id);
 return jsonb_build_object('status','claimed','isMakeup',true,'cycleDay',p_cycle_day,'pot',v_pot,'makeupCreditsRemaining',v_granted-v_used-1);
end; $$;
revoke all on function public.farm_v2_signin_makeup_pot_day(text,integer,integer) from public,anon,authenticated;

-- ===== artifacts/api-server/docs/sql/farm-v2-signin-makeup-consumables.sql =====
-- Atomic makeup issuance for all eleven functional-item sign-in days.
create or replace function public.farm_v2_signin_makeup_consumable_day(
 p_user_id text,p_cycle_number integer,p_cycle_day integer
) returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare
 v_cycle public.farm_v2_signin_cycles%rowtype;
 v_current integer;
 v_granted integer;
 v_used integer;
 v_item text;
 v_qty integer;
 v_receipt uuid;
begin
 v_item:=case when p_cycle_day in (3,13) then 'instant_harvest'
 when p_cycle_day in (5,14,23) then 'double_harvest'
 when p_cycle_day in (8,18,28) then 'farm_protection_1h'
 when p_cycle_day=9 then 'yellow_upgrade'
 when p_cycle_day in (19,26) then 'mystic_upgrade' end;
 v_qty:=case p_cycle_day when 3 then 1 when 5 then 1 when 8 then 2 when 9 then 1
 when 13 then 2 when 14 then 2 when 18 then 3 when 19 then 1 when 23 then 3
 when 26 then 1 when 28 then 5 end;
 if v_item is null then return jsonb_build_object('status','unsupported_reward'); end if;
 select * into v_cycle from public.farm_v2_signin_cycles
 where user_id=p_user_id and cycle_number=p_cycle_number for update;
 if not found then return jsonb_build_object('status','cycle_not_found'); end if;
 v_current:=(now() at time zone 'Asia/Taipei' - interval '5 hours')::date-v_cycle.cycle_start_day+1;
 if v_current not between 1 and 30 then return jsonb_build_object('status','cycle_inactive'); end if;
 if p_cycle_day>=v_current then return jsonb_build_object('status','not_past_day'); end if;
 if exists(select 1 from public.farm_v2_signin_days where user_id=p_user_id
 and cycle_number=p_cycle_number and cycle_day=p_cycle_day)
 then return jsonb_build_object('status','already_signed'); end if;
 select count(*) into v_granted from public.farm_v2_signin_makeup_grants
 where user_id=p_user_id and cycle_number=p_cycle_number and grant_day<=v_current;
 select count(*) into v_used from public.farm_v2_signin_days
 where user_id=p_user_id and cycle_number=p_cycle_number and is_makeup;
 if v_used>=v_granted then return jsonb_build_object('status','no_makeup_credit'); end if;
 if exists(select 1 from pg_catalog.generate_series(1,p_cycle_day-1) d
 where not exists(select 1 from public.farm_v2_signin_days s
 where s.user_id=p_user_id and s.cycle_number=p_cycle_number and s.cycle_day=d))
 then return jsonb_build_object('status','earlier_day_missing'); end if;
 if not exists(select 1 from public.farm_v2_player_state where user_id=p_user_id)
 then return jsonb_build_object('status','player_not_found'); end if;
 insert into public.farm_v2_consumable_balances(user_id,item_id,quantity)
 values(p_user_id,v_item,0) on conflict do nothing;
 update public.farm_v2_consumable_balances set quantity=quantity+v_qty,updated_at=now()
 where user_id=p_user_id and item_id=v_item and quantity<=2147483647-v_qty;
 if not found then return jsonb_build_object('status','inventory_overflow'); end if;
 insert into public.farm_v2_consumable_ledger(user_id,item_id,quantity,source_type,source_key)
 values(p_user_id,v_item,v_qty,'signin_makeup',p_cycle_number::text||':'||p_cycle_day)
 returning id into v_receipt;
 insert into public.farm_v2_signin_days(user_id,cycle_number,cycle_day,is_makeup,reward_transaction_id)
 values(p_user_id,p_cycle_number,p_cycle_day,true,v_receipt);
 return jsonb_build_object('status','claimed','isMakeup',true,'cycleDay',p_cycle_day,
 'item',v_item,'quantity',v_qty,'transactionId',v_receipt,
 'makeupCreditsRemaining',v_granted-v_used-1);
end; $$;
revoke all on function public.farm_v2_signin_makeup_consumable_day(text,integer,integer)
 from public,anon,authenticated;

-- Replace dispatcher in the same migration so all eleven item days are reachable.
create or replace function public.farm_v2_signin_makeup_day(
 p_user_id text,p_cycle_number integer,p_cycle_day integer
) returns jsonb language plpgsql volatile security invoker set search_path='' as $$
begin
 if p_cycle_day in (1,4,7,12,17,22,27) then
  return public.farm_v2_signin_makeup_coin_day(p_user_id,p_cycle_number,p_cycle_day);
 elsif p_cycle_day in (2,6,11,16,21,24,29) then
  return public.farm_v2_signin_makeup_material_day(p_user_id,p_cycle_number,p_cycle_day);
 elsif p_cycle_day in (10,25) then
  return public.farm_v2_signin_makeup_crystal_day(p_user_id,p_cycle_number,p_cycle_day);
 elsif p_cycle_day in (15,20,30) then
  return public.farm_v2_signin_makeup_pot_day(p_user_id,p_cycle_number,p_cycle_day);
 elsif p_cycle_day in (3,5,8,9,13,14,18,19,23,26,28) then
  return public.farm_v2_signin_makeup_consumable_day(p_user_id,p_cycle_number,p_cycle_day);
 else return jsonb_build_object('status','unsupported_reward','cycleDay',p_cycle_day);
 end if;
end; $$;
revoke all on function public.farm_v2_signin_makeup_day(text,integer,integer)
 from public,anon,authenticated;

-- ===== artifacts/api-server/docs/sql/farm-v2-signin-claim-dispatch.sql =====
-- Single server-side sign-in claim entrypoint for all 30 reward days.
-- Consumables are issued to server-owned balances, not yet usable in game.
create or replace function public.farm_v2_signin_claim_day(
 p_user_id text,p_cycle_number integer,p_cycle_day integer
) returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare
 v_result jsonb;
begin
 if p_cycle_day in (1,4,7,12,17,22,27) then
   v_result:=public.farm_v2_signin_claim_coin_day(p_user_id,p_cycle_number,p_cycle_day);
 elsif p_cycle_day in (2,6,11,16,21,24,29) then
   v_result:=public.farm_v2_signin_claim_material_day(p_user_id,p_cycle_number,p_cycle_day);
 elsif p_cycle_day in (10,25) then
   v_result:=public.farm_v2_signin_claim_crystal_day(p_user_id,p_cycle_number,p_cycle_day);
 elsif p_cycle_day in (15,20,30) then
   v_result:=public.farm_v2_signin_claim_pot_day(p_user_id,p_cycle_number,p_cycle_day);
 elsif p_cycle_day in (3,5,8,9,13,14,18,19,23,26,28) then
   v_result:=public.farm_v2_signin_claim_consumable_day(p_user_id,p_cycle_number,p_cycle_day);
 else
   return jsonb_build_object('status','unsupported_reward','cycleDay',p_cycle_day);
 end if;
 return v_result;
end; $$;
revoke all on function public.farm_v2_signin_claim_day(text,integer,integer) from public,anon,authenticated;

-- ===== artifacts/api-server/docs/sql/farm-v2-signin-makeup-dispatch.sql =====
-- One trusted makeup entrypoint for all 30 days; day 30 cannot be made up within the same cycle.
create or replace function public.farm_v2_signin_makeup_day(
 p_user_id text,p_cycle_number integer,p_cycle_day integer
) returns jsonb language plpgsql volatile security invoker set search_path='' as $$
begin
 if p_cycle_day in (1,4,7,12,17,22,27) then
  return public.farm_v2_signin_makeup_coin_day(p_user_id,p_cycle_number,p_cycle_day);
 elsif p_cycle_day in (2,6,11,16,21,24,29) then
  return public.farm_v2_signin_makeup_material_day(p_user_id,p_cycle_number,p_cycle_day);
 elsif p_cycle_day in (10,25) then
  return public.farm_v2_signin_makeup_crystal_day(p_user_id,p_cycle_number,p_cycle_day);
 elsif p_cycle_day in (15,20,30) then
  return public.farm_v2_signin_makeup_pot_day(p_user_id,p_cycle_number,p_cycle_day);
 elsif p_cycle_day in (3,5,8,9,13,14,18,19,23,26,28) then
  return public.farm_v2_signin_makeup_consumable_day(p_user_id,p_cycle_number,p_cycle_day);
 else
  return jsonb_build_object('status','unsupported_reward','cycleDay',p_cycle_day);
 end if;
end; $$;
revoke all on function public.farm_v2_signin_makeup_day(text,integer,integer) from public,anon,authenticated;

-- ===== artifacts/api-server/docs/sql/farm-v2-signin-initialize.sql =====
-- Initialize a player's first 30-day attendance cycle once, and grant earned
-- makeup credits based on the current Taipei day. No prizes are issued here.
create or replace function public.farm_v2_signin_initialize(
  p_user_id text
) returns jsonb
language plpgsql volatile security invoker
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Taipei' - interval '5 hours')::date;
  v_cycle public.farm_v2_signin_cycles%rowtype;
  v_day integer;
  v_grants integer;
begin
  if p_user_id is null or length(p_user_id) < 1 or length(p_user_id) > 256 then
    return jsonb_build_object('status','invalid_user');
  end if;
  -- A verified farm player is required. Caller must additionally authenticate
  -- p_user_id using the platform's server-side session before invoking this RPC.
  perform 1 from public.farm_v2_player_state where user_id=p_user_id;
  if not found then return jsonb_build_object('status','player_not_found'); end if;

  -- Serializes concurrent initialization for the same farm player.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('farm_v2_signin:'||p_user_id,0));
  select * into v_cycle from public.farm_v2_signin_cycles
    where user_id=p_user_id order by cycle_number desc limit 1 for update;
  if not found then
    insert into public.farm_v2_signin_cycles(user_id,cycle_number,cycle_start_day)
    values(p_user_id,1,v_today) returning * into v_cycle;
  elsif v_today >= v_cycle.cycle_start_day + 30 then
    -- Never backfill, silently claim or overwrite a prior cycle.
    insert into public.farm_v2_signin_cycles(user_id,cycle_number,cycle_start_day)
    values(p_user_id,v_cycle.cycle_number+1,v_today) returning * into v_cycle;
  end if;
  v_day := greatest(0,least(30,v_today-v_cycle.cycle_start_day+1));
  insert into public.farm_v2_signin_makeup_grants(user_id,cycle_number,grant_day)
    select p_user_id,v_cycle.cycle_number,d
      from pg_catalog.generate_series(3,30,3) as d
     where d <= v_day
    on conflict do nothing;
  select count(*)::integer into v_grants from public.farm_v2_signin_makeup_grants
    where user_id=p_user_id and cycle_number=v_cycle.cycle_number;
  return jsonb_build_object('status','ready','cycleNumber',v_cycle.cycle_number,
    'cycleDay',v_day,'makeupCreditsGranted',v_grants);
end;
$$;
revoke all on function public.farm_v2_signin_initialize(text) from public,anon,authenticated;

-- ===== artifacts/api-server/docs/sql/farm-v2-signin-summary.sql =====
-- Transactional sign-in cycle state reader. Does not create cycles or issue rewards.
-- Uses the persisted cycle start date, never the calendar month or client day.
create or replace function public.farm_v2_signin_cycle_summary(
  p_user_id text,
  p_cycle_number integer
) returns jsonb
language plpgsql stable security invoker
set search_path = ''
as $$
declare
  v_cycle public.farm_v2_signin_cycles%rowtype;
  v_today date := (now() at time zone 'Asia/Taipei' - interval '5 hours')::date;
  v_day integer;
  v_signed integer[];
  v_makeup integer[];
  v_earned integer;
  v_used integer;
begin
  select * into v_cycle from public.farm_v2_signin_cycles
  where user_id=p_user_id and cycle_number=p_cycle_number;
  if not found then return jsonb_build_object('status','cycle_not_found'); end if;
  v_day := greatest(0, least(30, v_today-v_cycle.cycle_start_day+1));
  select coalesce(array_agg(cycle_day order by cycle_day),'{}'::integer[]),
         coalesce(array_agg(cycle_day order by cycle_day) filter(where is_makeup),'{}'::integer[]),
         count(*) filter(where is_makeup)::integer
    into v_signed,v_makeup,v_used
    from public.farm_v2_signin_days
   where user_id=p_user_id and cycle_number=p_cycle_number;
  select count(*)::integer into v_earned
    from public.farm_v2_signin_makeup_grants
   where user_id=p_user_id and cycle_number=p_cycle_number;
  return jsonb_build_object(
    'status','ready','cycleNumber',p_cycle_number,'cycleDay',v_day,
    'signedDays',to_jsonb(v_signed),'makeupDays',to_jsonb(v_makeup),
    'makeupCreditsAvailable',greatest(0,v_earned-v_used),
    'perfectAttendanceReady',(coalesce(array_length(v_signed,1),0)=30 and v_cycle.perfect_reward_claimed_at is null),
    'perfectAttendanceClaimed',(v_cycle.perfect_reward_claimed_at is not null)
  );
end;
$$;
revoke all on function public.farm_v2_signin_cycle_summary(text,integer) from public,anon,authenticated;

-- ===== artifacts/api-server/docs/sql/farm-v2-signin-cycle-boundary.sql =====
-- Explicit cycle boundary: day 30 is claimable normally on day 30;
-- makeup applies only to earlier missed days and closes when day 30 ends.
create or replace function public.farm_v2_signin_cycle_summary(
 p_user_id text,p_cycle_number integer
) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare
 v_cycle public.farm_v2_signin_cycles%rowtype;
 v_today date:=(now() at time zone 'Asia/Taipei' - interval '5 hours')::date;
 v_raw_day integer;
 v_day integer;
 v_signed integer[];
 v_makeup integer[];
 v_earned integer;
 v_used integer;
 v_missing integer[];
begin
 select * into v_cycle from public.farm_v2_signin_cycles
 where user_id=p_user_id and cycle_number=p_cycle_number;
 if not found then return jsonb_build_object('status','cycle_not_found'); end if;
 v_raw_day:=v_today-v_cycle.cycle_start_day+1;
 v_day:=greatest(0,least(30,v_raw_day));
 select coalesce(array_agg(cycle_day order by cycle_day),'{}'::integer[]),
        coalesce(array_agg(cycle_day order by cycle_day) filter(where is_makeup),'{}'::integer[]),
        count(*) filter(where is_makeup)::integer
 into v_signed,v_makeup,v_used
 from public.farm_v2_signin_days where user_id=p_user_id and cycle_number=p_cycle_number;
 select count(*)::integer into v_earned from public.farm_v2_signin_makeup_grants
 where user_id=p_user_id and cycle_number=p_cycle_number;
 select coalesce(array_agg(d order by d),'{}'::integer[]) into v_missing
 from pg_catalog.generate_series(1,30) d where not(d=any(v_signed));
 return jsonb_build_object(
 'status',case when v_raw_day<1 then 'not_started' when v_raw_day>30 then 'closed' else 'ready' end,
 'cycleNumber',p_cycle_number,'cycleDay',v_day,'cycleClosed',v_raw_day>30,
 'signedDays',to_jsonb(v_signed),'makeupDays',to_jsonb(v_makeup),
 'missingDays',to_jsonb(v_missing),
 'makeupCreditsAvailable',case when v_raw_day between 1 and 30 then greatest(0,v_earned-v_used) else 0 end,
 'makeupEligibleDays',case when v_raw_day between 2 and 30 then
 (select coalesce(to_jsonb(array_agg(d order by d)),'[]'::jsonb)
 from pg_catalog.generate_series(1,v_raw_day-1) d where d=any(v_missing))
 else '[]'::jsonb end,
 'perfectAttendanceReady',(coalesce(array_length(v_signed,1),0)=30 and v_cycle.perfect_reward_claimed_at is null),
 'perfectAttendanceClaimed',(v_cycle.perfect_reward_claimed_at is not null));
end; $$;
revoke all on function public.farm_v2_signin_cycle_summary(text,integer) from public,anon,authenticated;

-- ===== artifacts/api-server/docs/sql/farm-v2-signin-status.sql =====
-- A single, authoritative sign-in status endpoint for the authenticated server.
-- Does not mutate attendance, grant prizes, or trust client-supplied balances.
create or replace function public.farm_v2_signin_status(p_user_id text)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare
 v_cycle public.farm_v2_signin_cycles%rowtype;
 v_summary jsonb;
 v_today date:=(now() at time zone 'Asia/Taipei' - interval '5 hours')::date;
 v_current integer;
 v_claimable integer[];
 v_makeup integer[];
 v_next_makeup integer;
 v_credits integer;
begin
 select * into v_cycle from public.farm_v2_signin_cycles
 where user_id=p_user_id order by cycle_number desc limit 1;
 if not found then return jsonb_build_object('status','not_initialized'); end if;
 v_summary:=public.farm_v2_signin_cycle_summary(p_user_id,v_cycle.cycle_number);
 v_current:=v_today-v_cycle.cycle_start_day+1;
 select coalesce(array_agg(d order by d),'{}'::integer[]) into v_claimable
 from pg_catalog.generate_series(1,30) d
 where d=v_current and not(d in
 (select cycle_day from public.farm_v2_signin_days where user_id=p_user_id and cycle_number=v_cycle.cycle_number));
 select coalesce(array_agg(d order by d),'{}'::integer[]) into v_makeup
 from pg_catalog.generate_series(1,30) d
 where d<v_current and v_current between 2 and 30
 and not exists(select 1 from public.farm_v2_signin_days s
 where s.user_id=p_user_id and s.cycle_number=v_cycle.cycle_number and s.cycle_day=d);
 v_credits:=coalesce((v_summary->>'makeupCreditsAvailable')::integer,0);
 select min(d) into v_next_makeup from pg_catalog.generate_series(1,30) d
 where d<v_current and v_current between 2 and 30
 and not exists(select 1 from public.farm_v2_signin_days s
 where s.user_id=p_user_id and s.cycle_number=v_cycle.cycle_number and s.cycle_day=d);
 return v_summary || jsonb_build_object(
 'todayClaimable',coalesce(array_length(v_claimable,1),0)>0,
 'todayClaimDay',case when v_current between 1 and 30 and coalesce(array_length(v_claimable,1),0)>0 then v_current else null end,
 'makeupCandidates',to_jsonb(v_makeup),
 'nextMakeupDay',case when v_credits>0 then v_next_makeup else null end,
 'makeupClaimable',v_credits>0 and v_next_makeup is not null,
 'nextMakeupRewardSupported',v_next_makeup between 1 and 29,
 'supportedRewardDays',to_jsonb(array(select d from pg_catalog.generate_series(1,30) d)),
 'pendingItemRewardDays','[]'::jsonb);
end; $$;
revoke all on function public.farm_v2_signin_status(text) from public,anon,authenticated;

-- ===== artifacts/api-server/docs/sql/farm-v2-signin-pending-perfect.sql =====
-- Select an already-completed, unclaimed attendance cycle for perfect award.
-- Prevents losing the award when day 31 initializes the next cycle.
-- The trusted server uses this only for the perfect-award action.
create or replace function public.farm_v2_signin_pending_perfect_cycle(p_user_id text)
returns integer language sql stable security invoker set search_path='' as $$
 select c.cycle_number from public.farm_v2_signin_cycles c
 where c.user_id=p_user_id and c.perfect_reward_claimed_at is null
 and (select count(*) from public.farm_v2_signin_days d
      where d.user_id=c.user_id and d.cycle_number=c.cycle_number)=30
 order by c.cycle_number asc limit 1;
$$;
revoke all on function public.farm_v2_signin_pending_perfect_cycle(text)
 from public,anon,authenticated;

-- ===== artifacts/api-server/docs/sql/farm-v2-signin-perfect-attendance.sql =====
-- Perfect-attendance award: one badge, 3 crystals, 200 coins,
-- 2 spirit sand, 2 jade marrow. One atomic transaction per cycle.
create table if not exists public.farm_v2_signin_perfect_badges(
 user_id text not null,cycle_number integer not null,
 awarded_at timestamptz not null default now(),
 primary key(user_id,cycle_number),
 foreign key(user_id,cycle_number) references public.farm_v2_signin_cycles(user_id,cycle_number)
);
alter table public.farm_v2_signin_perfect_badges enable row level security;
revoke all on public.farm_v2_signin_perfect_badges from public,anon,authenticated;
create or replace function public.farm_v2_signin_claim_perfect(
 p_user_id text,p_cycle_number integer
) returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare
 v_cycle public.farm_v2_signin_cycles%rowtype;
 v_owner uuid;
 v_count integer;
 v_state jsonb;
 v_materials jsonb;
 v_sand integer;
 v_jade integer;
 v_coin jsonb;
 v_crystal jsonb;
begin
 select * into v_cycle from public.farm_v2_signin_cycles
 where user_id=p_user_id and cycle_number=p_cycle_number for update;
 if not found then return jsonb_build_object('status','cycle_not_found'); end if;
 if v_cycle.perfect_reward_claimed_at is not null then
  return jsonb_build_object('status','already_claimed'); end if;
 select count(*) into v_count from public.farm_v2_signin_days
 where user_id=p_user_id and cycle_number=p_cycle_number;
 if v_count<>30 then return jsonb_build_object('status','incomplete','signedDays',v_count); end if;
 v_owner:=public.farm_v2_resolve_verified_wallet_owner(p_user_id);
 if v_owner is null then return jsonb_build_object('status','unverified_identity'); end if;
 select warehouse_state into v_state from public.farm_v2_player_state where user_id=p_user_id for update;
 if not found then return jsonb_build_object('status','player_not_found'); end if;
 v_materials:=v_state#>'{workshop,materials}';
 if jsonb_typeof(v_materials)<>'object'
 or (v_materials ? '蘊靈砂' and jsonb_typeof(v_materials->'蘊靈砂')<>'number')
 or (v_materials ? '九霄玉髓' and jsonb_typeof(v_materials->'九霄玉髓')<>'number')
 then return jsonb_build_object('status','invalid_inventory'); end if;
 v_sand:=coalesce((v_materials->>'蘊靈砂')::integer,0);
 v_jade:=coalesce((v_materials->>'九霄玉髓')::integer,0);
 if v_sand<0 or v_jade<0 or v_sand>2147483645 or v_jade>2147483645
 then return jsonb_build_object('status','invalid_inventory'); end if;
 v_coin:=public.core_wallet_apply_transaction(v_owner,200,'coin','credit',
 'farm-v2:signin:perfect:'||p_user_id||':'||p_cycle_number||':coin',
 'farm_v2_signin_perfect',p_cycle_number::text,'farm_v2_signin',null);
 if v_coin->>'result_status' not in ('created','duplicate')
 or nullif(v_coin#>>'{transaction,id}','') is null then
  raise exception 'PERFECT_COIN_LEDGER_FAILED'; end if;
 v_crystal:=public.core_wallet_apply_transaction(v_owner,3,'crystal','credit',
 'farm-v2:signin:perfect:'||p_user_id||':'||p_cycle_number||':crystal',
 'farm_v2_signin_perfect',p_cycle_number::text,'farm_v2_signin',null);
 if v_crystal->>'result_status' not in ('created','duplicate')
 or nullif(v_crystal#>>'{transaction,id}','') is null then
  raise exception 'PERFECT_CRYSTAL_LEDGER_FAILED'; end if;
 update public.farm_v2_player_state set warehouse_state=
 jsonb_set(jsonb_set(v_state,'{workshop,materials,蘊靈砂}',to_jsonb(v_sand+2),true),
 '{workshop,materials,九霄玉髓}',to_jsonb(v_jade+2),true),updated_at=now()
 where user_id=p_user_id;
 insert into public.farm_v2_signin_perfect_badges(user_id,cycle_number)
 values(p_user_id,p_cycle_number);
 update public.farm_v2_signin_cycles set perfect_reward_claimed_at=now()
 where user_id=p_user_id and cycle_number=p_cycle_number;
 return jsonb_build_object('status','claimed','badge',1,'coins',200,'crystals',3,
 '蘊靈砂',2,'九霄玉髓',2);
end; $$;
revoke all on function public.farm_v2_signin_claim_perfect(text,integer) from public,anon,authenticated;



-- The runtime receives this one capability, never raw wallet execution or identity-table access.
CREATE FUNCTION farm_v2_rewards.signin(p_user_id text,p_action text,p_cycle_day integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_current jsonb; v_result jsonb; v_cycle integer; v_pending integer;
BEGIN
 IF p_action IS NULL OR p_action NOT IN ('status','claim','makeup','perfect') THEN
  RETURN jsonb_build_object('status','unknown_action');
 END IF;
 IF p_action='makeup' AND (p_cycle_day IS NULL OR p_cycle_day NOT BETWEEN 1 AND 30) THEN
  RETURN jsonb_build_object('status','invalid_cycle_day');
 END IF;
 IF p_action<>'makeup' AND p_cycle_day IS NOT NULL THEN
  RETURN jsonb_build_object('status','invalid_cycle_day');
 END IF;
 IF public.farm_v2_resolve_verified_wallet_owner(p_user_id) IS NULL THEN
  RETURN jsonb_build_object('status','unverified_identity');
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('farm_v2_signin:'||p_user_id,0));
 v_current:=public.farm_v2_signin_initialize(p_user_id);
 IF v_current->>'status'<>'ready' THEN RETURN v_current; END IF;
 v_cycle:=(v_current->>'cycleNumber')::integer;
 IF p_action='status' THEN
  v_pending:=public.farm_v2_signin_pending_perfect_cycle(p_user_id);
  RETURN public.farm_v2_signin_status(p_user_id)||jsonb_build_object(
   'pendingPerfectCycle',v_pending,'perfectAttendanceReady',v_pending IS NOT NULL);
 ELSIF p_action='claim' THEN
  RETURN public.farm_v2_signin_claim_day(p_user_id,v_cycle,(v_current->>'cycleDay')::integer);
 ELSIF p_action='makeup' THEN
  RETURN public.farm_v2_signin_makeup_day(p_user_id,v_cycle,p_cycle_day);
 END IF;
 v_pending:=public.farm_v2_signin_pending_perfect_cycle(p_user_id);
 IF v_pending IS NULL THEN RETURN jsonb_build_object('status','incomplete'); END IF;
 RETURN public.farm_v2_signin_claim_perfect(p_user_id,v_pending);
END; $$;
REVOKE ALL ON FUNCTION farm_v2_rewards.signin(text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA farm_v2_rewards TO farm_v2_runtime;
GRANT EXECUTE ON FUNCTION farm_v2_rewards.signin(text,text,integer) TO farm_v2_runtime;

-- Replacing functions preserves old ACLs: explicitly remove any earlier runtime bypass.
DO $acl$
DECLARE f record; t text;
BEGIN
 FOR f IN SELECT p.oid FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname LIKE 'farm_v2_signin_%'
 LOOP EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %s FROM farm_v2_runtime',f.oid::regprocedure); END LOOP;
 FOREACH t IN ARRAY ARRAY['farm_v2_signin_cycles','farm_v2_signin_days','farm_v2_signin_makeup_grants','farm_v2_signin_perfect_badges','farm_v2_consumable_balances','farm_v2_consumable_ledger']
 LOOP EXECUTE pg_catalog.format('REVOKE ALL ON TABLE public.%I FROM farm_v2_runtime',t); END LOOP;
END $acl$;

COMMIT;

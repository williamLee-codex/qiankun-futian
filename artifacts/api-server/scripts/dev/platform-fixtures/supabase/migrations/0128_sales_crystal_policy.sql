-- Platform-wide crystal policy (2026-11-24):
--   Paid and free crystals are account-bound. They may never be cashed out, gifted,
--   abandoned, sold, exchanged, pledged, lent, moved to another account, or otherwise
--   transferred. Only the owning account may spend them inside the platform.
--
-- This migration
--   1. stops issuing crystals for referral rewards (coins only, amount from settings),
--   2. re-issues the member overview with the coin referral total,
--   3. installs a ledger-level guard that rejects any crystal transfer attempt.
--
-- It never rewrites balances: no existing wallet row, ledger row, or reward row is
-- updated or deleted.
--
-- Legal refunds, legitimate transaction reversals, and system compensation are not
-- user transfers. They keep flowing through the existing single-owner wallet runtime
-- and stay fully audited.

begin;

-- 1. Referral rewards pay coins only ------------------------------------------------
alter table sales.referral_rewards
  add column if not exists coins integer not null default 0;

-- Rows written before this migration may carry crystals; new rows must not.
alter table sales.referral_rewards
  alter column crystals set default 0;

-- 0126 required crystals > 0 for every reward row; coins replace crystals.
alter table sales.referral_rewards
  drop constraint if exists referral_rewards_crystals_check;

do $ddl$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sales_referral_rewards_no_crystals'
      and conrelid = 'sales.referral_rewards'::regclass
  ) then
    alter table sales.referral_rewards
      add constraint sales_referral_rewards_no_crystals check (crystals = 0) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'sales_referral_rewards_coins_non_negative'
      and conrelid = 'sales.referral_rewards'::regclass
  ) then
    alter table sales.referral_rewards
      add constraint sales_referral_rewards_coins_non_negative check (coins >= 0);
  end if;
end
$ddl$;

drop function if exists sales.grant_referral_reward(uuid, integer);

-- Coin amount comes from the active settings version (`referralRewardCoins`).
-- Zero means "no reward configured": nothing is written, so a later configuration
-- can still grant it once.
create or replace function sales.grant_referral_reward(
  p_application_id uuid, p_coins integer default null
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, sales, public, pg_temp as $fn$
declare
  v_app record;
  v_invitee record;
  v_inviter record;
  v_coins integer;
begin
  select coalesce(
    p_coins,
    (select nullif(config->>'referralRewardCoins', '')::integer
       from sales.commission_settings where is_active
      order by effective_at desc limit 1),
    0
  ) into v_coins;
  if v_coins is null or v_coins <= 0 then
    return jsonb_build_object('status', 'skipped', 'reason', 'no_reward_configured');
  end if;

  select id, member_id, status into v_app from sales.applications where id = p_application_id;
  if not found or v_app.status <> 'approved' then
    return jsonb_build_object('status', 'skipped', 'reason', 'not_approved');
  end if;

  if exists (select 1 from sales.referral_rewards where application_id = p_application_id) then
    return jsonb_build_object('status', 'skipped', 'reason', 'already_rewarded');
  end if;

  select id, member_id, introducer_business_id into v_invitee
    from sales.business_members where application_id = p_application_id;
  if not found or v_invitee.introducer_business_id is null then
    return jsonb_build_object('status', 'skipped', 'reason', 'no_introducer');
  end if;

  select id, member_id into v_inviter
    from sales.business_members where id = v_invitee.introducer_business_id;
  if not found or v_inviter.id = v_invitee.id then
    return jsonb_build_object('status', 'skipped', 'reason', 'self_referral');
  end if;

  insert into sales.referral_rewards
    (application_id, invitee_business_id, inviter_business_id, crystals, coins)
  values (p_application_id, v_invitee.id, v_inviter.id, 0, v_coins);

  perform public.core_wallet_apply_transaction(
    p_owner_id := v_inviter.member_id,
    p_amount := v_coins,
    p_currency := 'coin',
    p_direction := 'credit',
    p_idempotency_key := 'sales-referral-reward:' || p_application_id::text,
    p_reason := 'sales_referral_reward',
    p_reference_id := p_application_id::text,
    p_reference_type := 'sales_referral_reward',
    p_reversal_of := null
  );

  return jsonb_build_object('status', 'granted', 'coins', v_coins,
    'inviterBusinessId', v_inviter.id);
end;
$fn$;

grant execute on function sales.grant_referral_reward(uuid, integer) to service_role;

-- 2. Member overview: referral totals are coins --------------------------------------
create or replace function sales.member_overview()
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, sales, pg_temp as $fn$
declare
  v_uid uuid := auth.uid();
  v_app sales.applications%rowtype;
  v_biz sales.business_members%rowtype;
  v_att sales.attributions%rowtype;
  v_pub sales.daily_publications%rowtype;
begin
  if v_uid is null then
    raise exception 'SALES_NOT_AUTHENTICATED';
  end if;
  select * into v_app from sales.applications where member_id = v_uid;
  select * into v_biz from sales.business_members where member_id = v_uid;
  if v_app.id is not null then
    select * into v_att from sales.attributions where application_id = v_app.id;
  end if;
  select * into v_pub from sales.daily_publications order by business_day desc limit 1;
  return jsonb_build_object(
    'application', case when v_app.id is null then null else jsonb_build_object(
      'id', v_app.id, 'status', v_app.status, 'submittedAt', v_app.submitted_at,
      'reviewedAt', v_app.reviewed_at, 'approvedAt', v_app.approved_at,
      'decisionReason', v_app.decision_reason) end,
    'member', case when v_biz.id is null then null else jsonb_build_object(
      'businessId', v_biz.id, 'code', v_biz.business_code, 'level', v_biz.level,
      'status', v_biz.status, 'approvedAt', v_biz.approved_at,
      'cashRebateEnabled', v_biz.cash_rebate_enabled,
      'referralRewardCoins', coalesce((select sum(r.coins) from sales.referral_rewards r
                                        where r.inviter_business_id = v_biz.id), 0),
      'introducerBusinessId', v_biz.introducer_business_id,
      'introducerCode', (select b.business_code from sales.business_members b
                          where b.id = v_biz.introducer_business_id)) end,
    'attribution', case when v_att.application_id is null then null else jsonb_build_object(
      'status', v_att.status, 'deadlineAt', v_att.deadline_at,
      'confirmedAt', v_att.confirmed_at, 'effectiveAt', v_att.effective_at,
      'introducerCode', (select b.business_code from sales.business_members b
                          where b.id = v_att.introducer_business_id)) end,
    'publication', case when v_pub.business_day is null then null else jsonb_build_object(
      'businessDay', v_pub.business_day, 'publishedAt', v_pub.published_at) end,
    'today', (now() at time zone 'Asia/Taipei')::date
  );
end;
$fn$;

do $grants$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function sales.member_overview() to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function sales.member_overview() to service_role';
  end if;
end;
$grants$;

-- 3. Ledger-level crystal policy guard ----------------------------------------------
-- Crystal value is account-bound by construction: public.core_wallet_apply_transaction
-- only ever touches a single owner. The guard below makes the policy explicit and
-- rejects the remaining circumvention paths: a ledger row written against someone
-- else's wallet, a reversal that points at another account's entry, and any crystal
-- entry whose reason describes a transfer, gift, sale, exchange, pledge, or cash-out.
create or replace function public.core_crystal_policy_guard()
returns trigger language plpgsql
set search_path = pg_catalog, public, pg_temp as $fn$
declare
  v_forbidden constant text[] := array[
    'transfer', 'transferred', 'gift', 'gifted', 'cashout',
    'resale', 'exchange', 'loan', 'collateral', 'handover'
  ];
  v_wallet_owner uuid;
  v_tokens text[];
begin
  select w.owner_id into v_wallet_owner from public.core_wallets w where w.id = new.wallet_id;
  if v_wallet_owner is null then
    raise exception 'WALLET_NOT_FOUND';
  end if;
  if v_wallet_owner <> new.owner_id then
    raise exception 'WALLET_OWNER_MISMATCH';
  end if;

  if new.reversal_of is not null then
    if exists (
      select 1 from public.core_wallet_ledger l
       where l.id = new.reversal_of
         and (l.owner_id <> new.owner_id or l.currency <> new.currency)
    ) then
      raise exception 'WALLET_REVERSAL_CROSS_ACCOUNT';
    end if;
  end if;

  if new.currency = 'crystal' then
    v_tokens := regexp_split_to_array(
      lower(coalesce(new.reason, '') || ' ' || coalesce(new.reference_type, '')),
      '[^a-z]+'
    );
    if v_tokens && v_forbidden then
      raise exception 'CRYSTAL_TRANSFER_FORBIDDEN';
    end if;
    -- Punctuation-stripped comparison catches cash_out, cash-out, cashOut, and similar.
    if regexp_replace(lower(coalesce(new.reason, '')), '[^a-z0-9]', '', 'g')
         ~ '(transfer|gift|cashout|resale|exchange|collateral|handover)'
       or regexp_replace(lower(coalesce(new.reference_type, '')), '[^a-z0-9]', '', 'g')
         ~ '(transfer|gift|cashout|resale|exchange|collateral|handover)' then
      raise exception 'CRYSTAL_TRANSFER_FORBIDDEN';
    end if;
  end if;

  return new;
end;
$fn$;

do $guard$
begin
  if to_regclass('public.core_wallet_ledger') is not null then
    execute 'drop trigger if exists core_wallet_ledger_crystal_policy on public.core_wallet_ledger';
    execute 'create trigger core_wallet_ledger_crystal_policy
             before insert on public.core_wallet_ledger
             for each row execute function public.core_crystal_policy_guard()';
    execute 'comment on table public.core_wallet_ledger is
             ''Account-bound ledger. Crystals can never be transferred, gifted, exchanged, pledged, or cashed out; see public.core_crystal_policy_guard().''';
  end if;
end
$guard$;

comment on table sales.referral_rewards is
  'Referral rewards pay coins only. Crystals are never issued for referrals and cannot be transferred.';

commit;

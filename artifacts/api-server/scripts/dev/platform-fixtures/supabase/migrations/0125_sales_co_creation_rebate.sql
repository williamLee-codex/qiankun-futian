-- V3.9 共創夥伴: cash rebate eligibility, crystal rebate conversion, and approved
-- initial commission settings. Additive only; no existing data is rewritten.

begin;

-- 1. Per-partner cash rebate eligibility. Defaults to false (free crystals).
alter table sales.business_members
  add column if not exists cash_rebate_enabled boolean not null default false;

-- 2. Payout method on settlement payment records.
alter table sales.settlement_payment_records
  add column if not exists method text not null default 'cash';
alter table sales.settlement_payment_records
  add column if not exists crystal_amount integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sales_settlement_payment_method_check'
      and conrelid = 'sales.settlement_payment_records'::regclass
  ) then
    alter table sales.settlement_payment_records
      add constraint sales_settlement_payment_method_check
      check (method in ('cash', 'crystal'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'sales_settlement_payment_crystal_amount_check'
      and conrelid = 'sales.settlement_payment_records'::regclass
  ) then
    alter table sales.settlement_payment_records
      add constraint sales_settlement_payment_crystal_amount_check
      check (
        (method = 'cash' and crystal_amount is null)
        or (method = 'crystal' and crystal_amount is not null and crystal_amount >= 0)
      );
  end if;
end $$;

-- 3. Exact fractional carry for crystal rebates.
--    crystals = cents * 360 / 179000 = cents * 9 / 4475, so the remainder lives in
--    1/4475-crystal units and is never rounded away.
create table if not exists sales.crystal_rebate_carry (
  business_id uuid primary key references sales.business_members(id) on delete restrict,
  carry_numerator bigint not null default 0
    check (carry_numerator >= 0 and carry_numerator < 4475),
  updated_at timestamptz not null default now()
);

alter table sales.crystal_rebate_carry enable row level security;
revoke all on table sales.crystal_rebate_carry from anon, authenticated;

-- 4. Admin toggle. Eligibility never inherits from the introducer: it is stored per member.
create or replace function sales.set_member_cash_rebate(
  p_business_id uuid, p_enabled boolean,
  p_actor uuid default null, p_actor_email text default null
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, sales, pg_temp as $fn$
begin
  update sales.business_members
     set cash_rebate_enabled = coalesce(p_enabled, false), updated_at = now()
   where id = p_business_id;
  if not found then
    raise exception 'SALES_MEMBER_NOT_FOUND';
  end if;
  perform sales.log_audit(p_actor, p_actor_email, 'sales.member.cash_rebate', 'sales.business_members',
    p_business_id::text, jsonb_build_object('enabled', coalesce(p_enabled, false)));
  return jsonb_build_object('businessId', p_business_id, 'cashRebateEnabled', coalesce(p_enabled, false));
end;
$fn$;

-- 5. Grant a settlement payout as free crystals. Idempotent per (settlement, beneficiary).
create or replace function sales.grant_crystal_rebate(
  p_settlement_id uuid, p_beneficiary_business_id uuid, p_approved_cents bigint,
  p_actor uuid default null, p_actor_email text default null
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, sales, public, pg_temp as $fn$
declare
  v_member record;
  v_existing record;
  v_carry bigint;
  v_numerator bigint;
  v_crystals integer;
  v_new_carry bigint;
begin
  if p_approved_cents is null or p_approved_cents <= 0 then
    raise exception 'SALES_CRYSTAL_REBATE_INVALID_AMOUNT';
  end if;

  select id, member_id, cash_rebate_enabled into v_member
    from sales.business_members where id = p_beneficiary_business_id;
  if not found then
    raise exception 'SALES_MEMBER_NOT_FOUND';
  end if;
  if v_member.cash_rebate_enabled then
    raise exception 'SALES_CASH_REBATE_ELIGIBLE';
  end if;

  select id, crystal_amount into v_existing
    from sales.settlement_payment_records
   where settlement_id = p_settlement_id
     and beneficiary_business_id = p_beneficiary_business_id
     and method = 'crystal'
   limit 1;
  if found then
    return jsonb_build_object('settlementId', p_settlement_id, 'status', 'duplicate',
      'crystals', coalesce(v_existing.crystal_amount, 0));
  end if;

  insert into sales.crystal_rebate_carry (business_id, carry_numerator)
  values (p_beneficiary_business_id, 0)
  on conflict (business_id) do nothing;

  select carry_numerator into v_carry
    from sales.crystal_rebate_carry where business_id = p_beneficiary_business_id for update;

  v_numerator := p_approved_cents * 9 + v_carry;
  v_crystals := (v_numerator / 4475)::integer;
  v_new_carry := v_numerator % 4475;

  update sales.crystal_rebate_carry
     set carry_numerator = v_new_carry, updated_at = now()
   where business_id = p_beneficiary_business_id;

  insert into sales.settlement_payment_records
    (settlement_id, beneficiary_business_id, payment_reference, paid_cents, paid_at, recorded_by, method, crystal_amount)
  values (p_settlement_id, p_beneficiary_business_id,
          'crystal:' || p_settlement_id::text || ':' || p_beneficiary_business_id::text,
          p_approved_cents, now(), p_actor, 'crystal', v_crystals);

  if v_crystals > 0 then
    perform public.core_wallet_apply_transaction(
      p_owner_id := v_member.member_id,
      p_amount := v_crystals,
      p_currency := 'crystal',
      p_direction := 'credit',
      p_idempotency_key := 'sales-crystal-rebate:' || p_settlement_id::text || ':' || p_beneficiary_business_id::text,
      p_reason := 'sales_crystal_rebate',
      p_reference_id := p_settlement_id::text,
      p_reference_type := 'sales_settlement_rebate',
      p_reversal_of := null
    );
  end if;

  perform sales.log_audit(p_actor, p_actor_email, 'sales.settlement.crystal_rebate',
    'sales.settlement_payment_records', p_settlement_id::text,
    jsonb_build_object('beneficiary', p_beneficiary_business_id, 'approvedCents', p_approved_cents,
      'crystals', v_crystals, 'carryNumerator', v_new_carry));

  return jsonb_build_object('settlementId', p_settlement_id, 'status', 'recorded',
    'crystals', v_crystals, 'carryNumerator', v_new_carry);
end;
$fn$;

-- 6. Seed the approved V3.9 default configuration when no version is active yet.
insert into sales.commission_settings (version, effective_at, config, is_active)
select 'v3.9-default', '2026-11-20T00:00:00.000Z'::timestamptz,
  jsonb_build_object(
    'version', 'v3.9-default',
    'effectiveAt', '2026-11-20T00:00:00.000Z',
    'personal', jsonb_build_object(
      '1', jsonb_build_object('thresholdsCents', jsonb_build_array(3000000,10000000,30000000), 'ratesBps', jsonb_build_array(250,350,450,550)),
      '2', jsonb_build_object('thresholdsCents', jsonb_build_array(3000000,10000000,30000000), 'ratesBps', jsonb_build_array(250,350,450,550)),
      '3', jsonb_build_object('thresholdsCents', jsonb_build_array(3000000,10000000,30000000), 'ratesBps', jsonb_build_array(250,350,450,550)),
      '4', jsonb_build_object('thresholdsCents', jsonb_build_array(3000000,10000000,30000000), 'ratesBps', jsonb_build_array(250,350,450,550)),
      '5', jsonb_build_object('thresholdsCents', jsonb_build_array(3000000,10000000,30000000), 'ratesBps', jsonb_build_array(250,350,450,550)),
      '6', jsonb_build_object('thresholdsCents', jsonb_build_array(3000000,10000000,30000000), 'ratesBps', jsonb_build_array(300,400,500,600))
    ),
    'organization', jsonb_build_object(
      '2', jsonb_build_object('thresholdsCents', jsonb_build_array(10000000,30000000), 'ratesBps', jsonb_build_array(20,50,80)),
      '3', jsonb_build_object('thresholdsCents', jsonb_build_array(30000000,80000000), 'ratesBps', jsonb_build_array(20,40,70)),
      '4', jsonb_build_object('thresholdsCents', jsonb_build_array(80000000,200000000), 'ratesBps', jsonb_build_array(10,30,50)),
      '5', jsonb_build_object('thresholdsCents', jsonb_build_array(200000000,500000000), 'ratesBps', jsonb_build_array(10,20,40)),
      '6', jsonb_build_object('thresholdsCents', jsonb_build_array(200000000,500000000), 'ratesBps', jsonb_build_array(20,30,50))
    ),
    'team', jsonb_build_object('maxTeams', 3,
      'ratesBps', jsonb_build_object('2',150,'3',100,'4',50,'5',20,'6',30)),
    'capBps', 2000
  ), true
where not exists (select 1 from sales.commission_settings where is_active);

grant execute on function sales.set_member_cash_rebate(uuid, boolean, uuid, text) to service_role;
grant execute on function sales.grant_crystal_rebate(uuid, uuid, bigint, uuid, text) to service_role;

commit;

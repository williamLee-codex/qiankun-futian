-- Platform-wide dual crystal pools.
--
-- Purple (paid) crystals come from a real purchase; blue (free) crystals are granted
-- by the platform. Both are the same currency: identical spending value, identical
-- price, identical permissions in every app. The only difference is the refund
-- attribute (paid follows the existing refund rules, free is never refundable).
--
-- The shared wallet transaction layer owns the split:
--   * a crystal credit is recorded in the pool its source belongs to,
--   * a crystal debit always consumes free crystals first, then paid crystals,
--   * apps never pass a pool and never set a per-pool price.
--
-- No existing balance is reduced and no ledger row is deleted. Historical ledger rows
-- are classified with the same free-first rule the runtime uses.

begin;

-- 1. Wallet columns ----------------------------------------------------------------
alter table public.core_wallets
  add column if not exists free_crystal_balance integer not null default 0;
alter table public.core_wallets
  add column if not exists paid_crystal_balance integer not null default 0;

do $ddl$
begin
  if not exists (select 1 from pg_constraint where conname = 'core_wallets_free_crystal_balance_non_negative') then
    alter table public.core_wallets
      add constraint core_wallets_free_crystal_balance_non_negative
      check (free_crystal_balance >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'core_wallets_paid_crystal_balance_non_negative') then
    alter table public.core_wallets
      add constraint core_wallets_paid_crystal_balance_non_negative
      check (paid_crystal_balance >= 0);
  end if;
end
$ddl$;

-- 2. Ledger pool columns ------------------------------------------------------------
alter table public.core_wallet_ledger
  add column if not exists free_crystal_amount integer not null default 0;
alter table public.core_wallet_ledger
  add column if not exists paid_crystal_amount integer not null default 0;

do $ddl$
begin
  if not exists (select 1 from pg_constraint where conname = 'core_wallet_ledger_crystal_amounts_non_negative') then
    alter table public.core_wallet_ledger
      add constraint core_wallet_ledger_crystal_amounts_non_negative
      check (free_crystal_amount >= 0 and paid_crystal_amount >= 0);
  end if;
end
$ddl$;

-- 3. Wallet pool balances -----------------------------------------------------------
-- The production ledger is append-only: public.farm_v2_closed_wallet_request_guard
-- rejects every UPDATE and DELETE on public.core_wallet_ledger. Historical rows are
-- therefore never rewritten; the split below is derived from them and only rows
-- written from now on carry their own split.
--
-- Same rule as src/core/wallet/crystal-split.ts: payment-order reference types and
-- purchase/top-up/recharge reasons are paid, everything else is free. Debits consume
-- the free pool first. Rows written in one transaction share created_at, so credits
-- are ordered before debits at the same instant: a debit always has its credit.
with classified as (
  select
    l.wallet_id,
    l.amount,
    l.direction,
    l.created_at,
    l.id,
    case
      when l.direction = 'credit' then
        case
          when lower(btrim(l.reference_type)) in (
            'newebpay_payment_order', 'stripe_payment_order', 'paid_top_up'
          ) then 'paid'
          when l.reason ~* '(purchase|top[\s_-]?up|recharge)' then 'paid'
          else 'free'
        end
    end as credit_pool
  from public.core_wallet_ledger l
  where l.currency = 'crystal'
),
running as (
  select
    c.*,
    coalesce(sum(case when c.direction = 'credit' and c.credit_pool = 'free' then c.amount else 0 end)
      over (partition by c.wallet_id order by c.created_at, (c.direction = 'debit'), c.id
            rows between unbounded preceding and current row), 0) as free_credits_so_far,
    coalesce(sum(case when c.direction = 'debit' then c.amount else 0 end)
      over (partition by c.wallet_id order by c.created_at, (c.direction = 'debit'), c.id
            rows between unbounded preceding and current row), 0) as debits_so_far
  from classified c
),
planned as (
  select
    r.wallet_id,
    r.direction,
    case
      when r.direction = 'credit' and r.credit_pool = 'free' then r.amount
      when r.direction = 'credit' then 0
      else least(r.free_credits_so_far, r.debits_so_far)
           - least(r.free_credits_so_far, r.debits_so_far - r.amount)
    end as free_amount,
    case
      when r.direction = 'credit' and r.credit_pool = 'paid' then r.amount
      when r.direction = 'credit' then 0
      else r.amount
           - (least(r.free_credits_so_far, r.debits_so_far)
              - least(r.free_credits_so_far, r.debits_so_far - r.amount))
    end as paid_amount
  from running r
),
totals as (
  select
    p.wallet_id,
    sum(case when p.direction = 'credit' then p.free_amount else -p.free_amount end) as free_net,
    sum(case when p.direction = 'credit' then p.paid_amount else -p.paid_amount end) as paid_net
  from planned p
  group by p.wallet_id
),
resolved as (
  -- Crystals the ledger cannot account for are kept as free crystals: no balance is
  -- lost, and no refund right is invented. Paid never exceeds the balance held.
  select
    w.id,
    least(greatest(coalesce(t.paid_net, 0), 0), w.crystal_balance) as paid_balance,
    w.crystal_balance
  from public.core_wallets w
  left join totals t on t.wallet_id = w.id
)
update public.core_wallets w
   set free_crystal_balance = r.crystal_balance - r.paid_balance,
       paid_crystal_balance = r.paid_balance
  from resolved r
 where w.id = r.id
   and (w.free_crystal_balance, w.paid_crystal_balance)
       is distinct from (r.crystal_balance - r.paid_balance, r.paid_balance);

do $notice$
declare
  v_unaccounted bigint;
begin
  select coalesce(sum(w.crystal_balance), 0) into v_unaccounted
    from public.core_wallets w
   where not exists (
     select 1 from public.core_wallet_ledger l
      where l.wallet_id = w.id and l.currency = 'crystal');
  raise notice 'dual crystal backfill: % crystal(s) belong to wallets without ledger history and were kept as free crystals', v_unaccounted;
end
$notice$;

-- 5. Shared wallet runtime ----------------------------------------------------------
-- Every crystal movement goes through this section. Apps pass an amount only: they
-- cannot choose a pool, cannot set a per-pool price, and cannot spend paid crystals
-- while free crystals remain.
create or replace function public.core_wallet_get_or_create(p_owner_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_wallet public.core_wallets;
begin
  insert into public.core_wallets(owner_id) values (p_owner_id)
  on conflict (owner_id) do nothing;
  select * into v_wallet from public.core_wallets where owner_id = p_owner_id;
  return jsonb_build_object(
    'wallet_id', v_wallet.id, 'owner_id', v_wallet.owner_id,
    'coin_balance', v_wallet.coin_balance, 'crystal_balance', v_wallet.crystal_balance,
    'free_crystal_balance', v_wallet.free_crystal_balance,
    'paid_crystal_balance', v_wallet.paid_crystal_balance,
    'destiny_ticket_balance', v_wallet.destiny_ticket_balance, 'status', v_wallet.status,
    'created_at', v_wallet.created_at, 'updated_at', v_wallet.updated_at
  );
end; $$;

create or replace function public.core_crystal_credit_pool(p_reason text, p_reference_type text)
returns text language sql immutable set search_path = pg_catalog as $$
  select case
    when lower(btrim(coalesce(p_reference_type, ''))) in (
      'newebpay_payment_order', 'stripe_payment_order', 'paid_top_up'
    ) then 'paid'
    when coalesce(p_reason, '') ~* '(purchase|top[\s_-]?up|recharge)' then 'paid'
    else 'free'
  end;
$$;

create or replace function public.core_wallet_apply_transaction(
  p_owner_id uuid, p_amount integer, p_currency text, p_direction text,
  p_idempotency_key text, p_reason text, p_reference_id text,
  p_reference_type text, p_reversal_of uuid default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_wallet public.core_wallets;
  v_entry public.core_wallet_ledger;
  v_balance integer;
  v_sign integer;
  v_free integer := 0;
  v_paid integer := 0;
begin
  if p_owner_id is null or p_amount <= 0 or p_currency not in ('coin','crystal','destiny_ticket')
    or p_direction not in ('credit','debit') or btrim(p_idempotency_key) = '' then
    raise exception 'Invalid core wallet transaction';
  end if;

  perform public.core_wallet_get_or_create(p_owner_id);

  select * into v_entry from public.core_wallet_ledger
   where owner_id = p_owner_id and idempotency_key = p_idempotency_key;
  if found then
    if v_entry.amount <> p_amount or v_entry.currency <> p_currency or v_entry.direction <> p_direction
      or v_entry.reason <> p_reason or v_entry.reference_id <> p_reference_id
      or v_entry.reference_type <> p_reference_type then
      return jsonb_build_object('result_status','duplicate_conflict');
    end if;
    select * into v_wallet from public.core_wallets where owner_id = p_owner_id;
    return jsonb_build_object('result_status','duplicate',
      'wallet', public.core_wallet_get_or_create(p_owner_id), 'transaction', to_jsonb(v_entry));
  end if;

  select * into v_wallet from public.core_wallets where owner_id = p_owner_id for update;
  v_sign := case when p_direction = 'credit' then 1 else -1 end;
  v_balance := case p_currency
    when 'coin' then v_wallet.coin_balance
    when 'crystal' then v_wallet.crystal_balance
    else v_wallet.destiny_ticket_balance end;

  if p_direction = 'debit' and v_balance < p_amount then
    return jsonb_build_object('result_status','insufficient_funds');
  end if;

  if p_currency = 'crystal' then
    if p_direction = 'credit' then
      if public.core_crystal_credit_pool(p_reason, p_reference_type) = 'paid' then
        v_paid := p_amount;
      else
        v_free := p_amount;
      end if;
    else
      -- Free crystals are always spent before paid crystals.
      v_free := least(v_wallet.free_crystal_balance, p_amount);
      v_paid := p_amount - v_free;
    end if;
  end if;

  update public.core_wallets set
    coin_balance = coin_balance
      + case when p_currency = 'coin' then v_sign * p_amount else 0 end,
    crystal_balance = crystal_balance
      + case when p_currency = 'crystal' then v_sign * p_amount else 0 end,
    free_crystal_balance = free_crystal_balance + v_sign * v_free,
    paid_crystal_balance = paid_crystal_balance + v_sign * v_paid,
    destiny_ticket_balance = destiny_ticket_balance
      + case when p_currency = 'destiny_ticket' then v_sign * p_amount else 0 end,
    updated_at = now()
  where id = v_wallet.id
  returning * into v_wallet;

  insert into public.core_wallet_ledger(
    wallet_id, owner_id, amount, currency, direction, idempotency_key, reason,
    reference_id, reference_type, reversal_of, free_crystal_amount, paid_crystal_amount
  ) values (
    v_wallet.id, p_owner_id, p_amount, p_currency, p_direction, p_idempotency_key, p_reason,
    p_reference_id, p_reference_type, p_reversal_of, v_free, v_paid
  ) returning * into v_entry;

  return jsonb_build_object('result_status','created',
    'wallet', public.core_wallet_get_or_create(p_owner_id), 'transaction', to_jsonb(v_entry));
end; $$;

-- The only spend entry point apps may call.
create or replace function public.core_wallet_spend_crystals(
  p_owner_id uuid, p_amount integer, p_idempotency_key text, p_reason text,
  p_reference_id text, p_reference_type text
) returns jsonb language sql security definer set search_path = public as $$
  select public.core_wallet_apply_transaction(
    p_owner_id, p_amount, 'crystal', 'debit', p_idempotency_key, p_reason,
    p_reference_id, p_reference_type, null);
$$;

-- Refunds only ever reverse paid crystals: free crystals are never refundable.
create or replace function public.core_wallet_refund_paid_crystals(
  p_owner_id uuid, p_amount integer, p_idempotency_key text, p_reason text,
  p_reference_id text, p_reference_type text, p_reversal_of uuid default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_wallet public.core_wallets;
  v_entry public.core_wallet_ledger;
begin
  if p_owner_id is null or p_amount <= 0 or btrim(p_idempotency_key) = '' then
    raise exception 'Invalid crystal refund';
  end if;

  perform public.core_wallet_get_or_create(p_owner_id);

  select * into v_entry from public.core_wallet_ledger
   where owner_id = p_owner_id and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('result_status','duplicate',
      'wallet', public.core_wallet_get_or_create(p_owner_id), 'transaction', to_jsonb(v_entry));
  end if;

  select * into v_wallet from public.core_wallets where owner_id = p_owner_id for update;
  if v_wallet.paid_crystal_balance < p_amount then
    return jsonb_build_object('result_status','insufficient_paid_crystals',
      'wallet', public.core_wallet_get_or_create(p_owner_id));
  end if;

  update public.core_wallets set
    crystal_balance = crystal_balance - p_amount,
    paid_crystal_balance = paid_crystal_balance - p_amount,
    updated_at = now()
  where id = v_wallet.id
  returning * into v_wallet;

  insert into public.core_wallet_ledger(
    wallet_id, owner_id, amount, currency, direction, idempotency_key, reason,
    reference_id, reference_type, reversal_of, free_crystal_amount, paid_crystal_amount
  ) values (
    v_wallet.id, p_owner_id, p_amount, 'crystal', 'debit', p_idempotency_key, p_reason,
    p_reference_id, p_reference_type, p_reversal_of, 0, p_amount
  ) returning * into v_entry;

  return jsonb_build_object('result_status','created',
    'wallet', public.core_wallet_get_or_create(p_owner_id), 'transaction', to_jsonb(v_entry));
end; $$;

revoke all on function public.core_crystal_credit_pool(text, text) from public;
revoke all on function public.core_wallet_spend_crystals(uuid, integer, text, text, text, text) from public;
revoke all on function public.core_wallet_refund_paid_crystals(uuid, integer, text, text, text, text, uuid) from public;

grant execute on function public.core_crystal_credit_pool(text, text) to service_role;
grant execute on function public.core_wallet_spend_crystals(uuid, integer, text, text, text, text) to service_role;
grant execute on function public.core_wallet_refund_paid_crystals(uuid, integer, text, text, text, text, uuid) to service_role;

-- 6. Invariants ---------------------------------------------------------------------
-- The ledger constraint stays NOT VALID: rows written before this migration carry no
-- split, and the append-only guard forbids rewriting them. Every row inserted from now
-- on is still checked, and the wallet constraint below is validated for every wallet.
do $ddl$
begin
  -- A crystal row must say how much of it moved in each pool.
  if not exists (select 1 from pg_constraint where conname = 'core_wallet_ledger_crystal_amounts_match') then
    alter table public.core_wallet_ledger
      add constraint core_wallet_ledger_crystal_amounts_match
      check (currency <> 'crystal' or free_crystal_amount + paid_crystal_amount = amount) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'core_wallets_crystal_pool_sum') then
    alter table public.core_wallets
      add constraint core_wallets_crystal_pool_sum
      check (crystal_balance = free_crystal_balance + paid_crystal_balance) not valid;
  end if;
end
$ddl$;

alter table public.core_wallets
  validate constraint core_wallets_crystal_pool_sum;

commit;

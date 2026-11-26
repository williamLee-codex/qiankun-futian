begin;

create table if not exists platform.redemption_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  code_hint text not null,
  currency text not null check (currency in ('coin','crystal')),
  amount integer not null check (amount > 0),
  is_recharge boolean not null default false,
  max_uses integer not null default 1 check (max_uses > 0),
  used_count integer not null default 0 check (used_count >= 0 and used_count <= max_uses),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','DISABLED','EXHAUSTED')),
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint redemption_codes_recharge_currency_check check (not is_recharge or currency = 'crystal'),
  constraint redemption_codes_expiry_check check (expires_at is null or expires_at > starts_at)
);

create table if not exists platform.redemption_code_claims (
  id uuid primary key default gen_random_uuid(),
  redemption_code_id uuid not null references platform.redemption_codes(id) on delete restrict,
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  wallet_transaction_id uuid,
  claimed_at timestamptz not null default now(),
  unique (redemption_code_id, auth_user_id)
);

create table if not exists platform.recharge_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  core_user_id uuid not null references core.users(id) on delete restrict,
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  amount integer not null check (amount > 0),
  source text not null check (source = 'REDEMPTION_CODE'),
  reference_id uuid not null references platform.redemption_code_claims(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (reference_id)
);

create index if not exists redemption_codes_status_idx on platform.redemption_codes(status);
create index if not exists redemption_claims_user_idx on platform.redemption_code_claims(auth_user_id);
create index if not exists recharge_credit_user_idx on platform.recharge_credit_ledger(core_user_id);

alter table platform.redemption_codes enable row level security;
alter table platform.redemption_code_claims enable row level security;
alter table platform.recharge_credit_ledger enable row level security;

revoke all on table platform.redemption_codes, platform.redemption_code_claims, platform.recharge_credit_ledger from anon, authenticated;
grant all on table platform.redemption_codes, platform.redemption_code_claims, platform.recharge_credit_ledger to service_role;

create or replace function platform.redeem_redemption_code(
  p_auth_user_id uuid,
  p_code_hash text
) returns jsonb
language plpgsql security definer set search_path = public, platform, core
as $$
declare
  v_code platform.redemption_codes;
  v_claim platform.redemption_code_claims;
  v_wallet jsonb;
  v_core_user_id uuid;
  v_now timestamptz := now();
begin
  if p_auth_user_id is null or nullif(btrim(p_code_hash), '') is null then
    return jsonb_build_object('result_status','invalid_request');
  end if;

  select * into v_code
    from platform.redemption_codes
   where code_hash = lower(btrim(p_code_hash))
   for update;

  if not found then return jsonb_build_object('result_status','invalid_code'); end if;
  if v_code.status <> 'ACTIVE' then return jsonb_build_object('result_status','inactive_code'); end if;
  if v_now < v_code.starts_at or (v_code.expires_at is not null and v_now >= v_code.expires_at) then
    return jsonb_build_object('result_status','expired_code');
  end if;
  if v_code.used_count >= v_code.max_uses then return jsonb_build_object('result_status','exhausted_code'); end if;
  if exists (select 1 from platform.redemption_code_claims where redemption_code_id = v_code.id and auth_user_id = p_auth_user_id) then
    return jsonb_build_object('result_status','already_redeemed');
  end if;

  v_wallet := public.core_wallet_apply_transaction(
    p_auth_user_id, v_code.amount, v_code.currency, 'credit',
    format('redemption-code:%s:%s', v_code.id, p_auth_user_id),
    case when v_code.currency = 'crystal' and v_code.is_recharge then '水晶兌換碼（計入儲值）' else '兌換碼' end,
    v_code.id::text, 'redemption_code', null
  );

  if v_wallet->>'result_status' not in ('created','duplicate') then
    return jsonb_build_object('result_status','wallet_credit_failed');
  end if;

  insert into platform.redemption_code_claims(redemption_code_id, auth_user_id, wallet_transaction_id)
  values (v_code.id, p_auth_user_id, nullif(v_wallet->'transaction'->>'id','')::uuid)
  returning * into v_claim;

  update platform.redemption_codes
     set used_count = used_count + 1,
         status = case when used_count + 1 >= max_uses then 'EXHAUSTED' else status end,
         updated_at = v_now
   where id = v_code.id;

  if v_code.is_recharge then
    select u.id into v_core_user_id from core.users u where u.auth_user_id = p_auth_user_id limit 1;
    if v_core_user_id is not null then
      insert into platform.recharge_credit_ledger(core_user_id, auth_user_id, amount, source, reference_id)
      values (v_core_user_id, p_auth_user_id, v_code.amount, 'REDEMPTION_CODE', v_claim.id);
    end if;
  end if;

  return jsonb_build_object(
    'result_status','created',
    'currency',v_code.currency,
    'amount',v_code.amount,
    'is_recharge',v_code.is_recharge,
    'wallet',v_wallet->'wallet'
  );
end;
$$;

revoke all on function platform.redeem_redemption_code(uuid,text) from public, anon, authenticated;
grant execute on function platform.redeem_redemption_code(uuid,text) to service_role;

commit;

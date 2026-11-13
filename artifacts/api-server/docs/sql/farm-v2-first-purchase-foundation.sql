-- Independent first-purchase entitlements, backed by verified payment callbacks.
-- Schema only: no browser can grant gifts or mark a payment as verified.
create table if not exists public.farm_v2_first_purchase_claims (
  user_id text not null,
  plan_id text not null check (plan_id in ('A','B','C')),
  payment_id text not null check (length(payment_id) between 1 and 128),
  payment_provider text not null default 'newebpay' check (payment_provider='newebpay'),
  verified_amount_twd integer not null,
  payment_verified_at timestamptz not null,
  granted_at timestamptz,
  grant_transaction_id uuid,
  created_at timestamptz not null default now(),
  primary key(user_id,plan_id),
  unique(payment_provider,payment_id),
  unique(grant_transaction_id),
  constraint farm_v2_first_purchase_amount_matches_plan check (
    (plan_id='A' and verified_amount_twd=390) or
    (plan_id='B' and verified_amount_twd=990) or
    (plan_id='C' and verified_amount_twd=1790)
  ),
  constraint farm_v2_first_purchase_grant_atomic check (
    (granted_at is null and grant_transaction_id is null) or
    (granted_at is not null and grant_transaction_id is not null)
  )
);
create index if not exists farm_v2_first_purchase_claims_ungranted_idx
  on public.farm_v2_first_purchase_claims(created_at) where granted_at is null;
alter table public.farm_v2_first_purchase_claims enable row level security;
revoke all on public.farm_v2_first_purchase_claims from public, anon, authenticated;
-- Only backend with verified NewebPay callback may insert a claim.
-- An ungranted row must never be represented to players as an issued gift.

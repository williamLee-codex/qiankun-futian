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

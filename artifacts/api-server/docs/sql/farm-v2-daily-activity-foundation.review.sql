-- Farm V2 daily activity persistence foundation (REVIEW ONLY; do not apply to production without owner mapping).
-- Farm identity uses farm_v2_player_state.user_id TEXT. Do not cast it to
-- core_wallets.owner_id UUID without verifying the canonical mapping.
-- All tables are private; no client grants. Reward crediting is deliberately absent
-- until the existing authoritative wallet / inventory RPC contract is verified.
begin;

-- Immutable helper prevents six repeated task IDs from passing the length check.
create or replace function public.farm_v2_six_distinct_task_ids(p_ids text[])
returns boolean
language sql immutable strict
set search_path = ''
as $$
  select cardinality(p_ids) = 6
     and array_position(p_ids, null) is null
     and (select count(distinct item) from unnest(p_ids) as item) = 6
$$;
revoke all on function public.farm_v2_six_distinct_task_ids(text[]) from public, anon, authenticated;

create table if not exists public.farm_v2_daily_activity_days (
  user_id text not null,
  activity_day date not null,
  assigned_task_ids text[] not null,
  eligibility_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, activity_day),
  constraint farm_v2_daily_activity_six_tasks check (
    public.farm_v2_six_distinct_task_ids(assigned_task_ids)
  )
);

create table if not exists public.farm_v2_daily_activity_events (
  user_id text not null,
  activity_day date not null,
  transaction_id text not null,
  event_type text not null check (event_type in (
    'plant','harvest','buy_seeds','synthesize_pot','place_pot',
    'open_warehouse','feed_pet','view_pet','friend_interaction','visit_friend'
  )),
  quantity integer not null check (quantity > 0),
  species_id text,
  occurred_at timestamptz not null default now(),
  primary key (user_id, transaction_id),
  foreign key (user_id, activity_day)
    references public.farm_v2_daily_activity_days(user_id, activity_day)
    on delete restrict
);

create index if not exists farm_v2_daily_activity_events_day_idx
  on public.farm_v2_daily_activity_events(user_id, activity_day);

create table if not exists public.farm_v2_daily_activity_claims (
  user_id text not null,
  activity_day date not null,
  milestone integer not null check (milestone in (30,60,100)),
  reward_transaction_id uuid not null unique,
  claimed_at timestamptz not null default now(),
  primary key (user_id, activity_day, milestone),
  foreign key (user_id, activity_day)
    references public.farm_v2_daily_activity_days(user_id, activity_day)
    on delete restrict
);

alter table public.farm_v2_daily_activity_days enable row level security;
alter table public.farm_v2_daily_activity_events enable row level security;
alter table public.farm_v2_daily_activity_claims enable row level security;
revoke all on public.farm_v2_daily_activity_days from anon, authenticated;
revoke all on public.farm_v2_daily_activity_events from anon, authenticated;
revoke all on public.farm_v2_daily_activity_claims from anon, authenticated;

-- The service-side transaction must:
-- (1) verify player session; (2) lock owner/day; (3) assign six tasks once;
-- (4) accept events only from committed authoritative farm operations;
-- (5) deduplicate transaction_id; (6) compute progress from recorded events;
-- (7) atomically grant milestone reward and insert claim with same transaction.
-- Do NOT add a direct client-facing event insert or claim endpoint.
commit;

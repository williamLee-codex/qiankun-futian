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

-- Canonical assignment guard, already verified on isolated Supabase.
-- A six-task array must contain only official IDs, with no incompatible
-- thresholds or more than one click-only task.
create or replace function public.farm_v2_valid_daily_task_assignment(p_ids text[])
returns boolean language sql immutable strict set search_path = ''
as $
select cardinality(p_ids)=6
 and array_position(p_ids,null) is null
 and (select count(distinct t) from unnest(p_ids) t)=6
 and p_ids <@ array[
 'plant_once','buy_seeds_5','plant_5','plant_10','harvest_5','harvest_10',
 'buy_seeds_once','buy_seeds_10','synthesize_pot','place_pot','open_warehouse',
 'feed_pet','view_pet','friend_interaction','visit_friend','plant_distinct_2',
 'harvest_distinct_2']::text[]
 and not ('plant_5'=any(p_ids) and 'plant_10'=any(p_ids))
 and not ('harvest_5'=any(p_ids) and 'harvest_10'=any(p_ids))
 and not ('buy_seeds_5'=any(p_ids) and 'buy_seeds_10'=any(p_ids))
 and not ('open_warehouse'=any(p_ids) and 'view_pet'=any(p_ids))
$;
revoke all on function public.farm_v2_valid_daily_task_assignment(text[]) from public, anon, authenticated;
alter table public.farm_v2_daily_activity_days
 drop constraint if exists farm_v2_daily_activity_canonical_assignment;
alter table public.farm_v2_daily_activity_days
 add constraint farm_v2_daily_activity_canonical_assignment
 check (public.farm_v2_valid_daily_task_assignment(assigned_task_ids));

-- The service-side transaction must:
-- (1) verify player session; (2) lock owner/day; (3) assign six tasks once;
-- (4) accept events only from committed authoritative farm operations;
-- (5) deduplicate transaction_id; (6) compute progress from recorded events;
-- (7) atomically grant milestone reward and insert claim with same transaction.
-- Do NOT add a direct client-facing event insert or claim endpoint.
commit;

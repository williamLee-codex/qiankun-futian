begin;

create table platform.rpg_cultivation_progress (
  character_id uuid primary key references platform.rpg_characters(id) on delete cascade,
  trial_status text not null default 'not_started'
    check (trial_status in ('not_started', 'passed')),
  breakthrough_eligible boolean not null default false,
  breakthrough_status text not null default 'not_attempted'
    check (breakthrough_status in ('not_attempted', 'failed', 'succeeded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (trial_status = 'passed' and breakthrough_status in ('not_attempted', 'failed') and breakthrough_eligible)
    or (trial_status = 'passed' and breakthrough_status = 'succeeded' and not breakthrough_eligible)
    or (trial_status = 'not_started' and breakthrough_status = 'not_attempted' and not breakthrough_eligible)
  )
);

create table platform.rpg_cultivation_attempts (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references platform.rpg_characters(id) on delete cascade,
  event_key text not null check (char_length(btrim(event_key)) between 1 and 128),
  cultivation_id text not null check (cultivation_id = 'BT_QI_FOUNDATION'),
  outcome text not null
    check (outcome in ('breakthrough_succeeded', 'breakthrough_failed')),
  base_success_rate numeric(3, 2) not null default 0.9
    check (base_success_rate = 0.9),
  created_at timestamptz not null default now(),
  unique (character_id, event_key)
);

create index rpg_cultivation_attempts_character_created_idx
  on platform.rpg_cultivation_attempts(character_id, created_at desc);

alter table platform.rpg_cultivation_progress enable row level security;
alter table platform.rpg_cultivation_attempts enable row level security;

revoke all on table platform.rpg_cultivation_progress from anon, authenticated;
revoke all on table platform.rpg_cultivation_attempts from anon, authenticated;

grant select on table platform.rpg_cultivation_progress to authenticated;
grant select on table platform.rpg_cultivation_attempts to authenticated;

create policy rpg_cultivation_progress_select_own
  on platform.rpg_cultivation_progress
  for select
  to authenticated
  using (
    exists (
      select 1
      from platform.rpg_characters c
      join platform.rpg_players p on p.id = c.player_id
      where c.id = character_id
        and p.user_id = (select auth.uid())
    )
  );

create policy rpg_cultivation_attempts_select_own
  on platform.rpg_cultivation_attempts
  for select
  to authenticated
  using (
    exists (
      select 1
      from platform.rpg_characters c
      join platform.rpg_players p on p.id = c.player_id
      where c.id = character_id
        and p.user_id = (select auth.uid())
    )
  );

create or replace function platform.settle_rpg_g02_trial(p_event_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_character_id uuid;
  v_level integer;
  v_event_id uuid;
  v_trial_status text;
  v_breakthrough_eligible boolean;
  v_breakthrough_status text;
begin
  if p_event_key is null
     or char_length(btrim(p_event_key)) < 1
     or char_length(btrim(p_event_key)) > 128 then
    raise exception 'RPG_INVALID_EVENT_KEY';
  end if;

  if auth.uid() is null then
    raise exception 'RPG_UNAUTHENTICATED' using errcode = '42501';
  end if;

  select c.id
    into v_character_id
  from platform.rpg_players p
  join platform.rpg_characters c
    on c.id = p.active_character_id
   and c.player_id = p.id
  where p.user_id = auth.uid()
  for update of c;

  if not found then
    raise exception 'RPG_FOUNDATION_NOT_INITIALIZED';
  end if;

  select level into v_level
  from platform.rpg_characters
  where id = v_character_id;

  if v_level < 25 then
    raise exception 'RPG_G02_LEVEL_25_REQUIRED';
  end if;

  insert into platform.rpg_progress_events (
    character_id,
    event_key,
    event_type,
    experience_delta,
    payload
  )
  values (
    v_character_id,
    btrim(p_event_key),
    'g02_dun009_trial_cleared',
    0,
    jsonb_build_object('dungeonId', 'DUN009')
  )
  on conflict (character_id, event_key) do nothing
  returning id into v_event_id;

  if v_event_id is null and not exists (
    select 1
    from platform.rpg_progress_events
    where character_id = v_character_id
      and event_key = btrim(p_event_key)
      and event_type = 'g02_dun009_trial_cleared'
  ) then
    raise exception 'RPG_EVENT_KEY_ALREADY_USED';
  end if;

  insert into platform.rpg_cultivation_progress (
    character_id,
    trial_status,
    breakthrough_eligible,
    breakthrough_status
  )
  values (
    v_character_id,
    'passed',
    true,
    'not_attempted'
  )
  on conflict (character_id) do update
    set trial_status = 'passed',
        breakthrough_eligible = case
          when platform.rpg_cultivation_progress.breakthrough_status = 'succeeded'
            then false
          else true
        end,
        breakthrough_status = case
          when platform.rpg_cultivation_progress.breakthrough_status = 'succeeded'
            then 'succeeded'
          else platform.rpg_cultivation_progress.breakthrough_status
        end,
        updated_at = now()
  returning trial_status, breakthrough_eligible, breakthrough_status
    into v_trial_status, v_breakthrough_eligible, v_breakthrough_status;

  return jsonb_build_object(
    'dungeonId', 'DUN009',
    'trialStatus', v_trial_status,
    'breakthroughEligible', v_breakthrough_eligible,
    'breakthroughStatus', v_breakthrough_status
  );
end;
$$;

create or replace function platform.attempt_rpg_g02_foundation_breakthrough(p_event_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_character_id uuid;
  v_level integer;
  v_existing_outcome text;
  v_outcome text;
  v_trial_status text;
  v_breakthrough_eligible boolean;
  v_breakthrough_status text;
begin
  if p_event_key is null
     or char_length(btrim(p_event_key)) < 1
     or char_length(btrim(p_event_key)) > 128 then
    raise exception 'RPG_INVALID_EVENT_KEY';
  end if;

  if auth.uid() is null then
    raise exception 'RPG_UNAUTHENTICATED' using errcode = '42501';
  end if;

  select c.id
    into v_character_id
  from platform.rpg_players p
  join platform.rpg_characters c
    on c.id = p.active_character_id
   and c.player_id = p.id
  where p.user_id = auth.uid()
  for update of c;

  if not found then
    raise exception 'RPG_FOUNDATION_NOT_INITIALIZED';
  end if;

  select level into v_level
  from platform.rpg_characters
  where id = v_character_id;

  if v_level < 25 then
    raise exception 'RPG_G02_LEVEL_25_REQUIRED';
  end if;

  select outcome
    into v_existing_outcome
  from platform.rpg_cultivation_attempts
  where character_id = v_character_id
    and event_key = btrim(p_event_key);

  if found then
    select trial_status, breakthrough_eligible, breakthrough_status
      into v_trial_status, v_breakthrough_eligible, v_breakthrough_status
    from platform.rpg_cultivation_progress
    where character_id = v_character_id;

    return jsonb_build_object(
      'cultivationId', 'BT_QI_FOUNDATION',
      'outcome', v_existing_outcome,
      'trialStatus', v_trial_status,
      'breakthroughEligible', v_breakthrough_eligible,
      'breakthroughStatus', v_breakthrough_status
    );
  end if;

  select trial_status, breakthrough_eligible, breakthrough_status
    into v_trial_status, v_breakthrough_eligible, v_breakthrough_status
  from platform.rpg_cultivation_progress
  where character_id = v_character_id
  for update;

  if not found
     or v_trial_status <> 'passed'
     or not v_breakthrough_eligible
     or v_breakthrough_status = 'succeeded' then
    raise exception 'RPG_G02_TRIAL_REQUIRED';
  end if;

  v_outcome := case
    when random() < 0.9 then 'breakthrough_succeeded'
    else 'breakthrough_failed'
  end;

  insert into platform.rpg_cultivation_attempts (
    character_id,
    event_key,
    cultivation_id,
    outcome,
    base_success_rate
  )
  values (
    v_character_id,
    btrim(p_event_key),
    'BT_QI_FOUNDATION',
    v_outcome,
    0.9
  );

  if v_outcome = 'breakthrough_succeeded' then
    update platform.rpg_cultivation_progress
      set breakthrough_eligible = false,
          breakthrough_status = 'succeeded',
          updated_at = now()
      where character_id = v_character_id;

    update platform.rpg_characters
      set cultivation_realm = '築基期',
          updated_at = now()
      where id = v_character_id;
  else
    update platform.rpg_cultivation_progress
      set breakthrough_eligible = true,
          breakthrough_status = 'failed',
          updated_at = now()
      where character_id = v_character_id;
  end if;

  select trial_status, breakthrough_eligible, breakthrough_status
    into v_trial_status, v_breakthrough_eligible, v_breakthrough_status
  from platform.rpg_cultivation_progress
  where character_id = v_character_id;

  return jsonb_build_object(
    'cultivationId', 'BT_QI_FOUNDATION',
    'outcome', v_outcome,
    'trialStatus', v_trial_status,
    'breakthroughEligible', v_breakthrough_eligible,
    'breakthroughStatus', v_breakthrough_status
  );
end;
$$;

revoke all on function platform.settle_rpg_g02_trial(text) from public;
revoke all on function platform.settle_rpg_g02_trial(text) from anon;
revoke all on function platform.attempt_rpg_g02_foundation_breakthrough(text) from public;
revoke all on function platform.attempt_rpg_g02_foundation_breakthrough(text) from anon;

grant execute on function platform.settle_rpg_g02_trial(text) to authenticated;
grant execute on function platform.attempt_rpg_g02_foundation_breakthrough(text) to authenticated;
grant execute on function platform.settle_rpg_g02_trial(text) to service_role;
grant execute on function platform.attempt_rpg_g02_foundation_breakthrough(text) to service_role;

commit;

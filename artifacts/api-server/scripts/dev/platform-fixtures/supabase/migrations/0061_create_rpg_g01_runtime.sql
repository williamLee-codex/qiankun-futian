begin;

create schema if not exists platform;

grant usage on schema platform to authenticated, service_role;

create table platform.rpg_players (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  active_character_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table platform.rpg_characters (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references platform.rpg_players(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  level integer not null default 1 check (level >= 1),
  experience bigint not null default 0 check (experience >= 0),
  cultivation_realm text not null check (char_length(btrim(cultivation_realm)) between 1 and 40),
  location_id text not null check (char_length(btrim(location_id)) between 1 and 64),
  status text not null default 'active' check (status = 'active'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (player_id, id)
);

alter table platform.rpg_players
  add constraint rpg_players_active_character_owner_fk
  foreign key (id, active_character_id)
  references platform.rpg_characters(player_id, id)
  on delete set null (active_character_id);

create table platform.rpg_progress_events (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references platform.rpg_characters(id) on delete cascade,
  event_key text not null check (char_length(btrim(event_key)) between 1 and 128),
  event_type text not null check (char_length(btrim(event_type)) between 1 and 64),
  experience_delta bigint not null default 0 check (experience_delta >= 0),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  unique (character_id, event_key)
);

create index rpg_characters_player_id_idx
  on platform.rpg_characters(player_id);

create index rpg_progress_events_character_created_idx
  on platform.rpg_progress_events(character_id, created_at desc);

alter table platform.rpg_players enable row level security;
alter table platform.rpg_characters enable row level security;
alter table platform.rpg_progress_events enable row level security;

revoke all on table platform.rpg_players from anon, authenticated;
revoke all on table platform.rpg_characters from anon, authenticated;
revoke all on table platform.rpg_progress_events from anon, authenticated;

grant select on table platform.rpg_players to authenticated;
grant select on table platform.rpg_characters to authenticated;
grant select on table platform.rpg_progress_events to authenticated;

create policy rpg_players_select_own
  on platform.rpg_players
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy rpg_characters_select_own
  on platform.rpg_characters
  for select
  to authenticated
  using (
    exists (
      select 1
      from platform.rpg_players p
      where p.id = player_id
        and p.user_id = (select auth.uid())
    )
  );

create policy rpg_progress_events_select_own
  on platform.rpg_progress_events
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

create or replace function platform.initialize_rpg_g01_player()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_player_id uuid;
  v_character_id uuid;
  v_name text;
  v_level integer;
  v_experience bigint;
  v_realm text;
  v_location_id text;
  v_status text;
begin
  if v_user_id is null then
    raise exception 'RPG_UNAUTHENTICATED' using errcode = '42501';
  end if;

  insert into platform.rpg_players (user_id)
  values (v_user_id)
  on conflict (user_id) do update
    set updated_at = platform.rpg_players.updated_at
  returning id, active_character_id
    into v_player_id, v_character_id;

  if v_character_id is null then
    insert into platform.rpg_characters (
      player_id,
      name,
      level,
      experience,
      cultivation_realm,
      location_id,
      status
    )
    values (
      v_player_id,
      '九玄弟子',
      1,
      0,
      '練氣期',
      'LOC011',
      'active'
    )
    returning id into v_character_id;

    update platform.rpg_players
      set active_character_id = v_character_id,
          updated_at = now()
      where id = v_player_id;
  end if;

  select
    c.name,
    c.level,
    c.experience,
    c.cultivation_realm,
    c.location_id,
    c.status
  into
    v_name,
    v_level,
    v_experience,
    v_realm,
    v_location_id,
    v_status
  from platform.rpg_characters c
  where c.id = v_character_id
    and c.player_id = v_player_id;

  if not found then
    raise exception 'RPG_ACTIVE_CHARACTER_INVALID';
  end if;

  return jsonb_build_object(
    'player', jsonb_build_object(
      'id', v_player_id::text,
      'activeCharacterId', v_character_id::text
    ),
    'character', jsonb_build_object(
      'id', v_character_id::text,
      'name', v_name,
      'level', v_level,
      'experience', v_experience,
      'cultivationRealm', v_realm,
      'locationId', v_location_id,
      'status', v_status
    )
  );
end;
$$;

create or replace function platform.settle_rpg_g01_tutorial_step(p_event_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_player_id uuid;
  v_character_id uuid;
  v_event_id uuid;
  v_name text;
  v_level integer;
  v_experience bigint;
  v_realm text;
  v_location_id text;
  v_status text;
begin
  if v_user_id is null then
    raise exception 'RPG_UNAUTHENTICATED' using errcode = '42501';
  end if;

  if p_event_key is null
     or char_length(btrim(p_event_key)) < 1
     or char_length(btrim(p_event_key)) > 128 then
    raise exception 'RPG_INVALID_EVENT_KEY';
  end if;

  select p.id, c.id
    into v_player_id, v_character_id
  from platform.rpg_players p
  join platform.rpg_characters c
    on c.id = p.active_character_id
   and c.player_id = p.id
  where p.user_id = v_user_id
  for update of c;

  if not found then
    raise exception 'RPG_FOUNDATION_NOT_INITIALIZED';
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
    'tutorial_step_complete',
    10,
    jsonb_build_object('step', 'g01:first')
  )
  on conflict (character_id, event_key) do nothing
  returning id into v_event_id;

  if v_event_id is not null then
    update platform.rpg_characters
      set experience = experience + 10,
          updated_at = now()
      where id = v_character_id;
  end if;

  select
    c.name,
    c.level,
    c.experience,
    c.cultivation_realm,
    c.location_id,
    c.status
  into
    v_name,
    v_level,
    v_experience,
    v_realm,
    v_location_id,
    v_status
  from platform.rpg_characters c
  where c.id = v_character_id
    and c.player_id = v_player_id;

  if not found then
    raise exception 'RPG_ACTIVE_CHARACTER_INVALID';
  end if;

  return jsonb_build_object(
    'player', jsonb_build_object(
      'id', v_player_id::text,
      'activeCharacterId', v_character_id::text
    ),
    'character', jsonb_build_object(
      'id', v_character_id::text,
      'name', v_name,
      'level', v_level,
      'experience', v_experience,
      'cultivationRealm', v_realm,
      'locationId', v_location_id,
      'status', v_status
    )
  );
end;
$$;

revoke all on function platform.initialize_rpg_g01_player() from public;
revoke all on function platform.initialize_rpg_g01_player() from anon;
revoke all on function platform.settle_rpg_g01_tutorial_step(text) from public;
revoke all on function platform.settle_rpg_g01_tutorial_step(text) from anon;

grant execute on function platform.initialize_rpg_g01_player() to authenticated;
grant execute on function platform.settle_rpg_g01_tutorial_step(text) to authenticated;

grant execute on function platform.initialize_rpg_g01_player() to service_role;
grant execute on function platform.settle_rpg_g01_tutorial_step(text) to service_role;

commit;

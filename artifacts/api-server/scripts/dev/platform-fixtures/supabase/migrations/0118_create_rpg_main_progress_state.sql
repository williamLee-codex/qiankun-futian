begin;

create table platform.rpg_character_main_progress (
  character_id uuid primary key
    references platform.rpg_characters(id) on delete cascade,
  checkpoint_id text not null
    check (
      checkpoint_id ~ '^V1-L[0-9]{3}$'
      and substring(checkpoint_id from 5 for 3)::integer between 1 and 100
    ),
  status text not null
    check (status in ('ACTIVE', 'COMPLETED')),
  updated_at timestamptz not null default now()
);

insert into platform.rpg_character_main_progress (
  character_id,
  checkpoint_id,
  status
)
select
  c.id,
  'V1-L001',
  'ACTIVE'
from platform.rpg_characters c
on conflict (character_id) do nothing;

alter table platform.rpg_character_main_progress enable row level security;

revoke all on table platform.rpg_character_main_progress from anon, authenticated;
grant select on table platform.rpg_character_main_progress to authenticated;

create policy rpg_character_main_progress_owner_select
  on platform.rpg_character_main_progress
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

comment on table platform.rpg_character_main_progress is
  'Character-scoped materialized V1 main progression checkpoint state. Mutation remains behind a trusted atomic boundary.';

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

  insert into platform.rpg_character_main_progress (
    character_id,
    checkpoint_id,
    status
  )
  values (
    v_character_id,
    'V1-L001',
    'ACTIVE'
  )
  on conflict (character_id) do nothing;

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
grant execute on function platform.initialize_rpg_g01_player() to authenticated;
grant execute on function platform.initialize_rpg_g01_player() to service_role;

commit;

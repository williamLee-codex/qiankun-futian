begin;

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
  v_next_level integer;
  v_next_experience bigint;
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

  select p.id, c.id, c.level, c.experience
    into v_player_id, v_character_id, v_level, v_experience
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
    select progression.level, progression.experience
      into v_next_level, v_next_experience
    from platform.calculate_rpg_level_progression(
      v_level,
      v_experience + 10
    ) as progression;

    update platform.rpg_characters
      set level = v_next_level,
          experience = v_next_experience,
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

revoke all on function platform.settle_rpg_g01_tutorial_step(text) from public;
revoke all on function platform.settle_rpg_g01_tutorial_step(text) from anon;

grant execute on function platform.settle_rpg_g01_tutorial_step(text) to authenticated;
grant execute on function platform.settle_rpg_g01_tutorial_step(text) to service_role;

commit;

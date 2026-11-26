begin;

create or replace function platform.create_rpg_synthetic_batch(
  p_server_id text,
  p_requested_count integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing_count integer;
  v_player_id uuid;
  v_character_id uuid;
  v_created jsonb := '[]'::jsonb;
  v_index integer;
begin
  if p_server_id is null
     or char_length(btrim(p_server_id)) = 0
     or p_requested_count is null
     or p_requested_count <= 0 then
    raise exception 'RPG_SYNTHETIC_INVALID_BATCH';
  end if;

  lock table platform.rpg_synthetic_registry in share row exclusive mode;

  select count(*)::integer
    into v_existing_count
  from platform.rpg_synthetic_registry
  where server_id = btrim(p_server_id);

  if v_existing_count + p_requested_count > 399 then
    raise exception 'RPG_SYNTHETIC_SERVER_CAPACITY_EXCEEDED';
  end if;

  for v_index in 1..p_requested_count loop
    insert into platform.rpg_players (
      user_id,
      actor_type,
      server_id
    )
    values (
      null,
      'SYNTHETIC',
      btrim(p_server_id)
    )
    returning id into v_player_id;

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
      '修行者-' || substr(replace(v_player_id::text, '-', ''), 1, 8),
      1,
      0,
      '練氣一層',
      'LOC011',
      'active'
    )
    returning id into v_character_id;

    update platform.rpg_players
       set active_character_id = v_character_id,
           updated_at = now()
     where id = v_player_id;

    insert into platform.rpg_cultivation_progress (
      character_id
    )
    values (
      v_character_id
    );

    insert into platform.rpg_synthetic_registry (
      rpg_player_id,
      rpg_character_id,
      server_id,
      status,
      behavior_profile,
      runtime_status
    )
    values (
      v_player_id,
      v_character_id,
      btrim(p_server_id),
      'INACTIVE',
      '{}'::jsonb,
      'NORMAL'
    );

    v_created := v_created || jsonb_build_array(
      jsonb_build_object(
        'playerId', v_player_id::text,
        'characterId', v_character_id::text
      )
    );
  end loop;

  return jsonb_build_object(
    'serverId', btrim(p_server_id),
    'createdCount', p_requested_count,
    'players', v_created
  );
end;
$$;

revoke all on function platform.create_rpg_synthetic_batch(text, integer)
  from public, anon, authenticated;

grant execute on function platform.create_rpg_synthetic_batch(text, integer)
  to service_role;

commit;

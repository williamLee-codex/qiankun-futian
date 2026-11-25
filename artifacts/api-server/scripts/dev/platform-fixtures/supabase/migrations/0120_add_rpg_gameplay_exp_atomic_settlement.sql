begin;

create or replace function platform.settle_rpg_gameplay_experience(
  p_character_id uuid,
  p_event_key text,
  p_event_type text,
  p_experience_delta bigint,
  p_operation_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_level integer;
  v_experience bigint;
  v_next_level integer;
  v_next_experience bigint;
  v_event_id uuid;
begin
  if p_character_id is null
     or p_event_key is null
     or char_length(btrim(p_event_key)) not between 1 and 128
     or p_event_type is null
     or char_length(btrim(p_event_type)) not between 1 and 128
     or p_experience_delta is null
     or p_experience_delta < 0
     or p_operation_id is null
     or char_length(btrim(p_operation_id)) not between 1 and 128 then
    raise exception 'RPG_GAMEPLAY_EXP_INVALID_SETTLEMENT';
  end if;

  select c.level, c.experience
    into v_level, v_experience
  from platform.rpg_characters c
  where c.id = p_character_id
  for update;

  if not found then
    raise exception 'RPG_CHARACTER_NOT_FOUND';
  end if;

  perform 1
  from platform.rpg_progress_events
  where character_id = p_character_id
    and event_key = btrim(p_event_key);

  if found then
    return jsonb_build_object(
      'resultStatus', 'duplicate',
      'characterId', p_character_id::text,
      'level', v_level,
      'experience', v_experience
    );
  end if;

  insert into platform.rpg_progress_events (
    character_id,
    event_key,
    event_type,
    experience_delta,
    payload
  )
  values (
    p_character_id,
    btrim(p_event_key),
    btrim(p_event_type),
    p_experience_delta,
    jsonb_build_object('operationId', btrim(p_operation_id))
  )
  on conflict (character_id, event_key) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    select c.level, c.experience
      into v_level, v_experience
    from platform.rpg_characters c
    where c.id = p_character_id;

    return jsonb_build_object(
      'resultStatus', 'duplicate',
      'characterId', p_character_id::text,
      'level', v_level,
      'experience', v_experience
    );
  end if;

  select progression.level, progression.experience
    into v_next_level, v_next_experience
  from platform.calculate_rpg_level_progression(
    v_level,
    v_experience + p_experience_delta
  ) as progression;

  update platform.rpg_characters
    set level = v_next_level,
        experience = v_next_experience,
        updated_at = now()
  where id = p_character_id;

  return jsonb_build_object(
    'resultStatus', 'created',
    'characterId', p_character_id::text,
    'level', v_next_level,
    'experience', v_next_experience
  );
end;
$$;

revoke all on function platform.settle_rpg_gameplay_experience(uuid, text, text, bigint, text) from public;
revoke all on function platform.settle_rpg_gameplay_experience(uuid, text, text, bigint, text) from anon, authenticated;
grant execute on function platform.settle_rpg_gameplay_experience(uuid, text, text, bigint, text) to service_role;

comment on function platform.settle_rpg_gameplay_experience(uuid, text, text, bigint, text) is
  'Trusted RPG server settlement for idempotent gameplay EXP events. Level progression uses the canonical RPG level catalog and does not mutate main checkpoint state.';

commit;

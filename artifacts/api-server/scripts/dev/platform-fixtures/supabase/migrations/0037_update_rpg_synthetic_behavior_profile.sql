begin;

create or replace function platform.set_rpg_synthetic_behavior_profile(
  p_synthetic_id uuid,
  p_behavior_profile jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_record platform.rpg_synthetic_registry;
begin
  if p_synthetic_id is null
     or p_behavior_profile is null
     or jsonb_typeof(p_behavior_profile) <> 'object' then
    raise exception 'RPG_SYNTHETIC_INVALID_BEHAVIOR_PROFILE';
  end if;

  update platform.rpg_synthetic_registry
     set behavior_profile = p_behavior_profile,
         updated_at = now()
   where synthetic_id = p_synthetic_id
  returning *
    into v_record;

  if not found then
    raise exception 'RPG_SYNTHETIC_NOT_FOUND';
  end if;

  return jsonb_build_object(
    'syntheticId', v_record.synthetic_id::text,
    'serverId', v_record.server_id,
    'behaviorProfile', v_record.behavior_profile,
    'updatedAt', v_record.updated_at
  );
end;
$$;

revoke all on function platform.set_rpg_synthetic_behavior_profile(uuid, jsonb)
  from public, anon, authenticated;

grant execute on function platform.set_rpg_synthetic_behavior_profile(uuid, jsonb)
  to service_role;

commit;

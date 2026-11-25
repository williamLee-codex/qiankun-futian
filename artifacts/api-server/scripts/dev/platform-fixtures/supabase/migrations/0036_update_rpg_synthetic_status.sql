begin;

create or replace function platform.set_rpg_synthetic_status(
  p_synthetic_id uuid,
  p_status text
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
     or p_status not in ('ACTIVE', 'INACTIVE') then
    raise exception 'RPG_SYNTHETIC_INVALID_STATUS';
  end if;

  update platform.rpg_synthetic_registry
     set status = p_status,
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
    'status', v_record.status,
    'updatedAt', v_record.updated_at
  );
end;
$$;

revoke all on function platform.set_rpg_synthetic_status(uuid, text)
  from public, anon, authenticated;

grant execute on function platform.set_rpg_synthetic_status(uuid, text)
  to service_role;

commit;

-- Internal-only fail-closed wallet identity guard for future daily rewards.
-- This deliberately rejects legacy farm IDs that do not match an auth.users
-- UUID with a corresponding core.users record. Do not guess a mapping.
create or replace function public.farm_v2_resolve_verified_wallet_owner(p_farm_user_id text)
returns uuid language plpgsql stable security invoker set search_path = ''
as $$
declare v_owner uuid;
begin
 if p_farm_user_id is null or p_farm_user_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
  return null;
 end if;
 select a.id into v_owner
 from auth.users a
 where a.id::text=p_farm_user_id
 and exists(select 1 from core.users c where c.auth_user_id=a.id);
 return v_owner;
end;
$$;
revoke all on function public.farm_v2_resolve_verified_wallet_owner(text) from public,anon,authenticated;

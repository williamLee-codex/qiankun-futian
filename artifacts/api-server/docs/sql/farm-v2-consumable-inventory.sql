-- Server-side inventory read. No direct browser table privileges.
create or replace function public.farm_v2_consumable_inventory(p_user_id text)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
  'instant_harvest',coalesce(max(quantity) filter(where item_id='instant_harvest'),0),
  'double_harvest',coalesce(max(quantity) filter(where item_id='double_harvest'),0),
  'farm_protection_1h',coalesce(max(quantity) filter(where item_id='farm_protection_1h'),0),
  'yellow_upgrade',coalesce(max(quantity) filter(where item_id='yellow_upgrade'),0),
  'mystic_upgrade',coalesce(max(quantity) filter(where item_id='mystic_upgrade'),0))
 from public.farm_v2_consumable_balances where user_id=p_user_id;
$$;
revoke all on function public.farm_v2_consumable_inventory(text) from public,anon,authenticated;
grant execute on function public.farm_v2_consumable_inventory(text) to service_role;

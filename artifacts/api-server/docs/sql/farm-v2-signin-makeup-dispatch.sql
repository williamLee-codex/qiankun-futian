-- One trusted makeup entrypoint; rejects unimplemented item rewards.
create or replace function public.farm_v2_signin_makeup_day(
 p_user_id text,p_cycle_number integer,p_cycle_day integer
) returns jsonb language plpgsql volatile security invoker set search_path='' as $$
begin
 if p_cycle_day in (1,4,7,12,17,22,27) then
  return public.farm_v2_signin_makeup_coin_day(p_user_id,p_cycle_number,p_cycle_day);
 elsif p_cycle_day in (2,6,11,16,21,24,29) then
  return public.farm_v2_signin_makeup_material_day(p_user_id,p_cycle_number,p_cycle_day);
 elsif p_cycle_day in (10,25) then
  return public.farm_v2_signin_makeup_crystal_day(p_user_id,p_cycle_number,p_cycle_day);
 elsif p_cycle_day in (15,20,30) then
  return public.farm_v2_signin_makeup_pot_day(p_user_id,p_cycle_number,p_cycle_day);
 else
  return jsonb_build_object('status','unsupported_reward','cycleDay',p_cycle_day);
 end if;
end; $$;
revoke all on function public.farm_v2_signin_makeup_day(text,integer,integer) from public,anon,authenticated;

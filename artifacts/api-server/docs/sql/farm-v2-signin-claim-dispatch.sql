-- Single server-side sign-in claim entrypoint for all 30 reward days.
-- Consumables are issued to server-owned balances, not yet usable in game.
create or replace function public.farm_v2_signin_claim_day(
 p_user_id text,p_cycle_number integer,p_cycle_day integer
) returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare
 v_result jsonb;
begin
 if p_cycle_day in (1,4,7,12,17,22,27) then
   v_result:=public.farm_v2_signin_claim_coin_day(p_user_id,p_cycle_number,p_cycle_day);
 elsif p_cycle_day in (2,6,11,16,21,24,29) then
   v_result:=public.farm_v2_signin_claim_material_day(p_user_id,p_cycle_number,p_cycle_day);
 elsif p_cycle_day in (10,25) then
   v_result:=public.farm_v2_signin_claim_crystal_day(p_user_id,p_cycle_number,p_cycle_day);
 elsif p_cycle_day in (15,20,30) then
   v_result:=public.farm_v2_signin_claim_pot_day(p_user_id,p_cycle_number,p_cycle_day);
 elsif p_cycle_day in (3,5,8,9,13,14,18,19,23,26,28) then
   v_result:=public.farm_v2_signin_claim_consumable_day(p_user_id,p_cycle_number,p_cycle_day);
 else
   return jsonb_build_object('status','unsupported_reward','cycleDay',p_cycle_day);
 end if;
 return v_result;
end; $$;
revoke all on function public.farm_v2_signin_claim_day(text,integer,integer) from public,anon,authenticated;

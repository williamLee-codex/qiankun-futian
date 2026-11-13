-- Atomic makeup of coin sign-in days; chronological, once per earned credit.
create or replace function public.farm_v2_signin_makeup_crystal_day(
 p_user_id text,p_cycle_number integer,p_cycle_day integer
) returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare
 v_cycle public.farm_v2_signin_cycles%rowtype;
 v_today date:=(now() at time zone 'Asia/Taipei')::date;
 v_current integer;
 v_granted integer;
 v_used integer;
 v_amount integer;
 v_owner uuid;
 v_result jsonb;
 v_tx uuid;
begin
 v_amount:=case p_cycle_day when 10 then 1 when 25 then 2 else null end;
 if v_amount is null then return jsonb_build_object('status','unsupported_reward'); end if;
 select * into v_cycle from public.farm_v2_signin_cycles
  where user_id=p_user_id and cycle_number=p_cycle_number for update;
 if not found then return jsonb_build_object('status','cycle_not_found'); end if;
 v_current:=v_today-v_cycle.cycle_start_day+1;
 if v_current not between 1 and 30 then return jsonb_build_object('status','cycle_inactive'); end if;
 if p_cycle_day>=v_current then return jsonb_build_object('status','not_past_day'); end if;
 if exists(select 1 from public.farm_v2_signin_days where user_id=p_user_id
  and cycle_number=p_cycle_number and cycle_day=p_cycle_day) then
  return jsonb_build_object('status','already_signed'); end if;
 select count(*) into v_granted from public.farm_v2_signin_makeup_grants
  where user_id=p_user_id and cycle_number=p_cycle_number and grant_day<=v_current;
 select count(*) into v_used from public.farm_v2_signin_days
  where user_id=p_user_id and cycle_number=p_cycle_number and is_makeup;
 if v_used>=v_granted then return jsonb_build_object('status','no_makeup_credit'); end if;
 if exists(select 1 from pg_catalog.generate_series(1,p_cycle_day-1) as d
  where not exists(select 1 from public.farm_v2_signin_days s
   where s.user_id=p_user_id and s.cycle_number=p_cycle_number and s.cycle_day=d)) then
  return jsonb_build_object('status','earlier_day_missing'); end if;
 v_owner:=public.farm_v2_resolve_verified_wallet_owner(p_user_id);
 if v_owner is null then return jsonb_build_object('status','unverified_identity'); end if;
 v_result:=public.core_wallet_apply_transaction(v_owner,v_amount,'crystal','credit',
  'farm-v2:signin:'||p_user_id||':'||p_cycle_number||':'||p_cycle_day,
  'farm_v2_signin_makeup',p_cycle_number::text||':'||p_cycle_day,'farm_v2_signin',null);
 if v_result->>'result_status' not in ('created','duplicate') then
  raise exception 'SIGNIN_MAKEUP_WALLET_FAILURE: %',v_result->>'result_status'; end if;
 v_tx:=(v_result->'transaction'->>'id')::uuid;
 if v_tx is null then raise exception 'SIGNIN_MAKEUP_MISSING_LEDGER_ID'; end if;
 insert into public.farm_v2_signin_days(user_id,cycle_number,cycle_day,is_makeup,reward_transaction_id)
 values(p_user_id,p_cycle_number,p_cycle_day,true,v_tx);
 return jsonb_build_object('status','claimed','isMakeup',true,'cycleDay',p_cycle_day,
  'crystals',v_amount,'transactionId',v_tx,'makeupCreditsRemaining',v_granted-v_used-1);
end; $$;
revoke all on function public.farm_v2_signin_makeup_crystal_day(text,integer,integer) from public,anon,authenticated;

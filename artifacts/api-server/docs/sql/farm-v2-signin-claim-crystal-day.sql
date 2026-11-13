-- Day 10 and 25 crystal sign-in: same authoritative wallet/ledger as coins.
create or replace function public.farm_v2_signin_claim_crystal_day(
 p_user_id text, p_cycle_number integer, p_cycle_day integer
) returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare
 v_cycle public.farm_v2_signin_cycles%rowtype;
 v_today date := (now() at time zone 'Asia/Taipei')::date;
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
 if v_today-v_cycle.cycle_start_day+1<>p_cycle_day then
   return jsonb_build_object('status','not_today');
 end if;
 if exists(select 1 from public.farm_v2_signin_days
   where user_id=p_user_id and cycle_number=p_cycle_number and cycle_day=p_cycle_day) then
   return jsonb_build_object('status','already_signed');
 end if;
 v_owner:=public.farm_v2_resolve_verified_wallet_owner(p_user_id);
 if v_owner is null then return jsonb_build_object('status','unverified_identity'); end if;
 v_result:=public.core_wallet_apply_transaction(v_owner,v_amount,'crystal','credit',
   'farm-v2:signin:'||p_user_id||':'||p_cycle_number||':'||p_cycle_day,
   'farm_v2_signin',p_cycle_number::text||':'||p_cycle_day,'farm_v2_signin',null);
 if v_result->>'result_status' not in ('created','duplicate') then
   raise exception 'SIGNIN_CRYSTAL_WALLET_FAILURE: %',v_result->>'result_status';
 end if;
 v_tx:=(v_result->'transaction'->>'id')::uuid;
 if v_tx is null then raise exception 'SIGNIN_CRYSTAL_MISSING_LEDGER_ID'; end if;
 insert into public.farm_v2_signin_days(user_id,cycle_number,cycle_day,is_makeup,reward_transaction_id)
 values(p_user_id,p_cycle_number,p_cycle_day,false,v_tx);
 return jsonb_build_object('status','claimed','cycleDay',p_cycle_day,'crystals',v_amount,'transactionId',v_tx);
end; $$;
revoke all on function public.farm_v2_signin_claim_crystal_day(text,integer,integer) from public,anon,authenticated;

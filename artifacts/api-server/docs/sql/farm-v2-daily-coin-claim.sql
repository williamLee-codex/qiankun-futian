-- Internal-only atomic claim of the 30-point daily reward (10 coins).
-- The backend MUST authenticate the caller and supply the verified farm user ID.
-- Do not expose this function to browser roles. Requires installed daily summary,
-- canonical wallet-owner resolver, and core_wallet_apply_transaction.
create or replace function public.farm_v2_claim_daily_coin_reward(p_user_id text)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare v_day date; v_summary jsonb; v_owner uuid; v_key text; v_result jsonb; v_tx uuid; v_existing uuid;
begin
 v_day:=((now() at time zone 'Asia/Taipei')-interval '5 hours')::date;
 perform 1 from public.farm_v2_daily_activity_days where user_id=p_user_id and activity_day=v_day for update;
 if not found then return jsonb_build_object('status','not_initialized'); end if;
 select reward_transaction_id into v_existing from public.farm_v2_daily_activity_claims
 where user_id=p_user_id and activity_day=v_day and milestone=30;
 if found then return jsonb_build_object('status','already_claimed','transactionId',v_existing); end if;
 v_summary:=public.farm_v2_daily_activity_summary(p_user_id);
 if (v_summary->>'points')::integer < 30 then return jsonb_build_object('status','insufficient_points'); end if;
 v_owner:=public.farm_v2_resolve_verified_wallet_owner(p_user_id);
 if v_owner is null then return jsonb_build_object('status','unverified_identity'); end if;
 v_key:='farm-v2:daily:'||v_day::text||':30:'||p_user_id;
 v_result:=public.core_wallet_apply_transaction(v_owner,10,'coin','credit',v_key,
  'farm_v2_daily_activity_30',v_day::text,'farm_v2_daily_activity',null);
 if v_result->>'result_status' not in ('created','duplicate') then
  raise exception 'DAILY_REWARD_WALLET_FAILURE: %',v_result->>'result_status';
 end if;
 v_tx:=(v_result->'transaction'->>'id')::uuid;
 if v_tx is null then raise exception 'DAILY_REWARD_MISSING_LEDGER_ID'; end if;
 insert into public.farm_v2_daily_activity_claims(user_id,activity_day,milestone,reward_transaction_id)
 values(p_user_id,v_day,30,v_tx);
 return jsonb_build_object('status','claimed','milestone',30,'coins',10,'transactionId',v_tx);
end;
$$;
revoke all on function public.farm_v2_claim_daily_coin_reward(text) from public,anon,authenticated;

-- A single, authoritative sign-in status endpoint for the authenticated server.
-- Does not mutate attendance, grant prizes, or trust client-supplied balances.
create or replace function public.farm_v2_signin_status(p_user_id text)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare
 v_cycle public.farm_v2_signin_cycles%rowtype;
 v_summary jsonb;
 v_today date:=(now() at time zone 'Asia/Taipei')::date;
 v_current integer;
 v_claimable integer[];
 v_makeup integer[];
 v_next_makeup integer;
 v_credits integer;
begin
 select * into v_cycle from public.farm_v2_signin_cycles
 where user_id=p_user_id order by cycle_number desc limit 1;
 if not found then return jsonb_build_object('status','not_initialized'); end if;
 v_summary:=public.farm_v2_signin_cycle_summary(p_user_id,v_cycle.cycle_number);
 v_current:=v_today-v_cycle.cycle_start_day+1;
 select coalesce(array_agg(d order by d),'{}'::integer[]) into v_claimable
 from pg_catalog.generate_series(1,30) d
 where d=v_current and not(d in
 (select cycle_day from public.farm_v2_signin_days where user_id=p_user_id and cycle_number=v_cycle.cycle_number));
 select coalesce(array_agg(d order by d),'{}'::integer[]) into v_makeup
 from pg_catalog.generate_series(1,30) d
 where d<v_current and v_current between 2 and 30
 and not exists(select 1 from public.farm_v2_signin_days s
 where s.user_id=p_user_id and s.cycle_number=v_cycle.cycle_number and s.cycle_day=d);
 v_credits:=coalesce((v_summary->>'makeupCreditsAvailable')::integer,0);
 select min(d) into v_next_makeup from pg_catalog.generate_series(1,30) d
 where d<v_current and v_current between 2 and 30
 and not exists(select 1 from public.farm_v2_signin_days s
 where s.user_id=p_user_id and s.cycle_number=v_cycle.cycle_number and s.cycle_day=d);
 return v_summary || jsonb_build_object(
 'todayClaimable',coalesce(array_length(v_claimable,1),0)>0,
 'todayClaimDay',case when v_current between 1 and 30 and coalesce(array_length(v_claimable,1),0)>0 then v_current else null end,
 'makeupCandidates',to_jsonb(v_makeup),
 'nextMakeupDay',case when v_credits>0 then v_next_makeup else null end,
 'makeupClaimable',v_credits>0 and v_next_makeup is not null,
 'nextMakeupRewardSupported',v_next_makeup=any(array[1,2,4,6,7,10,11,12,15,16,17,20,21,22,24,25,27,29]),
 'supportedRewardDays',to_jsonb(array[1,2,4,6,7,10,11,12,15,16,17,20,21,22,24,25,27,29,30]),
 'pendingItemRewardDays',to_jsonb(array[3,5,8,9,13,14,18,19,23,26,28]));
end; $$;
revoke all on function public.farm_v2_signin_status(text) from public,anon,authenticated;

-- Cross-cycle perfect reward recovery; isolated rollback regression.
begin;
do $test$
declare
 v_user text;
 v_cycle integer:=987104;
 v_found integer;
 v_result jsonb;
begin
 select p.user_id into v_user from public.farm_v2_player_state p
 where public.farm_v2_resolve_verified_wallet_owner(p.user_id) is not null limit 1;
 if v_user is null then raise exception 'TEST_SETUP: no verified player'; end if;
 insert into public.farm_v2_signin_cycles(user_id,cycle_number,cycle_start_day)
 values(v_user,v_cycle,(now() at time zone 'Asia/Taipei')::date-31),
       (v_user,v_cycle+1,(now() at time zone 'Asia/Taipei')::date);
 insert into public.farm_v2_signin_days(user_id,cycle_number,cycle_day,is_makeup)
 select v_user,v_cycle,d,(d=2) from pg_catalog.generate_series(1,30)d;
 v_found:=public.farm_v2_signin_pending_perfect_cycle(v_user);
 if v_found<>v_cycle then raise exception 'previous cycle not discoverable: %',v_found; end if;
 v_result:=public.farm_v2_signin_claim_perfect(v_user,v_found);
 if v_result->>'status'<>'claimed' then raise exception 'previous award failed: %',v_result; end if;
 v_found:=public.farm_v2_signin_pending_perfect_cycle(v_user);
 if v_found is not null then raise exception 'claimed cycle still pending: %',v_found; end if;
 v_result:=public.farm_v2_signin_claim_perfect(v_user,v_cycle);
 if v_result->>'status'<>'already_claimed' then raise exception 'duplicate not rejected: %',v_result; end if;
end;
$test$;
rollback;

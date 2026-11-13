-- Exercise all 30 daily reward dispatch branches against an isolated database.
-- Requires one verified farm player. All prizes and fixtures are rolled back.
begin;
do $test$
declare
 v_user text;
 v_day integer;
 v_result jsonb;
 v_today date:=(now() at time zone 'Asia/Taipei' - interval '5 hours')::date;
begin
 select p.user_id into v_user from public.farm_v2_player_state p
 where public.farm_v2_resolve_verified_wallet_owner(p.user_id) is not null limit 1;
 if v_user is null then raise exception 'TEST_SETUP: no verified player'; end if;
 for v_day in 1..30 loop
   insert into public.farm_v2_signin_cycles(user_id,cycle_number,cycle_start_day)
   values(v_user,996000+v_day,v_today-(v_day-1));
   v_result:=public.farm_v2_signin_claim_day(v_user,996000+v_day,v_day);
   if v_result->>'status'<>'claimed' then
     raise exception 'DAY_%_REWARD_FAILED: %',v_day,v_result;
   end if;
   if not exists (
     select 1 from public.farm_v2_signin_days
     where user_id=v_user and cycle_number=996000+v_day and cycle_day=v_day
   ) then raise exception 'DAY_%_ATTENDANCE_MISSING',v_day; end if;
   v_result:=public.farm_v2_signin_claim_day(v_user,996000+v_day,v_day);
   if v_result->>'status'<>'already_signed' then
     raise exception 'DAY_%_DUPLICATE_NOT_REJECTED: %',v_day,v_result;
   end if;
 end loop;
end;
$test$;
rollback;

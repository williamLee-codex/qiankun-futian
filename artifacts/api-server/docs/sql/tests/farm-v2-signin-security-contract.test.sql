-- Read-only security contract for all installed sign-in RPCs.
-- Fail if a new function accidentally becomes callable by client roles,
-- or if SECURITY DEFINER is introduced.
do $test$
declare
 v_count integer;
 v_bad text;
begin
 select count(*) into v_count
 from pg_catalog.pg_proc p
 join pg_catalog.pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname like 'farm_v2_signin_%';
 if v_count <> 17 then
   raise exception 'SIGNIN_RPC_COUNT_CHANGED: expected 17, found %',v_count;
 end if;
 select pg_catalog.string_agg(p.proname, ', ' order by p.proname) into v_bad
 from pg_catalog.pg_proc p
 join pg_catalog.pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname like 'farm_v2_signin_%'
 and (p.prosecdef
   or pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
   or pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE'));
 if v_bad is not null then
   raise exception 'SIGNIN_RPC_SECURITY_REGRESSION: %',v_bad;
 end if;
 select pg_catalog.string_agg(c.relname, ', ' order by c.relname) into v_bad
 from pg_catalog.pg_class c
 join pg_catalog.pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public'
 and c.relname in ('farm_v2_signin_cycles','farm_v2_signin_days','farm_v2_signin_makeup_grants')
 and (not c.relrowsecurity
   or pg_catalog.has_table_privilege('anon',c.oid,'INSERT')
   or pg_catalog.has_table_privilege('authenticated',c.oid,'INSERT'));
 if v_bad is not null then
   raise exception 'SIGNIN_TABLE_SECURITY_REGRESSION: %',v_bad;
 end if;
end;
$test$;

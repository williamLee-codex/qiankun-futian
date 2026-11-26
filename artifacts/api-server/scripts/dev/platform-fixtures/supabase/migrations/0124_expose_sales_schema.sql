begin;
-- Expose the sales schema to PostgREST.
-- supabase-js calls the member RPCs through schema('sales'), which PostgREST only
-- serves when the schema is part of pgrst.db_schemas on the authenticator role.
-- Existing exposed schemas are preserved; nothing else is touched.

do $expose$
declare
  current_schemas text;
  next_schemas text;
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    raise notice 'authenticator role absent; PostgREST schema exposure skipped';
    return;
  end if;

  select split_part(cfg, '=', 2)
    into current_schemas
    from pg_db_role_setting s
    join pg_roles r on r.oid = s.setrole
    cross join lateral unnest(s.setconfig) as cfg
   where r.rolname = 'authenticator'
     and s.setdatabase in (0, (select oid from pg_database where datname = current_database()))
     and cfg like 'pgrst.db_schemas=%'
   order by s.setdatabase desc
   limit 1;

  current_schemas := coalesce(nullif(current_schemas, ''), 'public, graphql_public');

  if 'sales' = any (string_to_array(replace(current_schemas, ' ', ''), ',')) then
    next_schemas := current_schemas;
  else
    next_schemas := current_schemas || ', sales';
    execute format('alter role authenticator set pgrst.db_schemas = %L', next_schemas);
  end if;

  if not ('sales' = any (string_to_array(replace(next_schemas, ' ', ''), ','))) then
    raise exception 'SALES_SCHEMA_NOT_EXPOSED: %', next_schemas;
  end if;
end;
$expose$;

notify pgrst, 'reload config';
notify pgrst, 'reload schema';

commit;

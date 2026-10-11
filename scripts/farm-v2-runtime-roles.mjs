import { fileURLToPath } from "node:url";
import path from "node:path";
export function roleNames(runtime, operator) {
  for (const r of [runtime, operator])
    if (
      !/^[a-z][a-z0-9_]{0,62}$/.test(r) ||
      ["postgres", "service_role", "anon", "authenticated"].includes(r)
    )
      throw Error("INVALID_FARM_ROLE");
  if (runtime === operator) throw Error("SEPARATE_ROLES_REQUIRED");
  return [runtime, operator];
}
export function createRolesSql(runtime, operator) {
  const roles = roleNames(runtime, operator);
  return `BEGIN;
 DO $roles$ BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'ROLE_OPERATOR_REQUIRED'; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('${runtime}','${operator}')) THEN RAISE EXCEPTION 'ROLE_ALREADY_EXISTS'; END IF;
 END $roles$;
 ${roles
   .map(
     (
       r,
     ) => `CREATE ROLE ${r} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 0 PASSWORD NULL;
 ALTER ROLE ${r} SET search_path=pg_catalog,public;
 ALTER ROLE ${r} SET statement_timeout='15s';
 ALTER ROLE ${r} SET lock_timeout='3s';
 ALTER ROLE ${r} SET idle_in_transaction_session_timeout='8s';`,
   )
   .join("\n")}
 COMMIT;`;
}
export function revokeRolesSql(runtime, operator) {
  const roles = roleNames(runtime, operator);
  return `-- Emergency containment only, independently authorized; never DROP OWNED.
 BEGIN;
 ${roles.map((r) => `ALTER ROLE ${r} NOLOGIN CONNECTION LIMIT 0 PASSWORD NULL;`).join("\n")}
 COMMIT;
 -- Contain existing sessions before optional object revocation can fail.
 SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename IN ('${runtime}','${operator}') AND pid<>pg_backend_pid();
 BEGIN;
 REVOKE ALL PRIVILEGES ON public.farm_v2_player_state,public.farm_v2_land,public.farm_v2_mutation,public.farm_v2_authorization_attempt,public.farm_v2_reconciliation_case,public.farm_v2_reconciliation_event FROM ${roles.join(",")};
 REVOKE ALL PRIVILEGES ON SEQUENCE public.farm_v2_reconciliation_event_id_seq FROM ${roles.join(",")};
 REVOKE EXECUTE ON FUNCTION public.farm_v2_apply_atomic_pot_wallet(uuid,uuid,text,jsonb,text) FROM ${roles.join(",")};
 COMMIT;
 -- If object revocation fails, NOLOGIN/password removal and session containment above remain committed.`;
}
export function rolePreflightSql(runtime, operator) {
  roleNames(runtime, operator);
  return `BEGIN READ ONLY;
 SELECT current_database(),current_user,session_user,current_setting('statement_timeout'),current_setting('lock_timeout'),current_setting('idle_in_transaction_session_timeout');
 SELECT ssl,version,cipher FROM pg_stat_ssl WHERE pid=pg_backend_pid();
 SELECT rolname,rolcanlogin,rolinherit,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,rolreplication,rolconnlimit FROM pg_roles WHERE rolname IN ('${runtime}','${operator}');
 SELECT member::regrole,roleid::regrole FROM pg_auth_members WHERE member IN ('${runtime}'::regrole,'${operator}'::regrole);
 SELECT r.rolname,p.oid::regprocedure,p.prosecdef,pg_get_userbyid(p.proowner) AS owner,p.proconfig,p.proacl
 FROM pg_roles r CROSS JOIN pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE r.rolname IN ('${runtime}','${operator}') AND n.nspname IN ('public','platform','core')
 AND p.prosecdef AND has_function_privilege(r.rolname,p.oid,'EXECUTE');
 SELECT r.rolname,c.oid::regclass,has_table_privilege(r.rolname,c.oid,'SELECT') AS can_read,
 has_table_privilege(r.rolname,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE') AS any_write
 FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE r.rolname IN ('${runtime}','${operator}') AND n.nspname='public' AND c.relkind='r'
 AND (c.relname LIKE 'farm_v2_%' OR c.relname IN ('core_wallets','core_wallet_ledger'));
 ROLLBACK;`;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const a = process.argv.slice(2),
      v = (f) => a[a.indexOf(f) + 1];
    if (a.includes("--apply")) throw Error("REVIEW_ONLY_NO_APPLY");
    const fn = a.includes("--emit-create")
      ? createRolesSql
      : a.includes("--emit-revoke")
        ? revokeRolesSql
        : a.includes("--emit-preflight")
          ? rolePreflightSql
          : null;
    if (!fn) throw Error("EXPLICIT_OFFLINE_MODE_REQUIRED");
    console.log(fn(v("--runtime-role"), v("--operator-role")));
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}

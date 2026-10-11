import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const q = (s) => "'" + s.replaceAll("'", "''") + "'";
export const hash = (s) =>
  createHash("sha256").update(s.replace(/\r\n/g, "\n")).digest("hex");
export function loadFarmMigrations(platformRoot) {
  const map = JSON.parse(
    readFileSync(
      path.join(root, "lib/db/production-migration-map.json"),
      "utf8",
    ),
  );
  const platform = JSON.parse(
    readFileSync(
      path.join(platformRoot, "supabase/production-migration-map.json"),
      "utf8",
    ),
  );
  if (map.projectRef !== "qowjznvinqoxekiyjyvy")
    throw Error("PROJECT_AUTHORITY_MISMATCH");
  const prev = [];
  for (let n = 123; n <= 133; n++) {
    const m = platform.migrations[String(n).padStart(4, "0")];
    if (!m || m.projectRef !== map.projectRef)
      throw Error("PLATFORM_DEPENDENCY_MISSING");
    const source = readFileSync(
      path.join(platformRoot, m.file),
      "utf8",
    ).replace(/\r\n/g, "\n");
    if (hash(source) !== m.sha256) throw Error("PLATFORM_SOURCE_DRIFT");
    prev.push({ ...m, source });
  }
  const result = map.migrations.map((m) => {
    const source = readFileSync(path.join(root, m.file), "utf8").replace(
      /\r\n/g,
      "\n",
    );
    if (hash(source) !== m.sha256) throw Error("FARM_SOURCE_DRIFT");
    if (
      !/^\d{14}$/.test(m.version) ||
      prev.some((p) => p.version === m.version)
    )
      throw Error("VERSION_COLLISION");
    const prerequisites = [...prev];
    prev.push({ ...m, source });
    return { ...m, source, prerequisites };
  });
  if (
    result.some(
      (m, i) =>
        m.version <= m.prerequisites.at(-1).version ||
        m.id !== String(i + 1).padStart(4, "0"),
    )
  )
    throw Error("DEPENDENCY_ORDER_DRIFT");
  return result;
}
export function guard(m) {
  return `DO $farm_gate$ BEGIN
 IF current_user <> 'postgres' THEN RAISE EXCEPTION 'MIGRATION_OPERATOR_REQUIRED'; END IF;
 IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version>=${q(m.version)} OR name=${q(m.name)}) THEN RAISE EXCEPTION 'MIGRATION_VERSION_CONFLICT'; END IF;
 ${m.prerequisites.map((p) => `IF NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version=${q(p.version)} AND name=${q(p.name)} AND statements=ARRAY[${q(p.source)}]::text[]) THEN RAISE EXCEPTION 'MIGRATION_PREDECESSOR_DRIFT'; END IF;`).join("\n")}
 ${m.targets.map((t) => `IF to_regclass(${q("public." + t)}) IS NOT NULL THEN RAISE EXCEPTION 'FARM_TARGET_CONFLICT'; END IF;`).join("\n")}
 ${m.id === "0001" ? "IF to_regprocedure('public.farm_v2_audit_append_only()') IS NOT NULL THEN RAISE EXCEPTION 'FARM_TARGET_CONFLICT'; END IF;" : ""}
 END $farm_gate$;`;
}
export function reviewedSql(m) {
  const body = m.source
    .replace(/^([\s\S]*?)\bBEGIN\s*;/i, "$1")
    .replace(/\bCOMMIT\s*;\s*$/i, "");
  if (/\b(?:BEGIN|COMMIT)\s*;/i.test(body))
    throw Error("UNEXPECTED_TRANSACTION_BOUNDARY");
  return `BEGIN;
 SET LOCAL search_path=public;
 SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='30s'; SET LOCAL idle_in_transaction_session_timeout='8s';
 SELECT pg_advisory_xact_lock(hashtextextended('imperial-compass-production-migrations',0));
 ${guard(m)}
 ${body}
 INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES(${q(m.version)},${q(m.name)},ARRAY[${q(m.source)}]::text[]);
 COMMIT;`;
}
export function grantsSql(runtime, operator) {
  for (const role of [runtime, operator])
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(role)) throw Error("INVALID_ROLE_NAME");
  if (runtime === operator) throw Error("SEPARATE_OPERATOR_REQUIRED");
  const tables =
    "public.farm_v2_player_state,public.farm_v2_land,public.farm_v2_mutation,public.farm_v2_authorization_attempt";
  return `BEGIN;
 DO $roles$ BEGIN
 ${[runtime, operator]
   .map(
     (
       role,
     ) => `IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=${q(role)} AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb) OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member=${q(role)}::regrole) THEN RAISE EXCEPTION 'UNSAFE_FARM_ROLE'; END IF;
 IF has_table_privilege(${q(role)},'public.core_wallets','INSERT,UPDATE,DELETE,TRUNCATE') OR has_table_privilege(${q(role)},'public.core_wallet_ledger','INSERT,UPDATE,DELETE,TRUNCATE') OR has_function_privilege(${q(role)},'public.core_wallet_apply_transaction(uuid,integer,text,text,text,text,text,text,uuid)','EXECUTE') OR has_function_privilege(${q(role)},'public.farm_v2_apply_wallet_transaction(uuid,text,integer,text,text,text,text,text,uuid)','EXECUTE') THEN RAISE EXCEPTION 'CORE_AUTHORITY_ROLE_CONFLICT'; END IF;`,
   )
   .join("\n")}
 END $roles$;
 GRANT USAGE ON SCHEMA public,core TO ${runtime},${operator};
 GRANT SELECT,INSERT,UPDATE ON ${tables} TO ${runtime},${operator};
 GRANT EXECUTE ON FUNCTION public.farm_v2_apply_atomic_pot_wallet(uuid,uuid,text,jsonb,text) TO ${runtime};
 GRANT SELECT,INSERT,UPDATE ON public.farm_v2_reconciliation_case TO ${operator};
 GRANT SELECT,INSERT ON public.farm_v2_reconciliation_event TO ${operator};
 GRANT USAGE ON SEQUENCE public.farm_v2_reconciliation_event_id_seq TO ${operator};
 COMMIT;`;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const a = process.argv.slice(2),
      value = (f) => a[a.indexOf(f) + 1];
    if (a.includes("--apply")) throw Error("REVIEW_ONLY_NO_APPLY");
    if (a.includes("--emit-grants")) {
      console.log(grantsSql(value("--runtime-role"), value("--operator-role")));
    } else {
      if (!a.includes("--platform-checkout"))
        throw Error("PLATFORM_CHECKOUT_REQUIRED");
      const ms = loadFarmMigrations(path.resolve(value("--platform-checkout")));
      if (a.includes("--plan"))
        console.log(
          JSON.stringify(
            ms.map(({ source, prerequisites, ...m }) => ({
              ...m,
              dependencyVersions: prerequisites.map((p) => p.version),
              mode: "review-only",
              liveIdentityVerified: false,
            })),
            null,
            2,
          ),
        );
      else {
        const m = ms.find((m) => m.id === value("--migration"));
        if (!m) throw Error("MIGRATION_REQUIRED");
        if (a.includes("--emit-preflight"))
          console.log("BEGIN READ ONLY;\n" + guard(m) + "\nROLLBACK;");
        else if (a.includes("--emit-reviewed-sql")) console.log(reviewedSql(m));
        else throw Error("EXPLICIT_OFFLINE_MODE_REQUIRED");
      }
    }
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}

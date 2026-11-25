import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
const q = (s) => "'" + s.replaceAll("'", "''") + "'";
export function atomicPotPreflightSql(platformRoot, runtimeRole) {
  const runtime = runtimeRole ? q(runtimeRole) : "current_user";
  const map = JSON.parse(
    readFileSync(
      path.join(platformRoot, "supabase/production-migration-map.json"),
      "utf8",
    ),
  );
  const latest = new Map();
  for (let n = 123; n <= 132; n++) {
    const m = map.migrations[String(n).padStart(4, "0")];
    if (!m) throw new Error("PLATFORM_MIGRATION_CONTRACT_MISSING");
    const source = readFileSync(
      path.join(platformRoot, m.file),
      "utf8",
    ).replace(/\r\n/g, "\n");
    if (createHash("sha256").update(source).digest("hex") !== m.sha256)
      throw new Error("PLATFORM_MIGRATION_HASH_MISMATCH");
    for (const match of source.matchAll(
      /CREATE(?: OR REPLACE)? FUNCTION\s+([\w.]+)\(([\s\S]*?)\)\s*RETURNS\s+(\w+)([\s\S]*?)AS \$fn\$([\s\S]*?)\$fn\$/g,
    )) {
      const types = match[2]
        .split(",")
        .map((a) => a.trim().split(/\s+/)[1])
        .filter(Boolean);
      latest.set(match[1], {
        signature: match[1] + "(" + types.join(",") + ")",
        body: match[5],
        definer: /SECURITY DEFINER/.test(match[4]),
      });
    }
  }
  const checks = {
    farm_role_schema: `has_schema_privilege(${runtime},'public','USAGE') AND has_schema_privilege(${runtime},'core','USAGE')`,
  };
  const columns = {
    farm_v2_player_state:
      "user_id:text warehouse_state:jsonb updated_at:timestamptz",
    farm_v2_land:
      "user_id:text land_id:integer lifecycle:text access_active:boolean planted_quantity:integer planted_at:timestamptz matures_at:timestamptz version:bigint",
    farm_v2_mutation:
      "user_id:text request_id:text action:text response:jsonb transaction_state:text wallet_transaction:jsonb wallet_currency:text wallet_amount:integer wallet_direction:text updated_at:timestamptz",
    farm_v2_authorization_attempt: "id:uuid user_id:text state:text",
    core_wallets:
      "owner_id:uuid status:text coin_balance:integer crystal_balance:integer",
    core_wallet_ledger:
      "id:uuid owner_id:uuid idempotency_key:text reversal_of:uuid",
    farm_v2_paid_operations:
      "id:uuid user_id:uuid request_id:text action:text state:text",
    farm_v2_atomic_pot_receipts:
      "user_id:uuid request_id:text transaction_id:uuid command:jsonb",
  };
  for (const [table, fields] of Object.entries(columns)) {
    checks[table + "_columns"] = fields
      .split(" ")
      .map((f) => {
        const [name, type] = f.split(":");
        return `EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('public.${table}') AND attname=${q(name)} AND NOT attisdropped AND atttypid=to_regtype(${q(type)}))`;
      })
      .join(" AND ");
    checks[table + "_private"] = table.startsWith("core_wallet")
      ? `NOT has_table_privilege('anon',to_regclass('public.${table}'),'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AND NOT has_table_privilege('authenticated',to_regclass('public.${table}'),'INSERT,UPDATE,DELETE,TRUNCATE') AND EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('public.${table}') AND relrowsecurity) AND (SELECT count(*) FROM pg_policy WHERE polrelid=to_regclass('public.${table}'))=1 AND EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=to_regclass('public.${table}') AND polcmd='r' AND polroles=ARRAY['authenticated'::regrole::oid] AND regexp_replace(pg_get_expr(polqual,polrelid),'[()[:space:]]','','g')='SELECTauth.uidASuid=owner_id')`
      : `NOT has_table_privilege('anon',to_regclass('public.${table}'),'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AND NOT has_table_privilege('authenticated',to_regclass('public.${table}'),'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')`;
  }
  for (const name of [
    "farm_v2_player_state",
    "farm_v2_land",
    "farm_v2_mutation",
    "farm_v2_authorization_attempt",
  ])
    checks[name + "_runtime_access"] = ["SELECT", "INSERT", "UPDATE"]
      .map(
        (privilege) =>
          `has_table_privilege(${runtime},to_regclass('public.${name}'),'${privilege}')`,
      )
      .join(" AND ");
  for (const name of [
    "farm_v2_apply_atomic_pot_wallet",
    "farm_v2_apply_authorized_wallet_transaction",
    "farm_v2_apply_wallet_transaction",
    "farm_v2_workshop_wallet_contract",
    "farm_v2_closed_wallet_request_guard",
    "farm_v2_atomic_pot_receipt_guard",
  ]) {
    const f = latest.get("public." + name);
    if (!f) throw new Error("ATOMIC_RPC_SOURCE_MISSING");
    checks[name + "_source_acl"] =
      `EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure(${q(f.signature)}) AND p.prosecdef=${f.definer ? "true" : "false"} AND p.proconfig @> ARRAY['search_path=""']::text[] AND md5(replace(p.prosrc,E'\\r\\n',E'\\n'))=${q(createHash("md5").update(f.body).digest("hex"))} AND NOT has_function_privilege('anon',p.oid,'EXECUTE') AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE') ${name === "farm_v2_apply_atomic_pot_wallet" ? `AND has_function_privilege(${runtime},p.oid,'EXECUTE')` : ""})`;
  }
  checks.runtime_core_write_denied = `NOT has_table_privilege(${runtime},to_regclass('public.core_wallets'),'INSERT,UPDATE,DELETE,TRUNCATE') AND NOT has_table_privilege(${runtime},to_regclass('public.core_wallet_ledger'),'INSERT,UPDATE,DELETE,TRUNCATE') AND NOT has_function_privilege(${runtime},to_regprocedure('public.core_wallet_apply_transaction(uuid,integer,text,text,text,text,text,text,uuid)'),'EXECUTE') AND NOT has_function_privilege(${runtime},to_regprocedure('public.farm_v2_apply_wallet_transaction(uuid,text,integer,text,text,text,text,text,uuid)'),'EXECUTE')`;
  checks.history_catalog =
    "to_regclass('supabase_migrations.schema_migrations') IS NOT NULL AND has_table_privilege(current_user,to_regclass('supabase_migrations.schema_migrations'),'SELECT')";
  checks.cutover_observer_unfiltered =
    "EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) OR EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=to_regclass('public.farm_v2_paid_operations') AND pg_has_role(current_user,c.relowner,'USAGE'))";
  checks.receipt_rls =
    "EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('public.farm_v2_atomic_pot_receipts') AND relrowsecurity)";
  for (const [table, name, fn] of [
    [
      "core_wallet_ledger",
      "farm_v2_atomic_pot_compensation_guard",
      "farm_v2_atomic_pot_receipt_guard()",
    ],
    [
      "core_wallet_ledger",
      "farm_v2_closed_wallet_request_guard",
      "farm_v2_closed_wallet_request_guard()",
    ],
    [
      "farm_v2_atomic_pot_receipts",
      "farm_v2_atomic_pot_receipt_immutable",
      "farm_v2_atomic_pot_receipt_guard()",
    ],
  ])
    checks[name + "_trigger"] =
      `EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('public.${table}') AND tgname=${q(name)} AND tgenabled='O' AND tgfoid=to_regprocedure(${q("public." + fn)}))`;
  return (
    "BEGIN TRANSACTION READ ONLY;\nSELECT json_build_object(" +
    Object.entries(checks)
      .map(([k, v]) => q(k) + ",coalesce((" + v + "),false)")
      .join(",\n") +
    ")::text;\nROLLBACK;"
  );
}
export function atomicPotCutoverSql(platformRoot) {
  const map = JSON.parse(
    readFileSync(
      path.join(platformRoot, "supabase/production-migration-map.json"),
      "utf8",
    ),
  );
  const history = Array.from(
    { length: 10 },
    (_, i) => map.migrations[String(123 + i).padStart(4, "0")],
  )
    .map(
      (m) =>
        `EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version=${q(m.version)} AND name=${q(m.name)} AND statements=ARRAY[${q(readFileSync(path.join(platformRoot, m.file), "utf8").replace(/\r\n/g, "\n"))}]::text[])`,
    )
    .join(" AND ");
  return `BEGIN TRANSACTION READ ONLY;
SELECT json_build_object('migration_history',${history},'legacy_journals_drained',NOT EXISTS(SELECT 1 FROM public.farm_v2_mutation WHERE action LIKE 'WORKSHOP:%' AND action LIKE '%"synthesize"%' AND transaction_state<>'COMPLETED' AND transaction_state<>'COMPENSATED'),
'core_permits_drained',NOT EXISTS(SELECT 1 FROM public.farm_v2_paid_operations WHERE action='POST:/farm/v2/workshop' AND state='OPEN'))::text;
ROLLBACK;`;
}
function main() {
  if (process.argv.includes("--apply")) throw new Error("READ_ONLY_TOOL");
  const option = process.argv.indexOf("--platform-checkout"),
    platformRoot =
      option >= 0
        ? process.argv[option + 1]
        : process.env.FARM_V2_PLATFORM_CHECKOUT;
  if (!platformRoot) throw new Error("PLATFORM_CHECKOUT_REQUIRED");
  const runtimeIndex = process.argv.indexOf("--runtime-role"),
    runtimeRole =
      runtimeIndex >= 0 ? process.argv[runtimeIndex + 1] : undefined;
  const sql = atomicPotPreflightSql(platformRoot, runtimeRole);
  if (process.argv.includes("--emit-preflight")) {
    process.stdout.write(sql + "\n" + atomicPotCutoverSql(platformRoot) + "\n");
    return;
  }
  if (process.argv.includes("--plan")) {
    console.log(
      JSON.stringify(
        {
          mode: "read-only-plan",
          requirement:
            "Farm authoritative assets and Core Wallet on the same PostgreSQL database",
          platformProjectRef: "qowjznvinqoxekiyjyvy",
          requiredMigration: "20261010000132",
          atomicModeFlag: "FARM_V2_ATOMIC_POT_ENABLED=1",
          oldJournals: "must drain before cutover",
          productionIdentity: "not verified by an offline plan",
        },
        null,
        2,
      ),
    );
    return;
  }
  if (!process.env.DATABASE_URL) throw new Error("FARM_DATABASE_URL_REQUIRED");
  const url = new URL(process.env.DATABASE_URL);
  if (!["postgres:", "postgresql:"].includes(url.protocol))
    throw new Error("INVALID_DATABASE_URL");
  const env = {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGDATABASE: url.pathname.slice(1),
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGSSLMODE: url.searchParams.get("sslmode") || "require",
  };
  for (const query of [sql, atomicPotCutoverSql(platformRoot)]) {
    const r = spawnSync("psql", ["-X", "-q", "-At", "-v", "ON_ERROR_STOP=1"], {
      env,
      input: query,
      encoding: "utf8",
    });
    if (r.error || r.status !== 0)
      throw new Error("ATOMIC_PREFLIGHT_QUERY_BLOCKED");
    const checks = JSON.parse(r.stdout.trim());
    console.log(JSON.stringify(checks));
    if (Object.values(checks).some((v) => v !== true))
      throw new Error("ATOMIC_POT_PREFLIGHT_FAILED");
  }
  console.log(
    JSON.stringify({
      status: "PASS",
      identity: {
        database: url.pathname.slice(1),
        supabaseProjectRef:
          url.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i)?.[1] ??
          decodeURIComponent(url.username).match(
            /^postgres\.([a-z0-9]+)$/i,
          )?.[1] ??
          null,
      },
      livePlatformPermit:
        "validated on every actual operation; offline checks alone cannot prove remote co-location",
    }),
  );
}
if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
)
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }

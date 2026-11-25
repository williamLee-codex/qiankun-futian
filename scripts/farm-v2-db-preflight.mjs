import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = "lib/db/migrations/0001_farm_v2_authority_reconciliation.sql";
const schema = "lib/db/src/schema/farm-v2.ts";
const q = (s) => "'" + s.replaceAll("'", "''") + "'";
// This is a preflight contract, not a baseline creation script.
const tables = {
  farm_v2_player_state:
    "user_id:text first_farm_entered_at:timestamptz effective_paid_crystals:integer access_state:jsonb warehouse_state:jsonb mission_state:jsonb pet_state:jsonb farmer_state:jsonb chaos_seed_state:jsonb updated_at:timestamptz",
  farm_v2_land:
    "user_id:text land_id:integer lifecycle:text access_active:boolean planted_quantity:integer planted_at:timestamptz matures_at:timestamptz version:bigint",
  farm_v2_mutation:
    "request_id:text user_id:text action:text response:jsonb transaction_state:text wallet_direction:text wallet_currency:text wallet_amount:integer wallet_transaction:jsonb failure_code:text updated_at:timestamptz created_at:timestamptz",
};
const keys = {
  farm_v2_player_state: ["user_id"],
  farm_v2_land: ["user_id", "land_id"],
  farm_v2_mutation: ["user_id", "request_id"],
};
export function farmDbPreflightSql() {
  const checks = {
    schema_public:
      "current_schema()='public' AND has_schema_privilege(current_user,'public','CREATE')",
  };
  for (const [table, fields] of Object.entries(tables)) {
    checks[table + "_columns"] = fields
      .split(" ")
      .map((f) => {
        const [name, type] = f.split(":");
        return `EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=to_regclass('public.${table}') AND a.attname=${q(name)} AND a.atttypid=to_regtype(${q(type)}) AND NOT a.attisdropped)`;
      })
      .join(" AND ");
    checks[table + "_pk"] =
      `EXISTS(SELECT 1 FROM pg_index i WHERE i.indrelid=to_regclass('public.${table}') AND i.indisprimary AND i.indisvalid AND (SELECT array_agg(a.attname::text ORDER BY k.ord) FROM unnest(i.indkey::smallint[]) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.num)=ARRAY[${keys[table].map(q).join(",")}]::text[])`;
    checks[table + "_runtime_access"] =
      `CASE WHEN to_regclass('public.${table}') IS NULL THEN false ELSE has_table_privilege(current_user,'public.${table}','SELECT') AND has_table_privilege(current_user,'public.${table}','INSERT') AND has_table_privilege(current_user,'public.${table}','UPDATE') END`;
  }
  checks.migration_targets_absent =
    [
      "farm_v2_authorization_attempt",
      "farm_v2_reconciliation_case",
      "farm_v2_reconciliation_event",
    ]
      .map((t) => `to_regclass('public.${t}') IS NULL`)
      .join(" AND ") +
    " AND to_regprocedure('public.farm_v2_audit_append_only()') IS NULL";
  return (
    "BEGIN TRANSACTION READ ONLY;\nSELECT json_build_object(" +
    Object.entries(checks)
      .map(([k, v]) => `${q(k)},coalesce((${v}),false)`)
      .join(",\n") +
    ")::text;\nROLLBACK;"
  );
}
export function assertFarmDbPreflight(raw) {
  const data = JSON.parse(raw);
  const failed = Object.entries(data)
    .filter(([, v]) => v !== true)
    .map(([k]) => k);
  if (failed.length)
    throw new Error("FARM_DB_PREFLIGHT_FAILED: " + failed.join(", "));
  return data;
}
function main() {
  if (process.argv.includes("--apply"))
    throw new Error("READ_ONLY_TOOL: application not supported");
  if (
    process.argv.includes("--plan") &&
    process.argv.includes("--emit-preflight")
  )
    throw new Error("CONFLICTING_EXECUTION_MODES");
  const baseline = readFileSync(path.join(root, schema), "utf8");
  for (const t of Object.keys(tables))
    if (
      !baseline.includes('pgTable("' + t + '"') &&
      !baseline.includes('"' + t + '",')
    )
      throw new Error("BASELINE_SOURCE_CHANGED");
  if (process.argv.includes("--emit-preflight")) {
    console.log(farmDbPreflightSql());
    return;
  }
  if (process.argv.includes("--plan")) {
    console.log(
      JSON.stringify(
        {
          migration,
          executionOrder: [
            migration,
            "lib/db/migrations/0002_farm_v2_game_baseline.sql",
          ],
          preflightScope:
            "Legacy default: baseline runtime readiness before 0001; for fresh installation use docs/farm-v2-baseline-migration.md read-only catalog checks instead. 0001 has no structural dependency on baseline tables.",
          sha256: createHash("sha256")
            .update(
              readFileSync(path.join(root, migration), "utf8").replace(
                /\r\n/g,
                "\n",
              ),
            )
            .digest("hex"),
          baselineSource: schema,
          baselineSqlMigrationExists: readdirSync(
            path.join(root, "lib/db/migrations"),
          ).some((file) =>
            Object.keys(tables).some((t) =>
              new RegExp(
                "CREATE\\s+TABLE\\s+(?:public\\.)?" + t + "\\b",
                "i",
              ).test(
                readFileSync(
                  path.join(root, "lib/db/migrations", file),
                  "utf8",
                ),
              ),
            ),
          ),
          requiredBaseTables: Object.keys(tables),
          creationMechanism:
            "lib/db/migrations/0002_farm_v2_game_baseline.sql (strict transactional CREATE; never drizzle-kit push)",
          executionAuthority:
            "BLOCKED until operator verifies Farm DB identity and migration journal; this tool never applies SQL",
        },
        null,
        2,
      ),
    );
    return;
  }
  const connection = process.env.DATABASE_URL;
  if (!connection) throw new Error("FARM_DATABASE_URL_REQUIRED");
  const url = new URL(connection);
  if (!["postgres:", "postgresql:"].includes(url.protocol))
    throw new Error("INVALID_DATABASE_URL");
  const result = spawnSync(
    "psql",
    ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-At"],
    {
      input: farmDbPreflightSql(),
      encoding: "utf8",
      env: {
        ...process.env,
        PGHOST: url.hostname,
        PGPORT: url.port || "5432",
        PGDATABASE: url.pathname.slice(1),
        PGUSER: decodeURIComponent(url.username),
        PGPASSWORD: decodeURIComponent(url.password),
        PGSSLMODE: url.searchParams.get("sslmode") || "require",
      },
    },
  );
  if (result.error || result.status !== 0)
    throw new Error("FARM_DB_READ_ONLY_QUERY_FAILED");
  console.log(
    JSON.stringify(assertFarmDbPreflight(result.stdout.trim()), null, 2),
  );
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  try {
    main();
  } catch (e) {
    console.error("ERROR: " + e.message);
    process.exitCode = 1;
  }

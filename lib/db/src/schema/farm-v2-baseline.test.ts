import { expect, test } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  farmV2PlayerStateTable,
  farmV2LandTable,
  farmV2MutationTable,
} from "./farm-v2";
const container = process.env.LOCAL_TEST_POSTGRES_CONTAINER;
test.skipIf(!container)(
  "0002 catalog matches Drizzle columns, defaults, keys and absence of extra constraints",
  () => {
    expect(container).toMatch(/^farm-v2-.*test/);
    const db = `farm_v2_schema_test_${process.pid}`;
    const sql = (s: string, d = db) =>
      execFileSync(
        "docker",
        [
          "exec",
          "-i",
          container!,
          "psql",
          "-X",
          "-q",
          "-U",
          "postgres",
          "-d",
          d,
          "-At",
          "-v",
          "ON_ERROR_STOP=1",
        ],
        { input: s, encoding: "utf8" },
      ).trim();
    sql(`CREATE DATABASE ${db}`, "postgres");
    try {
      sql(
        readFileSync(
          "lib/db/migrations/0002_farm_v2_game_baseline.sql",
          "utf8",
        ),
      );
      for (const table of [
        farmV2PlayerStateTable,
        farmV2LandTable,
        farmV2MutationTable,
      ]) {
        const config = getTableConfig(table);
        const actual = JSON.parse(
          sql(
            `SELECT json_agg(json_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.${config.name}'::regclass AND a.attnum>0 AND NOT a.attisdropped`,
          ),
        );
        expect(actual).toEqual(
          config.columns.map((c) => ({
            name: c.name,
            type:
              c.getSQLType() === "timestamp with time zone"
                ? "timestamp with time zone"
                : c.getSQLType(),
            notNull: c.notNull,
            default: !c.hasDefault
              ? null
              : typeof c.default === "number"
                ? String(c.default)
                : typeof c.default === "string"
                  ? `'${c.default}'::text`
                  : "now()",
          })),
        );
        const keys = config.primaryKeys.length
          ? config.primaryKeys[0].columns.map((c) => c.name)
          : config.columns.filter((c) => c.primary).map((c) => c.name);
        expect(
          sql(
            `SELECT string_agg(a.attname,',' ORDER BY k.ord) FROM pg_constraint c CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.num WHERE c.conrelid='public.${config.name}'::regclass AND c.contype='p'`,
          ),
        ).toBe(keys.join(","));
        expect(
          sql(
            `SELECT count(*) FROM pg_constraint WHERE conrelid='public.${config.name}'::regclass AND contype IN ('f','c','u')`,
          ),
        ).toBe("0");
        expect(
          sql(
            `SELECT count(*) FROM pg_index WHERE indrelid='public.${config.name}'::regclass`,
          ),
        ).toBe("1");
      }
    } finally {
      sql(`DROP DATABASE ${db} WITH(FORCE)`, "postgres");
    }
  },
);

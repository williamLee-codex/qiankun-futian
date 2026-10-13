import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const farmV2PlayerStateTable = pgTable(
  "farm_v2_player_state",
  {
    userId: text("user_id").primaryKey(),
    firstFarmEnteredAt: timestamp("first_farm_entered_at", {
      withTimezone: true,
    }),
    effectivePaidCrystals: integer("effective_paid_crystals")
      .notNull()
      .default(0),
    accessState: jsonb("access_state").notNull(),
    warehouseState: jsonb("warehouse_state").notNull(),
    missionState: jsonb("mission_state").notNull(),
    petState: jsonb("pet_state").notNull(),
    farmerState: jsonb("farmer_state").notNull(),
    chaosSeedState: jsonb("chaos_seed_state"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "farm_v2_player_state_effective_paid_crystals_check",
      sql`${table.effectivePaidCrystals} >= 0`,
    ),
  ],
);

export const farmV2LandTable = pgTable(
  "farm_v2_land",
  {
    userId: text("user_id").notNull(),
    landId: integer("land_id").notNull(),
    lifecycle: text("lifecycle").notNull(),
    accessActive: boolean("access_active").notNull(),
    plantedQuantity: integer("planted_quantity").notNull().default(0),
    plantedAt: timestamp("planted_at", { withTimezone: true }),
    maturesAt: timestamp("matures_at", { withTimezone: true }),
    version: bigint("version", { mode: "number" }).notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.landId] }),
    check("farm_v2_land_land_id_check", sql`${table.landId} BETWEEN 1 AND 6`),
    check(
      "farm_v2_land_lifecycle_check",
      sql`${table.lifecycle} IN ('LOCKED','EMPTY','GROWING','MATURE')`,
    ),
    check(
      "farm_v2_land_planted_quantity_check",
      sql`${table.plantedQuantity} >= 0`,
    ),
    check("farm_v2_land_version_check", sql`${table.version} >= 0`),
  ],
);

export const farmV2MutationTable = pgTable(
  "farm_v2_mutation",
  {
    requestId: text("request_id").notNull(),
    userId: text("user_id").notNull(),
    action: text("action").notNull(),
    response: jsonb("response"),
    transactionState: text("transaction_state").notNull().default("PENDING"),
    walletDirection: text("wallet_direction"),
    walletCurrency: text("wallet_currency"),
    walletAmount: integer("wallet_amount"),
    walletTransaction: jsonb("wallet_transaction"),
    missionId: text("mission_id"),
    missionPeriodStart: timestamp("mission_period_start", { withTimezone: true }),
    missionMaterialId: text("mission_material_id"),
    missionMaterialQuantity: integer("mission_material_quantity"),
    failureCode: text("failure_code"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.requestId] }),
    check(
      "farm_v2_mutation_transaction_state_check",
      sql`${table.transactionState} IN ('PENDING','WALLET_APPLIED','COMPENSATING','COMPENSATED','COMPLETED','REJECTED')`,
    ),
    check(
      "farm_v2_mutation_wallet_direction_check",
      sql`${table.walletDirection} IN ('credit','debit')`,
    ),
    check(
      "farm_v2_mutation_wallet_currency_check",
      sql`${table.walletCurrency} IN ('coin','crystal')`,
    ),
    check(
      "farm_v2_mutation_wallet_amount_check",
      sql`${table.walletAmount} > 0`,
    ),
    check(
      "farm_v2_mutation_mission_claim_check",
      sql`(
        (${table.missionId} IS NULL AND ${table.missionPeriodStart} IS NULL AND ${table.missionMaterialId} IS NULL AND ${table.missionMaterialQuantity} IS NULL)
        OR
        (
          ${table.missionId} IS NOT NULL
          AND ${table.missionMaterialId} IS NOT NULL
          AND ${table.missionMaterialQuantity} IS NOT NULL
          AND ${table.walletDirection} IS NOT NULL
          AND ${table.walletCurrency} IS NOT NULL
          AND ${table.walletAmount} IS NOT NULL
          AND ${table.missionId} IN ('MISSION_D01','MISSION_D02','MISSION_D03','MISSION_D04','MISSION_W01','MISSION_W02','MISSION_W03','MISSION_W04')
          AND ${table.missionPeriodStart} IS NOT NULL
          AND ${table.missionMaterialId} = CASE WHEN ${table.missionId} LIKE 'MISSION_D%' THEN '蘊靈砂' ELSE '九霄玉髓' END
          AND ${table.missionMaterialQuantity} = CASE WHEN ${table.missionId} = 'MISSION_D04' THEN 3 ELSE 1 END
          AND ${table.walletDirection} = 'credit'
          AND ${table.walletCurrency} = 'coin'
          AND ${table.walletAmount} = CASE ${table.missionId}
            WHEN 'MISSION_D01' THEN 2 WHEN 'MISSION_D02' THEN 3 WHEN 'MISSION_D03' THEN 3 WHEN 'MISSION_D04' THEN 5
            WHEN 'MISSION_W01' THEN 10 WHEN 'MISSION_W02' THEN 15 WHEN 'MISSION_W03' THEN 15 WHEN 'MISSION_W04' THEN 20
          END
          AND ${table.action} = 'mission-claim:' || ${table.missionId}
        )
      )`,
    ),
    uniqueIndex("farm_v2_mutation_mission_period_unique")
      .on(table.userId, table.missionId, table.missionPeriodStart)
      .where(sql`${table.missionId} IS NOT NULL`),
  ],
);

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
  ],
);

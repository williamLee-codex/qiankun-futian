import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  uuid,
  index,
  unique,
  check,
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const farmV2PlayerStateTable = pgTable("farm_v2_player_state", {
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
});

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
  (table) => [primaryKey({ columns: [table.userId, table.landId] })],
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
  (table) => [primaryKey({ columns: [table.userId, table.requestId] })],
);

export const farmV2AuthorizationAttemptTable = pgTable(
  "farm_v2_authorization_attempt",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id").notNull(),
    requestId: text("request_id").notNull(),
    action: text("action").notNull(),
    state: text("state").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    coreSettledAt: timestamp("core_settled_at", { withTimezone: true }),
  },
  (t) => [
    check(
      "farm_v2_authorization_attempt_state_check",
      sql`${t.state} in ('OPEN','SETTLED','FENCED')`,
    ),
    index("farm_v2_authorization_outstanding")
      .on(t.userId)
      .where(sql`${t.coreSettledAt} is null`),
  ],
);
export const farmV2ReconciliationCaseTable = pgTable(
  "farm_v2_reconciliation_case",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    requestId: text("request_id").notNull(),
    actor: text("actor").notNull(),
    evidence: text("evidence").notNull(),
    status: text("status").notNull(),
    resolution: text("resolution"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique().on(t.userId, t.requestId),
    check(
      "farm_v2_reconciliation_case_status_check",
      sql`${t.status} in ('OPEN','NEEDS_FUNDS','ESCALATED','CLOSED')`,
    ),
  ],
);
export const farmV2ReconciliationEventTable = pgTable(
  "farm_v2_reconciliation_event",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    caseId: text("case_id")
      .notNull()
      .references(() => farmV2ReconciliationCaseTable.id),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    evidence: text("evidence").notNull(),
    details: jsonb("details").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

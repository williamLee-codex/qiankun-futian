import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// A liveness response never certifies migrations or production co-location.
// This anonymous probe reads catalog metadata only, never balances or users.
router.get("/healthz/ready", async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const configured = Boolean(
    process.env.PLATFORM_BASE_URL && process.env.REPLIT_APP_SHARED_SECRET,
  );
  if (!configured) {
    res.status(503).json({ status: "not_ready" });
    return;
  }
  try {
    const result = await pool.query(`SELECT
      to_regclass('public.farm_v2_player_state') IS NOT NULL
      AND to_regclass('public.farm_v2_land') IS NOT NULL
      AND to_regclass('public.farm_v2_mutation') IS NOT NULL
      AND to_regclass('public.farm_v2_authorization_attempt') IS NOT NULL
      AND to_regclass('public.farm_v2_atomic_pot_receipts') IS NOT NULL
      AND has_function_privilege(current_user,to_regprocedure('public.farm_v2_apply_atomic_pot_wallet(uuid,uuid,text,jsonb,text)'),'EXECUTE')
      AND has_table_privilege(current_user,to_regclass('public.farm_v2_player_state'),'SELECT,INSERT,UPDATE')
      AND (SELECT bool_and(has_table_privilege(current_user,t,p))
        FROM unnest(ARRAY['public.farm_v2_player_state','public.farm_v2_land','public.farm_v2_mutation','public.farm_v2_authorization_attempt']) t
        CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE']) p)
      AND NOT has_table_privilege(current_user,to_regclass('public.core_wallets'),'INSERT,UPDATE,DELETE')
      AND NOT has_table_privilege(current_user,to_regclass('public.core_wallet_ledger'),'INSERT,UPDATE,DELETE')
      AS ready`);
    const ready = result.rows[0]?.ready === true;
    res
      .status(ready ? 200 : 503)
      .json({ status: ready ? "ready" : "not_ready" });
  } catch {
    res.status(503).json({ status: "not_ready" });
  }
});

export default router;

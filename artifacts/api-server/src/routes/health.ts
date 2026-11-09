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
    console.warn("FARM_READINESS_CONFIGURATION_MISSING");
    res.status(503).json({ status: "not_ready" });
    return;
  }
  try {
    const result = await pool.query(`SELECT
      current_setting('statement_timeout') = '15s'
      AND current_setting('lock_timeout') = '3s'
      AND current_setting('idle_in_transaction_session_timeout') = '8s'
      AND to_regclass('public.farm_v2_player_state') IS NOT NULL
      AND to_regclass('public.farm_v2_land') IS NOT NULL
      AND to_regclass('public.farm_v2_mutation') IS NOT NULL
      AND to_regclass('public.farm_v2_authorization_attempt') IS NOT NULL
      AND to_regclass('public.farm_v2_atomic_pot_receipts') IS NOT NULL
      AND has_function_privilege(current_user,to_regprocedure('public.farm_v2_apply_atomic_pot_wallet(uuid,uuid,text,jsonb,text)'),'EXECUTE')
      AND has_function_privilege(current_user,to_regprocedure('public.farm_v2_inspect_recovery(uuid,text)'),'EXECUTE')
      AND has_function_privilege(current_user,to_regprocedure('public.farm_v2_observe_recovery(uuid,text)'),'EXECUTE')
      AND has_table_privilege(current_user,to_regclass('public.farm_v2_player_state'),'SELECT,INSERT,UPDATE')
      AND (SELECT bool_and(has_table_privilege(current_user,t,p))
        FROM unnest(ARRAY['public.farm_v2_player_state','public.farm_v2_land','public.farm_v2_mutation','public.farm_v2_authorization_attempt']) t
        CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE']) p)
      AND NOT has_table_privilege(current_user,to_regclass('public.core_wallets'),'INSERT,UPDATE,DELETE')
      AND NOT has_table_privilege(current_user,to_regclass('public.core_wallet_ledger'),'INSERT,UPDATE,DELETE')
      AS ready`);
    const ready = result.rows[0]?.ready === true;
    if (!ready) console.warn("FARM_READINESS_DATABASE_REQUIREMENTS_FAILED");
    res
      .status(ready ? 200 : 503)
      .json({ status: ready ? "ready" : "not_ready" });
  } catch (error) {
    const knownCodes = new Set([
      "SELF_SIGNED_CERT_IN_CHAIN", "DEPTH_ZERO_SELF_SIGNED_CERT",
      "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
      "CERT_HAS_EXPIRED", "ERR_TLS_CERT_ALTNAME_INVALID",
      "ENETUNREACH", "EHOSTUNREACH", "ECONNREFUSED", "ECONNRESET",
      "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "ENOENT",
      "28P01", "28000", "08001", "08006", "42501", "42P01", "42883",
      "57014", "53300", "57P03", "3D000", "42704", "22023", "08P01",
    ]);
    const codes = new Set<string>();
    const pending: unknown[] = [error];
    for (let inspected = 0; pending.length > 0 && inspected < 12; inspected++) {
      const item = pending.shift();
      if (!item || typeof item !== "object") continue;
      const detail = item as { code?: unknown; cause?: unknown; errors?: unknown };
      if (typeof detail.code === "string" && knownCodes.has(detail.code))
        codes.add(detail.code);
      if (detail.cause) pending.push(detail.cause);
      if (Array.isArray(detail.errors)) pending.push(...detail.errors.slice(0, 6));
    }
    console.warn("FARM_READINESS_DATABASE_QUERY_FAILED", {
      codes: [...codes],
      timedOut: error instanceof Error && /^timeout exceeded when trying to connect$/i.test(error.message),
    });
    res.status(503).json({ status: "not_ready" });
  }
});

export default router;

import { Router, type IRouter } from "express";

const router: IRouter = Router();

/**
 * Security boundary: these routes must not accept user IDs, launch tokens,
 * bridge secrets, or wallet balances supplied by a browser as authority.
 *
 * Until the server can verify a Farm session and proxy requests to the
 * central platform with a server-only secret, fail closed. In particular,
 * do not simulate a successful transfer or use localStorage balances.
 */
router.post("/farm-v2/coin-balances", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.status(503).json({ error: "FARM_WALLET_BRIDGE_NOT_CONFIGURED" });
});

router.post("/farm-v2/coin-conversion", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.status(503).json({ error: "FARM_WALLET_BRIDGE_NOT_CONFIGURED" });
});

export default router;

import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { sowFarmV2Land } from "../lib/farm-v2-sow";
import { harvestFarmV2Land } from "../lib/farm-v2-harvest";
import { requireFarmV2LaunchIdentity } from "../middlewares/farm-v2-launch-auth";
import { farmV2ErrorHandler } from "../middlewares/farm-v2-error-handler";
import { ensureFarmV2PlayerInitialized } from "../lib/farm-v2-init";
import { purchaseFarmV2SeedPacks } from "../lib/farm-v2-seed-purchase";
import { exchangeFarmV2Crops } from "../lib/farm-v2-crop-exchange";
import { reconcileFarmV2PaidAccessFromCore } from "../lib/farm-v2-paid-access";

const router: IRouter = Router();

router.use("/farm/v2", requireFarmV2LaunchIdentity);

router.get("/farm/v2/state", async (req, res, next) => {
  try {
    const userId = String(res.locals.authenticatedUserId ?? "").trim();
    if (!userId) {
      res.status(401).json({ error: "AUTH_REQUIRED" });
      return;
    }

    const launchToken = String(res.locals.launchToken ?? "").trim();
    if (!launchToken) {
      res.status(401).json({ error: "AUTH_REQUIRED" });
      return;
    }

    // Initialize first, then reconcile against Core on every state read.
    // Never serve cached paid entitlements when Core is unavailable.
    await ensureFarmV2PlayerInitialized({ userId });
    await reconcileFarmV2PaidAccessFromCore({
      userId,
      launchToken,
      requestId: `farm-v2-state:${randomUUID()}`,
    });
    // Return the committed, post-reconciliation state rather than the
    // pre-reconciliation snapshot.
    const state = await ensureFarmV2PlayerInitialized({ userId });
    res.setHeader("Cache-Control", "no-store");
    res.json(state);
  } catch (error) {
    next(error);
  }
});

router.post("/farm/v2/lands/:landId/sow", async (req, res, next) => {
  try {
    const userId = String(res.locals.authenticatedUserId ?? "").trim();
    const requestId = String(req.header("x-request-id") ?? "").trim();
    if (!userId) {
      res.status(401).json({ error: "AUTH_REQUIRED" });
      return;
    }
    if (!requestId) {
      res.status(400).json({ error: "REQUEST_ID_REQUIRED" });
      return;
    }

    const launchToken = String(res.locals.launchToken ?? "").trim();
    if (!launchToken) { res.status(401).json({ error: "AUTH_REQUIRED" }); return; }
    // Refresh paid land access before accepting a gameplay mutation.
    // Core outage fails closed instead of trusting cached unlocks.
    await reconcileFarmV2PaidAccessFromCore({
      userId, launchToken, requestId: `farm-v2-sowFarmV2Land:${randomUUID()}`,
    });
    const result = await sowFarmV2Land({
      requestId,
      userId,
      landId: Number(req.params.landId),
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/farm/v2/lands/:landId/harvest", async (req, res, next) => {
  try {
    const userId = String(res.locals.authenticatedUserId ?? "").trim();
    const requestId = String(req.header("x-request-id") ?? "").trim();
    if (!userId) { res.status(401).json({ error: "AUTH_REQUIRED" }); return; }
    if (!requestId) { res.status(400).json({ error: "REQUEST_ID_REQUIRED" }); return; }
    const launchToken = String(res.locals.launchToken ?? "").trim();
    if (!launchToken) { res.status(401).json({ error: "AUTH_REQUIRED" }); return; }
    // Refresh paid land access before accepting a gameplay mutation.
    // Core outage fails closed instead of trusting cached unlocks.
    await reconcileFarmV2PaidAccessFromCore({
      userId, launchToken, requestId: `farm-v2-harvestFarmV2Land:${randomUUID()}`,
    });
    const result = await harvestFarmV2Land({ requestId, userId, landId: Number(req.params.landId) });
    res.json(result);
  } catch (error) { next(error); }
});

router.post("/farm/v2/seeds/:landId/purchase", async (req, res, next) => {
  try {
    const userId = String(res.locals.authenticatedUserId ?? "").trim();
    const launchToken = String(res.locals.launchToken ?? "").trim();
    const requestId = String(req.header("x-request-id") ?? "").trim();
    if (!userId || !launchToken) { res.status(401).json({ error: "AUTH_REQUIRED" }); return; }
    if (!requestId) { res.status(400).json({ error: "REQUEST_ID_REQUIRED" }); return; }
    const result = await purchaseFarmV2SeedPacks({
      userId,
      launchToken,
      requestId,
      landId: Number(req.params.landId),
      packs: Number(req.body?.packs),
    });
    res.json(result);
  } catch (error) { next(error); }
});

router.post("/farm/v2/crops/:landId/exchange", async (req, res, next) => {
  try {
    const userId = String(res.locals.authenticatedUserId ?? "").trim();
    const launchToken = String(res.locals.launchToken ?? "").trim();
    const requestId = String(req.header("x-request-id") ?? "").trim();
    if (!userId || !launchToken) { res.status(401).json({ error: "AUTH_REQUIRED" }); return; }
    if (!requestId) { res.status(400).json({ error: "REQUEST_ID_REQUIRED" }); return; }
    const result = await exchangeFarmV2Crops({
      userId, launchToken, requestId,
      landId: Number(req.params.landId),
      cropQuantity: Number(req.body?.cropQuantity),
    });
    res.json(result);
  } catch (error) { next(error); }
});

// Never accept paid qualification from the request body. Only Core Wallet
// can supply it; unavailable Core authority fails closed.
router.post("/farm/v2/internal/effective-paid/reconcile", async (req, res, next) => {
  try {
    const userId = String(res.locals.authenticatedUserId ?? "").trim();
    const launchToken = String(res.locals.launchToken ?? "").trim();
    const requestId = String(req.header("x-request-id") ?? "").trim();
    if (!userId || !launchToken) { res.status(401).json({ error: "AUTH_REQUIRED" }); return; }
    if (!requestId) { res.status(400).json({ error: "REQUEST_ID_REQUIRED" }); return; }
    const result = await reconcileFarmV2PaidAccessFromCore({ userId, launchToken, requestId });
    res.json(result);
  } catch (error) { next(error); }
});

router.use("/farm/v2", farmV2ErrorHandler);

export default router;

import { purchaseFarmV2CoinLand } from '../lib/farm-v2-coin-land-unlock';
import { setFarmV2FarmerPreference } from "../lib/farm-v2-farmer";
import { claimFarmV2ChaosSeeds } from "../lib/farm-v2-chaos-claim";
import { Router, type IRouter } from "express";
import { and, eq, notInArray, isNotNull } from "drizzle-orm";
import { db, farmV2MutationTable } from "@workspace/db";
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
      requestId: "farm-v2:core-paid-refresh:v1",
      settleFarmer: true,
    });
    // Return the committed, post-reconciliation state rather than the
    // pre-reconciliation snapshot.
    const state = await ensureFarmV2PlayerInitialized({ userId });
    res.setHeader("Cache-Control", "no-store");
    const pending = await db
      .select()
      .from(farmV2MutationTable)
      .where(
        and(
          eq(farmV2MutationTable.userId, userId),
          isNotNull(farmV2MutationTable.walletDirection),
          notInArray(farmV2MutationTable.transactionState, [
            "COMPLETED",
            "REJECTED",
            "COMPENSATED",
          ]),
        ),
      )
      .orderBy(farmV2MutationTable.createdAt);
    const walletPending = pending.find((item) =>
      /^(seed-purchase|crop-exchange|coin-land-unlock):/.test(item.action),
    );
    const parts = walletPending?.action.split(":");
    res.json({
      ...state,
      serverTime: Date.now(),
      pendingMutation:
        walletPending && parts
          ? {
              requestId: walletPending.requestId,
              operation:
                parts[0] === "coin-land-unlock" ? "unlockCoinLand" : parts[0] === "seed-purchase" ? "purchaseSeeds" : "exchangeCrops",
              landId: Number(parts[1]),
              ...(parts[0] === "coin-land-unlock" ? {} : { quantity: Number(parts[2]) }),
            }
          : null,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/farm/v2/lands/:landId/unlock", async (req, res, next) => {
  try {
    const userId = String(res.locals.authenticatedUserId ?? '').trim();
    const launchToken = String(res.locals.launchToken ?? '').trim();
    const requestId = String(req.header('x-request-id') ?? '').trim();
    if (!userId || !launchToken) { res.status(401).json({error:'AUTH_REQUIRED'}); return; }
    if (!requestId) { res.status(400).json({error:'REQUEST_ID_REQUIRED', definitive:true}); return; }
    if (req.body && Object.keys(req.body).length) { res.status(400).json({error:'INVALID_UNLOCK_REQUEST',definitive:true}); return; }
    await ensureFarmV2PlayerInitialized({userId});
    res.json(await purchaseFarmV2CoinLand({userId,launchToken,requestId,landId:Number(req.params.landId)}));
  } catch(error) { next(error); }
});

router.post("/farm/v2/lands/:landId/farmer", async (req, res, next) => {
  try {
    const userId = String(res.locals.authenticatedUserId ?? "").trim();
    const launchToken = String(res.locals.launchToken ?? "").trim();
    const requestId = String(req.header("x-request-id") ?? "").trim();
    if (!userId || !launchToken) {
      res.status(401).json({ error: "AUTH_REQUIRED" });
      return;
    }
    if (!requestId) {
      res.status(400).json({ error: "REQUEST_ID_REQUIRED" });
      return;
    }
    if (typeof req.body?.enabled !== "boolean") {
      res
        .status(400)
        .json({ error: "INVALID_FARMER_PREFERENCE", definitive: true });
      return;
    }
    await reconcileFarmV2PaidAccessFromCore({
      userId,
      launchToken,
      requestId: "farm-v2:core-paid-refresh:v1",
    });
    res.json(
      await setFarmV2FarmerPreference({
        userId,
        requestId,
        landId: Number(req.params.landId),
        enabled: req.body.enabled,
      }),
    );
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
    if (!launchToken) {
      res.status(401).json({ error: "AUTH_REQUIRED" });
      return;
    }
    // Refresh paid land access before accepting a gameplay mutation.
    // Core outage fails closed instead of trusting cached unlocks.
    await reconcileFarmV2PaidAccessFromCore({
      userId,
      launchToken,
      requestId: "farm-v2:core-paid-refresh:v1",
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
    if (!userId) {
      res.status(401).json({ error: "AUTH_REQUIRED" });
      return;
    }
    if (!requestId) {
      res.status(400).json({ error: "REQUEST_ID_REQUIRED" });
      return;
    }
    const launchToken = String(res.locals.launchToken ?? "").trim();
    if (!launchToken) {
      res.status(401).json({ error: "AUTH_REQUIRED" });
      return;
    }
    // Refresh paid land access before accepting a gameplay mutation.
    // Core outage fails closed instead of trusting cached unlocks.
    await reconcileFarmV2PaidAccessFromCore({
      userId,
      launchToken,
      requestId: "farm-v2:core-paid-refresh:v1",
    });
    const result = await harvestFarmV2Land({
      requestId,
      userId,
      landId: Number(req.params.landId),
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/farm/v2/seeds/:landId/purchase", async (req, res, next) => {
  try {
    const userId = String(res.locals.authenticatedUserId ?? "").trim();
    const launchToken = String(res.locals.launchToken ?? "").trim();
    const requestId = String(req.header("x-request-id") ?? "").trim();
    if (!userId || !launchToken) {
      res.status(401).json({ error: "AUTH_REQUIRED" });
      return;
    }
    if (!requestId) {
      res.status(400).json({ error: "REQUEST_ID_REQUIRED" });
      return;
    }
    await reconcileFarmV2PaidAccessFromCore({
      userId,
      launchToken,
      requestId: "farm-v2:core-paid-refresh:v1",
    });
    const result = await purchaseFarmV2SeedPacks({
      userId,
      launchToken,
      requestId,
      landId: Number(req.params.landId),
      packs: Number(req.body?.packs),
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/farm/v2/crops/:landId/exchange", async (req, res, next) => {
  try {
    const userId = String(res.locals.authenticatedUserId ?? "").trim();
    const launchToken = String(res.locals.launchToken ?? "").trim();
    const requestId = String(req.header("x-request-id") ?? "").trim();
    if (!userId || !launchToken) {
      res.status(401).json({ error: "AUTH_REQUIRED" });
      return;
    }
    if (!requestId) {
      res.status(400).json({ error: "REQUEST_ID_REQUIRED" });
      return;
    }
    await reconcileFarmV2PaidAccessFromCore({
      userId,
      launchToken,
      requestId: "farm-v2:core-paid-refresh:v1",
    });
    const result = await exchangeFarmV2Crops({
      userId,
      launchToken,
      requestId,
      landId: Number(req.params.landId),
      cropQuantity: Number(req.body?.cropQuantity),
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/farm/v2/chaos-seeds/claim", async (req, res, next) => {
  try {
    const userId = String(res.locals.authenticatedUserId ?? "").trim();
    const launchToken = String(res.locals.launchToken ?? "").trim();
    const requestId = String(req.header("x-request-id") ?? "").trim();
    if (!userId || !launchToken) {
      res.status(401).json({ error: "AUTH_REQUIRED" });
      return;
    }
    if (!requestId) {
      res.status(400).json({ error: "REQUEST_ID_REQUIRED" });
      return;
    }
    await reconcileFarmV2PaidAccessFromCore({
      userId,
      launchToken,
      requestId: "farm-v2:core-paid-refresh:v1",
    });
    const result = await claimFarmV2ChaosSeeds({ userId, requestId });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Never accept paid qualification from the request body. Only Core Wallet
// can supply it; unavailable Core authority fails closed.
router.post(
  "/farm/v2/internal/effective-paid/reconcile",
  async (req, res, next) => {
    try {
      const userId = String(res.locals.authenticatedUserId ?? "").trim();
      const launchToken = String(res.locals.launchToken ?? "").trim();
      const requestId = String(req.header("x-request-id") ?? "").trim();
      if (!userId || !launchToken) {
        res.status(401).json({ error: "AUTH_REQUIRED" });
        return;
      }
      if (!requestId) {
        res.status(400).json({ error: "REQUEST_ID_REQUIRED" });
        return;
      }
      const result = await reconcileFarmV2PaidAccessFromCore({
        userId,
        launchToken,
        requestId,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

router.use("/farm/v2", farmV2ErrorHandler);

export default router;

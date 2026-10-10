import {
  claimFarmV2ChaosSeeds,
  configureFarmV2Farmer,
  settleFarmV2Farmer,
} from "../lib/farm-v2-gameplay";
import { randomUUID } from "node:crypto";
import { withFarmAuthority } from "../lib/farm-v2-authority";
import { Router, type IRouter, type RequestHandler } from "express";
import { sowFarmV2Land } from "../lib/farm-v2-sow";
import { harvestFarmV2Land } from "../lib/farm-v2-harvest";
import { requireFarmV2LaunchIdentity } from "../middlewares/farm-v2-launch-auth";
import { farmV2ErrorHandler } from "../middlewares/farm-v2-error-handler";
import { ensureFarmV2PlayerInitialized } from "../lib/farm-v2-init";
import { purchaseFarmV2SeedPacks } from "../lib/farm-v2-seed-purchase";
import { exchangeFarmV2Crops } from "../lib/farm-v2-crop-exchange";
import { reconcileFarmV2PaidAccessFromCore } from "../lib/farm-v2-paid-access";
import { requestFarmV2PlatformSession } from "../lib/farm-v2-platform";

const router: IRouter = Router();
// Fail closed before identity validation, database access or session creation.
// Revocation is cleanup only and still passes the existing platform verification.
router.use("/farm/v2", (req, res, next) => {
  const revoking =
    req.method === "POST" &&
    req.path === "/session" &&
    req.body?.action === "revoke";
  if (process.env.FARM_V2_ENTRY_ENABLED === "1" || revoking) {
    next();
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  res.status(503).json({ error: "FARM_V2_ENTRY_DISABLED" });
});
const authorizedRoute =
  (handler: RequestHandler): RequestHandler =>
  async (req, res, next) => {
    try {
      const requestId =
        req.header("x-request-id") ??
        (req.method === "GET" ? randomUUID() : "");
      if (!/^[A-Za-z0-9._:-]{1,120}$/.test(requestId))
        throw new Error("REQUEST_ID_REQUIRED");
      await withFarmAuthority(
        {
          userId: String(res.locals.authenticatedUserId),
          launchToken: String(res.locals.launchToken),
          requestId,
          action: req.method + ":" + req.path,
        },
        async () => {
          await handler(req, res, next);
        },
      );
    } catch (error) {
      if (!res.headersSent) next(error);
    }
  };

router.post("/farm/v2/session", async (req, res, next) => {
  try {
    const authorization = req.header("authorization") ?? "";
    const token = authorization.match(/^Bearer +(.+)$/i)?.[1]?.trim();
    if (!token || token.length > 4096) {
      res.status(401).json({ error: "MISSING_LAUNCH_TOKEN" });
      return;
    }
    const action = req.body?.action ?? "exchange";
    if (action !== "exchange" && action !== "revoke") {
      res.status(400).json({ error: "INVALID_FARM_SESSION_REQUEST" });
      return;
    }
    const result = await requestFarmV2PlatformSession(token, action);
    res.setHeader("Cache-Control", "no-store");
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.use("/farm/v2", requireFarmV2LaunchIdentity);

router.get(
  "/farm/v2/state",
  authorizedRoute(async (req, res, next) => {
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
      });
      await settleFarmV2Farmer({
        userId,
        requestId: "login-settle:" + randomUUID(),
      });
      // Return the committed, post-reconciliation state rather than the
      // pre-reconciliation snapshot.
      const state = await ensureFarmV2PlayerInitialized({ userId });
      res.setHeader("Cache-Control", "no-store");
      res.json(state);
    } catch (error) {
      next(error);
    }
  }),
);

router.post(
  "/farm/v2/chaos/claim",
  authorizedRoute(async (req, res) => {
    const userId = String(res.locals.authenticatedUserId);
    await reconcileFarmV2PaidAccessFromCore({
      userId,
      launchToken: String(res.locals.launchToken),
      requestId: "farm-v2:core-paid-refresh:v1",
    });
    res.json(
      await claimFarmV2ChaosSeeds({
        userId,
        requestId: String(req.header("x-request-id")),
      }),
    );
  }),
);
router.post(
  "/farm/v2/farmer/:landId",
  authorizedRoute(async (req, res) => {
    const userId = String(res.locals.authenticatedUserId);
    await reconcileFarmV2PaidAccessFromCore({
      userId,
      launchToken: String(res.locals.launchToken),
      requestId: "farm-v2:core-paid-refresh:v1",
    });
    res.json(
      await configureFarmV2Farmer({
        userId,
        requestId: String(req.header("x-request-id")),
        landId: Number(req.params.landId),
        enabled: req.body?.enabled,
      }),
    );
  }),
);

router.post(
  "/farm/v2/lands/:landId/sow",
  authorizedRoute(async (req, res, next) => {
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
  }),
);

router.post(
  "/farm/v2/lands/:landId/harvest",
  authorizedRoute(async (req, res, next) => {
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
  }),
);

router.post(
  "/farm/v2/seeds/:landId/purchase",
  authorizedRoute(async (req, res, next) => {
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
  }),
);

router.post(
  "/farm/v2/crops/:landId/exchange",
  authorizedRoute(async (req, res, next) => {
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
  }),
);

// Never accept paid qualification from the request body. Only Core Wallet
// can supply it; unavailable Core authority fails closed.
router.post(
  "/farm/v2/internal/effective-paid/reconcile",
  authorizedRoute(async (req, res, next) => {
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
  }),
);

router.use("/farm/v2", farmV2ErrorHandler);

export default router;

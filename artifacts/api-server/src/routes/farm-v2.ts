import { decodePendingSeedPurchases } from "../lib/farm-v2-seed-recovery";
import { localCoinsEnabled } from "../lib/farm-v2-local-coins";
import {
  readFarmCoinBalances,
  transferFarmCoins,
} from "../lib/farm-v2-bank-http";
import { farmAuthorityContext } from "../lib/farm-v2-authority-context";
import { purchaseFarmV2CoinLand } from "../lib/farm-v2-coin-land-unlock";
import { runFarmV2AuthorizedJson } from "../lib/farm-v2-authorized-json";
import { timeFarmV2Function } from "../lib/farm-v2-stage-timing";
import { completeFarmV2Mutation } from "../lib/farm-v2-mutation-snapshot";
import { pool } from "@workspace/db";
import { mutateFarmV2Friend } from "../lib/farm-v2-friend-actions";
import { withFarmFriendAuthority } from "../lib/farm-v2-friend-authority";
import { readFarmV2Friends, visitFarmV2Cave } from "../lib/farm-v2-friends";
import { mutateFarmV2Workshop } from "../lib/farm-v2-workshop";
import {
  claimFarmV2ChaosSeeds,
  configureFarmV2Farmer,
  settleFarmV2Farmer as rawsettleFarmV2Farmer,
} from "../lib/farm-v2-gameplay";
import { randomUUID } from "node:crypto";
import { withFarmAuthority } from "../lib/farm-v2-authority";
import { Router, type IRouter, type Request, type RequestHandler } from "express";
import { sowFarmV2Land as rawsowFarmV2Land } from "../lib/farm-v2-sow";
import { harvestFarmV2Land as rawharvestFarmV2Land } from "../lib/farm-v2-harvest";
import { requireFarmV2LaunchIdentity } from "../middlewares/farm-v2-launch-auth";
import { farmV2ErrorHandler } from "../middlewares/farm-v2-error-handler";
import { ensureFarmV2PlayerInitialized as rawensureFarmV2PlayerInitialized } from "../lib/farm-v2-init";
import { purchaseFarmV2SeedPacks as rawpurchaseFarmV2SeedPacks } from "../lib/farm-v2-seed-purchase";
import { exchangeFarmV2Crops as rawexchangeFarmV2Crops } from "../lib/farm-v2-crop-exchange";
import { reconcileFarmV2PaidAccessFromCore as rawreconcileFarmV2PaidAccessFromCore } from "../lib/farm-v2-paid-access";
import { requestFarmV2PlatformSession } from "../lib/farm-v2-platform";

const sowFarmV2Land = timeFarmV2Function("domain_sow", rawsowFarmV2Land);
const harvestFarmV2Land = timeFarmV2Function(
  "domain_harvest",
  rawharvestFarmV2Land,
);
const purchaseFarmV2SeedPacks = timeFarmV2Function(
  "domain_purchase",
  rawpurchaseFarmV2SeedPacks,
);
const exchangeFarmV2Crops = timeFarmV2Function(
  "domain_exchange",
  rawexchangeFarmV2Crops,
);
const reconcileFarmV2PaidAccessFromCore = timeFarmV2Function(
  "paid_access",
  rawreconcileFarmV2PaidAccessFromCore,
);
const settleFarmV2Farmer = timeFarmV2Function(
  "snapshot_settle",
  rawsettleFarmV2Farmer,
);
const ensureFarmV2PlayerInitialized = timeFarmV2Function(
  "snapshot_read",
  rawensureFarmV2PlayerInitialized,
);
const router: IRouter = Router();
const paidRefreshRequestId = "farm-v2:core-paid-refresh:v1";

async function hasRecentPaidQualification(userId: string) {
  const result = await pool.query(
    `select 1 from farm_v2_mutation
      where user_id=$1 and request_id=$2
        and action='paid-access:core-authoritative'
        and transaction_state='COMPLETED' and response is not null
        and updated_at between now() - interval '6 hours' and now()`,
    [userId, paidRefreshRequestId],
  );
  return result.rows.length === 1;
}

async function mutationResponse<T extends object>(
  includeSnapshot: boolean,
  userId: string,
  result: T,
) {
  if (!includeSnapshot) return result;
  return completeFarmV2Mutation({
    mutate: async () => result,
    settle: () =>
      settleFarmV2Farmer({ userId, requestId: "login-settle:" + randomUUID() }),
    read: () => ensureFarmV2PlayerInitialized({ userId }),
  });
}
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
  (
    handler: RequestHandler,
    useRecentQualification: boolean | ((req: Request) => boolean) = false,
  ): RequestHandler =>
  async (req, res, next) => {
    try {
      const requestId =
        req.header("x-request-id") ??
        (req.method === "GET" ? randomUUID() : "");
      if (!/^[A-Za-z0-9._:-]{1,120}$/.test(requestId))
        throw new Error("REQUEST_ID_REQUIRED");
      const useRecent =
        typeof useRecentQualification === "function"
          ? useRecentQualification(req)
          : useRecentQualification;
      const legacy =
        localCoinsEnabled() && useRecent && req.method !== "GET"
          ? await pool.query(
              "select 1 from farm_v2_mutation where user_id=$1 and request_id=$2 and wallet_transaction->'command' is not null and transaction_state <> 'COMPLETED' limit 1",
              [String(res.locals.authenticatedUserId), requestId],
            )
          : { rows: [] };
      if (
        useRecent &&
        !legacy.rows.length &&
        (await hasRecentPaidQualification(
          String(res.locals.authenticatedUserId),
        ))
      ) {
        await handler(req, res, next);
        return;
      }
      await runFarmV2AuthorizedJson(res, next, async (deferredNext) => {
        await withFarmAuthority(
          {
            userId: String(res.locals.authenticatedUserId),
            launchToken: String(res.locals.launchToken),
            requestId,
            action: req.method + ":" + req.path,
          },
          async () => {
            await handler(req, res, deferredNext);
          },
        );
      });
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
router.get("/farm/v2/recovery/seeds", async (_req,res,next) => {
  try {
    const result = await pool.query(
      "select request_id,action,wallet_transaction->'command'->>'referenceId' as reference_id,wallet_amount,wallet_currency,wallet_direction from public.farm_v2_mutation where user_id=$1 and action like 'seed-purchase:%' and transaction_state in ('WALLET_PENDING','WALLET_APPLIED') and response is null and wallet_transaction->'command'->>'reason'='farm_seed_purchase' order by created_at limit 10",
      [String(res.locals.authenticatedUserId)],
    );
    res.setHeader("Cache-Control","no-store");
    res.json({purchases:decodePendingSeedPurchases(result.rows)});
  } catch(error) {next(error);}
});

router.post("/farm/v2/recovery", async (req, res, next) => {
  try {
    const requestId = req.header("x-request-id") ?? "";
    if (!/^[A-Za-z0-9._:-]{1,120}$/.test(requestId))
      throw new Error("REQUEST_ID_REQUIRED");
    const result = await pool.query(
      "SELECT public.farm_v2_observe_recovery($1::uuid,$2) AS result",
      [String(res.locals.authenticatedUserId), requestId],
    );
    res.setHeader("Cache-Control", "no-store");
    res.json(result.rows[0].result);
  } catch (error) {
    next(error);
  }
});

router.get("/farm/v2/wallet", async (_req, res, next) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    res.json(
      await readFarmCoinBalances(String(res.locals.authenticatedUserId)),
    );
  } catch (error) {
    next(error);
  }
});
router.post("/farm/v2/wallet/transfer", async (req, res, next) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    res.json(
      await transferFarmCoins(
        String(res.locals.authenticatedUserId),
        String(req.header("x-request-id") ?? ""),
        req.body?.direction,
        req.body?.amount,
      ),
    );
  } catch (error) {
    next(error);
  }
});
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

      // A recent qualification proves this player was initialized and paid
      // access was checked within the approved six-hour window. New/expired
      // qualifications still initialize and refresh through Core first.
      if (farmAuthorityContext.getStore()) {
        await ensureFarmV2PlayerInitialized({ userId });
        await reconcileFarmV2PaidAccessFromCore({
          userId,
          launchToken,
          requestId: paidRefreshRequestId,
        });
      }
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
  }, true),
);

router.get(
  "/farm/v2/friends",
  authorizedRoute(async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json(await readFarmV2Friends(String(res.locals.launchToken)));
  }),
);
router.get(
  "/farm/v2/friends/:targetId/cave",
  authorizedRoute(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json(
      await visitFarmV2Cave({
        launchToken: String(res.locals.launchToken),
        targetId: String(req.params.targetId),
      }),
    );
  }),
);
router.post(
  "/farm/v2/workshop",
  authorizedRoute(async (req, res) => {
    res.json(
      await mutateFarmV2Workshop({
        userId: String(res.locals.authenticatedUserId),
        requestId: String(req.header("x-request-id")),
        launchToken: String(res.locals.launchToken),
        command: req.body,
      }),
    );
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

router.post("/farm/v2/friends/:targetId/actions", async (req, res, next) => {
  try {
    const kind = req.body?.kind;
    if (!["BORROW", "ASSIST"].includes(kind))
      throw new Error("INVALID_FRIEND_REQUEST");
    const input = {
      userId: String(res.locals.authenticatedUserId),
      launchToken: String(res.locals.launchToken),
      targetId: String(req.params.targetId).toLowerCase(),
      requestId: req.header("x-request-id") ?? "",
      kind,
      landId: Number(req.body?.landId),
    };
    const result = await withFarmFriendAuthority(input, () =>
      mutateFarmV2Friend(input),
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
});

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
      if (farmAuthorityContext.getStore()) {
        await reconcileFarmV2PaidAccessFromCore({
          userId,
          launchToken,
          requestId: paidRefreshRequestId,
        });
      }
      const result = await sowFarmV2Land({
        requestId,
        userId,
        landId: Number(req.params.landId),
      });
      res.setHeader("Cache-Control", "no-store");
      res.json(
        await mutationResponse(req.query.snapshot === "1", userId, result),
      );
    } catch (error) {
      next(error);
    }
  }, true),
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
      // Like sowing, harvesting may use the approved six-hour paid-access
      // qualification. Expired qualification still refreshes through Core.
      if (farmAuthorityContext.getStore()) {
        await reconcileFarmV2PaidAccessFromCore({
          userId,
          launchToken,
          requestId: paidRefreshRequestId,
        });
      }
      const result = await harvestFarmV2Land({
        requestId,
        userId,
        landId: Number(req.params.landId),
      });
      res.setHeader("Cache-Control", "no-store");
      res.json(
        await mutationResponse(req.query.snapshot === "1", userId, result),
      );
    } catch (error) {
      next(error);
    }
  }, true),
);

router.post(
  "/farm/v2/lands/:landId/unlock",
  authorizedRoute(async (req, res, next) => {
    try {
      const userId = String(res.locals.authenticatedUserId);
      const result = await purchaseFarmV2CoinLand({
        userId,
        launchToken: String(res.locals.launchToken),
        requestId: req.header("x-request-id") ?? "",
        landId: Number(req.params.landId),
      });
      res.setHeader("Cache-Control", "no-store");
      res.json(
        await mutationResponse(req.query.snapshot === "1", userId, result),
      );
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
      if (!(await hasRecentPaidQualification(userId))) {
        await reconcileFarmV2PaidAccessFromCore({
          userId,
          launchToken,
          requestId: paidRefreshRequestId,
        });
      }
      const result = await purchaseFarmV2SeedPacks({
        userId,
        launchToken,
        requestId,
        landId: Number(req.params.landId),
        packs: Number(req.body?.packs),
      });
      res.setHeader("Cache-Control", "no-store");
      res.json(
        await mutationResponse(req.query.snapshot === "1", userId, result),
      );
    } catch (error) {
      next(error);
    }
    // Local coin settlement needs no Core wallet operation. Legacy pending
    // journals still establish authority through authorizedRoute's guard.
  }, localCoinsEnabled),
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
      if (farmAuthorityContext.getStore()) await reconcileFarmV2PaidAccessFromCore({
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
      res.setHeader("Cache-Control", "no-store");
      res.json(
        await mutationResponse(req.query.snapshot === "1", userId, result),
      );
    } catch (error) {
      next(error);
    }
  }, req => localCoinsEnabled() && Number(req.params.landId) < 6),
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

// Sign-in actions share the established farm launch identity middleware above.
// The player identity and cycle are always resolved on the server.
router.get("/farm/v2/signin", async (_req, res, next) => {
  try {
    const userId = String(res.locals.authenticatedUserId);
    const initialized = await pool.query(
      "select public.farm_v2_signin_initialize($1) as result", [userId],
    );
    if (initialized.rows[0]?.result?.status !== "ready") {
      res.status(409).json(initialized.rows[0]?.result ?? { status: "not_initialized" });
      return;
    }
    const status = await pool.query(
      "select public.farm_v2_signin_status($1) as result", [userId],
    );
    res.setHeader("Cache-Control", "no-store");
    res.json(status.rows[0].result);
  } catch (error) { next(error); }
});

router.post("/farm/v2/signin/:action", async (req, res, next) => {
  try {
    const action = String(req.params.action);
    if (!["claim", "makeup", "perfect"].includes(action)) {
      res.status(404).json({ status: "unknown_action" }); return;
    }
    const userId = String(res.locals.authenticatedUserId);
    const initialized = await pool.query(
      "select public.farm_v2_signin_initialize($1) as result", [userId],
    );
    const current = initialized.rows[0]?.result;
    if (current?.status !== "ready") {
      res.status(409).json(current ?? { status: "not_initialized" }); return;
    }
    const cycle = Number(current.cycleNumber);
    const today = Number(current.cycleDay);
    let result;
    if (action === "claim") {
      result = await pool.query(
        "select public.farm_v2_signin_claim_day($1,$2,$3) as result",
        [userId, cycle, today],
      );
    } else if (action === "makeup") {
      const day = req.body?.cycleDay;
      if (!Number.isInteger(day) || day < 1 || day > 30) {
        res.status(400).json({ status: "invalid_cycle_day" }); return;
      }
      result = await pool.query(
        "select public.farm_v2_signin_makeup_day($1,$2,$3) as result",
        [userId, cycle, day],
      );
    } else {
      const pending = await pool.query(
        "select public.farm_v2_signin_pending_perfect_cycle($1) as cycle",
        [userId],
      );
      const awardCycle = pending.rows[0]?.cycle;
      if (awardCycle == null) {
        res.status(409).json({ status: "incomplete" }); return;
      }
      result = await pool.query(
        "select public.farm_v2_signin_claim_perfect($1,$2) as result",
        [userId, Number(awardCycle)],
      );
    }
    res.setHeader("Cache-Control", "no-store");
    res.json(result.rows[0].result);
  } catch (error) { next(error); }
});

router.use("/farm/v2", farmV2ErrorHandler);

export default router;

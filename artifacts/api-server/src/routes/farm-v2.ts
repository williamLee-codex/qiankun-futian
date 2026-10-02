import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, farmV2LandTable, farmV2PlayerStateTable } from "@workspace/db";
import { sowFarmV2Land } from "../lib/farm-v2-sow";
import { harvestFarmV2Land } from "../lib/farm-v2-harvest";

const router: IRouter = Router();

router.get("/farm/v2/state", async (req, res, next) => {
  try {
    const userId = String(res.locals.authenticatedUserId ?? "").trim();
    if (!userId) {
      res.status(401).json({ error: "AUTH_REQUIRED" });
      return;
    }

    const [player, lands] = await Promise.all([
      db.query.farmV2PlayerStateTable.findFirst({
        where: eq(farmV2PlayerStateTable.userId, userId),
      }),
      db.select().from(farmV2LandTable)
        .where(eq(farmV2LandTable.userId, userId))
        .orderBy(farmV2LandTable.landId),
    ]);

    if (!player) {
      res.status(404).json({ error: "FARM_PLAYER_STATE_NOT_FOUND" });
      return;
    }

    res.json({ player, lands });
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
    const result = await harvestFarmV2Land({ requestId, userId, landId: Number(req.params.landId) });
    res.json(result);
  } catch (error) { next(error); }
});

export default router;

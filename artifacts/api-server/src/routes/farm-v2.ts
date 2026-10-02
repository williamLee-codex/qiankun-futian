import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, farmV2LandTable, farmV2PlayerStateTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/farm/v2/state", async (req, res, next) => {
  try {
    const userId = String(req.header("x-user-id") ?? "").trim();
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

export default router;

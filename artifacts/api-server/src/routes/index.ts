import { Router, type IRouter } from "express";
import healthRouter from "./health";
import farmCoinBridgeRouter from "./farmCoinBridge";

const router: IRouter = Router();

router.use(healthRouter);
router.use(farmCoinBridgeRouter);

export default router;

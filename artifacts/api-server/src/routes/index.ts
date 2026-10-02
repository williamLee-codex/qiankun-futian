import { Router, type IRouter } from "express";
import healthRouter from "./health";
import farmV2Router from "./farm-v2";

const router: IRouter = Router();

router.use(healthRouter);
router.use(farmV2Router);

export default router;

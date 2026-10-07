import type { ErrorRequestHandler } from "express";

const FARM_V2_STATUS_BY_ERROR: Readonly<Record<string, number>> = {
  ACTOR_UID_REQUIRED: 401,
  AUTH_REQUIRED: 401,
  REQUEST_ID_REQUIRED: 400,
  INVALID_FARM_LAND_ID: 400,
  INVALID_PACK_COUNT: 400,
  SEED_NOT_PURCHASABLE: 409,
  INSUFFICIENT_FUNDS: 409,
  FARM_WALLET_BRIDGE_NOT_CONFIGURED: 503,
  FARM_WALLET_BRIDGE_FAILED: 502,
  INVALID_FARM_WALLET_BRIDGE_RESPONSE: 502,
  FARM_PLAYER_STATE_NOT_FOUND: 404,
  FARM_LAND_NOT_FOUND: 404,
  FIRST_FARM_ENTERED_AT_REQUIRED: 409,
  REQUEST_ID_ACTION_MISMATCH: 409,
  MUTATION_IN_PROGRESS: 409,
  FARM_LAND_CONCURRENT_MODIFICATION: 409,
  LAND_NOT_ACCESSIBLE: 409,
  LAND_NOT_EMPTY: 409,
  INSUFFICIENT_SEEDS_FOR_FULL_BATCH: 409,
  LAND_NOT_HARVESTABLE: 409,
};

export const farmV2ErrorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  const code = error instanceof Error ? error.message : "";
  const status = FARM_V2_STATUS_BY_ERROR[code];

  if (!status) {
    next(error);
    return;
  }

  res.status(status).json({ error: code });
};

import type { ErrorRequestHandler } from "express";
import { FarmWalletRejectedError } from "../lib/farm-v2-wallet-client";

const FARM_V2_STATUS_BY_ERROR: Readonly<Record<string, number>> = {
  ACTOR_UID_REQUIRED: 401,
  AUTH_REQUIRED: 401,
  REQUEST_ID_REQUIRED: 400,
  INVALID_FARM_LAND_ID: 400,
  INVALID_PACK_COUNT: 400,
  INVALID_EXCHANGE_QUANTITY: 400,
  INVALID_EFFECTIVE_PAID_CRYSTALS: 400,
  INSUFFICIENT_CROPS_FOR_EXCHANGE: 409,
  SEED_NOT_PURCHASABLE: 409,
  INSUFFICIENT_FUNDS: 409,
  FARM_WALLET_BRIDGE_NOT_CONFIGURED: 503,
  FARM_PAID_VALUE_SYNC_NOT_CONFIGURED: 503,
  FARM_PAID_VALUE_CORE_UNAVAILABLE: 503,
  FARM_PAID_VALUE_INVALID_CORE_RESPONSE: 502,
  FARM_WALLET_BRIDGE_FAILED: 502,
  INVALID_FARM_WALLET_BRIDGE_RESPONSE: 502,
  FARM_PLAYER_STATE_NOT_FOUND: 404,
  FARM_LAND_NOT_FOUND: 404,
  FIRST_FARM_ENTERED_AT_REQUIRED: 409,
  REQUEST_ID_ACTION_MISMATCH: 409,
  MUTATION_IN_PROGRESS: 409,
  FARM_V2_PREVIOUS_MUTATION_UNCONFIRMED: 409,
  FARM_WALLET_INTENT_MISMATCH: 409,
  MUTATION_RECOVERY_REQUIRED: 503,
  FARM_MUTATION_COMPENSATED: 409,
  FARM_LAND_CONCURRENT_MODIFICATION: 409,
  LAND_NOT_ACCESSIBLE: 409,
  LAND_NOT_EMPTY: 409,
  INSUFFICIENT_SEEDS_FOR_FULL_BATCH: 409,
  LAND_NOT_HARVESTABLE: 409,
};

export const farmV2ErrorHandler: ErrorRequestHandler = (
  error,
  _req,
  res,
  next,
) => {
  if (error instanceof FarmWalletRejectedError) {
    res.status(400).json({ error: error.message, definitive: true });
    return;
  }
  const code = error instanceof Error ? error.message : "";
  const status = FARM_V2_STATUS_BY_ERROR[code];

  if (!status) {
    next(error);
    return;
  }

  res
    .status(status)
    .json({
      error: code,
      ...(code === "FARM_MUTATION_COMPENSATED" ? { definitive: true } : {}),
    });
};

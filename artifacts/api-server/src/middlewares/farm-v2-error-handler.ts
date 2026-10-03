import type { ErrorRequestHandler } from "express";

const FARM_V2_STATUS_BY_ERROR: Readonly<Record<string, number>> = {
  ACTOR_UID_REQUIRED: 401,
  AUTH_REQUIRED: 401,
  REQUEST_ID_REQUIRED: 400,
  INVALID_FARM_LAND_ID: 400,
  FARM_PLAYER_STATE_NOT_FOUND: 404,
  FARM_LAND_NOT_FOUND: 404,
  FIRST_FARM_ENTERED_AT_REQUIRED: 409,
  REQUEST_ID_ACTION_MISMATCH: 409,
  MUTATION_IN_PROGRESS: 409,
  FARM_LAND_CONCURRENT_MODIFICATION: 409,
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

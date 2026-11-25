import type { NextFunction, Response } from "express";

/** Keep the request alive until the authority barrier and lock are released. */
export async function runFarmV2AuthorizedJson(
  res: Response,
  next: NextFunction,
  operation: (deferredNext: NextFunction) => Promise<void>,
): Promise<void> {
  const originalJson = res.json;
  let pending: { body: unknown } | undefined;
  let forwarded: { error: unknown } | undefined;
  res.json = (body: unknown) => {
    if (pending) throw new Error("FARM_DUPLICATE_RESPONSE");
    pending = { body };
    return res;
  };
  const deferredNext: NextFunction = (error?: unknown) => {
    forwarded = { error };
  };
  try {
    await operation(deferredNext);
  } catch (error) {
    forwarded = { error };
  } finally {
    res.json = originalJson;
  }
  if (forwarded) {
    next(forwarded.error);
  } else if (pending) {
    originalJson.call(res, pending.body);
  } else {
    next(new Error("FARM_RESPONSE_REQUIRED"));
  }
}

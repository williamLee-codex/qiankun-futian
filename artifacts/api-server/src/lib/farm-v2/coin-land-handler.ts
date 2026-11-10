export type CoreCoinLandHttpDependencies = {
  isTrusted(request: Request): boolean;
  verifyLaunchToken(
    token: string,
  ): Promise<{ appId: string; userId: string } | null>;
  rpc(name: string, args: Record<string, unknown>): Promise<unknown>;
};
export function createCoreCoinLandHandler(deps: CoreCoinLandHttpDependencies) {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    });
  return async (request: Request): Promise<Response> => {
    if (!deps.isTrusted(request))
      return json({ error: "INVALID_REPLIT_SECRET" }, 401);
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body))
      return json({ error: "INVALID_REQUEST", definitive: true }, 400);
    const value = body as Record<string, unknown>;
    const allowed =
      value.operation === "read"
        ? ["operation", "launchToken"]
        : ["operation", "launchToken", "landId"];
    if (
      !["read", "purchase"].includes(String(value.operation)) ||
      typeof value.launchToken !== "string" ||
      !value.launchToken ||
      Object.keys(value).some((key) => !allowed.includes(key))
    )
      return json({ error: "INVALID_REQUEST", definitive: true }, 400);
    const identity = await deps
      .verifyLaunchToken(value.launchToken)
      .catch(() => null);
    // Authentication failure cannot disprove an earlier committed request.
    if (!identity?.userId) return json({ error: "INVALID_LAUNCH_TOKEN" }, 401);
    if (identity.appId !== "qiankun-futian")
      return json({ error: "APP_TOKEN_MISMATCH" }, 403);
    const requestId = request.headers.get("x-request-id") ?? "";
    if (
      value.operation === "purchase" &&
      ((value.landId !== 2 && value.landId !== 3) ||
        !/^[A-Za-z0-9._:-]{1,120}$/.test(requestId))
    )
      return json({ error: "INVALID_REQUEST", definitive: true }, 400);
    try {
      const result = await deps.rpc(
        value.operation === "read"
          ? "farm_v2_coin_land_entitlements"
          : "farm_v2_purchase_coin_land",
        value.operation === "read"
          ? { p_owner_id: identity.userId }
          : {
              p_owner_id: identity.userId,
              p_land_id: value.landId,
              p_request_id: requestId,
            },
      );
      if (!result || typeof result !== "object" || !("result_status" in result))
        return json({ error: "CORE_COIN_LAND_INVALID_RESULT" }, 502);
      const status = (result as { result_status: string }).result_status;
      if (
        [
          "ok",
          "created",
          "already_unlocked",
          "entitlement_unavailable",
        ].includes(status)
      )
        return json(result);
      if (
        [
          "invalid_request",
          "land_2_required",
          "insufficient_funds",
          "wallet_unavailable",
          "duplicate_conflict",
        ].includes(status)
      )
        return json(
          { error: status, definitive: true },
          status === "invalid_request" ? 400 : 409,
        );
      return json({ error: "CORE_COIN_LAND_UNAVAILABLE" }, 503);
    } catch {
      return json({ error: "CORE_COIN_LAND_UNAVAILABLE" }, 503);
    }
  };
}

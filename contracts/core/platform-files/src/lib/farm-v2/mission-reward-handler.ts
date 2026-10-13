export type CoreMissionRewardHttpDependencies = {
  isTrusted(request: Request): boolean;
  verifyLaunchToken(
    token: string,
  ): Promise<{ appId: string; userId: string } | null>;
  rpc(name: string, args: Record<string, unknown>): Promise<unknown>;
};

const MISSION_IDS = new Set([
  "MISSION_D01",
  "MISSION_D02",
  "MISSION_D03",
  "MISSION_D04",
  "MISSION_W01",
  "MISSION_W02",
  "MISSION_W03",
  "MISSION_W04",
]);
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,120}$/;
const DEFINITIVE_REJECTIONS = new Set([
  "invalid_request",
  "identity_unavailable",
  "wallet_unavailable",
  "duplicate_conflict",
]);

export function createCoreMissionRewardHandler(
  deps: CoreMissionRewardHttpDependencies,
) {
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
    if (
      Object.keys(value).some((key) => !["missionId", "launchToken"].includes(key)) ||
      typeof value.missionId !== "string" ||
      !MISSION_IDS.has(value.missionId) ||
      typeof value.launchToken !== "string" ||
      !value.launchToken
    )
      return json({ error: "INVALID_REQUEST", definitive: true }, 400);

    const identity = await deps
      .verifyLaunchToken(value.launchToken)
      .catch(() => null);
    // A failed token check cannot disprove an earlier committed wallet credit.
    if (!identity?.userId) return json({ error: "INVALID_LAUNCH_TOKEN" }, 401);
    if (identity.appId !== "qiankun-futian")
      return json({ error: "APP_TOKEN_MISMATCH" }, 403);

    const requestId = request.headers.get("x-request-id") ?? "";
    if (!REQUEST_ID_PATTERN.test(requestId))
      return json({ error: "INVALID_REQUEST", definitive: true }, 400);

    try {
      const result: unknown = await deps.rpc("farm_v2_claim_mission_reward", {
        p_owner_id: identity.userId,
        p_mission_id: value.missionId,
        p_request_id: requestId,
      });
      if (!result || typeof result !== "object" || !("result_status" in result))
        return json({ error: "CORE_MISSION_REWARD_INVALID_RESULT" }, 503);

      const status = (result as { result_status: unknown }).result_status;
      if (status === "created" || status === "duplicate") return json(result);
      if (typeof status === "string" && DEFINITIVE_REJECTIONS.has(status))
        return json(
          { error: status, definitive: true },
          status === "invalid_request" ? 400 : 409,
        );
      return json({ error: "CORE_MISSION_REWARD_UNAVAILABLE" }, 503);
    } catch {
      return json({ error: "CORE_MISSION_REWARD_UNAVAILABLE" }, 503);
    }
  };
}

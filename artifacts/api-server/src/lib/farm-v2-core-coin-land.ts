export type CoreCoinLand = {
  landId: 2 | 3;
  historicallyUnlocked: boolean;
  accessActive: boolean;
  firstUnlockedAt: number | null;
};
export type CoreCoinLandReceipt = {
  result_status: "created" | "already_unlocked" | "entitlement_unavailable";
  land_id: 2 | 3;
  cost: number;
  unlocked_at: string;
  entitlement_id: string;
};
export class CoreCoinLandError extends Error {
  constructor(
    message: string,
    readonly definitive = false,
  ) {
    super(message);
  }
}
async function requestCore(
  launchToken: string,
  body: Record<string, unknown>,
  requestId?: string,
): Promise<Record<string, unknown>> {
  const base = process.env.PLATFORM_BASE_URL,
    secret = process.env.REPLIT_APP_SHARED_SECRET;
  if (!base || !secret || !launchToken)
    throw new CoreCoinLandError("CORE_COIN_LAND_NOT_CONFIGURED");
  const url = new URL(base);
  if (
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      )) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new CoreCoinLandError("INVALID_FARM_PLATFORM_BASE_URL");
  const response = await fetch(
    new URL("/api/replit/farm-v2/coin-land-unlocks", base),
    {
      method: "POST",
      redirect: "error",
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        "x-replit-shared-secret": secret,
        ...(requestId ? { "x-request-id": requestId } : {}),
      },
      body: JSON.stringify({ ...body, launchToken }),
      signal: AbortSignal.timeout(5000),
    },
  );
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const value = result as { error?: unknown; definitive?: unknown } | null;
    const business = [
      "invalid_request",
      "land_2_required",
      "insufficient_funds",
      "wallet_unavailable",
      "duplicate_conflict",
    ];
    const definitive =
      [400, 409].includes(response.status) &&
      value?.definitive === true &&
      typeof value.error === "string" &&
      business.includes(value.error);
    throw new CoreCoinLandError(
      definitive
        ? "CORE_COIN_LAND_" + String(value?.error).toUpperCase()
        : "CORE_COIN_LAND_UNAVAILABLE",
      definitive,
    );
  }
  if (!result || typeof result !== "object" || Array.isArray(result))
    throw new CoreCoinLandError("INVALID_CORE_COIN_LAND_RESPONSE");
  return result as Record<string, unknown>;
}
export async function readCoreCoinLands(
  launchToken: string,
): Promise<CoreCoinLand[]> {
  const value = await requestCore(launchToken, { operation: "read" });
  if (
    value.result_status !== "ok" ||
    !Array.isArray(value.lands) ||
    value.lands.length !== 2
  )
    throw new CoreCoinLandError("INVALID_CORE_COIN_LAND_RESPONSE");
  const rows = value.lands.map((row: any) => {
    const first =
      row?.firstUnlockedAt === null
        ? null
        : typeof row?.firstUnlockedAt === "string"
          ? Date.parse(row.firstUnlockedAt)
          : NaN;
    if (
      !row ||
      (row.landId !== 2 && row.landId !== 3) ||
      typeof row.historicallyUnlocked !== "boolean" ||
      typeof row.accessActive !== "boolean" ||
      (first !== null && (!Number.isFinite(first) || first < 0)) ||
      row.historicallyUnlocked !== (first !== null) ||
      (row.accessActive && !row.historicallyUnlocked)
    )
      throw new CoreCoinLandError("INVALID_CORE_COIN_LAND_RESPONSE");
    return {
      landId: row.landId,
      historicallyUnlocked: row.historicallyUnlocked,
      accessActive: row.accessActive,
      firstUnlockedAt: first,
    };
  });
  if (new Set(rows.map((row) => row.landId)).size !== 2)
    throw new CoreCoinLandError("INVALID_CORE_COIN_LAND_RESPONSE");
  return rows.sort((a, b) => a.landId - b.landId);
}
export async function purchaseCoreCoinLand(
  launchToken: string,
  landId: 2 | 3,
  requestId: string,
): Promise<CoreCoinLandReceipt> {
  if (
    (landId !== 2 && landId !== 3) ||
    !/^[A-Za-z0-9._:-]{1,120}$/.test(requestId)
  )
    throw new CoreCoinLandError("INVALID_CORE_COIN_LAND_REQUEST", true);
  const value = await requestCore(
    launchToken,
    { operation: "purchase", landId },
    requestId,
  );
  if (
    !["created", "already_unlocked", "entitlement_unavailable"].includes(
      String(value.result_status),
    ) ||
    value.land_id !== landId ||
    typeof value.unlocked_at !== "string" ||
    !Number.isFinite(Date.parse(value.unlocked_at)) ||
    typeof value.entitlement_id !== "string" ||
    !value.entitlement_id ||
    value.cost !==
      (value.result_status === "created" ? (landId === 2 ? 88 : 888) : 0)
  )
    throw new CoreCoinLandError("INVALID_CORE_COIN_LAND_RESPONSE");
  return value as CoreCoinLandReceipt;
}

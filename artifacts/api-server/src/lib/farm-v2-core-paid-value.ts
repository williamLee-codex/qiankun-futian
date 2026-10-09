/**
 * Fetches paid qualification only from the Core Wallet service.
 * Never accept effectivePaidCrystals from a Farm request body.
 */
export async function fetchFarmV2CorePaidQualification(launchToken: string): Promise<number> {
  const sharedSecret = process.env.REPLIT_APP_SHARED_SECRET;
  const platformBaseUrl = process.env.PLATFORM_BASE_URL;
  if (!sharedSecret || !platformBaseUrl || !launchToken) {
    throw new Error("FARM_PAID_VALUE_SYNC_NOT_CONFIGURED");
  }
  const response = await fetch(new URL("/api/replit/farm-v2/paid-value", platformBaseUrl), {
    method: "POST",
    redirect: "error",
    headers: {
      "content-type": "application/json",
      "x-replit-shared-secret": sharedSecret,
      "cache-control": "no-store",
    },
    body: JSON.stringify({ launchToken }),
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error("FARM_PAID_VALUE_CORE_UNAVAILABLE");
  const result: unknown = await response.json();
  if (!result || typeof result !== "object" || !("effectivePaidCrystals" in result)) {
    throw new Error("FARM_PAID_VALUE_INVALID_CORE_RESPONSE");
  }
  const value = result.effectivePaidCrystals;
  if (!Number.isSafeInteger(value) || typeof value !== "number" || value < 0) {
    throw new Error("FARM_PAID_VALUE_INVALID_CORE_RESPONSE");
  }
  return value;
}

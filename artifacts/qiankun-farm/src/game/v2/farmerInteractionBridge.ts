import type { FarmerState } from './farmerRuntime';
import type { FarmLandId } from './canonicalLandData';

export function isFarmerActiveOnLand(
  farmer: FarmerState,
  landId: FarmLandId,
): boolean {
  return farmer.entitled && farmer.enabledByLand[landId];
}

export function isFarmerActiveOnAnyLand(farmer: FarmerState): boolean {
  if (!farmer.entitled) return false;
  return ([1, 2, 3, 4, 5, 6] as const).some((landId) => farmer.enabledByLand[landId]);
}

/**
 * Friend crop interactions are rejected only when the target land is actually
 * under the entitled farmer's automation. This keeps the per-land farmer
 * switch authoritative instead of treating entitlement alone as "active".
 */
export function targetFarmerBlocksLandInteraction(
  farmer: FarmerState,
  landId: FarmLandId,
): boolean {
  return isFarmerActiveOnLand(farmer, landId);
}

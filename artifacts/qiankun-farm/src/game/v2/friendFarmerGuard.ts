import type { FarmLandId } from './canonicalLandData';
import type { FarmerState } from './farmerRuntime';
import { targetFarmerBlocksLandInteraction } from './farmerInteractionBridge';

/**
 * Resolves the farmer guard for a concrete set of requested target lands.
 * A request is blocked when any requested land is currently automated.
 * Entitlement alone never blocks friend interaction.
 */
export function targetFarmerBlocksRequestedLands(
  farmer: FarmerState,
  landIds: readonly FarmLandId[],
): boolean {
  return landIds.some((landId) => targetFarmerBlocksLandInteraction(farmer, landId));
}

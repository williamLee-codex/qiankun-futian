import type { FarmLandId } from "./canonicalLandData";
import type { FarmerState } from "./farmerRuntime";
import { isFarmerActiveOnAnyLand } from "./farmerInteractionBridge";
/** FARMER-FRIEND-001: any effective farmer blocks friend actions before land checks. */
export function targetFarmerBlocksRequestedLands(
  farmer: FarmerState,
  _landIds: readonly FarmLandId[],
): boolean {
  return isFarmerActiveOnAnyLand(farmer);
}

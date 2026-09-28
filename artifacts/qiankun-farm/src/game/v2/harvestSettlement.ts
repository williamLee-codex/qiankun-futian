import type { FarmLandId } from './canonicalLandData';
import { applyNewbieHarvestMultiplier } from './timeRuntime';
import type { FarmWarehouse } from './warehouseRuntime';
import { depositHarvest } from './warehouseRuntime';

export interface HarvestSettlementInput {
  warehouse: FarmWarehouse;
  landId: FarmLandId;
  baseHarvestQuantity: number;
  firstFarmEnteredAt: number;
  harvestedAt: number;
}

/**
 * Canonical harvest settlement.
 * Newbie x6 affects harvested crop quantity only. It does not alter seeds,
 * exchange rates, mission counts/rewards, or pot synthesis ratios.
 */
export function settleHarvestToWarehouse(input: HarvestSettlementInput): {
  warehouse: FarmWarehouse;
  creditedQuantity: number;
} {
  const creditedQuantity = applyNewbieHarvestMultiplier(
    input.baseHarvestQuantity,
    input.firstFarmEnteredAt,
    input.harvestedAt,
  );

  return {
    creditedQuantity,
    warehouse: depositHarvest(input.warehouse, input.landId, creditedQuantity),
  };
}

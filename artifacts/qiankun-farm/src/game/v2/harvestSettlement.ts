import type { FarmLandId } from './canonicalLandData';
import { applyNewbieHarvestMultiplier } from './timeRuntime';
import type { FarmWarehouse } from './warehouseRuntime';
import { depositHarvest } from './warehouseRuntime';
import {
  applyHarvestYield,
  NEUTRAL_FORMATION_BONUSES,
  type FormationBonuses,
} from './formationEffects';

export interface HarvestSettlementInput {
  warehouse: FarmWarehouse;
  landId: FarmLandId;
  baseHarvestQuantity: number;
  firstFarmEnteredAt: number;
  harvestedAt: number;
  /** FORMATION-EFFECT-001 yield; applied once, before the newbie window. */
  bonuses?: FormationBonuses;
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
  const withFormation = applyHarvestYield(
    input.baseHarvestQuantity,
    input.bonuses ?? NEUTRAL_FORMATION_BONUSES,
  );
  const creditedQuantity = applyNewbieHarvestMultiplier(
    withFormation,
    input.firstFarmEnteredAt,
    input.harvestedAt,
  );

  return {
    creditedQuantity,
    warehouse: depositHarvest(input.warehouse, input.landId, creditedQuantity),
  };
}

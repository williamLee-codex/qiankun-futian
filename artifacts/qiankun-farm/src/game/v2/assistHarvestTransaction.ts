import type { FarmLandId } from './canonicalLandData';
import { isNewbieHarvestWindow } from './timeRuntime';
import type { FarmWarehouse } from './warehouseRuntime';
import type { FriendInteractionState } from './friendInteractionRuntime';
import { executeAssistAction } from './assistAction';
import type { AssistTarget } from './assistRuntime';
import {
  applyHarvestYield,
  applyPetAssistBonus,
  NEUTRAL_FORMATION_BONUSES,
  type FormationBonuses,
} from './formationEffects';

export interface AssistHarvestActionResult {
  interactionState: FriendInteractionState;
  ownerWarehouse: FarmWarehouse;
  helperWarehouse: FarmWarehouse;
  ownerHarvestQuantity: number;
  helperBonusQuantity: number;
  successful: boolean;
}

function addCrop(warehouse: FarmWarehouse, landId: FarmLandId, quantity: number): FarmWarehouse {
  return {
    ...warehouse,
    crops: {
      ...warehouse.crops,
      [landId]: (warehouse.crops[landId] ?? 0) + quantity,
    },
  };
}

/**
 * Atomic transaction primitive for the server layer after the target land row
 * has been locked and re-read. Newbie x6 applies to the owner's successful
 * harvest quantity first; helper bonus is then ceil(actual owner harvest *10%).
 */
export function executeAssistHarvestTransaction(input: {
  interactionState: FriendInteractionState;
  friendUid: string;
  now: number;
  mutualFriends: boolean;
  targetFarmerActive: boolean;
  target: AssistTarget;
  ownerWarehouse: FarmWarehouse;
  helperWarehouse: FarmWarehouse;
  ownerFirstFarmEnteredAt: number | null;
  /** FORMATION-EFFECT-001: the owner's yield and the helper's pet assist. */
  ownerBonuses?: FormationBonuses;
  helperBonuses?: FormationBonuses;
}): AssistHarvestActionResult {
  const base = executeAssistAction({
    interactionState: input.interactionState,
    friendUid: input.friendUid,
    now: input.now,
    mutualFriends: input.mutualFriends,
    targetFarmerActive: input.targetFarmerActive,
    target: input.target,
  });

  if (!base.settlement.successful || base.settlement.landId === null) {
    return {
      interactionState: base.interactionState,
      ownerWarehouse: input.ownerWarehouse,
      helperWarehouse: input.helperWarehouse,
      ownerHarvestQuantity: 0,
      helperBonusQuantity: 0,
      successful: false,
    };
  }

  const multiplier = input.ownerFirstFarmEnteredAt !== null &&
    isNewbieHarvestWindow(input.ownerFirstFarmEnteredAt, input.now) ? 6 : 1;
  const ownerHarvestQuantity = applyHarvestYield(
    base.settlement.ownerHarvestQuantity,
    input.ownerBonuses ?? NEUTRAL_FORMATION_BONUSES,
  ) * multiplier;
  const helperBonusQuantity = applyPetAssistBonus(
    ownerHarvestQuantity,
    input.helperBonuses ?? NEUTRAL_FORMATION_BONUSES,
  );
  const landId = base.settlement.landId;

  return {
    interactionState: base.interactionState,
    ownerWarehouse: addCrop(input.ownerWarehouse, landId, ownerHarvestQuantity),
    helperWarehouse: addCrop(input.helperWarehouse, landId, helperBonusQuantity),
    ownerHarvestQuantity,
    helperBonusQuantity,
    successful: true,
  };
}

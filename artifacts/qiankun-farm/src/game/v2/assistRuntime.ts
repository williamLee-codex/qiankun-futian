import type { FarmLandId } from './canonicalLandData';

export interface AssistTarget {
  landId: FarmLandId;
  currentQuantity: number;
  maturesAt: number;
}

export interface AssistSettlementResult {
  successful: boolean;
  landId: FarmLandId | null;
  ownerHarvestQuantity: number;
  helperBonusQuantity: number;
}

export function isAssistableTarget(target: AssistTarget, now: number): boolean {
  return target.landId >= 2 &&
    target.landId <= 5 &&
    target.currentQuantity > 0 &&
    now >= target.maturesAt;
}

/**
 * Canonical assist:
 * - fields 2-5 only
 * - no 1h mature protection
 * - owner receives 100% of actual harvest
 * - helper receives EXTRA ceil(actual harvest * 10%)
 * - helper reward never reduces owner's harvest
 */
export function settleAssist(target: AssistTarget, now: number): AssistSettlementResult {
  if (!isAssistableTarget(target, now)) {
    return {
      successful: false,
      landId: null,
      ownerHarvestQuantity: 0,
      helperBonusQuantity: 0,
    };
  }

  return {
    successful: true,
    landId: target.landId,
    ownerHarvestQuantity: target.currentQuantity,
    helperBonusQuantity: Math.ceil(target.currentQuantity * 0.1),
  };
}

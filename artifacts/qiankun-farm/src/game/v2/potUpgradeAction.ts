import type { FarmLandId } from './canonicalLandData';
import { nextPotGrade, validatePotUpgrade, type PotGrade, type PotItem } from './potRuntime';
import type { PotDisplayState } from './potDisplayRuntime';

export interface PotInventoryCounts {
  [key: string]: number;
}

export function potInventoryKey(landId: FarmLandId, grade: PotGrade): string {
  return `${landId}:${grade}`;
}

/**
 * One manual, one-grade upgrade. A displayed source pot is allowed to count as
 * one source. When it participates, the upgraded result remains in that exact
 * species display slot. Remaining required sources come from inventory.
 */
export function upgradePotWithDisplay(input: {
  display: PotDisplayState;
  inventory: PotInventoryCounts;
  speciesLandId: FarmLandId;
  fromGrade: PotGrade;
  coinsAvailable: number;
  useDisplayedSource: boolean;
}): {
  display: PotDisplayState;
  inventory: PotInventoryCounts;
  coinsConsumed: number;
  resultPot: PotItem;
} {
  const displayed = input.display.slots[input.speciesLandId];
  const canUseDisplayed =
    input.useDisplayedSource &&
    displayed?.speciesLandId === input.speciesLandId &&
    displayed.grade === input.fromGrade;

  if (input.useDisplayedSource && !canUseDisplayed) throw new Error('DISPLAYED_SOURCE_MISMATCH');

  const key = potInventoryKey(input.speciesLandId, input.fromGrade);
  const inventoryCount = input.inventory[key] ?? 0;
  const totalSources = inventoryCount + (canUseDisplayed ? 1 : 0);
  const validated = validatePotUpgrade({
    speciesLandId: input.speciesLandId,
    fromGrade: input.fromGrade,
    sourceCount: totalSources,
    coinsAvailable: input.coinsAvailable,
  });

  const inventoryNeeded = validated.sourcePotsConsumed - (canUseDisplayed ? 1 : 0);
  if (inventoryCount < inventoryNeeded) throw new Error('INSUFFICIENT_SAME_GRADE_POTS');

  const inventory = {
    ...input.inventory,
    [key]: inventoryCount - inventoryNeeded,
  };
  const resultPot: PotItem = {
    speciesLandId: input.speciesLandId,
    grade: nextPotGrade(input.fromGrade)!,
  };

  if (canUseDisplayed) {
    return {
      display: {
        slots: { ...input.display.slots, [input.speciesLandId]: resultPot },
      },
      inventory,
      coinsConsumed: validated.coinsConsumed,
      resultPot,
    };
  }

  const resultKey = potInventoryKey(resultPot.speciesLandId, resultPot.grade);
  inventory[resultKey] = (inventory[resultKey] ?? 0) + 1;
  return {
    display: input.display,
    inventory,
    coinsConsumed: validated.coinsConsumed,
    resultPot,
  };
}

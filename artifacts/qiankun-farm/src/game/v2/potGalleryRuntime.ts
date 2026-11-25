import type { FarmLandId } from './canonicalLandData';
import {
  POT_FIRST_UNLOCK_REWARDS,
  POT_GRADES,
  type PotGrade,
  type PotItem,
} from './potRuntime';

export type PotGalleryNodeId = `${FarmLandId}-${PotGrade}`;

export interface PotGalleryState {
  unlocked: ReadonlySet<PotGalleryNodeId>;
}

export function potGalleryNodeId(landId: FarmLandId, grade: PotGrade): PotGalleryNodeId {
  return `${landId}-${grade}`;
}

export function createPotGalleryState(): PotGalleryState {
  return { unlocked: new Set() };
}

export function allPotGalleryNodeIds(): PotGalleryNodeId[] {
  const ids: PotGalleryNodeId[] = [];
  for (const landId of [1, 2, 3, 4, 5, 6] as const) {
    for (const grade of POT_GRADES) ids.push(potGalleryNodeId(landId, grade));
  }
  return ids;
}

export function unlockPotGalleryNode(
  state: PotGalleryState,
  pot: PotItem,
): { state: PotGalleryState; firstUnlock: boolean; rewardCoins: number } {
  const id = potGalleryNodeId(pot.speciesLandId, pot.grade);
  if (state.unlocked.has(id)) {
    return { state, firstUnlock: false, rewardCoins: 0 };
  }

  const unlocked = new Set(state.unlocked);
  unlocked.add(id);
  return {
    state: { unlocked },
    firstUnlock: true,
    rewardCoins: POT_FIRST_UNLOCK_REWARDS[pot.grade],
  };
}

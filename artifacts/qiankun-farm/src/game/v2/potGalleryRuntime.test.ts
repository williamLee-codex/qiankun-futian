import { describe, expect, it } from 'vitest';
import {
  allPotGalleryNodeIds,
  createPotGalleryState,
  unlockPotGalleryNode,
} from './potGalleryRuntime';
import { upgradePotWithDisplay } from './potUpgradeAction';

describe('Farm V2 pot gallery and displayed upgrade', () => {
  it('contains exactly 36 unique species-grade nodes', () => {
    const ids = allPotGalleryNodeIds();
    expect(ids).toHaveLength(36);
    expect(new Set(ids).size).toBe(36);
  });

  it('pays first-unlock reward only once for a gallery node', () => {
    const pot = { speciesLandId: 2 as const, grade: '天' as const };
    const first = unlockPotGalleryNode(createPotGalleryState(), pot);
    expect(first.firstUnlock).toBe(true);
    expect(first.rewardCoins).toBe(90);

    const repeat = unlockPotGalleryNode(first.state, pot);
    expect(repeat.firstUnlock).toBe(false);
    expect(repeat.rewardCoins).toBe(0);
  });

  it('allows a displayed pot to participate and keeps upgraded result displayed', () => {
    const result = upgradePotWithDisplay({
      display: { slots: { 2: { speciesLandId: 2, grade: '黃' } } },
      inventory: { '2:黃': 2 },
      speciesLandId: 2,
      fromGrade: '黃',
      coinsAvailable: 7,
      useDisplayedSource: true,
    });

    expect(result.inventory['2:黃']).toBe(0);
    expect(result.display.slots[2]).toEqual({ speciesLandId: 2, grade: '玄' });
    expect(result.coinsConsumed).toBe(7);
  });

  it('keeps a non-displayed upgrade result in inventory', () => {
    const result = upgradePotWithDisplay({
      display: { slots: {} },
      inventory: { '6:黃': 2 },
      speciesLandId: 6,
      fromGrade: '黃',
      coinsAvailable: 7,
      useDisplayedSource: false,
    });

    expect(result.inventory['6:黃']).toBe(0);
    expect(result.inventory['6:玄']).toBe(1);
    expect(result.display.slots[6]).toBeUndefined();
  });
});

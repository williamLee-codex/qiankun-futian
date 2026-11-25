import { describe, expect, it } from 'vitest';
import {
  baseCropCountForGodGrade,
  sourcePotCountForUpgrade,
  validatePotUpgrade,
} from './potRuntime';
import {
  displayPot,
  friendCapacityFromDisplay,
  lingyunFromDisplay,
  potDisplayBonus,
} from './potDisplayRuntime';

describe('Farm V2 pot runtime', () => {
  it('requires 729 normal crops and 96 chaos crops for one god-grade pot', () => {
    for (const landId of [1, 2, 3, 4, 5] as const) {
      expect(baseCropCountForGodGrade(landId)).toBe(729);
    }
    expect(baseCropCountForGodGrade(6)).toBe(96);
  });

  it('uses 3 same-grade pots for normal upgrades and 2 for chaos', () => {
    expect(sourcePotCountForUpgrade(2, '黃')).toBe(3);
    expect(sourcePotCountForUpgrade(6, '黃')).toBe(2);
  });

  it('permits only the immediate next grade and charges its canonical coin cost', () => {
    expect(validatePotUpgrade({
      speciesLandId: 2, fromGrade: '黃', sourceCount: 3, coinsAvailable: 7,
    })).toEqual({ toGrade: '玄', sourcePotsConsumed: 3, coinsConsumed: 7 });

    expect(() => validatePotUpgrade({
      speciesLandId: 2, fromGrade: '神', sourceCount: 99, coinsAvailable: 9999,
    })).toThrow('POT_ALREADY_MAX_GRADE');
  });

  it('uses species-specific display slots', () => {
    expect(() => displayPot({ slots: {} }, 2, { speciesLandId: 3, grade: '黃' }))
      .toThrow('POT_SPECIES_SLOT_MISMATCH');
  });

  it('locks the canonical display bonus matrix', () => {
    expect(['黃','玄','地','天','仙','神'].map((g) => potDisplayBonus(1, g as any)))
      .toEqual([1,2,3,5,8,12]);
    expect(['黃','玄','地','天','仙','神'].map((g) => potDisplayBonus(4, g as any)))
      .toEqual([2,4,6,10,16,24]);
    expect(['黃','玄','地','天','仙','神'].map((g) => potDisplayBonus(6, g as any)))
      .toEqual([3,6,9,15,24,36]);
  });

  it('all six god-grade displayed pots produce friend capacity 150 and lingyun 120', () => {
    let state = { slots: {} };
    for (const landId of [1,2,3,4,5,6] as const) {
      state = displayPot(state, landId, { speciesLandId: landId, grade: '神' });
    }
    expect(friendCapacityFromDisplay(state)).toBe(150);
    expect(lingyunFromDisplay(state)).toBe(120);
  });
});

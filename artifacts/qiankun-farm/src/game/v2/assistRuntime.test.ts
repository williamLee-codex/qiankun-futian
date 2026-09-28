import { describe, expect, it } from 'vitest';
import { settleAssist } from './assistRuntime';

describe('Farm V2 assist settlement', () => {
  it('allows fields 2-5 immediately at maturity with no one-hour protection', () => {
    const now = 1000;
    for (const landId of [2, 3, 4, 5] as const) {
      expect(settleAssist({ landId, currentQuantity: 10, maturesAt: now }, now).successful)
        .toBe(true);
    }
  });

  it('rejects fields 1 and 6 and crops that are not mature', () => {
    expect(settleAssist({ landId: 1, currentQuantity: 20, maturesAt: 0 }, 1000).successful)
      .toBe(false);
    expect(settleAssist({ landId: 6, currentQuantity: 1, maturesAt: 0 }, 1000).successful)
      .toBe(false);
    expect(settleAssist({ landId: 2, currentQuantity: 10, maturesAt: 1001 }, 1000).successful)
      .toBe(false);
  });

  it('gives owner 100 percent and helper an extra ceil 10 percent', () => {
    const a = settleAssist({ landId: 2, currentQuantity: 10, maturesAt: 0 }, 1000);
    expect(a.ownerHarvestQuantity).toBe(10);
    expect(a.helperBonusQuantity).toBe(1);

    const b = settleAssist({ landId: 4, currentQuantity: 4, maturesAt: 0 }, 1000);
    expect(b.ownerHarvestQuantity).toBe(4);
    expect(b.helperBonusQuantity).toBe(1);
  });
});

import { describe, expect, it } from 'vitest';
import { createInitialFarmAccess } from './accessRuntime';
import { unlockCoinLandTransaction } from './coinLandUnlockTransaction';
import { createEmptyFarmWarehouse } from './warehouseRuntime';

describe('Farm V2 coin land unlock transaction', () => {
  it('spends 88 coins for Land 2 exactly once', () => {
    const warehouse = createEmptyFarmWarehouse();
    const first = unlockCoinLandTransaction({
      access: createInitialFarmAccess(),
      wallet: { coins: 1000, crystals: 0 },
      warehouse,
      landId: 2,
      now: 100,
    });
    expect(first.coinsSpent).toBe(88);
    expect(first.wallet.coins).toBe(912);
    expect(first.access.accessActive.has(2)).toBe(true);

    const second = unlockCoinLandTransaction({
      access: first.access,
      wallet: first.wallet,
      warehouse,
      landId: 2,
      now: 200,
    });
    expect(second.coinsSpent).toBe(0);
    expect(second.wallet.coins).toBe(912);
  });

  it('requires historical Land 2 before Land 3 and then spends 888 coins', () => {
    expect(() => unlockCoinLandTransaction({
      access: createInitialFarmAccess(),
      wallet: { coins: 9999, crystals: 0 },
      warehouse: createEmptyFarmWarehouse(),
      landId: 3,
      now: 100,
    })).toThrow('LAND_2_REQUIRED');

    const land2 = unlockCoinLandTransaction({
      access: createInitialFarmAccess(),
      wallet: { coins: 1000, crystals: 0 },
      warehouse: createEmptyFarmWarehouse(),
      landId: 2,
      now: 100,
    });
    const land3 = unlockCoinLandTransaction({
      access: land2.access,
      wallet: land2.wallet,
      warehouse: land2.warehouse,
      landId: 3,
      now: 200,
    });
    expect(land3.coinsSpent).toBe(888);
    expect(land3.wallet.coins).toBe(24);
    expect(land3.access.accessActive.has(3)).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { FARM_V2_EXCHANGE, FARM_V2_SEED_PACKS } from './canonicalEconomyData';
import {
  buySeedPacks,
  createEmptyFarmWarehouse,
  depositHarvest,
  exchangeCrops,
} from './warehouseRuntime';

describe('Farm V2 canonical economy runtime', () => {
  it('locks seed packs for lands 1-5 and forbids chaos seed purchase', () => {
    expect(FARM_V2_SEED_PACKS.map((x) => [x.landId, x.quantity, x.price, x.purchasable]))
      .toEqual([
        [1, 20, 1, true],
        [2, 10, 1, true],
        [3, 6, 1, true],
        [4, 4, 1, true],
        [5, 3, 1, true],
        [6, 0, 0, false],
      ]);

    expect(() => buySeedPacks({
      warehouse: createEmptyFarmWarehouse(),
      wallet: { coins: 100, crystals: 100 },
      landId: 6,
      packs: 1,
    })).toThrow('SEED_NOT_PURCHASABLE');
  });

  it('locks canonical crop exchange rates', () => {
    expect(FARM_V2_EXCHANGE.map((x) => [
      x.landId, x.cropQuantity, x.rewardQuantity, x.currency,
    ])).toEqual([
      [1, 5, 1, 'coins'],
      [2, 2, 1, 'coins'],
      [3, 1, 1, 'coins'],
      [4, 1, 2, 'coins'],
      [5, 1, 4, 'coins'],
      [6, 1, 1, 'crystals'],
    ]);
  });

  it('allows seed purchase before its land is unlocked', () => {
    const result = buySeedPacks({
      warehouse: createEmptyFarmWarehouse(),
      wallet: { coins: 3, crystals: 0 },
      landId: 5,
      packs: 2,
    });
    expect(result.seedsAdded).toBe(6);
    expect(result.wallet.coins).toBe(1);
    expect(result.warehouse.seeds[5]).toBe(6);
  });

  it('exchanges only complete units and leaves the remainder', () => {
    let warehouse = createEmptyFarmWarehouse();
    warehouse = depositHarvest(warehouse, 1, 12);
    const result = exchangeCrops({
      warehouse,
      wallet: { coins: 0, crystals: 0 },
      landId: 1,
      cropQuantity: 12,
    });
    expect(result.cropsConsumed).toBe(10);
    expect(result.rewardQuantity).toBe(2);
    expect(result.wallet.coins).toBe(2);
    expect(result.warehouse.crops[1]).toBe(2);
  });

  it('exchanges chaos crystal crop into crystals only at exchange time', () => {
    let warehouse = createEmptyFarmWarehouse();
    warehouse = depositHarvest(warehouse, 6, 2);
    expect(warehouse.crops[6]).toBe(2);

    const result = exchangeCrops({
      warehouse,
      wallet: { coins: 0, crystals: 7 },
      landId: 6,
      cropQuantity: 2,
    });
    expect(result.wallet.crystals).toBe(9);
    expect(result.warehouse.crops[6]).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import {
  FARM_WAREHOUSE_CATEGORIES,
  addWarehouseItem,
  sortFarmWarehouseItems,
  totalWarehouseQuantity,
} from './warehouseCatalogRuntime';

describe('Farm V2 warehouse catalog', () => {
  it('uses the six canonical categories', () => {
    expect(FARM_WAREHOUSE_CATEGORIES).toEqual([
      '種子', '靈植', '培養材料', '盆栽', '洞府陳設', '其他',
    ]);
  });

  it('sorts seeds and crops by land 1 through 6', () => {
    const sorted = sortFarmWarehouseItems([
      { id: 's6', category: '種子', quantity: 1, landId: 6 },
      { id: 's1', category: '種子', quantity: 1, landId: 1 },
      { id: 's3', category: '種子', quantity: 1, landId: 3 },
    ]);
    expect(sorted.map((x) => x.landId)).toEqual([1, 3, 6]);
  });

  it('sorts pots by species then grade', () => {
    const sorted = sortFarmWarehouseItems([
      { id: 'p2g', category: '盆栽', quantity: 1, landId: 2, potGrade: '神' },
      { id: 'p1x', category: '盆栽', quantity: 1, landId: 1, potGrade: '玄' },
      { id: 'p1h', category: '盆栽', quantity: 1, landId: 1, potGrade: '黃' },
    ]);
    expect(sorted.map((x) => x.id)).toEqual(['p1h', 'p1x', 'p2g']);
  });

  it('stacks matching items without a capacity ceiling', () => {
    let items = addWarehouseItem([], { id: 'mat', category: '培養材料', quantity: 1 });
    items = addWarehouseItem(items, { id: 'mat', category: '培養材料', quantity: 999999 });
    expect(items[0].quantity).toBe(1000000);
    expect(totalWarehouseQuantity(items)).toBe(1000000);
  });
});

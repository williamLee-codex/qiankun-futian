export type FarmWarehouseCategory =
  | '種子'
  | '靈植'
  | '培養材料'
  | '盆栽'
  | '洞府陳設'
  | '其他';

export const FARM_WAREHOUSE_CATEGORIES: readonly FarmWarehouseCategory[] = [
  '種子',
  '靈植',
  '培養材料',
  '盆栽',
  '洞府陳設',
  '其他',
] as const;

export interface FarmWarehouseItem {
  id: string;
  category: FarmWarehouseCategory;
  quantity: number;
  landId?: 1 | 2 | 3 | 4 | 5 | 6;
  potGrade?: '黃' | '玄' | '地' | '天' | '仙' | '神';
  decorVersion?: number;
  decorCode?: string;
}

const POT_GRADE_ORDER = ['黃', '玄', '地', '天', '仙', '神'] as const;

export function sortFarmWarehouseItems(
  items: readonly FarmWarehouseItem[],
): FarmWarehouseItem[] {
  return [...items].sort((a, b) => {
    const categoryDelta =
      FARM_WAREHOUSE_CATEGORIES.indexOf(a.category) -
      FARM_WAREHOUSE_CATEGORIES.indexOf(b.category);
    if (categoryDelta !== 0) return categoryDelta;

    if (a.category === '種子' || a.category === '靈植') {
      return (a.landId ?? 99) - (b.landId ?? 99) || a.id.localeCompare(b.id);
    }

    if (a.category === '盆栽') {
      const speciesDelta = (a.landId ?? 99) - (b.landId ?? 99);
      if (speciesDelta !== 0) return speciesDelta;
      return POT_GRADE_ORDER.indexOf(a.potGrade!) - POT_GRADE_ORDER.indexOf(b.potGrade!);
    }

    if (a.category === '洞府陳設') {
      return (a.decorVersion ?? Number.MAX_SAFE_INTEGER) -
        (b.decorVersion ?? Number.MAX_SAFE_INTEGER) ||
        (a.decorCode ?? a.id).localeCompare(b.decorCode ?? b.id);
    }

    return a.id.localeCompare(b.id);
  });
}

export function addWarehouseItem(
  items: readonly FarmWarehouseItem[],
  item: FarmWarehouseItem,
): FarmWarehouseItem[] {
  if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
    throw new Error('INVALID_WAREHOUSE_QUANTITY');
  }

  const index = items.findIndex((existing) =>
    existing.id === item.id &&
    existing.category === item.category &&
    existing.landId === item.landId &&
    existing.potGrade === item.potGrade &&
    existing.decorVersion === item.decorVersion &&
    existing.decorCode === item.decorCode);

  if (index < 0) return sortFarmWarehouseItems([...items, item]);

  const next = [...items];
  next[index] = { ...next[index], quantity: next[index].quantity + item.quantity };
  return sortFarmWarehouseItems(next);
}

/**
 * Farm V2 warehouse has no capacity ceiling and exposes no discard operation.
 * RPG inventory is intentionally outside this module.
 */
export function totalWarehouseQuantity(items: readonly FarmWarehouseItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

/** Newcomer sixfold harvest eligibility. Authority: persisted first farm entry timestamp.
 * Do not infer eligibility from a browser clock or from a purchase/redeem event.
 * The first 7 x 24 hours are inclusive of the start and exclusive of the end.
 */
export const NEWCOMER_MULTIPLIER = 6;
export const NEWCOMER_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export function newcomerHarvestMultiplier(firstFarmEnteredAt: string | number | Date | null | undefined, harvestedAt: string | number | Date): 1 | 6 {
  if (firstFarmEnteredAt == null) return 1;
  const started = new Date(firstFarmEnteredAt).getTime();
  const harvested = new Date(harvestedAt).getTime();
  if (!Number.isFinite(started) || !Number.isFinite(harvested)) return 1;
  return harvested >= started && harvested - started < NEWCOMER_DURATION_MS ? 6 : 1;
}

/** Applies only to reward yield, not to harvested plant count or task progress.
 * All six lands share the same rule; never apply the multiplier twice.
 */
export function newcomerHarvestYield(
  plantedQuantity: number,
  firstFarmEnteredAt: string | number | Date | null | undefined,
  harvestedAt: string | number | Date,
): number {
  if (!Number.isSafeInteger(plantedQuantity) || plantedQuantity < 0) throw new Error('INVALID_HARVEST_QUANTITY');
  const yieldQuantity = plantedQuantity * newcomerHarvestMultiplier(firstFarmEnteredAt, harvestedAt);
  if (!Number.isSafeInteger(yieldQuantity)) throw new Error('HARVEST_YIELD_OVERFLOW');
  return yieldQuantity;
}

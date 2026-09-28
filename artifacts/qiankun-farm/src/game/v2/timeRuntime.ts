/**
 * 乾坤福田 V2 — Canonical time boundaries.
 * Business timezone is fixed at Asia/Taipei (UTC+8).
 */
export const FARM_TIME_ZONE = 'Asia/Taipei';
export const FARM_RESET_HOUR = 5;
const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function taipeiShift(timestamp: number): Date {
  return new Date(timestamp + TAIPEI_OFFSET_MS);
}

function unshiftTaipei(dateUtcFields: Date): number {
  return dateUtcFields.getTime() - TAIPEI_OFFSET_MS;
}

export function startOfFarmDay(timestamp: number): number {
  const d = taipeiShift(timestamp);
  const boundary = Date.UTC(
    d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), FARM_RESET_HOUR, 0, 0, 0,
  );
  const shiftedBoundary = unshiftTaipei(new Date(boundary));
  return timestamp >= shiftedBoundary ? shiftedBoundary : shiftedBoundary - DAY_MS;
}

export function nextFarmDayReset(timestamp: number): number {
  return startOfFarmDay(timestamp) + DAY_MS;
}

export function startOfFarmWeek(timestamp: number): number {
  const dayStart = startOfFarmDay(timestamp);
  const d = taipeiShift(dayStart);
  const weekday = d.getUTCDay(); // Sunday=0
  const daysSinceMonday = (weekday + 6) % 7;
  return dayStart - daysSinceMonday * DAY_MS;
}

export function nextFarmWeekReset(timestamp: number): number {
  return startOfFarmWeek(timestamp) + 7 * DAY_MS;
}

export function startOfFarmMonth(timestamp: number): number {
  const dayStart = startOfFarmDay(timestamp);
  const d = taipeiShift(dayStart);
  return unshiftTaipei(new Date(Date.UTC(
    d.getUTCFullYear(), d.getUTCMonth(), 1, FARM_RESET_HOUR, 0, 0, 0,
  )));
}

export function nextFarmMonthReset(timestamp: number): number {
  const start = taipeiShift(startOfFarmMonth(timestamp));
  return unshiftTaipei(new Date(Date.UTC(
    start.getUTCFullYear(), start.getUTCMonth() + 1, 1, FARM_RESET_HOUR, 0, 0, 0,
  )));
}

export const NEWBIE_WINDOW_MS = 7 * DAY_MS;

export function isNewbieHarvestWindow(firstFarmEnteredAt: number, harvestedAt: number): boolean {
  return harvestedAt >= firstFarmEnteredAt &&
    harvestedAt < firstFarmEnteredAt + NEWBIE_WINDOW_MS;
}

export function applyNewbieHarvestMultiplier(
  baseHarvestQuantity: number,
  firstFarmEnteredAt: number,
  harvestedAt: number,
): number {
  if (!Number.isInteger(baseHarvestQuantity) || baseHarvestQuantity < 0) {
    throw new Error('INVALID_HARVEST_QUANTITY');
  }
  return isNewbieHarvestWindow(firstFarmEnteredAt, harvestedAt)
    ? baseHarvestQuantity * 6
    : baseHarvestQuantity;
}

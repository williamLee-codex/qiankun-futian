import { describe, expect, it } from 'vitest';
import {
  applyNewbieHarvestMultiplier,
  nextFarmMonthReset,
  nextFarmWeekReset,
  startOfFarmDay,
  startOfFarmMonth,
  startOfFarmWeek,
} from './timeRuntime';

const ts = (iso: string) => Date.parse(iso);

describe('Farm V2 canonical time boundaries', () => {
  it('uses Asia/Taipei 05:00 as the daily boundary', () => {
    expect(startOfFarmDay(ts('2026-09-28T04:59:59+08:00')))
      .toBe(ts('2026-09-27T05:00:00+08:00'));
    expect(startOfFarmDay(ts('2026-09-28T05:00:00+08:00')))
      .toBe(ts('2026-09-28T05:00:00+08:00'));
  });

  it('uses Monday 05:00 as the weekly boundary', () => {
    expect(startOfFarmWeek(ts('2026-09-28T04:59:59+08:00')))
      .toBe(ts('2026-09-21T05:00:00+08:00'));
    expect(startOfFarmWeek(ts('2026-09-28T05:00:00+08:00')))
      .toBe(ts('2026-09-28T05:00:00+08:00'));
    expect(nextFarmWeekReset(ts('2026-09-28T05:00:00+08:00')))
      .toBe(ts('2026-10-05T05:00:00+08:00'));
  });

  it('uses the first day of each month at 05:00 as the monthly boundary', () => {
    expect(startOfFarmMonth(ts('2026-10-01T04:59:59+08:00')))
      .toBe(ts('2026-09-01T05:00:00+08:00'));
    expect(startOfFarmMonth(ts('2026-10-01T05:00:00+08:00')))
      .toBe(ts('2026-10-01T05:00:00+08:00'));
    expect(nextFarmMonthReset(ts('2026-10-01T05:00:00+08:00')))
      .toBe(ts('2026-11-01T05:00:00+08:00'));
  });

  it('applies newbie x6 to sixth-land chaos crystal harvest, without changing its 1:1 exchange rate', () => {
    const first = ts('2026-09-01T12:34:56+08:00');
    const withinSevenDays = first + 60 * 60 * 60 * 1000;
    expect(applyNewbieHarvestMultiplier(1, first, withinSevenDays)).toBe(6);
    expect(applyNewbieHarvestMultiplier(1, first, first + 7 * 24 * 60 * 60 * 1000)).toBe(1);
  });

  it('applies newbie x6 only during the exact first 7x24h window', () => {
    const first = ts('2026-09-01T12:34:56+08:00');
    expect(applyNewbieHarvestMultiplier(20, first, first)).toBe(120);
    expect(applyNewbieHarvestMultiplier(20, first, first + 7 * 24 * 60 * 60 * 1000 - 1))
      .toBe(120);
    expect(applyNewbieHarvestMultiplier(20, first, first + 7 * 24 * 60 * 60 * 1000))
      .toBe(20);
  });
});

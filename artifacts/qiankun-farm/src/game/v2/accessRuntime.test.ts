import { describe, expect, it } from 'vitest';
import {
  createInitialFarmAccess,
  reconcilePaidLandAccess,
  unlockCoinLand,
} from './accessRuntime';

describe('Farm V2 canonical land access', () => {
  it('charges 88 coins once for land 2', () => {
    const initial = createInitialFarmAccess();
    const first = unlockCoinLand({ access: initial, landId: 2, coinBalance: 88, now: 100 });
    expect(first.coinsSpent).toBe(88);
    expect(first.access.historicallyUnlocked.has(2)).toBe(true);
    expect(first.access.firstUnlockedAt[2]).toBe(100);

    const again = unlockCoinLand({ access: first.access, landId: 2, coinBalance: 0, now: 200 });
    expect(again.coinsSpent).toBe(0);
    expect(again.access.firstUnlockedAt[2]).toBe(100);
  });

  it('requires land 2 before the 888-coin land 3 unlock', () => {
    expect(() => unlockCoinLand({
      access: createInitialFarmAccess(),
      landId: 3,
      coinBalance: 999,
      now: 100,
    })).toThrow('LAND_2_REQUIRED');
  });

  it('activates paid lands at 100/300/600 effective paid crystals', () => {
    const result = reconcilePaidLandAccess({
      access: createInitialFarmAccess(),
      effectivePaidCrystals: 600,
      now: 500,
    });
    expect([...result.access.accessActive].sort()).toEqual([1, 4, 5, 6]);
    expect(result.chaosSeedsGranted).toBe(1);
    expect(result.access.firstUnlockedAt[6]).toBe(500);
  });

  it('grants the first land-6 chaos seed exactly once', () => {
    const first = reconcilePaidLandAccess({
      access: createInitialFarmAccess(),
      effectivePaidCrystals: 600,
      now: 500,
    });
    const second = reconcilePaidLandAccess({
      access: first.access,
      effectivePaidCrystals: 700,
      now: 900,
    });
    expect(first.chaosSeedsGranted).toBe(1);
    expect(second.chaosSeedsGranted).toBe(0);
    expect(second.access.firstUnlockedAt[6]).toBe(500);
  });

  it('refund suspends paid access but preserves historical unlock timestamps', () => {
    const unlocked = reconcilePaidLandAccess({
      access: createInitialFarmAccess(),
      effectivePaidCrystals: 600,
      now: 500,
    }).access;

    const refunded = reconcilePaidLandAccess({
      access: unlocked,
      effectivePaidCrystals: 99,
      now: 1000,
    }).access;

    expect(refunded.accessActive.has(4)).toBe(false);
    expect(refunded.accessActive.has(5)).toBe(false);
    expect(refunded.accessActive.has(6)).toBe(false);
    expect(refunded.historicallyUnlocked.has(4)).toBe(true);
    expect(refunded.historicallyUnlocked.has(5)).toBe(true);
    expect(refunded.historicallyUnlocked.has(6)).toBe(true);
    expect(refunded.firstUnlockedAt[6]).toBe(500);
  });

  it('requalification restores access without rewriting first unlock or granting seed again', () => {
    const first = reconcilePaidLandAccess({
      access: createInitialFarmAccess(),
      effectivePaidCrystals: 600,
      now: 500,
    });
    const suspended = reconcilePaidLandAccess({
      access: first.access,
      effectivePaidCrystals: 0,
      now: 800,
    });
    const restored = reconcilePaidLandAccess({
      access: suspended.access,
      effectivePaidCrystals: 600,
      now: 1200,
    });

    expect(restored.access.accessActive.has(6)).toBe(true);
    expect(restored.access.firstUnlockedAt[6]).toBe(500);
    expect(restored.chaosSeedsGranted).toBe(0);
  });
});

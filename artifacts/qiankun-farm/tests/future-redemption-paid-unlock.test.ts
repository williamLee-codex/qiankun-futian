import assert from "node:assert/strict";
import { test } from "node:test";
import { createInitialFarmAccess, reconcilePaidLandAccess } from "../src/game/v2/accessRuntime";

test("future qualified recharge unlocks fields 4/5/6 without requiring coin fields", () => {
  const result = reconcilePaidLandAccess({
    access: createInitialFarmAccess(),
    effectivePaidCrystals: 4000,
    now: 1_700_000_000_000,
  });
  for (const field of [4, 5, 6] as const) {
    assert.equal(result.access.accessActive.has(field), true);
    assert.equal(result.access.historicallyUnlocked.has(field), true);
  }
  assert.equal(result.access.historicallyUnlocked.has(2), false);
  assert.equal(result.access.historicallyUnlocked.has(3), false);
  assert.equal(result.chaosSeedsGranted, 1);
});

test("reconciliation retry does not grant a second chaos seed", () => {
  const first = reconcilePaidLandAccess({
    access: createInitialFarmAccess(),
    effectivePaidCrystals: 600,
    now: 1000,
  });
  const second = reconcilePaidLandAccess({
    access: first.access,
    effectivePaidCrystals: 600,
    now: 2000,
  });
  assert.equal(first.chaosSeedsGranted, 1);
  assert.equal(second.chaosSeedsGranted, 0);
  assert.equal(second.access.firstUnlockedAt[6], 1000);
});

test("unqualified credit leaves paid fields locked", () => {
  const result = reconcilePaidLandAccess({
    access: createInitialFarmAccess(),
    effectivePaidCrystals: 0,
    now: 1000,
  });
  for (const field of [4, 5, 6] as const) assert.equal(result.access.accessActive.has(field), false);
  assert.equal(result.chaosSeedsGranted, 0);
});

test("thresholds unlock only qualified paid fields", () => {
  for (const [value, fields] of [
    [99, []],
    [100, [4]],
    [299, [4]],
    [300, [4, 5]],
    [599, [4, 5]],
    [600, [4, 5, 6]],
  ] as const) {
    const result = reconcilePaidLandAccess({
      access: createInitialFarmAccess(),
      effectivePaidCrystals: value,
      now: 1000,
    });
    for (const field of [4, 5, 6] as const) {
      assert.equal(result.access.accessActive.has(field), (fields as readonly number[]).includes(field), `value=${value}, field=${field}`);
    }
  }
});

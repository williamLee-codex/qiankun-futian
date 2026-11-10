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


import { createFarmPetState, reconcileMilestonePets } from "../src/game/v2/petRuntime";
import { createFarmerState, reconcileFarmerEntitlement } from "../src/game/v2/farmerRuntime";

test("recharge milestones grant both pets and farmer at exact thresholds", () => {
  for (const amount of [0, 449, 450, 798, 799, 998, 999, 4000]) {
    const pets = reconcileMilestonePets({
      state: createFarmPetState(),
      effectivePaidCrystals: amount,
      now: 1000,
    });
    const farmer = reconcileFarmerEntitlement(createFarmerState(), amount);
    assert.equal(pets.owned.has("噬時諦聽"), amount >= 450, `450 threshold at ${amount}`);
    assert.equal(pets.owned.has("乾坤麒麟"), amount >= 799, `799 threshold at ${amount}`);
    assert.equal(farmer.entitled, amount >= 999, `999 threshold at ${amount}`);
  }
});

test("repeated paid qualification does not duplicate pets or reset farmer settings", () => {
  const initialPets = createFarmPetState();
  const first = reconcileMilestonePets({ state: initialPets, effectivePaidCrystals: 4000, now: 1000 });
  const second = reconcileMilestonePets({ state: first, effectivePaidCrystals: 4000, now: 1000 });
  assert.equal(second.owned.size, first.owned.size);
  const initialFarmer = createFarmerState();
  initialFarmer.enabledByLand[2] = false;
  const farmer = reconcileFarmerEntitlement(initialFarmer, 4000);
  assert.equal(farmer.entitled, true);
  assert.equal(farmer.enabledByLand[2], false);
});


test("qualification suspension and restoration preserve historical field unlock without regranting chaos seed", () => {
  const first = reconcilePaidLandAccess({
    access: createInitialFarmAccess(), effectivePaidCrystals: 999, now: 1000,
  });
  const suspended = reconcilePaidLandAccess({
    access: first.access, effectivePaidCrystals: 0, now: 2000,
  });
  const restored = reconcilePaidLandAccess({
    access: suspended.access, effectivePaidCrystals: 999, now: 3000,
  });
  for (const field of [4, 5, 6] as const) {
    assert.equal(suspended.access.accessActive.has(field), false);
    assert.equal(suspended.access.historicallyUnlocked.has(field), true);
    assert.equal(restored.access.accessActive.has(field), true);
    assert.equal(restored.access.firstUnlockedAt[field], 1000);
  }
  assert.equal(first.chaosSeedsGranted, 1);
  assert.equal(suspended.chaosSeedsGranted, 0);
  assert.equal(restored.chaosSeedsGranted, 0);

  const petsBefore = reconcileMilestonePets({
    state: createFarmPetState(), effectivePaidCrystals: 999, now: 1000,
  });
  const petsSuspended = reconcileMilestonePets({
    state: petsBefore, effectivePaidCrystals: 0, now: 2000,
  });
  const petsRestored = reconcileMilestonePets({
    state: petsSuspended, effectivePaidCrystals: 999, now: 3000,
  });
  assert.equal(petsSuspended.owned.has("乾坤麒麟"), false);
  assert.equal(petsRestored.owned.has("乾坤麒麟"), true);
  assert.equal(reconcileFarmerEntitlement(createFarmerState(), 0).entitled, false);
  assert.equal(reconcileFarmerEntitlement(createFarmerState(), 999).entitled, true);
});

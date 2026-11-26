import { expect, it } from "vitest";
import { createInitialFarmAccess } from "./accessRuntime";
import { createInitialLandEntities } from "./landRuntime";
import { projectCoreCoinLands } from "./coinLandProjection";
it("projects historical Core rights, preserves the crop and never invents another land", () => {
  const access = createInitialFarmAccess(),
    lands = createInitialLandEntities();
  const growing = {
    ...lands[1],
    lifecycle: "GROWING" as const,
    plantedAt: 100,
    maturesAt: 200,
    plantedQuantity: 10,
  };
  lands[1] = growing;
  const result = projectCoreCoinLands(access, lands, [
    {
      landId: 2,
      historicallyUnlocked: true,
      accessActive: false,
      firstUnlockedAt: 50,
    },
    {
      landId: 3,
      historicallyUnlocked: false,
      accessActive: false,
      firstUnlockedAt: null,
    },
  ]);
  expect(result.access.historicallyUnlocked.has(2)).toBe(true);
  expect(result.access.accessActive.has(2)).toBe(false);
  expect(result.lands[1]).toEqual(growing);
  expect(result.lands[2].lifecycle).toBe("LOCKED");
  const active = projectCoreCoinLands(result.access, result.lands, [
    {
      landId: 2,
      historicallyUnlocked: true,
      accessActive: true,
      firstUnlockedAt: 50,
    },
    {
      landId: 3,
      historicallyUnlocked: true,
      accessActive: true,
      firstUnlockedAt: 60,
    },
  ]);
  expect(active.lands[1]).toMatchObject({
    lifecycle: "GROWING",
    plantedAt: 100,
    maturesAt: 200,
    accessActive: true,
  });
  expect(active.lands[2].lifecycle).toBe("EMPTY");
  expect(access.historicallyUnlocked.has(2)).toBe(false);
});

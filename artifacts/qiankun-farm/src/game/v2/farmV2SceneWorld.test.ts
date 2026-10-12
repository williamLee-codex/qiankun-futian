import { describe, expect, it } from "vitest";
import { createFarmV2SceneEntities } from "./farmV2SceneWorld";
import { mapServerLands } from "./farmV2SceneAdapter";
import { farmV2ScenePlacement } from "./farmV2ScenePlacement";
const plots = () =>
  mapServerLands(
    Array.from({ length: 6 }, (_, i) => ({
      landId: i + 1,
      lifecycle: "EMPTY" as const,
      accessActive: true,
      plantedQuantity: 0,
      maturesAt: null,
    })),
    0,
  );
describe("one server-owned six-land world", () => {
  it("preserves identity, world geometry and server state across art projections", () => {
    const entities = createFarmV2SceneEntities(plots());
    expect(entities.map((e) => e.landId)).toEqual([1, 2, 3, 4, 5, 6]);
    const before = JSON.stringify(entities);
    for (const entity of entities) {
      expect(entity.world.corners).toHaveLength(4);
      for (const desktop of [true, false])
        farmV2ScenePlacement(entity.landId, desktop);
    }
    expect(JSON.stringify(entities)).toBe(before);
  });
  it("binds a shuffled snapshot by land identity and rejects missing or duplicate lands", () => {
    const input = plots().reverse();
    expect(createFarmV2SceneEntities(input).map((e) => e.plot.id + 1)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
    expect(() => createFarmV2SceneEntities(input.slice(1))).toThrow(
      "INVALID_SCENE_LANDS",
    );
    expect(() =>
      createFarmV2SceneEntities([...input.slice(1), input[1]]),
    ).toThrow("INVALID_SCENE_LANDS");
  });
});

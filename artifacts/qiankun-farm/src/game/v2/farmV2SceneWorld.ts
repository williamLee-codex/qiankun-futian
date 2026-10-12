import type { Plot } from "../types";
import { farmV2WorldSurface } from "./farmV2ScenePlacement";
import type { FarmLandId } from "./canonicalLandData";
const world = Object.freeze(
  [1, 2, 3, 4, 5, 6].map((id) =>
    Object.freeze({ ...farmV2WorldSurface(id), landId: id as FarmLandId }),
  ),
);
export type FarmV2SceneLandEntity = {
  landId: FarmLandId;
  world: (typeof world)[number];
  /** A validated server snapshot; art and viewport never produce gameplay state. */
  plot: Plot;
};
export function createFarmV2SceneEntities(
  plots: readonly Plot[],
): FarmV2SceneLandEntity[] {
  if (
    plots.length !== 6 ||
    new Set(plots.map((plot) => plot.id)).size !== 6 ||
    plots.some(
      (plot) => !Number.isInteger(plot.id) || plot.id < 0 || plot.id > 5,
    )
  )
    throw new Error("INVALID_SCENE_LANDS");
  return world.map((surface) => ({
    landId: surface.landId,
    world: surface,
    plot: plots.find((plot) => plot.id + 1 === surface.landId)!,
  }));
}

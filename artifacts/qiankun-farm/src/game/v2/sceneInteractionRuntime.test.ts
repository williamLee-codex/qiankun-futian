import { test, expect } from "vitest";
import { SCENE_LAYOUTS, sceneLandAction } from "./sceneInteractionRuntime";
test("CAVE-RESPONSIVE-001: independent mobile/desktop interactive regions stay inside each scene", () => {
  expect(SCENE_LAYOUTS.mobile.aspectRatio).not.toBe(
    SCENE_LAYOUTS.desktop.aspectRatio,
  );
  for (const layout of Object.values(SCENE_LAYOUTS)) {
    expect(layout.lands).toHaveLength(6);
    expect(layout.pots).toHaveLength(6);
    expect(layout.pets).toHaveLength(4);
    for (const r of [
      ...layout.lands,
      ...layout.pots,
      ...layout.pets,
      layout.cave,
      layout.formation,
    ])
      expect(r.x >= 0 && r.y >= 0 && r.x + r.w <= 100 && r.y + r.h <= 100).toBe(
        true,
      );
  }
});
test("SCENE server-backed action routing never offers harvest on empty/locked land", () => {
  expect(sceneLandAction({ unlocked: false, state: "ready" })).toBe(null);
  expect(sceneLandAction({ unlocked: true, state: "empty" })).toBe("sow");
  expect(sceneLandAction({ unlocked: true, state: "ready" })).toBe("harvest");
  expect(sceneLandAction({ unlocked: true, state: "growing" })).toBe(null);
});

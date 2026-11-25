import { test, expect } from "vitest";
import { SCENE_LAYOUTS, sceneLandAction } from "./sceneInteractionRuntime";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
test("approved scene originals retain exact pixels, dimensions and uncropped aspect ratios", () => {
  for (const [name, width, height, hash] of [
    [
      "desktop",
      1215,
      1295,
      "706748aef924482d9a7a7bd5398b2080572ae8c919056b1a855c1822e1b69382",
    ],
    [
      "mobile",
      941,
      1672,
      "d5a2faf9b01e3bad2978f5b52ee583e1ad995c353df4aeaa6b1cf92ad7511288",
    ],
  ] as const) {
    const image = readFileSync(
      new URL(
        `../../../public/images/farm/farm-scene-${name}.png`,
        import.meta.url,
      ),
    );
    expect(image.readUInt32BE(16)).toBe(width);
    expect(image.readUInt32BE(20)).toBe(height);
    expect(createHash("sha256").update(image).digest("hex")).toBe(hash);
    expect(SCENE_LAYOUTS[name].aspectRatio).toBe(`${width} / ${height}`);
  }
});
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

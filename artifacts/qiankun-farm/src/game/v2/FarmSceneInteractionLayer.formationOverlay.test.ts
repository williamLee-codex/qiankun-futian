import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const scene = readFileSync(new URL("./FarmSceneInteractionLayer.tsx", import.meta.url), "utf8");

describe("Farm V2 formation scene regression", () => {
  it("keeps the formation management hotspot without painting the oversized fixed art", () => {
    expect(scene).toContain('className="farm-v2-formation"');
    expect(scene).toContain('onClick={() => section("護陣")}');
    expect(scene).not.toContain("taixu-xinghe-formation.webp");
  });

  it("labels the hotspot using the equipped formation rather than a hard-coded tier", () => {
    expect(scene).toContain('FORMATION_NAMES[props.state.activeFormation]');
    expect(scene).not.toContain('aria-label={`太虛星河大陣，');
  });
});

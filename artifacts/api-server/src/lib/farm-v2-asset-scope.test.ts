import { describe, expect, it } from "vitest";
import { actionAssetBuckets, planAssetBuckets, planBlocksAction } from "./farm-v2-asset-scope";

// Trimmed from the production row that blocked a player: an abandoned
// synthesize that reserved one material and one pot it never committed.
const SYNTHESIZE_PLAN = {
  before: {
    crops: { "5": 17 },
    seeds: { "1": 0 },
    workshop: { pots: [], materials: { 蘊靈砂: 1, 九霄玉髓: 0 }, petFood: 1 },
  },
  state: {
    crops: { "5": 14 },
    seeds: { "1": 0 },
    workshop: {
      pots: [{ id: "33ea985b", grade: "黃", species: 5, displayed: false }],
      materials: { 蘊靈砂: 0, 九霄玉髓: 0 },
      petFood: 1,
    },
  },
  cost: 3,
  reward: 15,
};

const SEED_PLAN = {
  before: { seeds: { "1": 0 }, crops: { "5": 17 } },
  state: { seeds: { "1": 3 }, crops: { "5": 17 } },
};

describe("asset scope recovery fencing", () => {
  it("fences the buckets a synthesize plan actually changed", () => {
    const buckets = planAssetBuckets(SYNTHESIZE_PLAN);
    expect(buckets).toContain("workshop.pots");
    expect(buckets).toContain("workshop.materials");
    expect(buckets).not.toContain("seeds");
  });

  it("keeps the pending synthesize blocking only workshop synthesis", () => {
    const blocked = (action: string) => planBlocksAction(SYNTHESIZE_PLAN, "WORKSHOP:x", action);
    expect(blocked('WORKSHOP:{"kind":"synthesize","species":5,"grade":"黃"}')).toBe(true);
    expect(blocked("WORKSHOP:{\"kind\":\"decompose\",\"id\":\"p1\"}")).toBe(true);
    expect(blocked("seed-purchase:1:1")).toBe(false);
    expect(blocked("sow:1:1")).toBe(false);
    expect(blocked("harvest:1:1")).toBe(false);
  });

  it("keeps low-value seed and crop residues out of the fence", () => {
    // Coins, seeds and crops follow the lenient compensation policy and must
    // never lock a player out of buying or farming.
    expect(planBlocksAction(SEED_PLAN, "seed-purchase:1:1", "seed-purchase:2:1")).toBe(false);
    expect(planBlocksAction(SEED_PLAN, "seed-purchase:1:1", 'WORKSHOP:{"kind":"synthesize"}')).toBe(false);
    expect(planBlocksAction(SEED_PLAN, "seed-purchase:1:1", "harvest:1:1")).toBe(false);
  });

  it("fences an unreadable plan by the action family", () => {
    expect(planBlocksAction(null, "WORKSHOP:x", 'WORKSHOP:{"kind":"synthesize"}')).toBe(true);
    expect(planBlocksAction(null, "WORKSHOP:x", "seed-purchase:1:1")).toBe(false);
    expect(planBlocksAction({}, "seed-purchase:1:1", "seed-purchase:2:1")).toBe(false);
  });

  it("maps the remaining farm actions to their stored buckets", () => {
    expect(actionAssetBuckets("seed-purchase:1:1")).toEqual(["seeds"]);
    expect(actionAssetBuckets("sow:1:1")).toEqual(["seeds", "crops"]);
    expect(actionAssetBuckets("harvest:1:1")).toEqual(["crops"]);
  });
});

import { expect, it } from "vitest";
import { completeFarmV2Mutation } from "./farm-v2-mutation-snapshot";

it("returns a fresh committed snapshot after mutation and farmer settlement", async () => {
  const events: string[] = [];
  const snapshot = { player: { warehouseState: { seeds: { 1: 0 } } }, lands: [{ landId: 1, lifecycle: "GROWING" }] };
  const result = await completeFarmV2Mutation({
    mutate: async () => { events.push("commit"); return { replayed: true }; },
    settle: async () => { events.push("settle"); },
    read: async () => { events.push("read"); return snapshot; },
  });
  expect(events).toEqual(["commit", "settle", "read"]);
  expect(result).toEqual({ replayed: true, snapshot });
});

it("does not return a snapshot when mutation or settlement fails", async () => {
  let reads = 0;
  for (const phase of ["mutate", "settle"]) {
    await expect(completeFarmV2Mutation({
      mutate: async () => { if (phase === "mutate") throw new Error("denied"); return {}; },
      settle: async () => { throw new Error("denied"); },
      read: async () => { reads++; return {}; },
    })).rejects.toThrow("denied");
  }
  expect(reads).toBe(0);
});

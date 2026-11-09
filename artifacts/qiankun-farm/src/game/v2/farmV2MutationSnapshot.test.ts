import { expect, it } from "vitest";
import { resolveFarmV2MutationSnapshot } from "./farmV2MutationSnapshot";

it("uses the acknowledged snapshot without another request", async () => {
  const snapshot = { player: { warehouseState: { seeds: {}, crops: {} } }, lands: [] };
  let reads = 0;
  expect(await resolveFarmV2MutationSnapshot({ snapshot }, async () => { reads++; throw new Error("must not read"); })).toBe(snapshot);
  expect(reads).toBe(0);
});

it("reads current state for legacy responses and propagates failures", async () => {
  const snapshot = { player: { warehouseState: { seeds: {}, crops: {} } }, lands: [] };
  expect(await resolveFarmV2MutationSnapshot({ land: {} }, async () => snapshot)).toBe(snapshot);
  await expect(resolveFarmV2MutationSnapshot(undefined, async () => { throw new Error("offline"); })).rejects.toThrow("offline");
});

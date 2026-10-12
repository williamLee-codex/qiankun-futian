import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { create, act, type ReactTestRenderer } from "react-test-renderer";
import { useFarmV2Scene } from "./useFarmV2Scene";
let value: ReturnType<typeof useFarmV2Scene>;
let renderer: ReactTestRenderer;
function Harness({ token }: { token: string }) {
  value = useFarmV2Scene("https://farm.test/api", token);
  return null;
}
const snapshot = (stock: number, pendingMutation: any = null) => ({
  serverTime: Date.now(),
  pendingMutation,
  lands: Array.from({ length: 6 }, (_, i) => ({
    landId: i + 1,
    lifecycle: "EMPTY",
    accessActive: true,
    plantedQuantity: 0,
    maturesAt: null,
  })),
  player: {
    warehouseState: {
      seeds: Object.fromEntries(
        Array.from({ length: 6 }, (_, i) => [i + 1, stock]),
      ),
      crops: Object.fromEntries(
        Array.from({ length: 6 }, (_, i) => [i + 1, 0]),
      ),
    },
  },
});
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  vi.unstubAllGlobals();
});
describe("server-owned recovery and session isolation", () => {
  it("does not carry a recovered A request into player B", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("fetch", async (_url: any, options: any) =>
      json(
        options.headers.Authorization === "Bearer A"
          ? snapshot(20, {
              operation: "purchaseSeeds",
              landId: 1,
              quantity: 1,
              requestId: "A-request",
            })
          : snapshot(99),
      ),
    );
    await act(async () => {
      renderer = create(<Harness token="A" />);
    });
    expect(value.pendingRetry?.operation).toBe("purchaseSeeds");
    await act(async () => renderer.update(<Harness token="B" />));
    expect(value.pendingRetry).toBe(null);
    expect(value.data?.seedInventory.yaojin).toBe(99);
  });
  it("ignores an old mutation completion after changing identity", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    let finish!: (response: Response) => void;
    vi.stubGlobal("fetch", async (_url: any, options: any) =>
      options.method === "POST"
        ? new Promise<Response>((resolve) => {
            finish = resolve;
          })
        : json(
            snapshot(options.headers.Authorization === "Bearer A" ? 20 : 99),
          ),
    );
    await act(async () => {
      renderer = create(<Harness token="A" />);
    });
    let mutation!: Promise<boolean>;
    await act(async () => {
      mutation = value.mutate("sow", 1);
    });
    await act(async () => renderer.update(<Harness token="B" />));
    await act(async () => {
      finish(json({}));
      expect(await mutation).toBe(false);
    });
    expect(value.data?.seedInventory.yaojin).toBe(99);
    expect(value.busy).toBe(false);
    expect(value.pendingRetry).toBe(null);
  });
  it("keeps the original ID after authentication fails on an ambiguous retry", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const ids: string[] = [];
    vi.stubGlobal("fetch", async (_url: any, options: any) => {
      if (options.method === "POST") {
        ids.push(options.headers["x-request-id"]);
        return json({ error: "INVALID_LAUNCH_IDENTITY" }, 401);
      }
      return json(snapshot(20));
    });
    await act(async () => {
      renderer = create(<Harness token="A" />);
    });
    await act(async () => {
      await value.mutate("sow", 1);
    });
    expect(value.pendingRetry?.operation).toBe("sow");
    await act(async () => {
      await value.mutate("sow", 1);
    });
    expect(ids[0]).toBe(ids[1]);
  });
});

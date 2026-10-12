import { afterEach, expect, it, vi } from "vitest";
import {
  readCoreCoinLands,
  purchaseCoreCoinLand,
} from "./farm-v2-core-coin-land";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const env = () => {
  vi.stubEnv("PLATFORM_BASE_URL", "https://core.test");
  vi.stubEnv("REPLIT_APP_SHARED_SECRET", "shared");
};
it("sends only land and original request ID for the verified launch session", async () => {
  env();
  let call: any;
  vi.stubGlobal("fetch", async (url: any, input: any) => {
    call = { url: String(url), input };
    return Response.json({
      result_status: "created",
      land_id: 2,
      cost: 88,
      unlocked_at: "2026-10-12T00:00:00Z",
      entitlement_id: "e",
    });
  });
  await purchaseCoreCoinLand("launch", 2, "original");
  expect(JSON.parse(call.input.body)).toEqual({
    operation: "purchase",
    launchToken: "launch",
    landId: 2,
  });
  expect(call.input.headers["x-request-id"]).toBe("original");
  expect(call.url).toBe(
    "https://core.test/api/replit/farm-v2/coin-land-unlocks",
  );
});
it("rejects incomplete or inconsistent Core rights instead of granting cached access", async () => {
  env();
  vi.stubGlobal("fetch", async () =>
    Response.json({
      result_status: "ok",
      lands: [
        {
          landId: 2,
          historicallyUnlocked: false,
          accessActive: true,
          firstUnlockedAt: null,
        },
      ],
    }),
  );
  await expect(readCoreCoinLands("launch")).rejects.toThrow(
    "INVALID_CORE_COIN_LAND_RESPONSE",
  );
});
it("accepts only explicit authoritative rejections and preserves ambiguous authentication failure", async () => {
  env();
  vi.stubGlobal("fetch", async () =>
    Response.json(
      { error: "insufficient_funds", definitive: true },
      { status: 409 },
    ),
  );
  await expect(purchaseCoreCoinLand("launch", 2, "same")).rejects.toMatchObject(
    { definitive: true },
  );
  vi.stubGlobal("fetch", async () =>
    Response.json({ error: "INVALID_LAUNCH_TOKEN" }, { status: 401 }),
  );
  await expect(purchaseCoreCoinLand("launch", 2, "same")).rejects.toMatchObject(
    { definitive: false },
  );
});

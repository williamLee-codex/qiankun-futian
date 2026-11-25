import { expect, it, vi } from "vitest";
import { createCoreCoinLandHandler } from "./farm-v2/coin-land-handler";
const request = (body: unknown, secret = "trusted", id = "original-request") =>
  new Request("https://core.test/api", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-replit-shared-secret": secret,
      "x-request-id": id,
    },
    body: JSON.stringify(body),
  });
const deps = () => ({
  isTrusted: (r: Request) =>
    r.headers.get("x-replit-shared-secret") === "trusted",
  verifyLaunchToken: async (t: string) =>
    t === "valid"
      ? { appId: "qiankun-futian", userId: "verified-owner" }
      : null,
  rpc: vi.fn(async () => ({
    result_status: "created",
    land_id: 2,
    cost: 88,
    unlocked_at: "2026-10-12T00:00:00Z",
    entitlement_id: "e",
  })),
});
it("derives purchase owner from verified launch token and sends no caller price to RPC", async () => {
  const d = deps();
  const r = await createCoreCoinLandHandler(d)(
    request({ operation: "purchase", launchToken: "valid", landId: 2 }),
  );
  expect(r.status).toBe(200);
  expect(d.rpc).toHaveBeenCalledWith("farm_v2_purchase_coin_land", {
    p_owner_id: "verified-owner",
    p_land_id: 2,
    p_request_id: "original-request",
  });
});
it("blocks untrusted secret, bad launch and another app before RPC", async () => {
  const d = deps();
  const handler = createCoreCoinLandHandler(d);
  expect(
    (await handler(request({ operation: "read", launchToken: "valid" }, "bad")))
      .status,
  ).toBe(401);
  expect(
    (await handler(request({ operation: "read", launchToken: "bad" }))).status,
  ).toBe(401);
  d.verifyLaunchToken = async () => ({ appId: "other", userId: "other-owner" });
  expect(
    (await handler(request({ operation: "read", launchToken: "valid" })))
      .status,
  ).toBe(403);
  expect(d.rpc).not.toHaveBeenCalled();
});
it("rejects caller owner, prices and invalid land before Core mutation", async () => {
  const d = deps();
  for (const extra of [
    { ownerId: "victim" },
    { amount: 1 },
    { currency: "crystal" },
    { landId: 4 },
  ]) {
    const r = await createCoreCoinLandHandler(d)(
      request({
        operation: "purchase",
        launchToken: "valid",
        landId: 2,
        ...extra,
      }),
    );
    expect(r.status).toBe(400);
  }
  expect(d.rpc).not.toHaveBeenCalled();
});
it("reads only the verified owner account rights", async () => {
  const d = deps();
  d.rpc = vi.fn(async () => ({ result_status: "ok", lands: [] })) as any;
  const r = await createCoreCoinLandHandler(d)(
    request({ operation: "read", launchToken: "valid" }),
  );
  expect(r.status).toBe(200);
  expect(d.rpc).toHaveBeenCalledWith("farm_v2_coin_land_entitlements", {
    p_owner_id: "verified-owner",
  });
  expect(r.headers.get("cache-control")).toBe("no-store");
});
it("marks Core business rejection definitive but never marks authentication or RPC outage definitive", async () => {
  const d = deps();
  d.rpc = vi.fn(async () => ({ result_status: "insufficient_funds" })) as any;
  const r = await createCoreCoinLandHandler(d)(
    request({ operation: "purchase", launchToken: "valid", landId: 2 }),
  );
  expect(r.status).toBe(409);
  expect(((await r.json()) as { definitive?: boolean }).definitive).toBe(true);
  d.rpc = vi.fn(async () => {
    throw new Error("private database details");
  }) as any;
  const unavailable = await createCoreCoinLandHandler(d)(
    request({ operation: "purchase", launchToken: "valid", landId: 2 }),
  );
  expect(unavailable.status).toBe(503);
  expect(
    ((await unavailable.json()) as { definitive?: boolean }).definitive,
  ).not.toBe(true);
});
